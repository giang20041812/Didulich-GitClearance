import type { AmenityScope, CategoryKind, ContactChannel } from '../domain/enums.js';
import { groupBy, groupedValues } from '../lib/collections.js';
import { HttpError } from '../lib/errors.js';
import { geoBoxAround } from '../lib/geo.js';
import { pageOf, type PageJson } from '../lib/page.js';
import { addDays } from '../lib/time.js';
import * as places from '../repositories/placeRepo.js';
import type { ContactRow, PlaceWithRegion } from '../repositories/placeRepo.js';
import * as reviews from '../repositories/reviewRepo.js';
import * as rooms from '../repositories/roomRepo.js';
import type { InventoryDayRow, RoomTypeRow } from '../repositories/roomRepo.js';
import * as extrasSvc from './placeExtras.js';

/** Số mục tối đa mỗi trang của /api/public/places. */
const MAX_PAGE_SIZE = 100;
/** Bán kính tối đa của "địa điểm xung quanh" (thanh trượt trên trang chi tiết đi tới 30 km). */
const MAX_NEARBY_RADIUS_KM = 30.0;
/** Số đánh giá công khai tối đa trả về cho trang chi tiết. */
const PUBLIC_REVIEW_LIMIT = 100;
const LISTING_AMENITY_LIMIT = 4;

/** Loại địa điểm mà thẻ danh sách hiện liên hệ (gọi điện, Zalo, TikTok...). */
const LIST_KINDS_WITH_CONTACTS = new Set<CategoryKind>(['RESTAURANT', 'TRANSPORT', 'SERVICE', 'PHOTO', 'RENTAL']);

export interface ContactItemDto {
  id: number;
  channel: ContactChannel;
  value: string;
  isPublic: boolean;
  sortOrder: number;
}

export const contactDto = (c: ContactRow): ContactItemDto => ({
  id: c.id,
  channel: c.channel,
  value: c.value,
  isPublic: c.isPublic,
  sortOrder: c.sortOrder,
});

export interface PublicAmenityDto {
  code: string;
  name: string;
  scope: AmenityScope;
  count: number;
}

/**
 * Danh mục tiện ích cho bộ lọc tìm kiếm: chỉ trả các tiện ích đang có ở ít nhất một chỗ nghỉ công khai, để khách không
 * chọn phải tiện ích luôn cho 0 kết quả. Mã trả về khớp tham số `amenities` của /places.
 */
export async function getAmenitiesInUse(kind: CategoryKind | null | undefined): Promise<PublicAmenityDto[]> {
  const target = kind ?? 'HOMESTAY';
  const byCode = new Map<string, places.AmenityInUseRow>();
  for (const a of await places.placeAmenitiesInUse(target)) if (!byCode.has(a.code)) byCode.set(a.code, a);
  for (const a of await places.roomAmenitiesInUse(target)) {
    const existing = byCode.get(a.code);
    if (!existing) byCode.set(a.code, a);
    else if (a.count > existing.count) byCode.set(a.code, { ...existing, count: a.count });
  }
  return [...byCode.values()]
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
    .map((a) => ({ code: a.code, name: a.name, scope: a.scope, count: a.count }));
}

export interface RegionHierarchyDto {
  id: number;
  name: string;
  districts: Array<{ id: number; name: string; wards: Array<{ id: number; name: string }> }>;
  /** Tên tỉnh (getProvince() của DTO Java = name). */
  province: string;
}

export async function getPublicRegions(): Promise<RegionHierarchyDto[]> {
  let all = await places.findActiveRegions();
  if (all.length === 0) all = await places.findAllRegions();

  // Nhóm theo parentId để duyệt cây 3 level: 1 (Tỉnh) -> 2 (Huyện) -> 3 (Xã)
  const childrenByParent = groupBy(all, (r) => r.parentId);
  const provinces = all
    .filter((r) => r.level === 1 || r.parentId == null)
    .sort((a, b) => {
      if (a.name === 'Lào Cai') return -1;
      if (b.name === 'Lào Cai') return 1;
      return a.id - b.id;
    });
  if (provinces.length === 0) {
    // Fallback nếu không có phân cấp
    return [{ id: 1, name: 'Lào Cai', districts: [], province: 'Lào Cai' }];
  }
  return provinces.map((prov) => ({
    id: prov.id,
    name: prov.name,
    province: prov.name,
    districts: (childrenByParent.get(prov.id) ?? []).map((dist) => ({
      id: dist.id,
      name: dist.name,
      wards: (childrenByParent.get(dist.id) ?? []).map((w) => ({ id: w.id, name: w.name })),
    })),
  }));
}

