import { CATEGORY_KIND_LABEL, type AmenityValue, type CategoryKind } from '../domain/enums.js';
import { groupedValues } from '../lib/collections.js';
import { HttpError } from '../lib/errors.js';
import { geoBoxAround, roundHalfUp } from '../lib/geo.js';
import { addDays, today } from '../lib/time.js';
import * as places from '../repositories/placeRepo.js';
import type { PlaceWithRegion } from '../repositories/placeRepo.js';
import * as rooms from '../repositories/roomRepo.js';
import * as extrasSvc from './placeExtras.js';
import { contactDto } from './publicPlaceService.js';

/** Cửa sổ tính "số phòng còn trống" khi khách xem chi tiết mà chưa chọn ngày: 90 ngày tới. */
const AVAILABILITY_WINDOW_DAYS = 90;

/** LocalTime.toString() của Java: bỏ phần giây khi bằng 0 ("14:00:00" → "14:00"). */
export function timeToString(time: string | null | undefined): string | null {
  if (time == null) return null;
  return /^\d{2}:\d{2}:00(\.0+)?$/.test(time) ? time.slice(0, 5) : time;
}

function notFoundSlug(slug: string): HttpError {
  return new HttpError(404, `Không tìm thấy địa điểm với slug: ${slug}`);
}

export async function getPlaceDetail(slug: string) {
  const place = await places.findDetailBySlug(slug);
  if (!place) throw notFoundSlug(slug);
  return buildPlaceDetailDto(place);
}

export async function getPlaceDetailById(id: number) {
  const place = await places.findDetailById(id);
  if (!place) throw new HttpError(404, `Không tìm thấy địa điểm với ID: ${id}`);
  return buildPlaceDetailDto(place);
}

export async function getPlaceRooms(slug: string) {
  const place = await places.findDetailBySlug(slug);
  if (!place) throw notFoundSlug(slug);

  let activeRooms = await rooms.roomTypesByPlaceAndStatus(place.id, 'ACTIVE');
  // Fallback sang tất cả phòng nếu chưa có active hoặc status khác
  if (activeRooms.length === 0) activeRooms = await rooms.roomTypesByPlace(place.id);

  // Ảnh và tồn kho của mọi loại phòng lấy theo lô (2 câu), không hỏi lại cho từng phòng.
  const roomIds = activeRooms.map((r) => r.id);
  const imagesBy = groupedValues(await rooms.roomImageUrls(roomIds));
  const todayDate = today();
  const inventory = await rooms.inventoryForRooms(roomIds, todayDate, addDays(todayDate, AVAILABILITY_WINDOW_DAYS));
  const inventoryBy = new Map<number, typeof inventory>();
  for (const day of inventory) {
    const list = inventoryBy.get(day.roomTypeId) ?? [];
    list.push(day);
    inventoryBy.set(day.roomTypeId, list);
  }

  return activeRooms.map((rt) => {
    const roomImages = imagesBy.get(rt.id) ?? [];
    const coverImage = roomImages.length === 0 ? null : roomImages[0];
    const totalRooms = rt.totalRoomCount != null ? rt.totalRoomCount : 1;
    // Số phòng còn trống lấy từ tồn kho thật: đơn PENDING giữ held_rooms, CONFIRMED / PAID chiếm confirmed_rooms. Min trên
    // 90 ngày tới; ngày NCC chủ động đóng bán (stopSell) bị bỏ qua để không báo "hết phòng" cho cả loại phòng chỉ vì một ngày.
    let availableRooms = totalRooms;
    for (const day of inventoryBy.get(rt.id) ?? []) {
      if (day.stopSell) continue;
      const occupied = (day.heldRooms ?? 0) + (day.confirmedRooms ?? 0);
      const dayTotal = day.totalRooms != null ? day.totalRooms : totalRooms;
      availableRooms = Math.min(availableRooms, Math.max(0, dayTotal - occupied));
    }
    const badgeText = availableRooms > 0 ? `Còn ${availableRooms} phòng trống` : 'Hết phòng';
    const features: string[] = [];
    if (rt.maxOccupancy != null && rt.maxOccupancy > 0) features.push(`Tối đa ${rt.maxOccupancy} người`);
    if (rt.areaSqm != null) features.push(`${rt.areaSqm.toFixed(2)} m²`);
    if (rt.privateBathroom === 'YES') features.push('Vệ sinh khép kín');
    else if (rt.privateBathroom === 'NO') features.push('Vệ sinh chung');
    return {
      id: rt.id,
      placeId: place.id,
      name: rt.name,
      description: rt.description,
      maxOccupancy: rt.maxOccupancy,
      totalRoomCount: rt.totalRoomCount,
      privateBathroom: (rt.privateBathroom ?? 'UNVERIFIED') as AmenityValue,
      areaSqm: rt.areaSqm,
      basePrice: rt.basePrice,
      weekendPrice: rt.weekendPrice,
      status: rt.status ?? 'ACTIVE',
      availableRooms,
      badgeText,
      coverImage,
      images: roomImages,
      bedDescription: rt.description,
      features,
      unitNote: '/ đêm',
    };
  });
}

