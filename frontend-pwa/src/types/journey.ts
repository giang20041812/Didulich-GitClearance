import type { ItemKind, ItemOrigin, TripDay } from './trip';

/** Buổi tham quan trong ngày (backend DaySession). */
export type DaySession = 'MORNING' | 'NOON' | 'AFTERNOON' | 'EVENING';

/** Check-in địa điểm (ảnh + lưu bút). hidden = Admin đã ẩn (chỉ chủ lịch trình còn thấy, kèm lý do). */
export interface CheckinView {
  id: number;
  photoUrl: string | null;
  note: string | null;
  hidden: boolean;
  hiddenReason: string | null;
  createdAt: string;
}

/**
 * Một mục của lịch trình đã lưu (GET/POST/PUT /api/v1/traveler/journeys). Điểm tham quan (kind PLACE) kèm cẩm nang (video,
 * hướng dẫn đường); mục ăn uống / hoạt động / di chuyển / chỗ ở / nghỉ ngơi có thể không gắn địa điểm (placeId null).
 */
export interface JourneyStopView {
  id: number;
  placeId: number | null;
  placeName: string | null;
  placeSlug?: string | null;
  coverImageUrl?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  visitDate: string | null;
  session: DaySession;
  tiktokUrl?: string | null;
  /** Hướng dẫn đường đi do ban quản trị nhập. */
  accessNote?: string | null;
  address?: string | null;
  summary?: string | null;
  checkin?: CheckinView | null;
  /** Loại mục (bản backend cũ chưa có = điểm tham quan). */
  kind?: ItemKind;
  /** Tên mục (vd "Ăn trưa tại Tú Lệ"); null = dùng tên địa điểm. */
  title?: string | null;
  /** Ngày N của chuyến khi chưa có ngày đi. */
  dayIndex?: number | null;
  /** "HH:mm". */
  startTime?: string | null;
  endTime?: string | null;
  note?: string | null;
  /** Mã dịch vụ thêm (FLYCAM...). */
  addons?: string[];
  /** SUGGESTED = chép từ lịch trình gợi ý (nhãn "Gợi ý"), CUSTOM = khách thêm. Máy chủ cũ chưa có. */
  origin?: ItemOrigin;
  /** Mục gốc trong lịch trình gợi ý (so với bản gợi ý để "Khôi phục"). */
  sourceStopId?: number | null;
  /** Id món của mục (ảnh trong mục ăn uống). */
  dishIds?: number[];
  /** Id điểm đổi nhanh được (không gồm điểm hiện tại). */
  alternativePlaceIds?: number[];
}

/** Tên + lời dặn của "Ngày N" (journey_day). */
export type JourneyDayView = TripDay;

/** Điểm tham quan của lịch trình (có địa điểm) — cẩm nang, check-in, "Hôm nay", route. */
export type SightStopView = JourneyStopView & { placeId: number; placeName: string };

/** Mục là điểm tham quan (check-in, cẩm nang, route). */
export const isSightStop = <T extends { kind?: ItemKind; placeId: number | null }>(stop: T): stop is T & { placeId: number; placeName: string } =>
  (stop.kind ?? 'PLACE') === 'PLACE' && stop.placeId != null;

/** Tên hiển thị của mục: tiêu đề, không có thì tên địa điểm. */
export const stopName = (stop: { title?: string | null; placeName: string | null }) => stop.title?.trim() || stop.placeName || 'Mục lịch trình';

