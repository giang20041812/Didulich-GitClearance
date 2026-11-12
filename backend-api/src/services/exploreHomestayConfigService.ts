import { exec, query, tx } from '../db/pool.js';
import { insertRow } from '../db/sql.js';
import { EXPLORE_CATEGORY_INFO, exploreAllKinds, exploreCategoryOf } from '../domain/enums.js';
import { HttpError, IllegalArgumentError, IllegalStateError } from '../lib/errors.js';
import { byDistanceThenName, pageOf as rankedPage, type Candidate } from '../lib/exploreRanking.js';
import * as rules from '../lib/exploreRules.js';
import { geoBoxAround } from '../lib/geo.js';
import { nowLocal } from '../lib/time.js';
import * as placeRepo from '../repositories/placeRepo.js';
import type { PlaceRow } from '../repositories/placeRepo.js';
import * as audit from './auditLogService.js';
import { isExplorePlace } from './explorePlaceService.js';
import { normalizeName } from './explorePlaceWriter.js';
import * as exploreSettings from './exploreSettingsService.js';
import { candidate, cardsOf, findEligibleInBox, pinsOrdered, rankFor } from './exploreService.js';

/**
 * Cấu hình "Khám phá quanh đây" của từng homestay (US02.02, AD-03): địa điểm trong bán kính kèm khoảng cách (AC-02.09), ghim tối đa 10
 * (AC-02.11), ghim được địa điểm ngoài bán kính (AC-02.12), sắp thứ tự ghim (AC-02.10). Chỉ Admin (XN-12). Homestay chưa có tọa độ →
 * không cấu hình được (AC-02.14).
 */

const NEED_COORDINATES = 'Cần bổ sung tọa độ homestay trước khi cấu hình.';
const SEARCH_LIMIT = 20;

