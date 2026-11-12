import { exec, one, query, scalar } from '../db/pool.js';
import { json, insertRow, updateRow } from '../db/sql.js';
import type { DaySession, JourneyItemKind, JourneySource, JourneyStopOrigin, PlaceVisibility } from '../domain/enums.js';
import { nowLocal } from '../lib/time.js';
import type { DishRow } from './catalogRepo.js';
import type { PlaceRow } from './placeRepo.js';
import * as places from './placeRepo.js';

export interface JourneyRow {
  id: number;
  travelerId: number | null;
  source: JourneySource;
  templateId: number | null;
  basePlaceId: number | null;
  title: string | null;
  startDate: string | null;
  endDate: string | null;
  bookingId: number | null;
  shareToken: string | null;
  publishedAt: string | null;
  feedHiddenAt: string | null;
  feedHiddenReason: string | null;
  regionId: number | null;
  guestCount: number | null;
  templateCode: string | null;
  preferences: Record<string, unknown> | null;
  summary: string | null;
  dayCount: number | null;
  nights: number | null;
  priceFrom: number | null;
  visibility: PlaceVisibility | null;
  sortOrder: number;
  packageInfo: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface StopRow {
  id: number;
  journeyId: number;
  placeId: number | null;
  kind: JourneyItemKind;
  title: string | null;
  visitDate: string | null;
  dayIndex: number | null;
  daySession: DaySession;
  startTime: string | null;
  endTime: string | null;
  note: string | null;
  addons: string | null;
  sortOrder: number;
  origin: JourneyStopOrigin;
  sourceStopId: number | null;
  reminderSentAt: string | null;
}

export interface DayRow {
  dayIndex: number;
  title: string | null;
  note: string | null;
}

export interface TagRow {
  id: number;
  groupCode: string;
  slug: string;
  name: string;
  isActive: boolean;
}

/** Mục của lịch trình kèm địa điểm, món và điểm đổi được đã nạp (tương đương JourneyStop entity). */
export interface StopAgg extends StopRow {
  place: PlaceRow | null;
  dishes: DishRow[];
  alternatives: PlaceRow[];
}

/** Lịch trình kèm mục, ngày, tag (tương đương Journey entity với các quan hệ đã nạp). */
export interface JourneyAgg extends JourneyRow {
  stops: StopAgg[];
  days: DayRow[];
  tags: TagRow[];
}

// ---- Nạp aggregate ---------------------------------------------------------------------------------------------------

async function hydrate(rows: JourneyRow[]): Promise<JourneyAgg[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const stopRows = await query<StopRow>('SELECT * FROM journey_stop WHERE journey_id = ANY($1) ORDER BY sort_order ASC, id ASC', [ids]);
  const stopIds = stopRows.map((s) => s.id);

  const placeIds = new Set<number>();
  for (const s of stopRows) if (s.placeId != null) placeIds.add(s.placeId);
  const dishLinks = stopIds.length
    ? await query<{ stopId: number; dishId: number; sortOrder: number }>(
        'SELECT stop_id, dish_id, sort_order FROM journey_stop_dish WHERE stop_id = ANY($1) ORDER BY stop_id, sort_order',
        [stopIds],
      )
    : [];
  const altLinks = stopIds.length
    ? await query<{ stopId: number; placeId: number; sortOrder: number }>(
        'SELECT stop_id, place_id, sort_order FROM journey_stop_alternative WHERE stop_id = ANY($1) ORDER BY stop_id, sort_order',
        [stopIds],
      )
    : [];
  for (const a of altLinks) placeIds.add(a.placeId);

  const placeRows = await places.findAllByIds([...placeIds]);
  const placeBy = new Map(placeRows.map((p) => [p.id, p]));
  const dishIds = [...new Set(dishLinks.map((d) => d.dishId))];
  const dishRows = dishIds.length ? await query<DishRow>('SELECT d.* FROM dish d WHERE d.id = ANY($1)', [dishIds]) : [];
  const dishBy = new Map(dishRows.map((d) => [d.id, d]));

  const dishesByStop = new Map<number, DishRow[]>();
  for (const l of dishLinks) {
    const d = dishBy.get(l.dishId);
    if (!d) continue;
    const list = dishesByStop.get(l.stopId) ?? [];
    list.push(d);
    dishesByStop.set(l.stopId, list);
  }
  const altsByStop = new Map<number, PlaceRow[]>();
  for (const l of altLinks) {
    const p = placeBy.get(l.placeId);
    if (!p) continue;
    const list = altsByStop.get(l.stopId) ?? [];
    list.push(p);
    altsByStop.set(l.stopId, list);
  }

  const stopsByJourney = new Map<number, StopAgg[]>();
  for (const s of stopRows) {
    const agg: StopAgg = {
      ...s,
      place: s.placeId == null ? null : (placeBy.get(s.placeId) ?? null),
      dishes: dishesByStop.get(s.id) ?? [],
      alternatives: altsByStop.get(s.id) ?? [],
    };
    const list = stopsByJourney.get(s.journeyId) ?? [];
    list.push(agg);
    stopsByJourney.set(s.journeyId, list);
  }

  const dayRows = await query<DayRow & { journeyId: number }>('SELECT * FROM journey_day WHERE journey_id = ANY($1) ORDER BY day_index ASC', [ids]);
  const daysByJourney = new Map<number, DayRow[]>();
  for (const d of dayRows) {
    const list = daysByJourney.get(d.journeyId) ?? [];
    list.push({ dayIndex: d.dayIndex, title: d.title, note: d.note });
    daysByJourney.set(d.journeyId, list);
  }
  const tagRows = await query<TagRow & { journeyId: number }>(
    'SELECT jt.journey_id, t.* FROM journey_tag jt JOIN tag t ON t.id = jt.tag_id WHERE jt.journey_id = ANY($1) ORDER BY t.id',
    [ids],
  );
  const tagsByJourney = new Map<number, TagRow[]>();
  for (const t of tagRows) {
    const { journeyId, ...tag } = t;
    const list = tagsByJourney.get(journeyId) ?? [];
    list.push(tag);
    tagsByJourney.set(journeyId, list);
  }

  return rows.map((r) => ({
    ...r,
    stops: stopsByJourney.get(r.id) ?? [],
    days: daysByJourney.get(r.id) ?? [],
    tags: tagsByJourney.get(r.id) ?? [],
  }));
}

async function one1(sql: string, params: unknown[]): Promise<JourneyAgg | null> {
  const row = await one<JourneyRow>(sql, params);
  return row ? (await hydrate([row]))[0] : null;
}

async function many(sql: string, params: unknown[]): Promise<JourneyAgg[]> {
  return hydrate(await query<JourneyRow>(sql, params));
}

export const findById = (id: number) => one1('SELECT * FROM journey WHERE id = $1', [id]);

export const findRowById = (id: number) => one<JourneyRow>('SELECT * FROM journey WHERE id = $1', [id]);

export const findAllForTraveler = (travelerId: number) =>
  many('SELECT * FROM journey WHERE traveler_id = $1 ORDER BY updated_at DESC', [travelerId]);

export const findForTravelerAndBasePlace = (travelerId: number, basePlaceId: number) =>
  many('SELECT * FROM journey WHERE traveler_id = $1 AND base_place_id = $2 ORDER BY updated_at DESC', [travelerId, basePlaceId]);

export const findOwned = (id: number, travelerId: number) => one1('SELECT * FROM journey WHERE id = $1 AND traveler_id = $2', [id, travelerId]);

/** Lịch trình gắn với một đơn (mỗi đơn tối đa một). */
export const findByBookingIdWithStops = (bookingId: number) => one1('SELECT * FROM journey WHERE booking_id = $1', [bookingId]);

export const findByShareToken = (token: string) => one1('SELECT * FROM journey WHERE share_token = $1', [token]);

export const findFirstRowByBookingId = (bookingId: number) => one<JourneyRow>('SELECT * FROM journey WHERE booking_id = $1 ORDER BY id LIMIT 1', [bookingId]);

/** Lịch trình đang chia sẻ theo mã (không nạp điểm đến): mỗi dòng {id, shareToken, travelerId}. */
export async function findSharedOwners(tokens: readonly string[]): Promise<Array<{ id: number; shareToken: string; travelerId: number | null }>> {
  if (tokens.length === 0) return [];
  return query('SELECT id, share_token, traveler_id FROM journey WHERE share_token = ANY($1)', [tokens]);
}

/** Trang "Trải nghiệm": id các bài đang đăng (Admin chưa ẩn), mới đăng trước. */
export async function findFeedIds(limit: number, offset: number): Promise<number[]> {
  const rows = await query<{ id: number }>(
    `SELECT id FROM journey WHERE source = 'TRAVELER' AND published_at IS NOT NULL AND feed_hidden_at IS NULL
      ORDER BY published_at DESC, id DESC LIMIT $1 OFFSET $2`,
    [limit, offset],
  );
  return rows.map((r) => r.id);
}

export const findAllWithStopsByIds = (ids: readonly number[]) => (ids.length ? many('SELECT * FROM journey WHERE id = ANY($1)', [ids]) : Promise.resolve([]));

/** Admin kiểm duyệt bài đã đăng: hidden null = tất cả, true = đã ẩn, false = đang hiện. */
export async function findPublishedForModeration(hidden: boolean | null, limit: number, offset: number): Promise<{ rows: JourneyAgg[]; total: number }> {
  const where = `published_at IS NOT NULL AND source = 'TRAVELER'
     AND ($1::boolean IS NULL OR ($1 = TRUE AND feed_hidden_at IS NOT NULL) OR ($1 = FALSE AND feed_hidden_at IS NULL))`;
  const total = (await scalar<number>(`SELECT count(*) FROM journey WHERE ${where}`, [hidden])) ?? 0;
  const rows = await many(`SELECT * FROM journey WHERE ${where} ORDER BY published_at DESC, id DESC LIMIT $2 OFFSET $3`, [hidden, limit, offset]);
  return { rows, total };
}

// ---- Lịch trình gợi ý (gói mẫu) ----------------------------------------------------------------------------------

/** Lịch trình gợi ý đang công khai của một tỉnh (kèm mục + địa điểm), theo thứ tự hiển thị. */
export const findSuggestedPublishedByRegion = (regionId: number) =>
  many(
    `SELECT * FROM journey WHERE source = 'SUGGESTED' AND region_id = $1 AND visibility = 'PUBLISHED' ORDER BY sort_order ASC, id ASC`,
    [regionId],
  );

/** Id các tỉnh đang có lịch trình gợi ý công khai. */
export async function findRegionIdsWithSuggested(): Promise<number[]> {
  const rows = await query<{ regionId: number }>(
    `SELECT DISTINCT region_id FROM journey WHERE source = 'SUGGESTED' AND visibility = 'PUBLISHED' AND region_id IS NOT NULL`,
  );
  return rows.map((r) => r.regionId);
}

/** Mã mọi gói đã chép sang lịch trình gợi ý (kể cả gói đang ẩn). */
export async function findSuggestedCodes(): Promise<string[]> {
  const rows = await query<{ templateCode: string | null }>(`SELECT template_code FROM journey WHERE source = 'SUGGESTED'`);
  return rows.map((r) => r.templateCode).filter((c): c is string => c != null);
}

export const findSuggestedByCode = (code: string) => one1(`SELECT * FROM journey WHERE source = 'SUGGESTED' AND template_code = $1`, [code]);

export const findSuggestedById = (id: number) => one1(`SELECT * FROM journey WHERE source = 'SUGGESTED' AND id = $1`, [id]);

// ---- Ghi aggregate ---------------------------------------------------------------------------------------------------

const JOURNEY_COLUMNS = [
  'travelerId',
  'source',
  'templateId',
  'basePlaceId',
  'title',
  'startDate',
  'endDate',
  'bookingId',
  'shareToken',
  'publishedAt',
  'feedHiddenAt',
  'feedHiddenReason',
  'regionId',
  'guestCount',
  'templateCode',
  'preferences',
  'summary',
  'dayCount',
  'nights',
  'priceFrom',
  'visibility',
  'sortOrder',
  'packageInfo',
] as const;

const STOP_COLUMNS = [
  'placeId',
  'kind',
  'title',
  'visitDate',
  'dayIndex',
  'daySession',
  'startTime',
  'endTime',
  'note',
  'addons',
  'sortOrder',
  'origin',
  'sourceStopId',
  'reminderSentAt',
] as const;

/** Một dòng journey để ghi: jsonb bọc json(). */
function journeyValues(j: Partial<JourneyRow>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const c of JOURNEY_COLUMNS) {
    if (!(c in j)) continue;
    const v = j[c];
    out[c] = c === 'preferences' || c === 'packageInfo' ? json(v ?? null) : v;
  }
  return out;
}

