import { query } from '../db/pool.js';
import { IllegalArgumentError } from '../lib/errors.js';
import { pageFromList, type PageJson } from '../lib/page.js';
import { addDays, daysBetween, startOfMonth, today } from '../lib/time.js';

/**
 * Dòng tiền theo NCC và Homestay từ lịch sử thanh toán/hoàn tiền của toàn hệ thống. Tổng hợp nằm ở DB (GROUP BY theo Homestay); số
 * dòng trả về bị giới hạn bởi số Homestay nên lọc/sắp xếp/phân trang thực hiện trên tập đã gộp. Số liệu là dòng tiền thực
 * thu/thực hoàn: thu theo ngày thanh toán thành công, hoàn theo ngày xử lý.
 */

const MAX_RANGE_DAYS = 3 * 366;
const SORT_FIELDS = new Set(['net', 'paid', 'refunded', 'pending', 'bookings', 'name']);

export const CASHFLOW_LEVELS = ['PROVIDER', 'PLACE'] as const;
export type CashflowLevel = (typeof CASHFLOW_LEVELS)[number];

export interface CashflowRowDto {
  id: number;
  name: string;
  providerId: number;
  providerName: string | null;
  paidBookings: number;
  paidAmount: number;
  refundedAmount: number;
  pendingRefundAmount: number;
  netAmount: number;
}

interface Acc {
  placeId: number | null;
  placeName: string | null;
  providerId: number;
  providerName: string | null;
  paidBookings: number;
  paid: number;
  refunded: number;
  pending: number;
}

