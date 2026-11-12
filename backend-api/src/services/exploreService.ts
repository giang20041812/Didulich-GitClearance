import { query } from '../db/pool.js';
import { EXPLORE_CATEGORY_INFO, exploreAllKinds, exploreCategoryOf, type ExploreCategory } from '../domain/enums.js';
import { HttpError } from '../lib/errors.js';
import * as ranking from '../lib/exploreRanking.js';
import type { Candidate, Ranked } from '../lib/exploreRanking.js';
import * as rules from '../lib/exploreRules.js';
import { geoBoxAround } from '../lib/geo.js';
import { dayName, statusAt, type DayHours } from '../lib/openingHours.js';
import { nowLocal } from '../lib/time.js';
import * as placeRepo from '../repositories/placeRepo.js';
import type { PlaceRow } from '../repositories/placeRepo.js';
import * as settings from './exploreSettingsService.js';

/**
 * Mục "Khám phá quanh đây" (US02.03) và chi tiết địa điểm (US02.04) phía khách; {@link rankFor} dùng chung cho màn xem trước của Admin
 * (US02.02). Mọi điều kiện hiển thị theo BR-02.03 / BR-C05 ({@link rules.isExploreEligible}).
 */

export interface RankedList {
  ranked: Ranked[];
  placesById: Map<number, PlaceRow>;
}

export interface OpeningHourRow {
  dayOfWeek: number | null;
  isClosed: boolean;
  openTime: string | null;
  closeTime: string | null;
}

// ---- Truy vấn dùng chung ---------------------------------------------------------------------------------------------------------------

/** Địa điểm đủ điều kiện (BR-02.03, BR-C05) nằm trong hộp tọa độ — lọc thô; khoảng cách đúng tính ở service bằng Haversine. */
export async function findEligibleInBox(box: { minLat: number; maxLat: number; minLng: number; maxLng: number }): Promise<PlaceRow[]> {
  return query<PlaceRow>(
    `SELECT * FROM place WHERE is_deleted = FALSE AND visibility = 'PUBLISHED' AND approval_status = 'APPROVED' AND coord_verified = TRUE
        AND operation_status = 'OPERATING' AND kind = ANY($1) AND latitude BETWEEN $2 AND $3 AND longitude BETWEEN $4 AND $5`,
    [exploreAllKinds(), box.minLat, box.maxLat, box.minLng, box.maxLng],
  );
}

/** Ghim của một homestay theo thứ tự Admin sắp (BR-02.06), kèm địa điểm. */
export async function pinsOrdered(homestayId: number): Promise<Array<PlaceRow & { pinSortOrder: number }>> {
  return query(
    `SELECT p.*, pin.sort_order AS pin_sort_order FROM homestay_explore_pin pin JOIN place p ON p.id = pin.place_id
      WHERE pin.homestay_id = $1 ORDER BY pin.sort_order, p.id`,
    [homestayId],
  );
}

export async function openingHoursOf(placeId: number): Promise<OpeningHourRow[]> {
  return query<OpeningHourRow>('SELECT day_of_week, is_closed, open_time, close_time FROM place_opening_hour WHERE place_id = $1 ORDER BY day_of_week, id', [placeId]);
}

const hhmm = (t: string | null): string | null => (t == null ? null : t.slice(0, 5));

export function hourDto(h: OpeningHourRow) {
  const day = h.dayOfWeek ?? 0;
  const closed = h.isClosed === true;
  return { dayOfWeek: day, dayName: dayName(day), closed, open: closed ? null : hhmm(h.openTime), close: closed ? null : hhmm(h.closeTime) };
}

// ---- US02.03 --------------------------------------------------------------------------------------------------------------------------

export const isPublicHomestay = (place: PlaceRow): boolean => place.kind === 'HOMESTAY' && !place.isDeleted && place.visibility === 'PUBLISHED';

export const homestayDto = (homestay: PlaceRow) => ({ id: homestay.id, name: homestay.name, latitude: homestay.latitude, longitude: homestay.longitude });

export function candidate(place: PlaceRow, fromLat: number, fromLng: number): Candidate {
  const km = rules.haversineKm(fromLat, fromLng, place.latitude as number, place.longitude as number);
  return { id: place.id, name: place.name, category: exploreCategoryOf(place.kind) as ExploreCategory, distanceKm: km };
}

/**
 * AC-02.09 / AC-02.15 / AC-02.17 / AC-02.18: một trang mục "Khám phá quanh đây" của homestay. Homestay chưa có tọa độ hoặc không có địa
 * điểm đủ điều kiện → danh sách rỗng (giao diện ẩn mục).
 */
export async function explore(homestayId: number, category: ExploreCategory | undefined, page: number) {
  const homestay = await placeRepo.findById(homestayId);
  if (!homestay || !isPublicHomestay(homestay)) throw new HttpError(404, 'Không tìm thấy homestay.');
  const radiusKm = await settings.radiusKm();
  const all = await rankFor(homestay, radiusKm);
  const filtered = ranking.filter(all.ranked, category);
  const slice = ranking.pageOf(filtered, page);
  const cards = await cardsOf(slice.items, all.placesById);
  const categories = [...ranking.countByCategory(all.ranked).entries()].map(([code, count]) => ({ code, label: EXPLORE_CATEGORY_INFO[code].label, count }));
  return {
    homestay: homestayDto(homestay),
    items: cards,
    page: slice.page,
    size: slice.size,
    totalElements: slice.totalElements,
    hasMore: slice.hasMore,
    categories,
    radiusKm,
  };
}

