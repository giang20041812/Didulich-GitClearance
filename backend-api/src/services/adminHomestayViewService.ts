import { query } from '../db/pool.js';
import { Where } from '../db/sql.js';
import { pageOf, type PageJson } from '../lib/page.js';
import { HOMESTAY_VIEW } from './travelerActivityService.js';

/**
 * Homestay khách đã xem, gom theo người dùng (Admin, chỉ xem): người dùng A đã xem những homestay nào, mỗi nơi mấy lần, lần đầu / lần
 * cuối lúc nào. Lượt xem được ghi sẵn vào audit_log với hành động HOMESTAY_VIEW khi khách đã đăng nhập mở trang chi tiết homestay; ở
 * đây chỉ đọc.
 */

const withOffset = (local: string | null): string | null => (local == null ? null : `${local}+07:00`);

interface Filter {
  keyword?: string;
  placeId?: number;
  from?: string;
  to?: string;
}

function nextDay(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

const FROM = `FROM audit_log a LEFT JOIN account t ON t.id = a.actor_id LEFT JOIN place p ON p.id = a.entity_id
  LEFT JOIN provider pr ON pr.id = p.provider_id LEFT JOIN region r ON r.id = p.region_id`;

/** Bộ lọc: chỉ ghép điều kiện có giá trị. */
function where(f: Filter): Where {
  const w = new Where();
  w.and(`a.actor = 'CUSTOMER' AND a.action = ? AND a.result = 'SUCCESS'`, HOMESTAY_VIEW);
  if (f.from) w.and('a.created_at >= ?', `${f.from}T00:00:00`);
  if (f.to) w.and('a.created_at < ?', `${nextDay(f.to)}T00:00:00`);
  if (f.placeId != null) w.and('a.entity_id = ?', f.placeId);
  const kw = f.keyword && f.keyword.trim() !== '' ? `%${f.keyword.trim().toLowerCase()}%` : null;
  if (kw) w.and(`(lower(t.full_name) LIKE ? OR lower(t.email) LIKE ? OR t.phone LIKE ? OR lower(p.name) LIKE ?)`, kw, kw, kw, kw);
  return w;
}

/** Mỗi phần tử là một người dùng (người xem gần nhất lên trước) kèm các homestay người đó đã xem. */
export async function byTraveler(f: Filter, page: number, size: number): Promise<PageJson<unknown>> {
  const p = Math.max(0, page);
  const s = Math.min(50, Math.max(1, size));
  const w = where(f);
  const travelerRows = await query<{ actorId: number; views: number; last: string }>(
    `SELECT a.actor_id, count(a.id) AS views, max(a.created_at) AS last ${FROM} ${w.toSql()} GROUP BY a.actor_id ORDER BY max(a.created_at) DESC LIMIT ${s} OFFSET ${p * s}`,
    w.params,
  );
  const w2 = where(f);
  const [{ n }] = await query<{ n: number }>(`SELECT count(DISTINCT a.actor_id) AS n ${FROM} ${w2.toSql()}`, w2.params);
  const total = Number(n);
  if (travelerRows.length === 0) return pageOf([], p, s, total);

  const ids = travelerRows.map((r) => r.actorId);
  const travelers = new Map<number, { fullName: string | null; email: string | null; phone: string | null; avatarUrl: string | null }>();
  for (const t of await query<{ id: number; fullName: string | null; email: string | null; phone: string | null; avatarUrl: string | null }>('SELECT id, full_name, email, phone, avatar_url FROM account WHERE id = ANY($1)', [ids])) {
    travelers.set(t.id, t);
  }

  // Các homestay của những người dùng trong trang này: mỗi (người, homestay) một dòng, xem gần nhất lên trước.
  const w3 = where(f);
  w3.and('a.actor_id = ANY(?)', ids);
  const homestays = new Map<number, unknown[]>();
  for (const r of await query<{
    actorId: number;
    entityId: number;
    placeName: string | null;
    providerName: string | null;
    regionName: string | null;
    views: number;
    first: string;
    last: string;
  }>(
    `SELECT a.actor_id, a.entity_id, p.name AS place_name, pr.name AS provider_name, r.name AS region_name, count(a.id) AS views,
            min(a.created_at) AS first, max(a.created_at) AS last
       ${FROM} ${w3.toSql()} GROUP BY a.actor_id, a.entity_id, p.name, pr.name, r.name ORDER BY max(a.created_at) DESC`,
    w3.params,
  )) {
    const list = homestays.get(r.actorId) ?? [];
    list.push({
      placeId: r.entityId,
      placeName: r.placeName != null ? r.placeName : `Homestay #${r.entityId}`,
      providerName: r.providerName,
      regionName: r.regionName,
      views: Number(r.views),
      firstViewedAt: withOffset(r.first),
      lastViewedAt: withOffset(r.last),
    });
    homestays.set(r.actorId, list);
  }

  const content = travelerRows.map((r) => {
    const t = travelers.get(r.actorId);
    return {
      travelerId: r.actorId,
      name: t?.fullName ?? null,
      email: t?.email ?? null,
      phone: t?.phone ?? null,
      picture: t?.avatarUrl ?? null,
      totalViews: Number(r.views),
      lastViewedAt: withOffset(r.last),
      homestays: homestays.get(r.actorId) ?? [],
    };
  });
  return pageOf(content, p, s, total);
}

/** Tổng lượt xem, số khách và số homestay khác nhau theo đúng bộ lọc đang chọn. */
export async function summary(f: Filter) {
  const w = where(f);
  const [row] = await query<{ views: number; travelers: number; homestays: number }>(
    `SELECT count(a.id) AS views, count(DISTINCT a.actor_id) AS travelers, count(DISTINCT a.entity_id) AS homestays ${FROM} ${w.toSql()}`,
    w.params,
  );
  return { totalViews: Number(row.views), travelers: Number(row.travelers), homestays: Number(row.homestays) };
}
