import { query } from '../db/pool.js';
import { IllegalArgumentError } from '../lib/errors.js';
import type { RefundType } from '../domain/enums.js';
import type { PlaceRow } from '../repositories/placeRepo.js';

/**
 * Hình ảnh, tiện nghi và chính sách lưu trú của một cơ sở cho các màn chi tiết phía Admin (Duyệt điểm đến, Hồ sơ nhà cung cấp). Chỉ đọc.
 */

export interface ImageDto {
  url: string;
  caption: string | null;
  cover: boolean;
}

export interface StayPolicyDto {
  checkInFrom: string;
  checkOutUntil: string;
  houseRules: string;
  surchargeNote: string;
  childrenPolicy: string;
  petsPolicy: string;
  suitability: string;
  cancellationPolicyName: string;
  cancellationPolicy: string;
  freeCancelCutoffHours: number | null;
  refundOnLateCancel: RefundType | null;
}

export interface PlaceShowcaseDto {
  placeId: number | null;
  placeName: string | null;
  images: ImageDto[];
  amenities: string[];
  stayPolicy: StayPolicyDto | null;
  rooms: unknown[];
}

const empty = (): PlaceShowcaseDto => ({ placeId: null, placeName: null, images: [], amenities: [], stayPolicy: null, rooms: [] });

const text = (value: string | null | undefined): string => (value == null ? '' : value.trim());

export async function forPlace(placeId: number): Promise<PlaceShowcaseDto> {
  const [place] = await query<PlaceRow>('SELECT * FROM place WHERE id = $1 AND is_deleted = FALSE', [placeId]);
  if (!place) throw new IllegalArgumentError(`Không tìm thấy địa điểm với ID: ${placeId}`);
  return build(place);
}

/**
 * Form đăng ký NCC không thu ảnh / tiện nghi / chính sách nên hồ sơ chưa có dữ liệu riêng: khi hồ sơ đã được duyệt thì lấy Homestay đầu
 * tiên của đối tác được tạo từ hồ sơ; còn lại trả về rỗng để giao diện hiện trạng thái trống.
 */
export async function forApplication(applicationId: number): Promise<PlaceShowcaseDto> {
  const [application] = await query<{ providerId: number | null }>('SELECT provider_id FROM provider_application WHERE id = $1', [applicationId]);
  if (!application) throw new IllegalArgumentError(`Không tìm thấy hồ sơ đăng ký với ID: ${applicationId}`);
  if (application.providerId == null) return empty();
  const [place] = await query<PlaceRow>(`SELECT * FROM place WHERE provider_id = $1 AND kind = 'HOMESTAY' AND is_deleted = FALSE ORDER BY id LIMIT 1`, [application.providerId]);
  return place ? build(place) : empty();
}

async function build(place: PlaceRow): Promise<PlaceShowcaseDto> {
  // Ảnh bìa lên đầu, còn lại giữ thứ tự sắp xếp của NCC.
  const media = await query<{ publicUrl: string | null; caption: string | null; altText: string | null; role: string }>(
    `SELECT m.public_url, pm.caption, m.alt_text, pm.role FROM place_media pm JOIN media_asset m ON m.id = pm.media_id
      WHERE pm.place_id = $1 ORDER BY pm.sort_order, pm.media_id`,
    [place.id],
  );
  const images = media
    .filter((m) => m.publicUrl != null && m.publicUrl.trim() !== '')
    .sort((a, b) => Number(b.role === 'COVER') - Number(a.role === 'COVER'))
    .map((m) => ({ url: m.publicUrl as string, caption: m.caption != null && m.caption.trim() !== '' ? m.caption : m.altText, cover: m.role === 'COVER' }));
  const amenities = (
    await query<{ name: string | null }>(`SELECT a.name FROM place_amenity pa JOIN amenity a ON a.id = pa.amenity_id WHERE pa.place_id = $1 AND pa.value = 'YES' ORDER BY a.sort_order, a.name`, [place.id])
  )
    .map((a) => a.name)
    .filter((n): n is string => n != null);
  const homestay = place.kind === 'HOMESTAY';
  return {
    placeId: place.id,
    placeName: place.name,
    images,
    amenities,
    stayPolicy: homestay ? await policyOf(place.id) : null,
    rooms: homestay ? await rooms(place.id) : [],
  };
}