const hasCoordinates = (place: PlaceRow): boolean => place.latitude != null && place.longitude != null;
const isHomestay = (place: PlaceRow | null): place is PlaceRow => !!place && place.kind === 'HOMESTAY' && !place.isDeleted;
const likeOf = (norm: string): string => `%${norm.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

async function homestay(id: number): Promise<PlaceRow> {
  const place = await placeRepo.findById(id);
  if (!isHomestay(place)) throw new HttpError(404, 'Không tìm thấy homestay.');
  return place;
}

async function lockedHomestay(id: number): Promise<PlaceRow> {
  const place = await placeRepo.findByIdForUpdate(id);
  if (!isHomestay(place)) throw new HttpError(404, 'Không tìm thấy homestay.');
  return place;
}

function notEligibleReason(place: PlaceRow): string | null {
  if (place.isDeleted) return 'Đã xóa';
  if (place.approvalStatus !== 'APPROVED') return 'Chưa được duyệt';
  if (place.visibility !== 'PUBLISHED') return 'Đang ẩn';
  if (!hasCoordinates(place)) return 'Chưa có tọa độ';
  if (place.coordVerified !== true) return 'Tọa độ chưa xác minh';
  if (place.operationStatus === 'TEMP_CLOSED') return 'Tạm ngừng hoạt động';
  return null;
}

/** Dòng địa điểm cho Admin; `notEligibleReason` giải thích vì sao khách chưa thấy (FS §7 Q5). */
function item(place: PlaceRow, home: PlaceRow, pinned: boolean) {
  const category = exploreCategoryOf(place.kind) ?? null;
  let km: number | null = null;
  if (hasCoordinates(place) && hasCoordinates(home) && place.coordVerified === true) {
    km = rules.haversineKm(home.latitude as number, home.longitude as number, place.latitude as number, place.longitude as number);
  }
  const reason = notEligibleReason(place);
  return {
    id: place.id,
    name: place.name,
    category,
    categoryLabel: category == null ? null : EXPLORE_CATEGORY_INFO[category].label,
    distanceKm: km,
    distanceText: km == null ? null : rules.formatDistance(km),
    pinned,
    eligible: reason == null,
    notEligibleReason: reason,
  };
}

/** Chọn homestay để cấu hình (tìm theo tên). */
export async function homestays(keyword: string | undefined) {
  const norm = normalizeName(keyword);
  const params: unknown[] = [];
  let like = '';
  if (norm !== '') {
    params.push(`%${norm.replace(/%/g, '')}%`);
    like = ' AND name_norm LIKE $1';
  }
  const rows = await query<PlaceRow>(`SELECT * FROM place WHERE kind = 'HOMESTAY' AND is_deleted = FALSE${like} ORDER BY name_norm, id LIMIT ${SEARCH_LIMIT}`, params);
  return rows.map((h) => ({ id: h.id, name: h.name, address: h.address, hasCoordinates: hasCoordinates(h) }));
}

/** AC-02.09 / AC-02.14: cấu hình hiện tại của homestay; chưa có tọa độ thì `hasCoordinates = false`, danh sách rỗng. */
export async function overview(homestayId: number) {
  const home = await homestay(homestayId);
  const radiusKm = await exploreSettings.radiusKm();
  const pinned = await pinsOrdered(homestayId);
  const pinnedIds = new Set(pinned.map((p) => p.id));
  const pins = pinned.map((p) => item(p, home, true));
  if (!hasCoordinates(home)) {
    return { homestayId: home.id, homestayName: home.name, hasCoordinates: false, radiusKm, pinMax: rules.PIN_MAX, pins, inRadius: [], preview: [] };
  }
  const inRadius: Candidate[] = [];
  for (const place of await findEligibleInBox(geoBoxAround(home.latitude as number, home.longitude as number, radiusKm))) {
    if (place.id === homestayId || !rules.isExploreEligible(place)) continue;
    const c = candidate(place, home.latitude as number, home.longitude as number);
    if (c.distanceKm > radiusKm) continue;
    inRadius.push(c);
  }
  const inRadiusDtos = inRadius.sort(byDistanceThenName).map((c) => ({
    id: c.id,
    name: c.name,
    category: c.category,
    categoryLabel: EXPLORE_CATEGORY_INFO[c.category].label,
    distanceKm: c.distanceKm,
    distanceText: rules.formatDistance(c.distanceKm),
    pinned: pinnedIds.has(c.id),
    eligible: true,
    notEligibleReason: null,
  }));
  const ranked = await rankFor(home, radiusKm);
  const preview = await cardsOf(rankedPage(ranked.ranked, 0).items, ranked.placesById);
  return { homestayId: home.id, homestayName: home.name, hasCoordinates: true, radiusKm, pinMax: rules.PIN_MAX, pins, inRadius: inRadiusDtos, preview };
}

/** AC-02.12: tìm địa điểm (đã duyệt) theo tên để ghim, kể cả ngoài bán kính; kèm khoảng cách nếu có tọa độ. */
export async function search(homestayId: number, keyword: string | undefined) {
  const home = await homestay(homestayId);
  const norm = normalizeName(keyword);
  if (norm === '') return [];
  const pinnedIds = new Set((await pinsOrdered(homestayId)).map((p) => p.id));
  const rows = await query<PlaceRow>(
    `SELECT * FROM place WHERE is_deleted = FALSE AND kind = ANY($1) AND approval_status = 'APPROVED' AND name_norm LIKE $2 ESCAPE '\\'
      ORDER BY name_norm, id LIMIT ${SEARCH_LIMIT}`,
    [exploreAllKinds(), likeOf(norm.replace(/%/g, ''))],
  );
  return rows.map((p) => item(p, home, pinnedIds.has(p.id))).sort((a, b) => Number(!a.eligible) - Number(!b.eligible));
}

/** AC-02.11 / AC-02.12: ghim; tối đa 10; ghim trùng bị chặn; khóa dòng homestay để hai Admin không cùng vượt giới hạn. */
export function pin(homestayId: number, placeId: number | null | undefined, adminAccountId: number | null) {
  return tx(async () => {
    if (placeId == null) throw new IllegalArgumentError('Chưa chọn địa điểm.');
    const home = await lockedHomestay(homestayId);
    if (!hasCoordinates(home)) throw new IllegalStateError(NEED_COORDINATES);
    const place = await placeRepo.findById(placeId);
    if (!isExplorePlace(place) || place.approvalStatus !== 'APPROVED') throw new IllegalArgumentError('Địa điểm không hợp lệ hoặc chưa được duyệt.');
    const current = await pinsOrdered(homestayId);
    if (current.some((p) => p.id === placeId)) throw new IllegalStateError('Địa điểm đã được ghim.');
    if (current.length >= rules.PIN_MAX) throw new IllegalStateError(`Mỗi homestay ghim tối đa ${rules.PIN_MAX} địa điểm.`);
    const next = current.reduce((max, p) => Math.max(max, p.pinSortOrder), -1) + 1;
    await insertRow('homestay_explore_pin', { homestayId, placeId, sortOrder: next, createdBy: adminAccountId, createdAt: nowLocal() });
    await audit.record(adminAccountId, 'EXPLORE_PIN_ADDED', 'Place', homestayId, null, null, { placeId, sortOrder: next });
    return overview(homestayId);
  });
}

export function unpin(homestayId: number, placeId: number, adminAccountId: number | null) {
  return tx(async () => {
    await lockedHomestay(homestayId);
    const removed = await exec('DELETE FROM homestay_explore_pin WHERE homestay_id = $1 AND place_id = $2', [homestayId, placeId]);
    if (removed > 0) await audit.record(adminAccountId, 'EXPLORE_PIN_REMOVED', 'Place', homestayId, null, { placeId }, null);
    return overview(homestayId);
  });
}

/** AC-02.10: sắp thứ tự ghim; danh sách phải đủ và đúng các ghim hiện có. */
export function reorder(homestayId: number, placeIds: Array<number | null> | null | undefined, adminAccountId: number | null) {
  return tx(async () => {
    if (!placeIds || placeIds.some((p) => p == null)) throw new IllegalArgumentError('Thiếu thứ tự ghim.');
    const ids = placeIds as number[];
    await lockedHomestay(homestayId);
    const current = await pinsOrdered(homestayId);
    const currentIds = new Set(current.map((p) => p.id));
    if (ids.length !== current.length || ids.some((i) => !currentIds.has(i)) || new Set(ids).size !== currentIds.size) {
      throw new IllegalStateError('Danh sách ghim vừa thay đổi, vui lòng tải lại trang.');
    }
    for (const p of current) await exec('UPDATE homestay_explore_pin SET sort_order = $3 WHERE homestay_id = $1 AND place_id = $2', [homestayId, p.id, ids.indexOf(p.id)]);
    await audit.record(adminAccountId, 'EXPLORE_PIN_REORDERED', 'Place', homestayId, null, null, { placeIds: [...ids] });
    return overview(homestayId);
  });
}

