import type { DaySession } from './journey';

/**
 * Lên lịch trình (/lich-trinh): danh mục của một tỉnh (GET /api/public/trips/catalog) — gói mẫu lấy từ tài liệu gói
 * tour, tag lọc, dịch vụ thêm, điểm tham quan (bản đồ) và món đặc sản (ảnh trong mục ăn uống).
 */

/** Loại mục của lịch trình — khớp backend JourneyItemKind. */
export type ItemKind = 'PLACE' | 'MEAL' | 'ACTIVITY' | 'TRANSPORT' | 'STAY' | 'FREE';

export interface TripRegion {
  id: number;
  name: string;
  /** Vùng nổi bật (cấp dưới) — dòng phụ "Mù Cang Chải · Văn Chấn". */
  areas: string[];
}

/** Tag tiêu chí của lịch trình gợi ý: TRIP_DINING = ăn uống, TRIP_GOAL = trải nghiệm (mục tiêu). */
export interface TripTag {
  slug: string;
  group: 'TRIP_DINING' | 'TRIP_GOAL' | string;
  name: string;
}

/** Dịch vụ thêm — không có giá (note: "Giá ưu đãi riêng", "Đã gồm trong combo"...). */
export interface TripAddon {
  code: string;
  name: string;
  description: string | null;
  note: string | null;
}

/** Một mục của gói mẫu (giờ dạng "05:30"). */
export interface TemplateItem {
  day: number;
  start: string;
  end?: string | null;
  kind: ItemKind;
  title: string;
  note?: string | null;
  /** Slug điểm tham quan. */
  place?: string | null;
  /** Slug món đặc sản (ảnh trong mục ăn uống). */
  dishes?: string[];
  /** Mã dịch vụ thêm gắn ở mục. */
  addons?: string[];
  /** Slug điểm có thể đổi sang ("Kim Nọi / Sống Lưng Khủng Long"). */
  alternatives?: string[];
  /** Id mục của lịch trình gợi ý (gói đọc từ bảng journey) — gửi lại làm sourceStopId khi lưu. */
  id?: number | null;
  /** Id điểm tham quan (cùng điểm với `place`). */
  placeId?: number | null;
  /** Id món đặc sản (cùng các món của `dishes`). */
  dishIds?: number[];
  /** Id điểm đổi được (cùng các điểm của `alternatives`, không gồm điểm hiện tại). */
  alternativePlaceIds?: number[];
}

export interface TemplateContent {
  dayTitles?: string[];
  dayNotes?: (string | null)[];
  /** "Đã gồm" của gói. */
  included?: string[];
  /** Dịch vụ thêm của gói (mã). */
  addons?: string[];
  /** Điểm nhấn hiện trên thẻ gói. */
  highlights?: string[];
  items: TemplateItem[];
}

export interface TripTemplate {
  code: string;
  title: string;
  summary: string | null;
  days: number;
  nights: number;
  /** Mốc giá mỗi người (tag "999K/người"); null = chưa công bố. */
  priceFrom: number | null;
  /** Slug tag lọc của gói. */
  tags: string[];
  content: TemplateContent;
  /** Id lịch trình gợi ý (journey nguồn SUGGESTED) — gửi kèm làm templateId; null / thiếu = máy chủ cũ (bảng trip_template). */
  id?: number | null;
}

export interface TripPlace {
  id: number;
  slug: string;
  name: string;
  regionName: string | null;
  coverImageUrl: string | null;
  description: string | null;
  latitude: number | null;
  longitude: number | null;
  suitableSessions: DaySession[];
  /** Loại cảnh quan (nhãn SCENIC, vd "Ruộng bậc thang di sản"); null = không phải điểm ngắm cảnh. Máy chủ cũ chưa có. */
  scenicType?: string | null;
  /** Mã dịch vụ các lịch trình gợi ý dùng ở điểm này (vd đèo Khau Phạ → FLYCAM, PARAGLIDING) — chọn sẵn khi thêm mục. */
  suggestedAddons?: string[];
}