interface PlaceSum {
  placeId: number;
  placeName: string;
  providerId: number;
  providerName: string;
  bookings?: number;
  total: number;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

export async function report(
  from: string | undefined,
  to: string | undefined,
  level: CashflowLevel | undefined,
  providerId: number | undefined,
  keyword: string | undefined,
  sortBy: string,
  sortDir: string,
  page: number,
  size: number,
): Promise<{
  from: string;
  to: string;
  level: CashflowLevel;
  totals: { paidBookings: number; paidAmount: number; netAmount: number };
  rows: PageJson<CashflowRowDto>;
}> {
  const now = today();
  const end = to ?? now;
  const start = from ?? startOfMonth(now);
  if (start > end) throw new IllegalArgumentError('Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.');
  if (daysBetween(start, end) > MAX_RANGE_DAYS) throw new IllegalArgumentError('Khoảng thời gian tối đa 3 năm.');
  const effectiveLevel: CashflowLevel = level ?? 'PROVIDER';
  const fromTs = `${start}T00:00:00`;
  const toTs = `${addDays(end, 1)}T00:00:00`;

  const byPlace = new Map<number, Acc>();
  const acc = (r: PlaceSum): Acc => {
    let a = byPlace.get(r.placeId);
    if (!a) {
      a = { placeId: r.placeId, placeName: r.placeName, providerId: r.providerId, providerName: r.providerName, paidBookings: 0, paid: 0, refunded: 0, pending: 0 };
      byPlace.set(r.placeId, a);
    }
    return a;
  };
  for (const r of await query<PlaceSum>(
    `SELECT pl.id AS place_id, pl.name AS place_name, p.id AS provider_id, p.name AS provider_name, count(DISTINCT b.id) AS bookings, coalesce(sum(pt.amount), 0) AS total
       FROM payment_transaction pt JOIN booking b ON b.id = pt.booking_id JOIN place pl ON pl.id = b.place_id JOIN provider p ON p.id = b.provider_id
      WHERE pt.status = 'SUCCESS' AND pt.paid_at >= $1 AND pt.paid_at < $2 AND ($3::bigint IS NULL OR p.id = $3)
      GROUP BY pl.id, pl.name, p.id, p.name`,
    [fromTs, toTs, providerId ?? null],
  )) {
    const a = acc(r);
    a.paidBookings = Number(r.bookings);
    a.paid = Number(r.total);
  }
  for (const r of await query<PlaceSum>(
    `SELECT pl.id AS place_id, pl.name AS place_name, p.id AS provider_id, p.name AS provider_name, coalesce(sum(r.amount), 0) AS total
       FROM refund r JOIN booking b ON b.id = r.booking_id JOIN place pl ON pl.id = b.place_id JOIN provider p ON p.id = b.provider_id
      WHERE r.status = 'PROCESSED' AND r.processed_at >= $1 AND r.processed_at < $2 AND ($3::bigint IS NULL OR p.id = $3)
      GROUP BY pl.id, pl.name, p.id, p.name`,
    [fromTs, toTs, providerId ?? null],
  )) {
    acc(r).refunded = Number(r.total);
  }
  for (const r of await query<PlaceSum>(
    `SELECT pl.id AS place_id, pl.name AS place_name, p.id AS provider_id, p.name AS provider_name, coalesce(sum(r.amount), 0) AS total
       FROM refund r JOIN booking b ON b.id = r.booking_id JOIN place pl ON pl.id = b.place_id JOIN provider p ON p.id = b.provider_id
      WHERE r.status = 'PENDING' AND ($1::bigint IS NULL OR p.id = $1)
      GROUP BY pl.id, pl.name, p.id, p.name`,
    [providerId ?? null],
  )) {
    acc(r).pending = Number(r.total);
  }

  let rows = effectiveLevel === 'PLACE' ? placeRows([...byPlace.values()]) : providerRows([...byPlace.values()]);
  const kw = keyword && keyword.trim() !== '' ? keyword.trim().toLowerCase() : null;
  if (kw) rows = rows.filter((r) => r.name.toLowerCase().includes(kw) || (r.providerName != null && r.providerName.toLowerCase().includes(kw)));
  // Tổng phản ánh đúng tập đã lọc, không phụ thuộc trang đang xem.
  const totals = {
    paidBookings: rows.reduce((n, r) => n + r.paidBookings, 0),
    paidAmount: round2(rows.reduce((n, r) => n + r.paidAmount, 0)),
    netAmount: round2(rows.reduce((n, r) => n + r.netAmount, 0)),
  };

  const key = SORT_FIELDS.has(sortBy) ? sortBy : 'net';
  const value = (r: CashflowRowDto): number | string => {
    switch (key) {
      case 'paid':
        return r.paidAmount;
      case 'refunded':
        return r.refundedAmount;
      case 'pending':
        return r.pendingRefundAmount;
      case 'bookings':
        return r.paidBookings;
      case 'name':
        return r.name.toLowerCase();
      default:
        return r.netAmount;
    }
  };
  const sign = sortDir.toLowerCase() === 'asc' ? 1 : -1;
  const cmp = (a: number | string, b: number | string): number => (a < b ? -1 : a > b ? 1 : 0);
  const sorted = [...rows].sort((a, b) => sign * cmp(value(a), value(b)) || cmp(a.name, b.name) || a.id - b.id);

  const pageSize = Math.min(Math.max(size, 1), 100);
  const pageIndex = Math.max(page, 0);
  return { from: start, to: end, level: effectiveLevel, totals, rows: pageFromList(sorted, pageIndex, pageSize) };
}

function placeRows(accs: Acc[]): CashflowRowDto[] {
  return accs.map((a) => ({
    id: a.placeId!,
    name: a.placeName ?? '',
    providerId: a.providerId,
    providerName: a.providerName,
    paidBookings: a.paidBookings,
    paidAmount: a.paid,
    refundedAmount: a.refunded,
    pendingRefundAmount: a.pending,
    netAmount: round2(a.paid - a.refunded),
  }));
}

/** Gộp các Homestay theo NCC sở hữu. */
function providerRows(accs: Acc[]): CashflowRowDto[] {
  const byProvider = new Map<number, Acc>();
  for (const a of accs) {
    let p = byProvider.get(a.providerId);
    if (!p) {
      p = { placeId: null, placeName: null, providerId: a.providerId, providerName: a.providerName, paidBookings: 0, paid: 0, refunded: 0, pending: 0 };
      byProvider.set(a.providerId, p);
    }
    p.paidBookings += a.paidBookings;
    p.paid += a.paid;
    p.refunded += a.refunded;
    p.pending += a.pending;
  }
  return [...byProvider.values()].map((a) => ({
    id: a.providerId,
    name: a.providerName ?? '',
    providerId: a.providerId,
    providerName: a.providerName,
    paidBookings: a.paidBookings,
    paidAmount: round2(a.paid),
    refundedAmount: round2(a.refunded),
    pendingRefundAmount: round2(a.pending),
    netAmount: round2(a.paid - a.refunded),
  }));
}