const sameList = (a: readonly number[], b: readonly number[]) => a.length === b.length && a.every((x, i) => x === b[i]);

/**
 * Lưu aggregate (tương đương journeys.saveAndFlush): chèn / cập nhật lịch trình, đồng bộ mục (xóa mục không còn, chèn mục
 * mới, cập nhật mục đổi), món, điểm đổi được, tên ngày và tag. Mục mới được gán id ngay trong aggregate trả về.
 */
export async function saveAggregate(agg: JourneyAgg): Promise<JourneyAgg> {
  const now = nowLocal();
  agg.updatedAt = agg.updatedAt ?? now;
  let id = agg.id;
  if (!id) {
    const created = await insertRow<JourneyRow>('journey', { ...journeyValues(agg), createdAt: agg.createdAt ?? now, updatedAt: agg.updatedAt });
    id = created.id;
    agg.id = id;
    agg.createdAt = created.createdAt;
  } else {
    await updateRow('journey', id, { ...journeyValues(agg), updatedAt: agg.updatedAt });
  }

  // ---- mục ----
  const existingIds = (await query<{ id: number }>('SELECT id FROM journey_stop WHERE journey_id = $1', [id])).map((r) => r.id);
  const keep = new Set(agg.stops.filter((s) => s.id).map((s) => s.id));
  const removed = existingIds.filter((x) => !keep.has(x));
  if (removed.length) await exec('DELETE FROM journey_stop WHERE id = ANY($1)', [removed]);

  for (const stop of agg.stops) {
    const values: Record<string, unknown> = {};
    for (const c of STOP_COLUMNS) values[c] = stop[c];
    values.placeId = stop.place ? stop.place.id : null;
    if (!stop.id) {
      const created = await insertRow<StopRow>('journey_stop', { journeyId: id, ...values });
      stop.id = created.id;
      stop.journeyId = id;
    } else {
      await updateRow('journey_stop', stop.id, values);
    }
    await syncLinks('journey_stop_dish', 'dish_id', stop.id, stop.dishes.map((d) => d.id));
    await syncLinks('journey_stop_alternative', 'place_id', stop.id, stop.alternatives.map((p) => p.id));
  }

  // ---- ngày ----
  const savedDays = await query<DayRow>('SELECT day_index, title, note FROM journey_day WHERE journey_id = $1 ORDER BY day_index', [id]);
  const wantedDays = [...agg.days].sort((a, b) => a.dayIndex - b.dayIndex);
  const sameDays =
    savedDays.length === wantedDays.length &&
    savedDays.every((d, i) => d.dayIndex === wantedDays[i].dayIndex && d.title === wantedDays[i].title && d.note === wantedDays[i].note);
  if (!sameDays) {
    await exec('DELETE FROM journey_day WHERE journey_id = $1', [id]);
    for (const d of wantedDays) {
      await exec('INSERT INTO journey_day (journey_id, day_index, title, note) VALUES ($1, $2, $3, $4)', [id, d.dayIndex, d.title, d.note]);
    }
  }

  // ---- tag ----
  const savedTags = (await query<{ tagId: number }>('SELECT tag_id FROM journey_tag WHERE journey_id = $1 ORDER BY tag_id', [id])).map((r) => r.tagId);
  const wantedTags = agg.tags.map((t) => t.id).sort((a, b) => a - b);
  if (!sameList(savedTags, wantedTags)) {
    await exec('DELETE FROM journey_tag WHERE journey_id = $1', [id]);
    for (const t of wantedTags) await exec('INSERT INTO journey_tag (journey_id, tag_id) VALUES ($1, $2)', [id, t]);
  }
  return agg;
}