export interface PlaceSummaryDto {
  id: number;
  slug: string;
  name: string;
  regionName: string | null;
  coverImageUrl: string | null;
  description?: string;
  priceRefMin: number | null;
  ratingAvg?: number;
  ratingCount?: number;
  googleRating?: number;
  attributes: Record<string, unknown>;
  kind: CategoryKind;
  needs: string | null;
  latitude: number | null;
  longitude: number | null;
  address: string | null;
  suitableDateStart: string | null;
  suitableDateEnd: string | null;
  categoryName: string | null;
  priceRefMax: number | null;
  priceUnitNote: string | null;
  tagBadge: string | null;
  statsText: string | null;
  amenities: string[] | null;
  highlights: string[] | null;
  durationText: string | null;
  contacts: ContactItemDto[];
  /** Chỉ homestay: có loại phòng đang bán trực tuyến không (false = chỉ có thông tin tham khảo, khách liên hệ trực tiếp). */
  hasOnlineRooms?: boolean;
  tiktokUrl: string | null;
  operationStatus: string;
  operationStatusReason: string | null;
  availableForSelectedDates: boolean;
}

export interface ListQuery {
  kind?: CategoryKind | null;
  minPrice?: number | null;
  maxPrice?: number | null;
  amenities?: string[] | null;
  checkIn?: string | null;
  checkOut?: string | null;
  province?: string | null;
  district?: string | null;
  ward?: string | null;
  attractionIds?: number[] | null;
  keyword?: string | null;
  needs?: string | null;
  guests?: number | null;
  sortProperty?: string;
  sortDirection?: 'asc' | 'desc';
  page: number;
  size: number;
}

function validateFilters(q: ListQuery): void {
  const bad = (m: string) => new HttpError(400, m);
  if (q.minPrice != null && q.minPrice < 0) throw bad('Giá từ không được âm');
  if (q.maxPrice != null && q.maxPrice < 0) throw bad('Giá đến không được âm');
  if (q.minPrice != null && q.maxPrice != null && q.minPrice > q.maxPrice) throw bad('Giá từ không được lớn hơn Giá đến');
  if (q.checkOut && !q.checkIn) throw bad('Phải chọn Check-in trước khi chọn Check-out');
  if (q.checkIn && q.checkOut && !(q.checkOut > q.checkIn)) throw bad('Check-out phải sau Check-in');
}

/** Tồn kho theo (loại phòng, ngày) để kiểm tra "còn phòng cho ngày đã chọn". */
type InventoryIndex = Map<string, InventoryDayRow>;

const invKey = (roomTypeId: number, date: string) => `${roomTypeId}|${date}`;

function isAvailableForSelection(
  place: PlaceWithRegion,
  roomTypes: RoomTypeRow[],
  checkIn: string | null | undefined,
  checkOut: string | null | undefined,
  inventory: InventoryIndex,
): boolean {
  if (place.operationStatus !== 'OPERATING') return false;
  if (!checkIn || !checkOut) return true;
  return roomTypes.some((room) => {
    if (room.totalRoomCount == null || room.totalRoomCount < 1) return false;
    // Loại phòng chưa có giá không đặt được.
    if (room.basePrice == null) return false;
    for (let date = checkIn; date < checkOut; date = addDays(date, 1)) {
      const day = inventory.get(invKey(room.id, date));
      if (day) {
        const occupied = (day.heldRooms ?? 0) + (day.confirmedRooms ?? 0);
        if (day.totalRooms == null || day.stopSell || day.totalRooms - occupied < 1) return false;
      }
    }
    return true;
  });
}