function resolveCategoryLabel(categoryKind: string | null): string {
  if (categoryKind == null) return 'Điểm đến';
  switch (categoryKind.toUpperCase()) {
    case 'ATTRACTION':
      return 'Danh lam thắng cảnh';
    case 'RESTAURANT':
      return 'Nhà hàng & Quán ăn';
    case 'PHOTO':
      return 'Điểm & Dịch vụ Chụp ảnh';
    case 'RENTAL':
      return 'Cho thuê trang phục & Phương tiện';
    case 'TRANSPORT':
      return 'Di chuyển & Nhà xe';
    case 'CULTURE':
      return 'Văn hóa & Lễ hội';
    case 'MARKET':
      return 'Chợ & Điểm mua sắm';
    case 'SERVICE':
      return 'Dịch vụ & Tiện ích';
    default:
      return 'Điểm lân cận';
  }
}

export async function getMapContext(slug: string) {
  const place = await places.findDetailBySlug(slug);
  if (!place) throw notFoundSlug(slug);

  const lat = place.latitude;
  const lng = place.longitude;
  const pois: Array<{
    id: number;
    name: string;
    category: CategoryKind;
    latitude: number | null;
    longitude: number | null;
    distanceKm: number | null;
    note: string;
    address: string | null;
  }> = [];
  if (lat != null && lng != null) {
    const box = geoBoxAround(lat, lng, 15.0);
    const nearby = await places.findNearbyPlaces(lat, lng, 15.0, box, place.id, 10);
    for (const np of nearby) {
      pois.push({
        id: np.id,
        name: np.name,
        category: np.kind,
        latitude: np.latitude,
        longitude: np.longitude,
        distanceKm: np.distance != null ? roundHalfUp(np.distance, 1) : null,
        address: np.address,
        note: np.address != null ? np.address : np.name,
      });
    }
  }

  const altitudeMeters = place.altitudeM;
  const verificationBadge = place.verification === 'VERIFIED' ? 'GPS Verified' : 'Community Listed';
  const scenarios: Array<Record<string, unknown>> = [
    {
      id: 'SCENARIO_1',
      code: `MAP-${place.id}`,
      label: `1. Chuẩn: ${place.name}`,
      targetName: place.name,
      latitude: lat,
      longitude: lng,
      zoomLevel: 15,
      altitudeMeters,
      accessNote: place.accessNote != null ? place.accessNote : 'Đường liên thôn vào tận nơi.',
      isPrimary: true,
    },
  ];
  // Bổ sung các điểm POI lân cận vào scenarios tương tác (tối đa 4 scenarios)
  let scenarioIndex = 2;
  for (const poi of pois) {
    if (scenarioIndex > 4) break;
    scenarios.push({
      id: `SCENARIO_${scenarioIndex}`,
      code: `POI-${poi.id}`,
      label: `${scenarioIndex}. ${resolveCategoryLabel(poi.category)}: ${poi.name}`,
      targetName: poi.name,
      latitude: poi.latitude,
      longitude: poi.longitude,
      zoomLevel: 15,
      altitudeMeters,
      accessNote: poi.address != null ? poi.address : 'Khu vực lân cận',
      isPrimary: false,
    });
    scenarioIndex++;
  }

  return {
    placeId: place.id,
    placeSlug: place.slug,
    placeName: place.name,
    regionName: place.regionName,
    address: place.address,
    latitude: lat,
    longitude: lng,
    altitudeMeters,
    accessNote: place.accessNote,
    verificationBadge,
    pois,
    scenarios,
  };
}