/** Bảng nối có thứ tự (stop_id, X, sort_order): chỉ ghi lại khi danh sách (theo thứ tự) khác. */
async function syncLinks(table: string, column: string, stopId: number, wanted: readonly number[]): Promise<void> {
  const current = (await query<{ v: number }>(`SELECT ${column} AS v FROM ${table} WHERE stop_id = $1 ORDER BY sort_order`, [stopId])).map((r) => r.v);
  if (sameList(current, wanted)) return;
  await exec(`DELETE FROM ${table} WHERE stop_id = $1`, [stopId]);
  for (let i = 0; i < wanted.length; i++) {
    await exec(`INSERT INTO ${table} (stop_id, ${column}, sort_order) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`, [stopId, wanted[i], i]);
  }
}

export async function deleteJourney(id: number): Promise<void> {
  await exec('DELETE FROM journey WHERE id = $1', [id]);
}

export async function patchJourney(id: number, patch: Partial<JourneyRow>): Promise<void> {
  await updateRow('journey', id, journeyValues(patch));
}

// ---- Lượt "Hữu ích" ---------------------------------------------------------------------------------------------------

export async function helpfulCounts(journeyIds: readonly number[]): Promise<Map<number, number>> {
  const map = new Map<number, number>();
  if (journeyIds.length === 0) return map;
  const rows = await query<{ journeyId: number; n: number }>(
    'SELECT journey_id, count(*) AS n FROM journey_helpful WHERE journey_id = ANY($1) GROUP BY journey_id',
    [journeyIds],
  );
  for (const r of rows) map.set(r.journeyId, r.n);
  return map;
}

