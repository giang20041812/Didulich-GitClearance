import { query, scalar } from '../db/pool.js';
import { addDays, nowLocal } from '../lib/time.js';
import type { UserPrincipal } from '../security/principal.js';
import { actor as actorOf } from './partnerHomestayService.js';

const pad = (n: number): string => String(n).padStart(2, '0');

/** Đầu tháng kế tiếp của (năm, tháng). */
function nextMonthStart(year: number, month: number): string {
  return month === 12 ? `${year + 1}-01-01` : `${year}-${pad(month + 1)}-01`;
}

/** Tổng quan cổng NCC: số đơn theo trạng thái trong tháng, doanh thu (chỉ đơn Đã thanh toán), đánh giá, tỷ lệ lấp đầy, xu hướng. */
export async function getDashboardSummary(principal: UserPrincipal | undefined, year: number | undefined, month: number | undefined, homestayId: number | undefined) {
  const account = await actorOf(principal, false);
  const providerId = account.provider!.id;
  const today = nowLocal().slice(0, 10);
  const targetYear = year ?? Number(today.slice(0, 4));
  const targetMonth = month ?? Number(today.slice(5, 7));
  const start = `${targetYear}-${pad(targetMonth)}-01T00:00:00`;
  const end = `${nextMonthStart(targetYear, targetMonth)}T00:00:00`;
  const place = homestayId != null ? ' AND b.place_id = $2' : '';
  const base: unknown[] = homestayId != null ? [providerId, homestayId] : [providerId];
  const n = base.length;

  // 1. Số đơn trong tháng theo trạng thái: một câu GROUP BY cho mọi thẻ số.
  const byStatusRows = await query<{ status: string; n: number }>(
    `SELECT b.status, count(*) AS n FROM booking b WHERE b.provider_id = $1${place} AND b.created_at >= $${n + 1} AND b.created_at < $${n + 2} GROUP BY b.status`,
    [...base, start, end],
  );
  const byStatus = new Map(byStatusRows.map((r) => [r.status, r.n]));
  const monthlyBookingsCount = [...byStatus.values()].reduce((a, b) => a + b, 0);

  // Doanh thu chỉ tính đơn Đã thanh toán, theo thời điểm ghi nhận thanh toán (closed_at).
  const monthlyRevenue =
    (await scalar<number>(
      `SELECT sum(b.total_amount) FROM booking b WHERE b.provider_id = $1${place} AND b.status = 'PAID'
          AND COALESCE(b.closed_at, b.created_at) >= $${n + 1} AND COALESCE(b.closed_at, b.created_at) < $${n + 2}`,
      [...base, start, end],
    )) ?? 0;

  // 2. Điểm trung bình và số đánh giá.
  const ratingRow = (
    await query<{ avg: number | null; n: number }>(
      `SELECT avg(r.rating)::float8 AS avg, count(*) AS n FROM review r JOIN booking b ON b.id = r.booking_id WHERE b.provider_id = $1${place}`,
      base,
    )
  )[0];
  const averageRating = ratingRow.avg == null ? 0 : Math.round(ratingRow.avg * 10) / 10;
  const totalReviews = ratingRow.n ?? 0;

  // 3. Doanh thu 12 tháng của năm được chọn.
  const revenueRows = await query<{ m: number; total: number; n: number }>(
    `SELECT EXTRACT(MONTH FROM COALESCE(b.closed_at, b.created_at))::int AS m, sum(b.total_amount) AS total, count(*) AS n
       FROM booking b WHERE b.provider_id = $1${place} AND b.status = 'PAID' AND EXTRACT(YEAR FROM COALESCE(b.closed_at, b.created_at)) = $${n + 1}
      GROUP BY 1`,
    [...base, targetYear],
  );
  const revenueByMonth = new Map(revenueRows.map((r) => [r.m, r]));
  const revenueTrend = Array.from({ length: 12 }, (_, i) => {
    const row = revenueByMonth.get(i + 1);
    return { year: targetYear, month: i + 1, totalAmount: row?.total ?? 0, transactionCount: row?.n ?? 0 };
  });

  // 4. Đơn gần đây (10 đơn).
  const recent = await query<{ bookingCode: string; placeName: string; guestName: string; checkIn: string; totalAmount: number; status: string }>(
    `SELECT b.booking_code, p.name AS place_name, b.guest_name, b.check_in, b.total_amount, b.status FROM booking b JOIN place p ON p.id = b.place_id
      WHERE b.provider_id = $1${place} ORDER BY b.created_at DESC LIMIT 10`,
    base,
  );
  const recentBookings = recent.map((b) => ({ bookingCode: b.bookingCode, homestayName: b.placeName, guestName: b.guestName, checkInDate: b.checkIn, totalAmount: b.totalAmount, status: b.status }));

  // 5. Tỷ lệ lấp đầy (30 ngày tới).
  let occupancyRate = 0;
  try {
    const occ = (
      await query<{ total: number | null; confirmed: number | null }>(
        `SELECT sum(d.total_rooms)::bigint AS total, sum(d.confirmed_rooms)::bigint AS confirmed
           FROM room_inventory_day d JOIN room_type rt ON rt.id = d.room_type_id JOIN place p ON p.id = rt.place_id
          WHERE p.provider_id = $1${homestayId != null ? ' AND p.id = $2' : ''} AND d.stay_date >= $${n + 1} AND d.stay_date <= $${n + 2}`,
        [...base, today, addDays(today, 30)],
      )
    )[0];
    if (occ.total != null && occ.total > 0) occupancyRate = Math.round(((occ.confirmed ?? 0) * 100) / occ.total);
  } catch {
    // giữ 0
  }

  // 6. Xu hướng theo ngày (7 ngày gần nhất).
  const sevenDaysAgo = addDays(today, -6);
  const dailyRows = await query<{ d: string; status: string; n: number }>(
    `SELECT b.created_at::date::text AS d, b.status, count(*) AS n FROM booking b WHERE b.provider_id = $1${place} AND b.created_at >= $${n + 1} GROUP BY 1, 2`,
    [...base, `${sevenDaysAgo}T00:00:00`],
  );
  const dailyBy = new Map<string, Map<string, number>>();
  for (const r of dailyRows) {
    if (!dailyBy.has(r.d)) dailyBy.set(r.d, new Map());
    dailyBy.get(r.d)!.set(r.status, r.n);
  }
  const statusTrend = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(sevenDaysAgo, i);
    const m = dailyBy.get(d) ?? new Map<string, number>();
    return { date: d, paid: m.get('PAID') ?? 0, pending: (m.get('PENDING') ?? 0) + (m.get('CONFIRMED') ?? 0), cancelled: m.get('CANCELLED') ?? 0 };
  });

  return {
    monthlyRevenue,
    monthlyBookingsCount,
    averageRating,
    totalReviews,
    occupancyRate,
    pendingBookings: byStatus.get('PENDING') ?? 0,
    confirmedBookings: byStatus.get('CONFIRMED') ?? 0,
    paidBookings: byStatus.get('PAID') ?? 0,
    cancelledBookings: byStatus.get('CANCELLED') ?? 0,
    statusTrend,
    revenueTrend,
    recentBookings,
  };
}