export interface BasePlaceView {
  id: number;
  name: string;
  slug?: string | null;
  coverImageUrl?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

export interface JourneyView {
  id: number;
  basePlaceId: number | null;
  basePlace?: BasePlaceView | null;
  title: string | null;
  startDate: string | null;
  endDate: string | null;
  /** Đơn đặt phòng đang gắn (null = lịch trình độc lập). */
  bookingCode?: string | null;
  /** Mã chia sẻ công khai (null = chưa chia sẻ). */
  shareToken?: string | null;
  stops: JourneyStopView[];
  updatedAt: string;
  /** Đã đăng lên trang "Trải nghiệm" (null = chưa). */
  publishedAt?: string | null;
  /** Admin đã ẩn bài khỏi trang "Trải nghiệm" (kèm lý do, chỉ chủ lịch trình thấy). */
  feedHidden?: boolean;
  feedHiddenReason?: string | null;
  /** Tỉnh / thành của chuyến (lên từ trang /lich-trinh). */
  regionId?: number | null;
  regionName?: string | null;
  guestCount?: number | null;
  /** Mã gói mẫu đã dùng. */
  templateCode?: string | null;
  /** Tag đã chọn khi lọc gói. */
  preferences?: Record<string, unknown> | null;
  /** Trạng thái đơn đang gắn. */
  bookingStatus?: 'PENDING' | 'CONFIRMED' | 'PAID' | 'CANCELLED' | null;
  /** TRAVELER = lịch trình của khách; SUGGESTED = lịch trình gợi ý (gói mẫu). */
  source?: 'SUGGESTED' | 'TRAVELER';
  /** Id lịch trình gợi ý đã chép (TripTemplate.id). */
  templateId?: number | null;
  /** Tên + lời dặn từng ngày. */
  days?: JourneyDayView[];
  /** Slug tag lọc (chép theo gói). */
  tags?: string[];
}

/** Lịch trình gửi kèm khi đặt phòng — lưu cùng đơn (journeyId: nháp đang sửa lịch trình đã lưu). */
/** Một bài trên trang "Trải nghiệm" (GET /api/public/journeys/feed). */
export interface FeedItem {
  id: number;
  shareToken: string;
  title: string | null;
  ownerName: string | null;
  basePlace: BasePlaceView | null;
  dayCount: number | null;
  stopCount: number;
  checkinCount: number;
  completed: boolean;
  coverImageUrl: string | null;
  /** Tối đa 4 ảnh check-in. */
  photos: string[];
  /** Tối đa 4 tên điểm đầu tiên theo thứ tự đi. */
  placeNames: string[];
  /** Lưu bút đầu tiên (nếu có). */
  note: string | null;
  publishedAt: string;
  /** Thân bài dạng blog: tối đa 6 khoảnh khắc check-in theo thứ tự đi (bản backend cũ chưa có). */
  checkins?: FeedCheckin[];
  /** Số khách đã bấm "Hữu ích" (tim) — bản backend cũ chưa có. */
  helpfulCount?: number;
}

/** Một khoảnh khắc check-in trong bài "Trải nghiệm" — "Ngày N" + buổi, không có ngày cụ thể. */
export interface FeedCheckin {
  placeName: string;
  photoUrl: string | null;
  note: string | null;
  dayNumber: number | null;
  session: DaySession;
}

/** Kết quả bấm / bỏ "Hữu ích" (PUT/DELETE /api/v1/traveler/journeys/helpful/{token}). */
export interface HelpfulView {
  helpful: boolean;
  count: number;
}

/** Trong các bài đang xem (theo mã chia sẻ): bài khách đã bấm "Hữu ích", bài của chính khách. */
export interface HelpfulState {
  helpful: string[];
  own: string[];
}

export interface FeedPage {
  items: FeedItem[];
  page: number;
  hasMore: boolean;
}

/** Admin kiểm duyệt bài trang "Trải nghiệm". */
export interface AdminFeedItem {
  id: number;
  shareToken: string | null;
  title: string | null;
  travelerId: number;
  travelerName: string | null;
  travelerEmail: string | null;
  stopCount: number;
  publishedAt: string;
  hiddenAt: string | null;
  hiddenReason: string | null;
}

/** Tab "Lịch trình" của đơn: lịch trình đang gắn + lịch trình cùng chỗ nghỉ để gắn. */
export interface BookingJourneyView {
  linked: JourneyView | null;
  candidates: JourneyView[];
  /** Tỉnh / thành của chỗ nghỉ trong đơn — mở /lich-trinh đúng tỉnh. */
  province?: string | null;
}

/** Trang chia sẻ /j/{token}: không có mã đơn, giá, SĐT; chuyến chưa đi xong chỉ có "Ngày 1, 2". */
export interface SharedStopView {
  placeId: number;
  placeName: string;
  /** "HH:mm" — giờ riêng của điểm (lịch trình lên theo giờ); không có thì dùng giờ mặc định của buổi. */
  startTime?: string | null;
  placeSlug?: string | null;
  coverImageUrl?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  dayNumber: number | null;
  visitDate: string | null;
  session: DaySession;
  tiktokUrl?: string | null;
  checkinPhotoUrl?: string | null;
  checkinNote?: string | null;
}

/** Một mục trên dòng thời gian của trang chia sẻ (mọi loại) — "Áp dụng lịch trình này" chép đúng các mục này. */
export interface SharedItemView {
  kind: ItemKind;
  title: string | null;
  placeId: number | null;
  placeName: string | null;
  placeSlug?: string | null;
  coverImageUrl?: string | null;
  /** "Ngày N" — chuyến chưa đi xong không có ngày thật. */
  dayNumber: number | null;
  visitDate: string | null;
  session: DaySession;
  /** "HH:mm". */
  startTime?: string | null;
  endTime?: string | null;
  note?: string | null;
  addons?: string[];
  /** Như JourneyStopView — "Áp dụng lịch trình này" chép theo. */
  sourceStopId?: number | null;
  dishIds?: number[];
  alternativePlaceIds?: number[];
}

export interface SharedJourneyView {
  title: string | null;
  ownerName: string | null;
  basePlace: BasePlaceView | null;
  dayCount: number | null;
  completed: boolean;
  startDate: string | null;
  endDate: string | null;
  /** Các điểm tham quan (lộ trình, nhật ký check-in). */
  stops: SharedStopView[];
  /** Số khách đã bấm "Hữu ích" (tim) — bản backend cũ chưa có. */
  helpfulCount?: number;
  /** Trọn lịch trình theo giờ (bản backend cũ chưa có — khi đó chỉ có các điểm tham quan). */
  items?: SharedItemView[];
  /** Gói gốc + tỉnh: ảnh món, tên từng ngày, tên dịch vụ thêm (danh mục /lich-trinh). */
  templateCode?: string | null;
  regionName?: string | null;
  /** Số người của chuyến gốc — mặc định khi áp dụng. */
  guestCount?: number | null;
  /** Tên + lời dặn từng ngày của chuyến gốc. */
  days?: JourneyDayView[];
}

/** Hồ sơ "Địa điểm đã đi". */
export interface VisitedPlaceView {
  checkinId: number;
  placeId: number;
  placeName: string;
  placeSlug?: string | null;
  coverImageUrl?: string | null;
  photoUrl: string | null;
  note: string | null;
  hidden: boolean;
  journeyId: number | null;
  checkedInAt: string;
}

/** Cổng NCC: lịch trình khách gắn với đơn (chỉ đọc) — placeName = tên mục (gồm cả mục ăn uống / hoạt động). */
export interface GuestJourneyView {
  title: string | null;
  stops: { placeName: string; visitDate: string | null; session: DaySession; startTime?: string | null }[];
}

/** Admin kiểm duyệt check-in. */
export interface AdminCheckinView {
  id: number;
  travelerId: number;
  travelerName: string | null;
  travelerEmail: string | null;
  placeId: number;
  placeName: string;
  photoUrl: string | null;
  note: string | null;
  createdAt: string;
  hiddenAt: string | null;
  hiddenReason: string | null;
}

/** Một mục gửi lên khi lưu lịch trình kiểu mới (format 2). */
export interface JourneyItemInput {
  id?: number | null;
  placeId: number | null;
  visitDate: string | null;
  session: DaySession;
  kind?: ItemKind;
  title?: string | null;
  dayIndex?: number | null;
  startTime?: string | null;
  endTime?: string | null;
  note?: string | null;
  addons?: string[];
  /** Mục gốc trong lịch trình gợi ý (chỉ đọc với mục mới). */
  sourceStopId?: number | null;
  /** null = giữ (mục đã lưu) / chép theo mục gốc (mục mới); [] = xóa hết; danh sách = thay. */
  dishIds?: number[] | null;
  alternativePlaceIds?: number[] | null;
}

/**
 * format 2: gửi đủ mọi mục (ghi đè toàn bộ, kể cả ăn uống / hoạt động) và trường mới. Không có format: backend chỉ áp
 * phần điểm tham quan, giữ nguyên các mục khác.
 */
export interface JourneyInput {
  basePlaceId: number | null;
  title: string | null;
  startDate: string | null;
  endDate: string | null;
  stops: JourneyItemInput[];
  format?: 2;
  regionId?: number | null;
  guestCount?: number | null;
  templateCode?: string | null;
  preferences?: Record<string, unknown> | null;
  /** Lịch trình gợi ý đã chép (ưu tiên hơn templateCode). */
  templateId?: number | null;
  /** Tên + lời dặn từng ngày: null = giữ (lịch trình mới lên từ gói thì máy chủ chép theo gói), danh sách = thay toàn bộ. */
  days?: JourneyDayView[] | null;
}