export async function helpfulCount(journeyId: number): Promise<number> {
  return (await scalar<number>('SELECT count(*) FROM journey_helpful WHERE journey_id = $1', [journeyId])) ?? 0;
}

export async function markedJourneyIds(travelerId: number, journeyIds: readonly number[]): Promise<number[]> {
  if (journeyIds.length === 0) return [];
  const rows = await query<{ journeyId: number }>('SELECT journey_id FROM journey_helpful WHERE traveler_id = $1 AND journey_id = ANY($2)', [
    travelerId,
    journeyIds,
  ]);
  return rows.map((r) => r.journeyId);
}

export async function helpfulExists(journeyId: number, travelerId: number): Promise<boolean> {
  return (await scalar<boolean>('SELECT count(*) > 0 FROM journey_helpful WHERE journey_id = $1 AND traveler_id = $2', [journeyId, travelerId])) === true;
}

export async function insertHelpful(journeyId: number, travelerId: number): Promise<void> {
  await exec('INSERT INTO journey_helpful (journey_id, traveler_id, created_at) VALUES ($1, $2, $3)', [journeyId, travelerId, nowLocal()]);
}

export async function deleteHelpful(journeyId: number, travelerId: number): Promise<void> {
  await exec('DELETE FROM journey_helpful WHERE journey_id = $1 AND traveler_id = $2', [journeyId, travelerId]);
}

