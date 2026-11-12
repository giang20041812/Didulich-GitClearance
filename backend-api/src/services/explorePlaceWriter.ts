import { randomUUID } from 'node:crypto';
import { exec, one, query } from '../db/pool.js';
import { insertRow, updateRow } from '../db/sql.js';
import { EXPLORE_CATEGORY_INFO, SERVICE_GROUP_INFO, type CategoryKind, type ExploreCategory, type PlaceApprovalStatus, type PlaceVisibility, type ServiceGroup, type SourceType } from '../domain/enums.js';
import { IllegalArgumentError, InvalidFieldsError, type FieldError } from '../lib/errors.js';
import * as rules from '../lib/exploreRules.js';
import { roundHalfUp } from '../lib/geo.js';
import { dayName } from '../lib/openingHours.js';
import { nowLocal } from '../lib/time.js';
import { normalize } from '../lib/vietnamese.js';
import * as placeRepo from '../repositories/placeRepo.js';
import type { PlaceRow } from '../repositories/placeRepo.js';

/**
 * Kiểm tra và ghi form địa điểm (AD-02, NCC dùng chung) — BR-02.01, BR-02.02, BR-C05; thông báo lỗi theo FS §5 (V1–V17), trả đủ lỗi từng
 * trường một lượt ({@link InvalidFieldsError}).
 */

export interface ImageInput {
  mediaId?: number | null;
  imageId?: string | null;
  url?: string | null;
}

/** Giờ một ngày trong form; open/close dạng "HH:mm", bỏ trống khi closed. */
export interface OpeningHourInput {
  dayOfWeek?: number | null;
  closed?: boolean | null;
  open?: string | null;
  close?: string | null;
}

/** Thông tin riêng của dịch vụ nhà xe / trải nghiệm (place_service_profile). */
export interface ServiceProfileInput {
  serviceGroup?: ServiceGroup | null;
  vehicleType?: string | null;
  routeFrom?: string | null;
  routeTo?: string | null;
  departureTimes?: string | null;
  durationMinutes?: number | null;
  seats?: number | null;
  groupSizeMax?: number | null;
  languages?: Array<string | null> | null;
  includes?: string | null;
}

/**
 * Form thêm / sửa địa điểm (BR-02.01, BR-02.02). Ảnh đầu tiên là ảnh bìa. `openingHours` rỗng = không khai báo giờ mở cửa. Admin gửi
 * thêm `coordVerified` và `visible`; NCC gửi thì hai trường này bị bỏ qua. `service` chỉ có ở form dịch vụ nhà xe / trải nghiệm: khi khác
 * null thì giá (`priceFrom`, `priceUnit`) và thông tin dịch vụ được ghi theo form; null = giữ nguyên.
 */
export interface PlaceInput {
  name?: string | null;
  category?: ExploreCategory | null;
  summary?: string | null;
  description?: string | null;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  phone?: string | null;
  website?: string | null;
  openingHours?: Array<OpeningHourInput | null> | null;
  images?: Array<ImageInput | null> | null;
  coordVerified?: boolean | null;
  visible?: boolean | null;
  priceFrom?: number | null;
  priceUnit?: string | null;
  service?: ServiceProfileInput | null;
}

export const DESCRIPTION_MAX = 10_000;
export const ADDRESS_MAX = 500;
export const WEBSITE_MAX = 1000;
const VEHICLE_TYPE_MAX = 64;
const ROUTE_MAX = 120;
const DEPARTURE_TIMES_MAX = 255;
const INCLUDES_MAX = 1000;
const PRICE_UNIT_MAX = 32;
const DURATION_MIN = 10;
/** 7 ngày — tour xe máy / trekking nhiều ngày. */
const DURATION_MAX = 10_080;
const SEATS_MAX = 100;
const GROUP_SIZE_MAX = 500;
const PRICE_MAX = 100_000_000;
/** Ngôn ngữ hướng dẫn của trải nghiệm (cùng bộ mã với đơn đăng ký NCC). */
const LANGUAGES = ['VI', 'EN', 'HMONG', 'THAI', 'OTHER'];
/** Số điện thoại Việt Nam: 0 hoặc +84, rồi 9–10 chữ số (sau khi bỏ khoảng trắng, dấu chấm, gạch). */
const PHONE = /^(\+84|0)\d{9,10}$/;
const HTTP_URL = /^https?:\/\/\S+$/i;

export const text = (value: string | null | undefined): string | null => {
  if (value == null) return null;
  const trimmed = value.normalize('NFC').trim();
  return trimmed === '' ? null : trimmed;
};

