import { query, scalar } from '../db/pool.js';
import { BOOKING_STATUSES, type BookingStatus } from '../domain/enums.js';
import { IllegalArgumentError } from '../lib/errors.js';
import { addDays, addMonths, daysBetween, nowLocal, startOfMonth, today } from '../lib/time.js';

/**
 * Báo cáo & thống kê tổng quan cho Admin (FR-AD-11..14). Tổng hợp theo điều kiện Admin chọn: khoảng thời gian (ngày tạo Booking), NCC,
 * nhóm trạng thái. Mỗi phần tử top có id để giao diện mở danh sách Booking chi tiết (drill-down).
 */

/** Đơn thành công: đã xác nhận (chờ thanh toán) hoặc đã thanh toán. Doanh thu thực thu lấy từ giao dịch thanh toán. */
const REVENUE_STATUSES: readonly BookingStatus[] = ['CONFIRMED', 'PAID'];
const OPEN_STATUSES: readonly BookingStatus[] = ['PENDING'];
const LOST_STATUSES: readonly BookingStatus[] = ['CANCELLED'];
const MAX_RANGE_DAYS = 366 * 3;
const DAILY_MAX_DAYS = 62;
const TOP_LIMIT = 5;

interface ReportRow {
  createdAt: string;
  status: BookingStatus;
  totalAmount: number | null;
  providerId: number;
  providerName: string;
  placeId: number;
  placeName: string;
}