function resolveAmenityIcon(code: string | null): string {
  if (code == null) return 'CheckCircle';
  switch (code.toUpperCase()) {
    case 'WIFI':
    case 'FREE_WIFI':
      return 'Wifi';
    case 'PARKING':
    case 'FREE_PARKING':
      return 'Car';
    case 'KITCHEN':
    case 'FREE_KITCHEN':
      return 'ChefHat';
    case 'MEAL':
    case 'MEAL_ON_DEMAND':
    case 'RESTAURANT':
      return 'Utensils';
    case 'HOT_WATER':
      return 'ShowerHead';
    case 'MOSQUITO_NET':
      return 'Shield';
    case 'BUS_PICKUP':
    case 'TRANSPORT':
      return 'Bus';
    case 'AIR_CONDITIONING':
      return 'Wind';
    case 'BALCONY':
      return 'Maximize2';
    case 'BATHTUB':
      return 'Bath';
    case 'BBQ_AREA':
      return 'Flame';
    case 'MOTORBIKE_RENTAL':
      return 'Bike';
    case 'FIREPLACE':
      return 'Flame';
    default:
      return 'CheckCircle';
  }
}

const decimal6 = (n: number) => n.toFixed(6);

async function buildPlaceDetailDto(place: PlaceWithRegion) {
  // 1. Media
  const mediaRows = await places.mediaWithAsset(place.id);
  const images: string[] = [];
  const media: Array<{ id: number; publicUrl: string; role: string; caption: string | null; sortOrder: number }> = [];
  for (const pm of mediaRows) {
    if (pm.publicUrl != null) {
      images.push(pm.publicUrl);
      media.push({ id: pm.mediaId, publicUrl: pm.publicUrl, role: pm.role ?? 'GALLERY', caption: pm.caption, sortOrder: pm.sortOrder });
    }
  }

  // 2. Amenities
  const placeAmenities = await places.placeAmenities([place.id]);
  const amenities = placeAmenities.map((pa) => pa.name);
  const amenityItems = placeAmenities.map((pa) => ({
    id: pa.amenityId,
    code: pa.code,
    name: pa.name,
    icon: resolveAmenityIcon(pa.code),
    value: pa.value ?? 'YES',
    note: pa.note,
  }));

  // 3. Rooms — chỉ chỗ nghỉ mới có loại phòng, hồ sơ lưu trú và dịch vụ tại chỗ.
  const lodging = place.kind === 'HOMESTAY';
  const roomTypes = lodging ? await rooms.roomTypesByPlace(place.id) : [];
  const roomIds = roomTypes.map((r) => r.id);
  const imagesBy = groupedValues(await rooms.roomImageUrls(roomIds));
  const amenitiesBy = groupedValues(await rooms.roomAmenityNames(roomIds));
  const roomDtos = roomTypes.map((rt) => ({
    id: rt.id,
    name: rt.name,
    description: rt.description,
    maxOccupancy: rt.maxOccupancy,
    totalRoomCount: rt.totalRoomCount,
    areaSqm: rt.areaSqm,
    basePrice: rt.basePrice,
    weekendPrice: rt.weekendPrice,
    status: rt.status ?? 'ACTIVE',
    images: imagesBy.get(rt.id) ?? [],
    amenities: amenitiesBy.get(rt.id) ?? [],
    otherAmenities: rt.otherAmenities,
  }));

  // 4. Loại địa điểm
  const extras = await extrasSvc.loadExtrasOf(place.id);

  // 5. Contacts (SĐT, FB, TikTok, Zalo, Google Maps...)
  const contacts = (await places.publicContacts([place.id])).map(contactDto);

  // 6. Highlights (Ưu nhược điểm: PRO, CON, TIP) — giữ đúng thứ tự nhập.
  const highlights = (await places.publicHighlights(place.id))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id)
    .map((h) => ({ id: h.id, type: h.type, content: h.content }));

  // 7. Tỉnh / thành của địa điểm (trang homestay mở /lich-trinh đúng tỉnh)
  const province = place.regionId == null ? null : await places.provinceOfRegion(place.regionId);

  // 8. GPS & Altitude
  const verifiedGpsText = place.latitude != null && place.longitude != null ? `${decimal6(place.latitude)} - ${decimal6(place.longitude)}` : null;

  // Hồ sơ lưu trú NCC đã lưu (không hiển thị chính sách bịa).
  let homestayProfile: Record<string, unknown> | null = null;
  if (lodging) {
    const profile = await rooms.homestayProfile(place.id);
    if (profile) {
      const policy = profile.currentPolicyId == null ? null : await rooms.policyById(profile.currentPolicyId);
      homestayProfile = {
        placeId: place.id,
        checkInFrom: timeToString(profile.checkInFrom),
        checkOutUntil: timeToString(profile.checkOutUntil),
        houseRules: profile.houseRules,
        surchargeNote: profile.surchargeNote,
        childrenPolicy: profile.childrenPolicy,
        petsPolicy: profile.petsPolicy,
        viewHighlight: profile.viewHighlight,
        suitability: profile.suitability,
        otherAmenities: profile.otherAmenities,
        currentPolicy: policy ? { id: policy.id, name: policy.name, description: policy.contentText } : null,
      };
    }
  }

  const services = lodging
    ? (await rooms.serviceOffers(place.id, true)).map((s) => ({
        id: s.id,
        name: s.name,
        description: s.description,
        price: s.price,
        priceUnit: s.priceUnit,
        active: s.active,
      }))
    : [];

  return {
    id: place.id,
    slug: place.slug,
    name: place.name,
    kind: place.kind,
    needs: extrasSvc.needs(extras),
    categoryKind: place.kind,
    categoryName: CATEGORY_KIND_LABEL[place.kind],
    regionName: place.regionName,
    address: place.address,
    latitude: place.latitude,
    longitude: place.longitude,
    accessNote: place.accessNote,
    priceRefMin: place.priceRefMin,
    priceRefMax: place.priceRefMax,
    priceUnitNote: place.priceUnitNote != null ? place.priceUnitNote : 'đêm',
    operationStatus: place.operationStatus ?? 'OPERATING',
    operationStatusReason: place.operationNote,
    verification: place.verification ?? 'UNVERIFIED',
    ratingAvg: place.ratingAvg,
    ratingCount: place.ratingCount ?? 0,
    googleRating: place.googleRating,
    description: place.description,
    altitudeMeters: place.altitudeM,
    verifiedGpsText,
    suitableDateStart: extrasSvc.seasonStart(extras),
    suitableDateEnd: extrasSvc.seasonEnd(extras),
    attributes: extrasSvc.attributes(place, extras),
    images,
    amenities,
    rooms: roomDtos,
    media,
    amenityItems,
    contacts,
    highlights,
    homestayProfile,
    services,
    provinceName: province ? province.name : null,
  };
}
