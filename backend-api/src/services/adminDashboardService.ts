import { query, scalar } from '../db/pool.js';
import { addMonths, nowLocal, plusDaysTime, startOfMonth, today } from '../lib/time.js';
import * as accounts from '../repositories/accountRepo.js';
import * as providers from '../repositories/providerRepo.js';
import * as finance from './adminFinanceService.js';

export interface MonthlyRevenuePoint {
  year: number;
  month: number;
  totalAmount: number;
  transactionCount: number;
}

/** Sự kiện xác thực dày đặc không đưa vào bảng "Hoạt động gần đây"; vẫn tra cứu được ở Nhật ký hệ thống. */
const FEED_EXCLUDED_ACTIONS = ['LOGIN_SUCCESS', 'LOGIN_FAILED', 'LOGIN_BLOCKED', 'LOGOUT', 'HOMESTAY_VIEW'];

const count = async (sql: string, params: unknown[] = []): Promise<number> => Number((await scalar<number>(sql, params)) ?? 0);

/** 6 tháng gần nhất, cũ → mới. */
function lastSixMonths(now: string): Array<{ year: number; month: number }> {
  const first = startOfMonth(now);
  const out: Array<{ year: number; month: number }> = [];
  for (let i = 5; i >= 0; i--) {
    const ym = addMonths(first, -i);
    out.push({ year: Number(ym.slice(0, 4)), month: Number(ym.slice(5, 7)) });
  }
  return out;
}

export const pendingSosCount = (): Promise<number> => count(`SELECT count(*) FROM sos_request WHERE status = 'PENDING'`);

export async function getSummary() {
  const now = today();
  const start = `${startOfMonth(now)}T00:00:00`;
  const nextMonthStart = `${addMonths(startOfMonth(now), 1)}T00:00:00`;

  let monthlyRevenue = 0;
  const revenueTrend: MonthlyRevenuePoint[] = [];
  try {
    const months = (await finance.getRevenueSummary()).byMonth;
    for (const ym of lastSixMonths(now)) {
      const found = months.find((m) => m.year === ym.year && m.month === ym.month);
      revenueTrend.push({ ...ym, totalAmount: found?.totalAmount ?? 0, transactionCount: found?.transactionCount ?? 0 });
    }
    const [year, month] = [Number(now.slice(0, 4)), Number(now.slice(5, 7))];
    monthlyRevenue = months.find((m) => m.year === year && m.month === month)?.totalAmount ?? 0;
  } catch {
    // Bản Java bỏ qua lỗi tổng hợp doanh thu: bảng điều khiển vẫn hiển thị phần còn lại.
  }

  // GMV 6 tháng gần nhất (giá trị đặt phòng, không phụ thuộc đã thanh toán) — dự phòng khi revenueTrend = 0đ.
  const gmvRows = await query<{ year: number; month: number; total: number | null; count: number }>(
    `SELECT extract(year FROM created_at)::int AS year, extract(month FROM created_at)::int AS month, sum(total_amount) AS total, count(*) AS count
       FROM booking WHERE status <> 'CANCELLED' GROUP BY 1, 2`,
  );
  const gmvTrend: MonthlyRevenuePoint[] = lastSixMonths(now).map((ym) => {
    const row = gmvRows.find((r) => r.year === ym.year && r.month === ym.month);
    return { ...ym, totalAmount: row?.total ?? 0, transactionCount: row ? Number(row.count) : 0 };
  });

  const nowTs = nowLocal();
  return {
    totalPlaces: await count('SELECT count(*) FROM place WHERE is_deleted = FALSE'),
    unverifiedPlaces: await count(`SELECT count(*) FROM place WHERE verification = 'UNVERIFIED' AND is_deleted = FALSE`),
    totalProviders: await count('SELECT count(*) FROM provider'),
    activeProviders: await providers.countByStatus('ACTIVE'),
    suspendedProviders: await providers.countByStatus('SUSPENDED'),
    // Tài khoản cổng (Admin / NCC); khách du lịch thống kê riêng bên dưới.
    totalAccounts: await accounts.countByRoleIn(['ADMIN', 'PROVIDER']),
    activeAccounts: await accounts.countByRoleInAndStatus(['ADMIN', 'PROVIDER'], 'ACTIVE'),
    monthlyBookingsCount: await count('SELECT count(*) FROM booking WHERE created_at >= $1 AND created_at < $2', [start, nextMonthStart]),
    monthlyRevenue,
    pendingRefundsCount: await count(`SELECT count(*) FROM refund WHERE status = 'PENDING'`),
    terminatedProviders: await providers.countByStatus('TERMINATED'),
    needsUpdatePlaces: await count(`SELECT count(*) FROM place WHERE verification = 'NEEDS_UPDATE' AND is_deleted = FALSE`),
    pendingSosCount: await pendingSosCount(),
    totalTravelers: await accounts.countByRole('TRAVELER'),
    newTravelers7d: await accounts.countByRoleCreatedSince('TRAVELER', plusDaysTime(nowTs, -7)),
    newTravelers30d: await accounts.countByRoleCreatedSince('TRAVELER', plusDaysTime(nowTs, -30)),
    lockedTravelers: await accounts.countByRoleInAndStatus(['TRAVELER'], 'INACTIVE'),
    revenueTrend,
    gmvTrend,
  };
}

/** Nhật ký hoạt động gần đây cho Live Audit Feed. */
export async function recentActivity(limit: number) {
  const logs = await query<{ id: number; action: string; entityType: string; entityId: number | null; reason: string | null; actorId: number | null; createdAt: string }>(
    `SELECT id, action, entity_type, entity_id, reason, actor_id, created_at FROM audit_log
      WHERE action <> ALL($1::text[]) ORDER BY created_at DESC, id DESC LIMIT 20`,
    [FEED_EXCLUDED_ACTIONS],
  );
  const ids = [...new Set(logs.filter((l) => l.actorId != null).map((l) => l.actorId as number))];
  const names = new Map<number, string | null>();
  if (ids.length > 0) for (const a of await query<{ id: number; fullName: string | null }>('SELECT id, full_name FROM account WHERE id = ANY($1)', [ids])) names.set(a.id, a.fullName);
  const n = Math.max(1, Math.min(limit, 20));
  return logs.slice(0, n).map((l) => ({
    id: l.id,
    action: l.action,
    entityType: l.entityType,
    entityId: l.entityId,
    reason: l.reason,
    actorName: l.actorId != null ? (names.get(l.actorId) ?? 'Quản trị viên') : 'Hệ thống',
    createdAt: l.createdAt,
  }));
}