export interface TripDish {
  id: number;
  slug: string;
  name: string;
  coverImageUrl: string | null;
}

export interface TripCatalog {
  region: TripRegion | null;
  templates: TripTemplate[];
  tags: TripTag[];
  addons: TripAddon[];
  places: TripPlace[];
  dishes: TripDish[];
}

/**
 * Tiêu chí khách chọn (lưu vào journey.preferences), chọn lần lượt: thời gian → ăn uống → trải nghiệm. Chỉ là tiêu chí —
 * không có giá hay mã gói (lịch trình gợi ý tự chọn theo tiêu chí). journey.preferences cũ có thể còn khóa "price": bỏ qua.
 */
export interface TripFilters {
  /** "2-1" = 2 ngày 1 đêm (2N1Đ). */
  duration: string | null;
  /** Slug tag ăn uống (TRIP_DINING), chọn một. */
  dining: string | null;
  /** Slug tag trải nghiệm (TRIP_GOAL), chọn nhiều. */
  goals: string[];
}

/** Nguồn của mục: SUGGESTED = chép từ lịch trình gợi ý (nhãn "Gợi ý"), CUSTOM = khách tự thêm (nhãn "Bạn thêm"). */
export type ItemOrigin = 'SUGGESTED' | 'CUSTOM';

/** Tên + lời dặn của "Ngày N" (journey_day). */
export interface TripDay {
  dayIndex: number;
  title: string | null;
  note: string | null;
}

/** Một mục của lịch trình đang lên / sửa. */
export interface TripItem {
  /** Khóa trên máy (mục chưa lưu chưa có id). */
  uid: string;
  /** Id mục đã lưu (giữ bản ghi khi sửa). */
  id: number | null;
  kind: ItemKind;
  /** Ngày N của chuyến (1 = ngày đầu). */
  dayIndex: number;
  /** "HH:mm"; null = theo buổi. */
  startTime: string | null;
  endTime: string | null;
  /** Buổi khi mục không có giờ (lịch trình cũ). */
  session: DaySession | null;
  title: string;
  note: string | null;
  placeId: number | null;
  addons: string[];
  origin: ItemOrigin;
  /** Mục gốc trong lịch trình gợi ý (TemplateItem.id) — "Gợi ý gốc … · Khôi phục"; null = khách thêm / chưa biết. */
  sourceStopId: number | null;
  /** Id món (ảnh trong mục ăn uống); null = chưa biết (nháp / máy chủ cũ) → dò theo mục gốc của gói. */
  dishIds: number[] | null;
  /** Id điểm đổi nhanh được, không gồm điểm hiện tại; null = chưa biết → dò theo mục gốc của gói. */
  alternativeIds: number[] | null;
}

/** Lịch trình đang lên trên máy (nháp) — trang /lich-trinh. */
export interface TripDraft {
  version: 1;
  /** Lịch trình đã lưu đang sửa (null = chưa lưu). */
  journeyId: number | null;
  province: string | null;
  regionId: number | null;
  regionName: string | null;
  templateCode: string | null;
  /** Id lịch trình gợi ý đã chép (TripTemplate.id); null = máy chủ cũ / tự lên lịch trình. */
  templateId: number | null;
  title: string;
  /** "YYYY-MM-DD"; null = chưa chọn ngày đi. */
  startDate: string | null;
  /** Số ngày của chuyến. */
  days: number;
  guests: number;
  /** Chỗ nghỉ đã gắn (lịch trình đã đặt phòng). */
  basePlaceId: number | null;
  filters: TripFilters | null;
  items: TripItem[];
  /** Homestay khách mở luồng từ trang của nó — gợi ý chỗ ở đứng đầu. */
  stayPlaceId: number | null;
  /** Lên lịch trình cho một đơn đã có (?forBooking=) — lưu xong gắn đơn. */
  forBooking: string | null;
  /** Tên + lời dặn từng ngày; null = chưa có (lưu thì máy chủ giữ nguyên / chép theo gói). */
  dayInfo: TripDay[] | null;
}