interface Bucket {
  count: number;
  value: number;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

export async function overview(from: string | undefined, to: string | undefined, providerId: number | undefined, group: string) {
  const now = today();
  const end = to ?? now;
  const start = from ?? addMonths(startOfMonth(now), -5);
  if (start > end) throw new IllegalArgumentError('Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.');
  if (daysBetween(start, end) > MAX_RANGE_DAYS) throw new IllegalArgumentError('Khoảng thời gian báo cáo tối đa 3 năm.');
  let filter: readonly BookingStatus[] | null;
  switch ((group ?? 'ALL').toUpperCase()) {
    case 'ALL':
      filter = null;
      break;
    case 'CONFIRMED':
      filter = REVENUE_STATUSES;
      break;
    case 'OPEN':
      filter = OPEN_STATUSES;
      break;
    case 'LOST':
      filter = LOST_STATUSES;
      break;
    default:
      throw new IllegalArgumentError(`Nhóm trạng thái không hợp lệ: ${group}`);
  }

  const fromTs = `${start}T00:00:00`;
  const toTs = `${addDays(end, 1)}T00:00:00`;
  const rows = await query<ReportRow>(
    `SELECT b.created_at, b.status, b.total_amount, p.id AS provider_id, p.name AS provider_name, pl.id AS place_id, pl.name AS place_name
       FROM booking b JOIN provider p ON p.id = b.provider_id JOIN place pl ON pl.id = b.place_id
      WHERE b.created_at >= $1 AND b.created_at < $2 AND ($3::bigint IS NULL OR p.id = $3)`,
    [fromTs, toTs, providerId ?? null],
  );

  const daily = daysBetween(start, end) <= DAILY_MAX_DAYS;
  const statusCounts = new Map<BookingStatus, number>(BOOKING_STATUSES.map((s) => [s, 0]));
  const buckets = new Map<string, Bucket>();
  const providerNames = new Map<number, string>();
  const providers = new Map<number, Bucket>();
  const places = new Map<number, Bucket & { name: string; providerId: number }>();
  let total = 0;
  let confirmed = 0;
  let open = 0;
  let lost = 0;
  let value = 0;

  for (const r of rows) {
    statusCounts.set(r.status, (statusCounts.get(r.status) ?? 0) + 1); // biểu đồ trạng thái luôn hiển thị đủ để đối chiếu
    if (filter && !filter.includes(r.status)) continue;
    const amount = r.totalAmount ?? 0;
    const earns = REVENUE_STATUSES.includes(r.status);
    if (earns) {
      confirmed++;
      value += amount;
    } else if (OPEN_STATUSES.includes(r.status)) open++;
    else if (LOST_STATUSES.includes(r.status)) lost++;

    // RPT-BR-04/05: "Tổng Booking" (chế độ Tất cả) đếm 1 lần mỗi Booking theo ngày tạo, loại Đã hủy tại thời điểm chốt. Khi Admin
    // đã chọn một nhóm cụ thể (vd: Đã hủy) thì xem đúng nhóm đó nên không áp dụng loại trừ này.
    if (!filter && r.status === 'CANCELLED') continue;
    total++;

    const key = daily ? r.createdAt.slice(0, 10) : r.createdAt.slice(0, 7);
    const bucket = buckets.get(key) ?? { count: 0, value: 0 };
    bucket.count++;
    if (earns) bucket.value += amount;
    buckets.set(key, bucket);

    providerNames.set(r.providerId, providerNames.get(r.providerId) ?? r.providerName);
    const pv = providers.get(r.providerId) ?? { count: 0, value: 0 };
    pv.count++;
    if (earns) pv.value += amount;
    providers.set(r.providerId, pv);

    const pl = places.get(r.placeId) ?? { count: 0, value: 0, name: r.placeName, providerId: r.providerId };
    pl.count++;
    if (earns) pl.value += amount;
    places.set(r.placeId, pl);
  }

  // Không đủ dữ liệu để tính (chưa có đơn xác nhận/chưa có đơn nào trong kỳ) thì để null, không tự quy về 0 (RPT-BR-02).
  const averageValue = confirmed === 0 ? null : Math.round(value / confirmed);
  const paidRevenue =
    (await scalar<number>(
      `SELECT coalesce(sum(pt.amount), 0) FROM payment_transaction pt JOIN booking b ON b.id = pt.booking_id
        WHERE pt.status = 'SUCCESS' AND pt.paid_at >= $1 AND pt.paid_at < $2 AND ($3::bigint IS NULL OR b.provider_id = $3)`,
      [fromTs, toTs, providerId ?? null],
    )) ?? 0;
  const confirmationRate = total === 0 ? null : Math.round((confirmed * 1000) / total) / 10;
  const newProviders =
    providerId != null ? null : Number((await scalar<number>('SELECT count(*) FROM provider WHERE created_at >= $1 AND created_at < $2', [fromTs, toTs])) ?? 0);
  const newPlaces =
    providerId != null
      ? null
      : Number((await scalar<number>('SELECT count(*) FROM place WHERE is_deleted = FALSE AND created_at >= $1 AND created_at < $2', [fromTs, toTs])) ?? 0);

  const byValueThenBookings = <T extends Bucket>(a: [number, T], b: [number, T]): number => b[1].value - a[1].value || b[1].count - a[1].count;
  const topProviders = [...providers.entries()]
    .sort(byValueThenBookings)
    .slice(0, TOP_LIMIT)
    .map(([id, v]) => ({ id, name: providerNames.get(id) ?? null, bookings: v.count, value: round2(v.value) }));
  const topPlaces = [...places.entries()]
    .sort(byValueThenBookings)
    .slice(0, TOP_LIMIT)
    .map(([id, v]) => ({ id, name: v.name, providerId: v.providerId, providerName: providerNames.get(v.providerId) ?? null, bookings: v.count, value: round2(v.value) }));

  return {
    from: start,
    to: end,
    providerId: providerId ?? null,
    granularity: daily ? 'DAY' : 'MONTH',
    generatedAt: nowLocal(),
    kpi: {
      totalBookings: total,
      confirmedBookings: confirmed,
      openBookings: open,
      lostBookings: lost,
      bookingValue: round2(value),
      averageValue,
      paidRevenue,
      confirmationRate,
      newProviders,
      newPlaces,
    },
    byStatus: [...statusCounts.entries()].map(([status, count]) => ({ status, count })),
    series: buildSeries(start, end, daily, buckets),
    topProviders,
    topPlaces,
  };
}

/** Sinh đủ mọi mốc thời gian trong khoảng (kể cả mốc không có đơn) để biểu đồ liên tục. */
function buildSeries(start: string, end: string, daily: boolean, buckets: Map<string, Bucket>) {
  const out: Array<{ key: string; label: string; from: string; to: string; bookings: number; value: number }> = [];
  if (daily) {
    for (let d = start; d <= end; d = addDays(d, 1)) {
      const b = buckets.get(d);
      out.push({ key: d, label: `${Number(d.slice(8, 10))}/${Number(d.slice(5, 7))}`, from: d, to: d, bookings: b?.count ?? 0, value: round2(b?.value ?? 0) });
    }
    return out;
  }
  for (let m = startOfMonth(start); m <= end; m = addMonths(m, 1)) {
    const key = m.slice(0, 7);
    const lastDay = addDays(addMonths(m, 1), -1);
    const b = buckets.get(key);
    out.push({
      key,
      label: `T${Number(key.slice(5, 7))}/${key.slice(0, 4)}`,
      from: m < start ? start : m,
      to: lastDay > end ? end : lastDay,
      bookings: b?.count ?? 0,
      value: round2(b?.value ?? 0),
    });
  }
  return out;
}