// ---- Check-in ---------------------------------------------------------------------------------------------------------

export interface CheckinRow {
  id: number;
  travelerId: number;
  journeyId: number | null;
  placeId: number;
  photoUrl: string | null;
  note: string | null;
  hiddenAt: string | null;
  hiddenReason: string | null;
  hiddenByAccountId: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface CheckinWithPlace extends CheckinRow {
  placeName: string;
  placeSlug: string;
}

export const checkinsByJourneyIds = (ids: readonly number[]) =>
  ids.length ? query<CheckinRow>('SELECT * FROM journey_checkin WHERE journey_id = ANY($1)', [ids]) : Promise.resolve([]);

export const findCheckin = (journeyId: number, placeId: number) =>
  one<CheckinRow>('SELECT * FROM journey_checkin WHERE journey_id = $1 AND place_id = $2', [journeyId, placeId]);

export const findCheckinById = (id: number) => one<CheckinRow>('SELECT * FROM journey_checkin WHERE id = $1', [id]);

export async function saveCheckin(c: Partial<CheckinRow> & Pick<CheckinRow, 'travelerId' | 'placeId'>): Promise<CheckinRow> {
  const now = nowLocal();
  const values: Record<string, unknown> = {
    photoUrl: c.photoUrl ?? null,
    note: c.note ?? null,
    hiddenAt: c.hiddenAt ?? null,
    hiddenReason: c.hiddenReason ?? null,
    hiddenByAccountId: c.hiddenByAccountId ?? null,
  };
  if (c.id) {
    return (await updateRow<CheckinRow>('journey_checkin', c.id, { ...values, updatedAt: now })) as CheckinRow;
  }
  return insertRow<CheckinRow>('journey_checkin', {
    ...values,
    travelerId: c.travelerId,
    journeyId: c.journeyId ?? null,
    placeId: c.placeId,
    createdAt: now,
    updatedAt: now,
  });
}

export async function deleteCheckin(id: number): Promise<void> {
  await exec('DELETE FROM journey_checkin WHERE id = $1', [id]);
}

/** Hồ sơ "Địa điểm đã đi": mọi check-in của khách, mới nhất trước. */
export const checkinsForTraveler = (travelerId: number) =>
  query<CheckinWithPlace>(
    `SELECT c.*, p.name AS place_name, p.slug AS place_slug FROM journey_checkin c JOIN place p ON p.id = c.place_id
      WHERE c.traveler_id = $1 ORDER BY c.created_at DESC, c.id DESC`,
    [travelerId],
  );

/** Kiểm duyệt của Admin: chỉ check-in có ảnh hoặc lưu bút. */
export async function checkinsForModeration(hidden: boolean | null, limit: number, offset: number): Promise<{ rows: CheckinWithPlace[]; total: number }> {
  const where = `(c.photo_url IS NOT NULL OR c.note IS NOT NULL)
     AND ($1::boolean IS NULL OR ($1 = TRUE AND c.hidden_at IS NOT NULL) OR ($1 = FALSE AND c.hidden_at IS NULL))`;
  const total = (await scalar<number>(`SELECT count(*) FROM journey_checkin c WHERE ${where}`, [hidden])) ?? 0;
  const rows = await query<CheckinWithPlace>(
    `SELECT c.*, p.name AS place_name, p.slug AS place_slug FROM journey_checkin c JOIN place p ON p.id = c.place_id
      WHERE ${where} ORDER BY c.created_at DESC, c.id DESC LIMIT $2 OFFSET $3`,
    [hidden, limit, offset],
  );
  return { rows, total };
}