export async function getPlaces(q: ListQuery): Promise<PageJson<PlaceSummaryDto>> {
  validateFilters(q);
  if (q.guests != null && (q.guests < 1 || q.guests > 200)) throw new HttpError(400, 'Số người không hợp lệ');

  const pageSize = Math.min(Math.max(q.size, 1), MAX_PAGE_SIZE);
  const orderBy = places.orderByForSort(q.sortProperty, q.sortDirection ?? 'asc');
  const { rows, total } = await places.searchPublic(
    {
      kind: q.kind,
      minPrice: q.minPrice,
      maxPrice: q.maxPrice,
      amenities: q.amenities,
      province: q.province,
      district: q.district,
      ward: q.ward,
      attractionIds: q.attractionIds,
      keyword: q.keyword,
      needs: q.needs,
      guests: q.guests,
    },
    orderBy,
    q.page,
    pageSize,
  );
  const placeIds = rows.map((p) => p.id);

  // Chỉ nạp phần thẻ danh sách thật sự hiển thị: liên hệ cho nhà hàng / di chuyển / dịch vụ, loại phòng (giá "từ", còn
  // phòng theo ngày) và vài tiện ích cơ sở cho chỗ nghỉ.
  const contactsBy =
    placeIds.length === 0 || !q.kind || !LIST_KINDS_WITH_CONTACTS.has(q.kind)
      ? new Map<number, ContactItemDto[]>()
      : await contactsByPlaceId(placeIds);

  const listingPrice = new Map<number, number>();
  const activeRoomsBy = new Map<number, RoomTypeRow[]>();
  if (placeIds.length > 0 && (!q.kind || q.kind === 'HOMESTAY')) {
    for (const rt of await rooms.roomTypesByPlaceIdsAndStatus(placeIds, 'ACTIVE')) {
      const list = activeRoomsBy.get(rt.placeId) ?? [];
      list.push(rt);
      activeRoomsBy.set(rt.placeId, list);
      if (rt.basePrice == null || rt.basePrice < 0) continue;
      const cur = listingPrice.get(rt.placeId);
      listingPrice.set(rt.placeId, cur == null ? rt.basePrice : Math.min(cur, rt.basePrice));
    }
  }

  // Ảnh và tồn kho của cả trang lấy theo lô (mỗi loại một câu).
  const mediaBy = groupedValues(await places.publicUrlsByPlaceIds(placeIds));
  const inventory: InventoryIndex = new Map();
  if (q.checkIn && q.checkOut && activeRoomsBy.size > 0) {
    const roomIds = [...activeRoomsBy.values()].flat().map((r) => r.id);
    for (const day of await rooms.inventoryForRooms(roomIds, q.checkIn, q.checkOut)) inventory.set(invKey(day.roomTypeId, day.stayDate), day);
  }
  const extrasBy = await extrasSvc.loadExtras(placeIds);
  // Thẻ chỗ nghỉ hiện tiện ích cơ sở (chỉ loại đã xác nhận có) — một câu cho cả trang, tối đa 4 tiện ích/thẻ.
  const amenitiesBy = placeIds.length === 0 || q.kind !== 'HOMESTAY' ? new Map<number, string[]>() : await listingAmenities(placeIds);

  const content = rows.map((p): PlaceSummaryDto => {
    const media = mediaBy.get(p.id);
    const extras = extrasBy.get(p.id) ?? extrasSvc.NO_EXTRAS;
    // Thẻ danh sách chỉ hiện giá + địa điểm: không trả mô tả, điểm đánh giá (nội bộ lẫn Google) hay nhận xét.
    return {
      id: p.id,
      slug: p.slug,
      name: p.name,
      regionName: p.regionName,
      coverImageUrl: media && media.length > 0 ? media[0] : null,
      priceRefMin: listingPrice.get(p.id) ?? p.priceRefMin,
      attributes: extrasSvc.attributes(p, extras),
      kind: p.kind,
      needs: extrasSvc.needs(extras),
      latitude: p.latitude,
      longitude: p.longitude,
      address: p.address,
      suitableDateStart: extrasSvc.seasonStart(extras),
      suitableDateEnd: extrasSvc.seasonEnd(extras),
      categoryName: null,
      priceRefMax: null,
      priceUnitNote: null,
      tagBadge: p.badge,
      statsText: null,
      amenities: amenitiesBy.get(p.id) ?? null,
      highlights: null,
      durationText: extrasSvc.durationText(extras),
      contacts: contactsBy.get(p.id) ?? [],
      ...(p.kind === 'HOMESTAY' ? { hasOnlineRooms: (activeRoomsBy.get(p.id)?.length ?? 0) > 0 } : {}),
      tiktokUrl: null,
      operationStatus: p.operationStatus,
      operationStatusReason: p.operationNote,
      availableForSelectedDates: isAvailableForSelection(p, activeRoomsBy.get(p.id) ?? [], q.checkIn, q.checkOut, inventory),
    };
  });
  return pageOf(content, q.page, pageSize, total);
}

