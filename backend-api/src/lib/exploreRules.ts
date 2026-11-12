import { exploreCategoryOf } from '../domain/enums.js';
import type { PlaceRow } from '../repositories/placeRepo.js';
import { haversineKm } from './geo.js';

/**
 * Hằng số và quy tắc thuần của EP02 "Khám phá quanh Homestay" (docs/FS_EP02_Kham_pha_quanh_Homestay.md §4.6). Mọi giá trị cấu hình
 * nằm ở đây kèm mã BR; frontend có bản sao ở src/lib/exploreRules.ts.
 */

/** BR-02.01: tên địa điểm tối đa 100 ký tự. */
export const NAME_MAX = 100;
/** BR-02.01: mô tả ngắn tối đa 300 ký tự. */
export const SUMMARY_MAX = 300;
/** BR-02.01: ít nhất 1 ảnh, tối đa 10 ảnh. */
export const IMAGES_MIN = 1;
export const IMAGES_MAX = 10;
/** BR-02.04: bán kính quanh homestay mặc định 10 km, Admin cấu hình 1–50 km, áp dụng toàn hệ thống. */
export const RADIUS_DEFAULT_KM = 10;
export const RADIUS_MIN_KM = 1;
export const RADIUS_MAX_KM = 50;
/** Khóa lưu bán kính trong bảng app_setting (BR-02.04). */
export const RADIUS_SETTING_KEY = 'explore.radius_km';
/** BR-02.05: tối đa 10 địa điểm ghim mỗi homestay. */
export const PIN_MAX = 10;
/** BR-02.07: hiển thị 10 địa điểm đầu, mỗi lần "Xem thêm" thêm 10. */
export const PAGE_SIZE = 10;
/** BR-C02: lý do từ chối 10–500 ký tự. */
export const REJECT_REASON_MIN = 10;
export const REJECT_REASON_MAX = 500;
/** BR-02.02: vùng phục vụ — tỉnh Yên Bái / Lào Cai (hộp tọa độ bao hai tỉnh). */
export const AREA_MIN_LAT = 21.3;
export const AREA_MAX_LAT = 22.9;
export const AREA_MIN_LNG = 103.5;
export const AREA_MAX_LNG = 105.1;

/** BR-C06: khoảng cách đường thẳng giữa hai tọa độ (Haversine), đơn vị km. */
export { haversineKm };

/**
 * BR-C06 / AC-02.16: dưới 1 km hiển thị mét làm tròn 10 m ("850 m"); từ 1 km hiển thị km làm tròn 0,1 km ("2,4 km"). Làm tròn mét
 * trước: kết quả đạt 1.000 m (vd 995 m) thì hiển thị theo km ("1,0 km"). Làm tròn nửa lên trên số thập phân để 0,995 không bị sai số
 * dấu phẩy động thành 990 m.
 */
export function formatDistance(km: number): string | null {
  if (!Number.isFinite(km) || km < 0) return null;
  const meters = roundHalfUpScaled(km, 2) * 10;
  if (meters < 1000) return `${meters} m`;
  const tenths = roundHalfUpScaled(km, 1);
  return `${Math.floor(tenths / 10)},${tenths % 10} km`;
}

/** km × 10^scale làm tròn nửa lên, tính từ dạng thập phân ngắn nhất của số (như BigDecimal.valueOf(double)). */
function roundHalfUpScaled(km: number, scale: number): number {
  const text = km.toString().includes('e') ? km.toFixed(20) : km.toString();
  const [int, rawFrac = ''] = text.split('.');
  const frac = rawFrac.padEnd(scale + 1, '0');
  const kept = BigInt(int + frac.slice(0, scale));
  return Number(kept + (frac[scale] >= '5' ? 1n : 0n));
}

/** BR-02.02: tọa độ nằm trong vùng phục vụ (biên tính là trong vùng). */
export function inServiceArea(latitude: number | null | undefined, longitude: number | null | undefined): boolean {
  if (latitude == null || longitude == null) return false;
  return latitude >= AREA_MIN_LAT && latitude <= AREA_MAX_LAT && longitude >= AREA_MIN_LNG && longitude <= AREA_MAX_LNG;
}

type PlaceFacts = Pick<PlaceRow, 'kind' | 'isDeleted' | 'visibility' | 'approvalStatus'> &
  Partial<Pick<PlaceRow, 'coordVerified' | 'latitude' | 'longitude' | 'operationStatus' | 'summary' | 'description'>>;

/**
 * BR-02.03 / BR-C05: địa điểm đủ điều kiện xuất hiện ở "Khám phá quanh đây": thuộc 5 danh mục, chưa xóa, Hiển thị, đã duyệt, tọa độ đã
 * xác minh; không gồm địa điểm Tạm ngừng hoạt động.
 */
export function isExploreEligible(place: PlaceFacts | null | undefined): boolean {
  return (
    !!place &&
    place.kind != null &&
    exploreCategoryOf(place.kind) !== undefined &&
    place.isDeleted !== true &&
    place.visibility === 'PUBLISHED' &&
    place.approvalStatus === 'APPROVED' &&
    place.coordVerified === true &&
    place.latitude != null &&
    place.longitude != null &&
    place.operationStatus !== 'TEMP_CLOSED'
  );
}

/** Địa điểm khách xem được trang chi tiết (BR-02.03): chưa xóa, Hiển thị, đã duyệt, thuộc 5 danh mục. */
export function isPubliclyVisible(place: PlaceFacts | null | undefined): boolean {
  return (
    !!place &&
    place.kind != null &&
    exploreCategoryOf(place.kind) !== undefined &&
    place.isDeleted !== true &&
    place.visibility === 'PUBLISHED' &&
    place.approvalStatus === 'APPROVED'
  );
}

export function trimToNull(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

/**
 * Mô tả ngắn cho thẻ: `summary`; địa điểm cũ chưa có thì lấy tối đa 300 ký tự đầu của mô tả dài, cắt ở ranh giới từ và thêm "…"; cả
 * hai trống thì null (BR-C08: ẩn trên giao diện).
 */
export function cardSummary(place: Pick<PlaceRow, 'summary' | 'description'>): string | null {
  const summary = trimToNull(place.summary);
  if (summary != null) return summary;
  const description = trimToNull(place.description);
  if (description == null) return null;
  const flat = description.replace(/\s+/g, ' ');
  if (flat.length <= SUMMARY_MAX) return flat;
  let cut = flat.slice(0, SUMMARY_MAX - 1);
  const space = cut.lastIndexOf(' ');
  if (space > SUMMARY_MAX / 2) cut = cut.slice(0, space);
  return `${cut.trim()}…`;
}