/**
 * BR-02.06 / BR-02.05: danh sách đầy đủ đã xếp thứ tự (chưa lọc danh mục) của một homestay: ghim đủ điều kiện theo thứ tự Admin (kể cả
 * ngoài bán kính), rồi địa điểm đủ điều kiện trong bán kính theo khoảng cách, tên.
 */
export async function rankFor(homestay: PlaceRow, radiusKm: number): Promise<RankedList> {
  if (homestay.latitude == null || homestay.longitude == null) return { ranked: [], placesById: new Map() };
  const lat = homestay.latitude;
  const lng = homestay.longitude;
  const byId = new Map<number, PlaceRow>();
  const pinned: Candidate[] = [];
  for (const place of await pinsOrdered(homestay.id)) {
    if (!rules.isExploreEligible(place)) continue; // BR-02.05: ghim bị Ẩn vẫn giữ nhưng không hiện
    byId.set(place.id, place);
    pinned.push(candidate(place, lat, lng));
  }
  const inRadius: Candidate[] = [];
  for (const place of await findEligibleInBox(geoBoxAround(lat, lng, radiusKm))) {
    if (place.id === homestay.id || !rules.isExploreEligible(place)) continue;
    const c = candidate(place, lat, lng);
    if (c.distanceKm > radiusKm) continue; // hộp tọa độ rộng hơn vòng tròn bán kính
    byId.set(place.id, place);
    inRadius.push(c);
  }
  return { ranked: ranking.rank(pinned, inRadius), placesById: byId };
}

/** Dựng thẻ cho các địa điểm của một trang; ảnh bìa nạp một câu cho cả trang. */
export async function cardsOf(items: Ranked[], placesById: Map<number, PlaceRow>) {
  if (items.length === 0) return [];
  const covers = new Map<number, string>();
  for (const row of await placeRepo.publicUrlsByPlaceIds(items.map((r) => r.candidate.id))) if (!covers.has(row.id)) covers.set(row.id, row.value);
  return items.map((r) => {
    const c = r.candidate;
    const place = placesById.get(c.id);
    return {
      id: c.id,
      name: c.name,
      category: c.category,
      categoryLabel: EXPLORE_CATEGORY_INFO[c.category].label,
      summary: place ? rules.cardSummary(place) : null,
      imageUrl: covers.get(c.id) ?? null,
      distanceKm: c.distanceKm,
      distanceText: rules.formatDistance(c.distanceKm),
      pinned: r.pinned,
      latitude: place?.latitude ?? null,
      longitude: place?.longitude ?? null,
    };
  });
}

// ---- US02.04 --------------------------------------------------------------------------------------------------------------------------

/**
 * Chi tiết địa điểm (AC-02.20 – AC-02.23). Tọa độ và khoảng cách chỉ trả khi tọa độ đã xác minh (BR-C05); `homestayId` (tùy chọn) là
 * homestay khách đang xem — điểm xuất phát của Chỉ đường (BR-02.08).
 */
export async function placeDetail(placeId: number, homestayId: number | undefined) {
  const place = await placeRepo.findById(placeId);
  if (!place || !rules.isPubliclyVisible(place)) throw new HttpError(404, 'Địa điểm không còn hiển thị.');
  const category = exploreCategoryOf(place.kind) as ExploreCategory;
  const verified = place.coordVerified === true && place.latitude != null && place.longitude != null;

  const homestayRow = homestayId == null ? null : await placeRepo.findById(homestayId);
  const homestay = homestayRow && isPublicHomestay(homestayRow) ? homestayRow : null;
  let distanceKm: number | null = null;
  if (verified && homestay && homestay.latitude != null && homestay.longitude != null) {
    distanceKm = rules.haversineKm(homestay.latitude, homestay.longitude, place.latitude as number, place.longitude as number);
  }
  let phone: string | null = null;
  let website: string | null = null;
  for (const contact of await placeRepo.publicContacts([placeId])) {
    if (phone == null && contact.channel === 'PHONE') phone = rules.trimToNull(contact.value);
    if (website == null && contact.channel === 'WEBSITE') website = rules.trimToNull(contact.value);
  }
  const hours = await openingHoursOf(placeId);
  const week: DayHours[] = hours.map((h) => ({ dayOfWeek: h.dayOfWeek ?? 0, closed: h.isClosed === true, open: h.openTime, close: h.closeTime }));
  const status = statusAt(week, nowLocal());
  const images = (await placeRepo.publicUrlsByPlaceIds([placeId])).map((r) => r.value);
  return {
    id: place.id,
    name: place.name,
    category,
    categoryLabel: EXPLORE_CATEGORY_INFO[category].label,
    summary: rules.cardSummary(place),
    description: rules.trimToNull(place.description),
    address: rules.trimToNull(place.address),
    phone,
    website,
    images,
    openingHours: hours.map(hourDto),
    openStatus: status ? { open: status.open, text: status.text } : null,
    latitude: verified ? place.latitude : null,
    longitude: verified ? place.longitude : null,
    distanceKm,
    distanceText: distanceKm == null ? null : rules.formatDistance(distanceKm),
    homestay: homestay ? homestayDto(homestay) : null,
  };
}