export const displayName = (raw: string | null | undefined): string => (raw == null ? '' : raw.normalize('NFC').replace(/\s+/g, ' ').trim());

/** Tên không dấu, chữ thường — cột name_norm dùng để tìm kiếm. */
export const normalizeName = (raw: string | null | undefined): string => normalize(displayName(raw));

const normalizePhone = (phone: string): string => phone.replace(/[\s.\-()]/g, '');
export const isHttpUrl = (value: string | null | undefined): boolean => value != null && HTTP_URL.test(value.trim());

/** LocalTime.parse: "HH:mm" hoặc "HH:mm:ss"; sai định dạng → null. */
function time(value: string | null | undefined): string | null {
  if (value == null || value.trim() === '') return null;
  const m = /^(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,9})?)?$/.exec(value.trim());
  if (!m) return null;
  const [h, mi, s] = [Number(m[1]), Number(m[2]), Number(m[3] ?? 0)];
  if (h > 23 || mi > 59 || s > 59) return null;
  return `${m[1]}:${m[2]}:${(m[3] ?? '00').padStart(2, '0')}`;
}

// ---- Kiểm tra ---------------------------------------------------------------------------------------------------------------------

/** Ảnh trong form, bỏ phần tử rỗng và ảnh trùng. */
export function imagesOf(input: PlaceInput): ImageInput[] {
  const result: ImageInput[] = [];
  const seen = new Set<string>();
  for (const image of input.images ?? []) {
    if (!image) continue;
    const key = image.mediaId != null ? `m${image.mediaId}` : `u${text(image.imageId)}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(image);
    }
  }
  return result;
}

/** Kiểm mọi trường của form; `admin` = được gửi cờ "Tọa độ đã xác minh" (BR-C05). */
export function validate(input: PlaceInput | null | undefined, admin: boolean): void {
  if (!input) throw new IllegalArgumentError('Thiếu thông tin địa điểm.');
  const errors: FieldError[] = [];
  const add = (field: string, message: string) => errors.push({ field, message });
  const name = displayName(input.name);
  if (name === '') add('name', 'Vui lòng nhập tên địa điểm.');
  else if (name.length > rules.NAME_MAX) add('name', `Tên địa điểm tối đa ${rules.NAME_MAX} ký tự.`);
  if (input.category == null) add('category', 'Vui lòng chọn danh mục.');
  const summary = text(input.summary);
  if (summary == null) add('summary', 'Vui lòng nhập mô tả ngắn.');
  else if (summary.length > rules.SUMMARY_MAX) add('summary', `Mô tả ngắn tối đa ${rules.SUMMARY_MAX} ký tự.`);
  const description = text(input.description);
  if (description != null && description.length > DESCRIPTION_MAX) add('description', `Mô tả chi tiết tối đa ${DESCRIPTION_MAX} ký tự.`);
  const address = text(input.address);
  if (address != null && address.length > ADDRESS_MAX) add('address', `Địa chỉ tối đa ${ADDRESS_MAX} ký tự.`);

  const images = imagesOf(input);
  if (images.length < rules.IMAGES_MIN) add('images', 'Vui lòng thêm ít nhất 1 ảnh.');
  else if (images.length > rules.IMAGES_MAX) add('images', `Mỗi địa điểm tối đa ${rules.IMAGES_MAX} ảnh.`);
  else if (images.some((i) => i.mediaId == null && (text(i.imageId) == null || !isHttpUrl(i.url)))) add('images', 'Ảnh không hợp lệ, vui lòng tải lại ảnh.');

  if ((input.latitude == null) !== (input.longitude == null)) add('coordinates', 'Vui lòng nhập đủ vĩ độ và kinh độ.');
  else if (input.latitude != null && !rules.inServiceArea(input.latitude, input.longitude)) add('coordinates', 'Tọa độ nằm ngoài vùng phục vụ (tỉnh Yên Bái / Lào Cai).');
  if (admin && input.coordVerified === true && input.latitude == null) add('coordVerified', 'Cần nhập tọa độ trước khi xác minh.');

  const phone = text(input.phone);
  if (phone != null && !PHONE.test(normalizePhone(phone))) add('phone', 'Số điện thoại không hợp lệ.');
  const website = text(input.website);
  if (website != null && (!isHttpUrl(website) || website.length > WEBSITE_MAX)) add('website', 'Website phải bắt đầu bằng http:// hoặc https://.');

  validateHours(input.openingHours, errors);
  validateService(input, errors);
  if (errors.length > 0) throw new InvalidFieldsError(errors);
}

/** Giá và thông tin dịch vụ nhà xe / trải nghiệm — chỉ kiểm khi form có khối `service`. */
function validateService(input: PlaceInput, errors: FieldError[]): void {
  const s = input.service;
  if (!s) return;
  const add = (field: string, message: string) => errors.push({ field, message });
  const group = s.serviceGroup ?? null;
  if (group == null) add('serviceGroup', 'Vui lòng chọn loại dịch vụ.');
  else if (input.category != null && !EXPLORE_CATEGORY_INFO[input.category].kinds.includes(SERVICE_GROUP_INFO[group].kind)) {
    add('serviceGroup', 'Loại dịch vụ không thuộc danh mục đã chọn.');
  }
  if (group != null && SERVICE_GROUP_INFO[group].kind === 'TRANSPORT') {
    const vehicle = text(s.vehicleType);
    if (vehicle != null && vehicle.length > VEHICLE_TYPE_MAX) add('vehicleType', `Loại xe tối đa ${VEHICLE_TYPE_MAX} ký tự.`);
    const fixedRoute = group === 'INTERCITY_BUS' || group === 'SHARED_CAR';
    if (fixedRoute && (text(s.routeFrom) == null || text(s.routeTo) == null)) add('route', 'Vui lòng nhập điểm đi và điểm đến của tuyến.');
    const departures = text(s.departureTimes);
    if (departures != null && departures.length > DEPARTURE_TIMES_MAX) add('departureTimes', `Giờ chạy tối đa ${DEPARTURE_TIMES_MAX} ký tự.`);
    if (s.seats != null && (s.seats < 1 || s.seats > SEATS_MAX)) add('seats', `Số chỗ mỗi xe từ 1 đến ${SEATS_MAX}.`);
  } else if (group != null) {
    if (s.groupSizeMax != null && (s.groupSizeMax < 1 || s.groupSizeMax > GROUP_SIZE_MAX)) add('groupSizeMax', `Số khách mỗi đoàn từ 1 đến ${GROUP_SIZE_MAX}.`);
    if (s.languages != null && s.languages.some((l) => l == null || !LANGUAGES.includes(l.trim().toUpperCase()))) add('languages', 'Ngôn ngữ hướng dẫn không hợp lệ.');
  }
  const from = text(s.routeFrom);
  const to = text(s.routeTo);
  if ((from != null && from.length > ROUTE_MAX) || (to != null && to.length > ROUTE_MAX)) add('route', `Điểm đi / điểm đến tối đa ${ROUTE_MAX} ký tự.`);
  if (s.durationMinutes != null && (s.durationMinutes < DURATION_MIN || s.durationMinutes > DURATION_MAX)) add('durationMinutes', `Thời lượng từ ${DURATION_MIN} phút đến 7 ngày.`);
  const includes = text(s.includes);
  if (includes != null && includes.length > INCLUDES_MAX) add('includes', `Mục "Đã bao gồm" tối đa ${INCLUDES_MAX} ký tự.`);
  if (input.priceFrom != null && (input.priceFrom < 0 || input.priceFrom > PRICE_MAX)) add('priceFrom', 'Giá phải từ 0 đến 100.000.000 đ.');
  const unit = text(input.priceUnit);
  if (unit != null && unit.length > PRICE_UNIT_MAX) add('priceUnit', `Đơn vị giá tối đa ${PRICE_UNIT_MAX} ký tự.`);
}

function validateHours(hours: Array<OpeningHourInput | null> | null | undefined, errors: FieldError[]): void {
  if (!hours || hours.length === 0) return;
  const days = new Set<number>();
  for (const h of hours) {
    if (!h || h.dayOfWeek == null || h.dayOfWeek < 1 || h.dayOfWeek > 7 || days.has(h.dayOfWeek)) {
      errors.push({ field: 'openingHours', message: 'Giờ mở cửa không hợp lệ.' });
      return;
    }
    days.add(h.dayOfWeek);
    if (h.closed === true) continue;
    const day = dayName(h.dayOfWeek);
    const open = time(h.open);
    const close = time(h.close);
    if (open == null || close == null) {
      errors.push({ field: 'openingHours', message: `Vui lòng nhập giờ mở và giờ đóng cho ${day}.` });
      return;
    }
    if (open === close) {
      errors.push({ field: 'openingHours', message: `Giờ mở và giờ đóng không được trùng nhau (${day}).` });
      return;
    }
  }
}

// ---- Ghi ------------------------------------------------------------------------------------------------------------------------------

export interface NewPlaceOptions {
  category: ExploreCategory;
  actorId: number | null;
  providerId?: number | null;
  sourceType: SourceType;
  approvalStatus: PlaceApprovalStatus;
  visibility: PlaceVisibility;
}

/** Địa điểm mới theo danh mục; slug ngẫu nhiên như homestay ("restaurant-…"). */
export function newPlace(o: NewPlaceOptions): Promise<PlaceRow> {
  const kind: CategoryKind = EXPLORE_CATEGORY_INFO[o.category].defaultKind;
  return placeRepo.insertPlace({
    slug: `${kind.toLowerCase()}-${randomUUID()}`,
    kind,
    name: '',
    nameNorm: '',
    createdBy: o.actorId,
    updatedBy: o.actorId,
    providerId: o.providerId ?? null,
    sourceType: o.sourceType,
    approvalStatus: o.approvalStatus,
    visibility: o.visibility,
  });
}

const scale = (coordinate: number | null | undefined): number | null => (coordinate == null ? null : roundHalfUp(coordinate, 6));

/**
 * Ghi nội dung form vào địa điểm rồi lưu (form đã qua {@link validate}). Đổi tọa độ thì cờ xác minh tự tắt (placeRepo.updatePlace). Cờ /
 * hiển thị của Admin xử lý ở service gọi. Trả về địa điểm sau khi lưu.
 */
export async function apply(place: PlaceRow, input: PlaceInput, actorId: number | null): Promise<PlaceRow> {
  const service = input.service ?? null;
  const category = input.category as ExploreCategory;
  const kinds = EXPLORE_CATEGORY_INFO[category].kinds;
  const patch: Partial<PlaceRow> = {
    name: displayName(input.name),
    nameNorm: normalizeName(input.name),
    summary: text(input.summary),
    description: text(input.description),
    address: text(input.address),
    latitude: scale(input.latitude),
    longitude: scale(input.longitude),
    updatedBy: actorId,
  };
  // Nhóm dịch vụ quyết định đúng loại địa điểm (xe khách → TRANSPORT, hiện ở trang Di chuyển).
  if (service?.serviceGroup && kinds.includes(SERVICE_GROUP_INFO[service.serviceGroup].kind)) patch.kind = SERVICE_GROUP_INFO[service.serviceGroup].kind;
  else if (!kinds.includes(place.kind)) patch.kind = EXPLORE_CATEGORY_INFO[category].defaultKind;
  if (service) {
    // Form dịch vụ chỉ có giá "từ": bỏ giá "đến" cũ để không vướng ràng buộc min <= max.
    patch.priceRefMin = input.priceFrom == null ? null : Math.round(input.priceFrom);
    patch.priceRefMax = null;
    patch.priceUnitNote = input.priceFrom == null ? null : text(input.priceUnit);
  }
  const saved = await placeRepo.updatePlace(place, patch);
  const phone = text(input.phone);
  await writeContacts(saved.id, phone == null ? null : normalizePhone(phone), text(input.website));
  await writeHours(saved.id, input.openingHours);
  await writeImages(saved.id, imagesOf(input), actorId);
  await writeServiceProfile(saved, service);
  return (await placeRepo.findById(saved.id)) as PlaceRow;
}

/** Mã ngôn ngữ chuẩn hóa, bỏ trùng, giữ thứ tự; null khi không chọn. */
function languagesOf(codes: Array<string | null> | null | undefined): string | null {
  if (!codes) return null;
  const clean = [...new Set(codes.filter((c): c is string => c != null).map((c) => c.trim().toUpperCase()).filter((c) => LANGUAGES.includes(c)))];
  return clean.length === 0 ? null : clean.join(',');
}

/**
 * Ghi thông tin dịch vụ; trường không áp dụng cho loại thì bỏ (nhà xe không có số khách mỗi đoàn…). Form không có khối dịch vụ thì giữ
 * nguyên — trừ khi địa điểm đã đổi sang loại khác, khi đó thông tin cũ không còn đúng nên xóa.
 */
async function writeServiceProfile(place: PlaceRow, s: ServiceProfileInput | null): Promise<void> {
  if (!s) {
    const [current] = await query<{ serviceGroup: ServiceGroup }>('SELECT service_group FROM place_service_profile WHERE place_id = $1', [place.id]);
    if (current && SERVICE_GROUP_INFO[current.serviceGroup].kind !== place.kind) await exec('DELETE FROM place_service_profile WHERE place_id = $1', [place.id]);
    return;
  }
  const group = s.serviceGroup as ServiceGroup;
  const transport = SERVICE_GROUP_INFO[group].kind === 'TRANSPORT';
  const fields = {
    serviceGroup: group,
    vehicleType: transport ? text(s.vehicleType) : null,
    routeFrom: text(s.routeFrom),
    routeTo: transport ? text(s.routeTo) : null,
    departureTimes: transport ? text(s.departureTimes) : null,
    durationMinutes: s.durationMinutes ?? null,
    seats: transport ? (s.seats ?? null) : null,
    groupSizeMax: transport ? null : (s.groupSizeMax ?? null),
    languages: transport ? null : languagesOf(s.languages),
    includes: text(s.includes),
    updatedAt: nowLocal(),
  };
  const exists = await one('SELECT place_id FROM place_service_profile WHERE place_id = $1', [place.id]);
  if (exists) await updateRow('place_service_profile', place.id, fields, 'place_id');
  else await insertRow('place_service_profile', { placeId: place.id, ...fields });
}

/** Thay số điện thoại và website; giữ nguyên các kênh liên hệ khác (Zalo, Facebook...) của dữ liệu cũ. */
async function writeContacts(placeId: number, phone: string | null, website: string | null): Promise<void> {
  await exec(`DELETE FROM place_contact WHERE place_id = $1 AND channel IN ('PHONE', 'WEBSITE')`, [placeId]);
  if (phone != null) await insertRow('place_contact', { placeId, channel: 'PHONE', value: phone, isPublic: true, sortOrder: 0 });
  if (website != null) await insertRow('place_contact', { placeId, channel: 'WEBSITE', value: website, isPublic: true, sortOrder: 1 });
}

async function writeHours(placeId: number, hours: Array<OpeningHourInput | null> | null | undefined): Promise<void> {
  await exec('DELETE FROM place_opening_hour WHERE place_id = $1', [placeId]);
  if (!hours) return;
  for (const h of hours) {
    if (!h) continue;
    const closed = h.closed === true;
    await insertRow('place_opening_hour', {
      placeId,
      dayOfWeek: h.dayOfWeek,
      isClosed: closed,
      openTime: closed ? null : time(h.open),
      closeTime: closed ? null : time(h.close),
    });
  }
}

const mimeType = (url: string | null | undefined): string => {
  const lower = (url ?? '').toLowerCase();
  if (lower.includes('.png')) return 'image/png';
  if (lower.includes('.webp')) return 'image/webp';
  return 'image/jpeg';
};

/** Đồng bộ ảnh: giữ ảnh cũ còn trong form, thêm ảnh mới tải lên, bỏ ảnh không còn; ảnh đầu tiên là ảnh bìa. */
async function writeImages(placeId: number, images: ImageInput[], actorId: number | null): Promise<void> {
  const current = new Set((await query<{ mediaId: number }>('SELECT media_id FROM place_media WHERE place_id = $1', [placeId])).map((r) => r.mediaId));
  const ordered: number[] = [];
  const created: number[] = [];
  for (const image of images) {
    if (image.mediaId != null) {
      if (!current.has(image.mediaId)) throw new InvalidFieldsError([{ field: 'images', message: 'Ảnh không thuộc địa điểm này.' }]);
      ordered.push(image.mediaId);
    } else {
      const key = `cloudinary:${text(image.imageId)}`;
      if (await one('SELECT id FROM media_asset WHERE storage_key = $1', [key])) {
        throw new InvalidFieldsError([{ field: 'images', message: 'Ảnh này đã được sử dụng, vui lòng tải ảnh khác.' }]);
      }
      const asset = await insertRow<{ id: number }>('media_asset', {
        storageKey: key,
        publicUrl: (image.url as string).trim(),
        mimeType: mimeType(image.url),
        uploadedBy: actorId,
        createdAt: nowLocal(),
      });
      created.push(asset.id);
      ordered.push(asset.id);
    }
  }
  // 1. Bỏ ảnh không còn trong form, đưa mọi ảnh còn lại về GALLERY (mỗi địa điểm tối đa một ảnh bìa).
  await exec('DELETE FROM place_media WHERE place_id = $1 AND NOT (media_id = ANY($2::bigint[]))', [placeId, ordered]);
  await exec(`UPDATE place_media SET role = 'GALLERY' WHERE place_id = $1`, [placeId]);
  // 2. Thêm ảnh mới (GALLERY).
  for (const mediaId of created) await insertRow('place_media', { placeId, mediaId, role: 'GALLERY', sortOrder: 0 });
  // 3. Thứ tự và ảnh bìa.
  for (let i = 0; i < ordered.length; i++) {
    await exec('UPDATE place_media SET sort_order = $3, role = $4 WHERE place_id = $1 AND media_id = $2', [placeId, ordered[i], i, i === 0 ? 'COVER' : 'GALLERY']);
  }
}