async function listingAmenities(placeIds: number[]): Promise<Map<number, string[]>> {
  const grouped = new Map<number, string[]>();
  for (const pa of await places.placeAmenities(placeIds)) {
    if (pa.value !== 'YES') continue;
    const names = grouped.get(pa.placeId) ?? [];
    if (names.length < LISTING_AMENITY_LIMIT) names.push(pa.name);
    grouped.set(pa.placeId, names);
  }
  return grouped;
}

export async function contactsByPlaceId(placeIds: readonly number[]): Promise<Map<number, ContactItemDto[]>> {
  const grouped = new Map<number, ContactItemDto[]>();
  for (const c of await places.publicContacts(placeIds)) {
    const list = grouped.get(c.placeId) ?? [];
    list.push(contactDto(c));
    grouped.set(c.placeId, list);
  }
  return grouped;
}

export interface NearbyPlaceDto {
  id: number;
  name: string;
  description: string | null;
  imageUrl: string | null;
  kind: CategoryKind;
  needs: string | null;
  distance: number;
  latitude: number | null;
  longitude: number | null;
  address: string | null;
  contacts: ContactItemDto[];
}

export async function getNearbyPlaces(id: number, radiusInKm: number): Promise<NearbyPlaceDto[]> {
  const coords = await places.coordinatesOf(id);
  if (!coords) throw new HttpError(404, `Không tìm thấy địa điểm với ID: ${id}`);
  if (coords.latitude == null || coords.longitude == null) return [];

  const radius = Math.max(0.1, Math.min(radiusInKm, MAX_NEARBY_RADIUS_KM));
  const box = geoBoxAround(coords.latitude, coords.longitude, radius);
  const nearby = await places.findNearbyPlaces(coords.latitude, coords.longitude, radius, box, id, 10);
  const contactsBy = nearby.length === 0 ? new Map<number, ContactItemDto[]>() : await contactsByPlaceId(nearby.map((n) => n.id));
  return nearby.map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    imageUrl: p.imageUrl,
    kind: p.kind,
    needs: p.needs,
    distance: p.distance,
    latitude: p.latitude,
    longitude: p.longitude,
    address: p.address,
    contacts: contactsBy.get(p.id) ?? [],
  }));
}

export interface ReviewDto {
  id: number;
  placeId: number;
  bookingCode: string | null;
  rating: number;
  content: string | null;
  images: string[];
  providerReply: string | null;
  providerReplyAt: string | null;
  guestName: string | null;
  createdAt: string;
  editableUntil: string;
}

export async function getPlaceReviews(placeId: number): Promise<ReviewDto[]> {
  // Chỉ các cột trang chi tiết hiển thị (không nạp cả đơn đặt phòng chỉ để lấy tên khách), mới nhất trước.
  const rows = await reviews.publicRowsByPlace(placeId, 'VISIBLE', PUBLIC_REVIEW_LIMIT);
  const imagesBy = groupedValues(await reviews.imagesOf(rows.map((r) => r.id)));
  return rows.map((r) => ({
    id: r.id,
    placeId,
    bookingCode: null,
    rating: r.rating,
    content: r.content,
    images: imagesBy.get(r.id) ?? [],
    providerReply: r.providerReply,
    providerReplyAt: r.providerReplyAt,
    guestName: r.guestName && r.guestName.trim() ? r.guestName : 'Khách du lịch',
    createdAt: r.createdAt,
    editableUntil: r.editableUntil,
  }));
}