async function policyOf(placeId: number): Promise<StayPolicyDto | null> {
  const [profile] = await query<{
    checkInFrom: string | null;
    checkOutUntil: string | null;
    houseRules: string | null;
    surchargeNote: string | null;
    childrenPolicy: string | null;
    petsPolicy: string | null;
    suitability: string | null;
    policyName: string | null;
    contentText: string | null;
    freeCancelCutoffHours: number | null;
    refundOnLateCancel: RefundType | null;
    hasPolicy: boolean;
  }>(
    `SELECT h.check_in_from, h.check_out_until, h.house_rules, h.surcharge_note, h.children_policy, h.pets_policy, h.suitability,
            c.name AS policy_name, c.content_text, c.free_cancel_cutoff_hours, c.refund_on_late_cancel, (c.id IS NOT NULL) AS has_policy
       FROM homestay_profile h LEFT JOIN cancellation_policy c ON c.id = h.current_policy_id WHERE h.place_id = $1`,
    [placeId],
  );
  if (!profile) return null;
  return {
    checkInFrom: profile.checkInFrom == null ? '' : localTime(profile.checkInFrom),
    checkOutUntil: profile.checkOutUntil == null ? '' : localTime(profile.checkOutUntil),
    houseRules: text(profile.houseRules),
    surchargeNote: text(profile.surchargeNote),
    childrenPolicy: text(profile.childrenPolicy),
    petsPolicy: text(profile.petsPolicy),
    suitability: text(profile.suitability),
    cancellationPolicyName: profile.hasPolicy ? text(profile.policyName) : '',
    cancellationPolicy: profile.hasPolicy ? text(profile.contentText) : '',
    freeCancelCutoffHours: profile.hasPolicy ? profile.freeCancelCutoffHours : null,
    refundOnLateCancel: profile.hasPolicy ? profile.refundOnLateCancel : null,
  };
}

/** LocalTime.toString(): "HH:mm" khi giây = 0, ngược lại "HH:mm:ss". */
function localTime(value: string): string {
  return value.length >= 8 && value.endsWith(':00') ? value.slice(0, 5) : value;
}

async function rooms(placeId: number) {
  const list = await query<{
    id: number;
    name: string;
    totalRoomCount: number;
    maxOccupancy: number | null;
    areaSqm: number | null;
    privateBathroom: string | null;
    basePrice: number | null;
    weekendPrice: number | null;
    status: string;
    viewDescription: string | null;
    description: string | null;
  }>('SELECT * FROM room_type WHERE place_id = $1 ORDER BY id', [placeId]);
  if (list.length === 0) return [];
  const ids = list.map((r) => r.id);
  const beds = new Map<number, string[]>();
  for (const b of await query<{ roomTypeId: number; bedType: string | null; quantity: number }>('SELECT room_type_id, bed_type, quantity FROM room_bed WHERE room_type_id = ANY($1) ORDER BY id', [ids])) {
    const type = b.bedType == null ? '' : b.bedType.trim().toLowerCase();
    beds.set(b.roomTypeId, [...(beds.get(b.roomTypeId) ?? []), `${b.quantity} ${type}`.trim()]);
  }
  const amenities = new Map<number, string[]>();
  for (const a of await query<{ roomTypeId: number; name: string }>(
    `SELECT ra.room_type_id, a.name FROM room_amenity ra JOIN amenity a ON a.id = ra.amenity_id
      WHERE ra.room_type_id = ANY($1) AND ra.value = 'YES' ORDER BY a.sort_order, a.name`,
    [ids],
  )) {
    amenities.set(a.roomTypeId, [...(amenities.get(a.roomTypeId) ?? []), a.name]);
  }
  const prices = new Map<number, unknown[]>();
  for (const p of await query<{ roomTypeId: number; name: string; periodStart: string; periodEnd: string; price: number }>(
    'SELECT room_type_id, name, period_start, period_end, price FROM room_special_price WHERE room_type_id = ANY($1) ORDER BY period_start',
    [ids],
  )) {
    prices.set(p.roomTypeId, [...(prices.get(p.roomTypeId) ?? []), { name: p.name, periodStart: p.periodStart, periodEnd: p.periodEnd, price: p.price }]);
  }
  return list.map((r) => ({
    id: r.id,
    name: r.name,
    totalRoomCount: r.totalRoomCount,
    maxOccupancy: r.maxOccupancy,
    areaSqm: r.areaSqm,
    privateBathroom: r.privateBathroom,
    basePrice: r.basePrice,
    weekendPrice: r.weekendPrice,
    status: r.status,
    viewDescription: text(r.viewDescription),
    description: text(r.description),
    beds: beds.get(r.id) ?? [],
    amenities: amenities.get(r.id) ?? [],
    seasonalPrices: prices.get(r.id) ?? [],
  }));
}
