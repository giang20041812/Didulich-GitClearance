import type { ExploreCategory } from '@/types/explore';

/**
 * Hằng số EP02 "Khám phá quanh Homestay" — bản sao của ExploreRules.java (backend là nơi kiểm tra cuối). Ghi chú mã BR
 * theo docs/FS_EP02_Kham_pha_quanh_Homestay.md.
 */

/** BR-02.01: tên tối đa 100 ký tự. */
export const NAME_MAX = 100;
/** BR-02.01: mô tả ngắn tối đa 300 ký tự. */
export const SUMMARY_MAX = 300;
/** BR-02.01: 1–10 ảnh. */
export const IMAGES_MIN = 1;
export const IMAGES_MAX = 10;
/** BR-02.01: ảnh gốc tối đa 5 MB (sau đó nén về ≤ 4 MB theo giới hạn kho ảnh). */
export const IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
/** BR-02.04: bán kính 1–50 km, mặc định 10 km. */
export const RADIUS_MIN_KM = 1;
export const RADIUS_MAX_KM = 50;
/** BR-02.05: tối đa 10 địa điểm ghim mỗi homestay. */
export const PIN_MAX = 10;
/** BR-C02: lý do từ chối 10–500 ký tự. */
export const REJECT_REASON_MIN = 10;
export const REJECT_REASON_MAX = 500;
/** BR-02.02: vùng phục vụ Yên Bái / Lào Cai (đề xuất, XN-13). */
export const SERVICE_AREA = { minLat: 21.3, maxLat: 22.9, minLng: 103.5, maxLng: 105.1 };
/** Tâm bản đồ chọn tọa độ khi địa điểm chưa có tọa độ: thị trấn Mù Cang Chải. */
export const DEFAULT_CENTER = { lat: 21.851, lng: 104.088 };

/** Thứ tự chip lọc / lựa chọn danh mục (BR-02.01). */
export const EXPLORE_CATEGORIES: { value: ExploreCategory; label: string }[] = [
  { value: 'FOOD', label: 'Ăn uống' },
  { value: 'SIGHTSEEING', label: 'Tham quan' },
  { value: 'CHECKIN', label: 'Check-in' },
  { value: 'EXPERIENCE', label: 'Trải nghiệm' },
  { value: 'LOCAL_SERVICE', label: 'Dịch vụ địa phương' },
];

export const CATEGORY_LABEL: Record<ExploreCategory, string> = Object.fromEntries(
  EXPLORE_CATEGORIES.map((c) => [c.value, c.label]),
) as Record<ExploreCategory, string>;

export const DAY_NAMES = ['', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy', 'Chủ nhật'];

/** BR-02.02: tọa độ trong vùng phục vụ (biên tính là trong vùng). */
export function inServiceArea(lat: number, lng: number): boolean {
  return lat >= SERVICE_AREA.minLat && lat <= SERVICE_AREA.maxLat && lng >= SERVICE_AREA.minLng && lng <= SERVICE_AREA.maxLng;
}

/** BR-02.01 / V8, V9: kiểm ảnh gốc trước khi nén và tải lên. */
export function imageProblem(file: File): string | null {
  if (!IMAGE_TYPES.includes(file.type)) return 'Chỉ nhận ảnh JPG, PNG hoặc WebP.';
  if (file.size > IMAGE_MAX_BYTES) return `Ảnh "${file.name}" vượt quá 5 MB.`;
  return null;
}

/** Độ dài theo cách backend đếm: chuẩn NFC, gộp khoảng trắng, bỏ đầu / cuối. */
export const cleanText = (raw: string) => raw.normalize('NFC').replace(/\s+/g, ' ').trim();
