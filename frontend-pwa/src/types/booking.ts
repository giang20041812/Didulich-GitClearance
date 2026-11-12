import type { AdminBookingDto } from './admin';

/**
 * Trạng thái đơn — khớp BookingStatus bên backend (4 trạng thái):
 * PENDING chờ xác nhận → CONFIRMED đã xác nhận (chờ thanh toán) → PAID đã thanh toán; PENDING / CONFIRMED → CANCELLED đã hủy.
 */
export type BookingStatus = 'PENDING' | 'CONFIRMED' | 'PAID' | 'CANCELLED';

/**
 * Thao tác Admin / NCC trên đơn — khớp BookingWorkflowService.Action: CONFIRM / REJECT khi chờ xác nhận,
 * PAY (ghi nhận đã thanh toán) / CANCEL khi đã xác nhận; CHECK_IN "Khách đã nhận phòng" (đơn đã thanh toán, trong ngày
 * ở, khách chưa tự quét mã QR) — chỉ ghi mốc nhận phòng, không đổi trạng thái.
 */
export type BookingAction = 'CONFIRM' | 'REJECT' | 'PAY' | 'CANCEL' | 'CHECK_IN';

/** Người ghi nhận / trả phòng: khách tự quét mã QR, NCC, Admin, hoặc hệ thống tự trả phòng khi hết giờ. */
export type StayActor = 'CUSTOMER' | 'PROVIDER' | 'ADMIN' | 'SYSTEM';

/** Một dòng danh sách đơn của NCC — khớp PartnerBookingDtos.BookingRowDto (dữ liệu chung + thao tác nhanh hợp lệ). */
export type PartnerBookingRowDto = AdminBookingDto & { actions: BookingAction[] };

export interface CancelBookingRequest {
  reason: string;
  note?: string;
}

/** Một loại phòng khách chọn trong đơn — khớp BookingRoomSelection.java. */
export interface BookingRoomSelection {
  roomTypeId: number;
  roomCount: number;
}

/** Một loại phòng của đơn: số phòng và thành tiền của loại đó — khớp BookingRoomDto.java. */
export interface BookingRoomDto {
  roomTypeId: number;
  roomTypeName: string;
  roomCount: number;
  subtotal: number;
}

// DTO gửi lên backend — field name khớp với CreateBookingRequest.java
export interface CreateBookingRequest {
  placeId: number;
  /** Các loại phòng của đơn (một đơn đặt được nhiều loại phòng cùng ngày ở). */
  rooms: BookingRoomSelection[];
  checkIn: string;   // YYYY-MM-DD
  checkOut: string;  // YYYY-MM-DD
  guestCount: number;
  guestName: string;
  guestPhone: string;
  guestEmail?: string;
  guestNote?: string;
  specialRequests?: string[];
  /** Gắn đơn vào lịch trình này sau khi tạo (đặt chỗ ở từ ô "Chỗ ở" của lịch trình). */
  journeyId?: number;
}

export interface UpdateBookingDetailsRequest {
  guestName?: string;
  guestPhone?: string;
  guestEmail?: string;
  guestNote?: string;
  checkIn?: string;
  checkOut?: string;
  /** Thay toàn bộ loại phòng của đơn; bỏ trống = giữ nguyên. */
  rooms?: BookingRoomSelection[];
  guestCount?: number;
  reason?: string;
}

export interface CheckAvailabilityResponse {
  available: boolean;
  requestedRooms: number;
  minAvailableRooms: number;
  message: string;
}

export interface BookingQuoteResponse {
  roomTypeId: number;
  availableRooms: number;
  suitable: boolean;
  totalAmount: number;
}

export interface BookingPolicySnapshot {
  policyId?: number;
  policyVersion?: number;
  policyName?: string;
  freeCancelCutoffHours?: number;
  refundType?: string;
  description?: string;
  cancelReason?: string;
  refundAmount?: number | string;
}

// DTO nhận về từ backend — field name khớp với BookingResponseDto.java
export interface BookingResponseDto {
  id: number;
  bookingCode: string;
  placeId: number;
  placeName: string;
  placeAddress: string;
  latitude?: number | null;
  longitude?: number | null;
  coverImageUrl?: string | null;
  /** Các loại phòng của đơn. Đơn lưu trên máy từ bản cũ có thể thiếu — dùng bookingRooms() trong lib/roomSelection. */
  rooms?: BookingRoomDto[];
  /** Loại phòng đầu tiên của đơn. */
  roomTypeId: number;
  /** Tên các loại phòng của đơn, cách nhau bằng dấu phẩy. */
  roomTypeName: string;
  checkIn: string;   // YYYY-MM-DD
  checkOut: string;  // YYYY-MM-DD
  nights: number;
  /** Tổng số phòng của đơn (mọi loại phòng). */
  roomCount: number;
  guestCount: number;
  guestName: string;
  guestPhone: string;
  guestEmail: string | null;
  guestNote: string | null;
  status: BookingStatus;
  currency: string;
  unitPrice: number;
  totalAmount: number;
  createdAt: string;       // ISO datetime
  confirmedAt?: string | null;
  /** Lý do khi đơn bị hủy / từ chối. */
  closeReason?: string | null;
  policySnapshot: BookingPolicySnapshot;
  /** Khách sửa được: chỉ khi đơn còn chờ xác nhận. */
  canEdit: boolean;
  /** Khách hủy được: trước khi đơn được ghi nhận đã thanh toán. */
  canCancel: boolean;
  /** Khách đánh giá được: đơn đã thanh toán, từ ngày trả phòng tới 14 ngày sau. */
  canReview: boolean;
  /** Nhận / trả phòng (mốc thời gian, không phải trạng thái). Trả phòng tự động khi hết giờ trả phòng. */
  checkedInAt?: string | null;
  checkedOutAt?: string | null;
  /** Nhận phòng được ngay: đơn đã thanh toán, đang trong ngày ở, chưa nhận phòng. */
  canCheckIn?: boolean;
  /** Chỉ có trong phản hồi tạo đơn: mã truy cập đơn, gửi lại qua header X-Booking-Token (bookingService lưu theo mã đơn). */
  accessToken?: string;
  /** Chỉ có trong phản hồi tạo đơn có gửi journeyId: lịch trình vừa gắn đơn. */
  journeyId?: number;
  /** Đơn đã tạo nhưng chưa gắn được vào lịch trình — câu báo cho khách. */
  journeyWarning?: string;
}

/** Một loại phòng khách đã chọn ở trang Homestay (kèm giá, số phòng để trang đặt phòng tính tiền và phòng trống). */
export interface BookingRoomChoice {
  roomTypeId: number;
  roomTypeName: string;
  roomCount: number;
  basePrice: number;
  weekendPrice?: number | null;
  /** Tổng số phòng của loại phòng. */
  totalRoomCount: number;
  maxOccupancy: number;
  bedInfo?: string;
  hasBreakfast?: boolean;
}

// State truyền từ HomestayDetailPage -> BookingPage qua navigate()
export interface BookingNavigationState {
  placeId: number;
  placeName: string;
  placeAddress?: string;
  placeRating?: number;
  placeReviewCount?: number;
  coverImageUrl?: string;

  /** Các loại phòng đã chọn (ít nhất một). */
  rooms: BookingRoomChoice[];

  // Vị trí tọa độ homestay
  latitude?: number;
  longitude?: number;

  // Phải là ISO date YYYY-MM-DD để backend parse được LocalDate
  checkIn: string;
  checkOut: string;
  nights: number;
  guestCount: number;

  /** Đặt chỗ ở cho lịch trình này (mở từ ô "Chỗ ở" của lịch trình) — đơn tự gắn vào lịch trình sau khi tạo. */
  journeyId?: number;
  journeyTitle?: string;

  /**
   * Lịch trình gợi ý khách chọn ở trang homestay và tick "Lưu kèm lịch trình … vào đơn": mã gói (TripTemplate.code). Đặt
   * xong, màn hình kết quả mời lưu đúng lịch trình này cho đơn (/lich-trinh/tao?tpl=…&forBooking=…).
   */
  tripTemplate?: string;
  /** Tên gói để hiện "Lưu lịch trình <tên> cho đơn này". */
  tripTitle?: string;
  /** Tag khách đã chọn khi xem gợi ý (mở lại trang lên lịch trình với đúng các tag này). */
  tripFilters?: BookingTripFilters;
}

/** Tiêu chí của lịch trình gợi ý đi kèm đơn — cùng nghĩa TripFilters (types/trip): "2-1", slug ăn uống / trải nghiệm. */
export interface BookingTripFilters {
  duration: string | null;
  dining: string | null;
  goals: string[];
}

export interface BookedDateRangeDto {
  roomTypeId: number;
  checkIn: string;
  checkOut: string;
  roomCount: number;
}

// ---- Nhà cung cấp xử lý đơn — khớp PartnerBookingDtos.java ----

export type BookingActorType = 'CUSTOMER' | 'PROVIDER' | 'ADMIN' | 'SYSTEM';

/** Giá một đêm của một loại phòng trong đơn (tiền của dòng = unitPrice × roomCount). */
export interface BookingNightPriceDto {
  stayDate: string;
  unitPrice: number;
  roomCount: number;
  roomTypeId: number;
  roomTypeName: string;
}

export interface BookingHistoryDto {
  fromStatus: BookingStatus | null;
  toStatus: BookingStatus;
  actor: BookingActorType;
  reason: string | null;
  createdAt: string;
}

export interface PartnerBookingDetailDto {
  id: number;
  bookingCode: string;
  status: BookingStatus;
  placeId: number;
  placeName: string;
  /** Các loại phòng của đơn. */
  rooms: BookingRoomDto[];
  /** Loại phòng đầu tiên / tên các loại phòng / tổng số phòng. */
  roomTypeId: number;
  roomTypeName: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  roomCount: number;
  guestCount: number;
  guestName: string;
  guestPhone: string;
  guestEmail: string | null;
  guestNote: string | null;
  totalAmount: number;
  currency: string;
  createdAt: string;
  confirmedAt: string | null;
  closedAt: string | null;
  closeReason: string | null;
  policySnapshot: Record<string, unknown>;
  nightPrices: BookingNightPriceDto[];
  history: BookingHistoryDto[];
  /** Thao tác hợp lệ ở trạng thái hiện tại — giống hệt cổng Admin. */
  actions: BookingAction[];
  /** Giờ nhận / trả phòng của Homestay ("HH:mm"); null khi chưa khai báo. */
  checkInFrom: string | null;
  checkOutUntil: string | null;
  /** Lịch trình khách gắn với đơn (chỉ xem); null = khách chưa gắn lịch trình. */
  guestJourney: import('@/types/journey').GuestJourneyView | null;
  /** Nhận / trả phòng (mốc thời gian; trả phòng tự động khi hết giờ trả phòng). */
  checkedInAt?: string | null;
  checkedInBy?: StayActor | null;
  checkedOutAt?: string | null;
  checkedOutBy?: StayActor | null;
}

/** Nhận phòng bằng mã QR dán tại homestay — khớp StayDtos bên backend. */
export interface QrPlaceView {
  placeId: number;
  placeName: string;
  address: string | null;
  coverImageUrl: string | null;
  /** "HH:mm"; null khi homestay chưa khai báo. */
  checkInFrom: string | null;
  checkOutUntil: string | null;
}

export interface StayView {
  bookingCode: string;
  roomTypeName: string | null;
  checkIn: string;
  checkOut: string;
  nights: number | null;
  roomCount: number;
  guestCount: number;
  status: BookingStatus;
  checkedInAt: string | null;
  checkedOutAt: string | null;
  /** Hạn trả phòng — hết hạn thì tự trả phòng. */
  checkoutDeadline: string | null;
  canCheckIn: boolean;
  /** Vì sao chưa nhận phòng được (chưa thanh toán, chưa tới ngày…); null khi nhận được. */
  blockReason: string | null;
}

export interface QrStaysView {
  place: QrPlaceView;
  stays: StayView[];
}

export interface CheckinQrView {
  placeId: number;
  placeName: string;
  address: string | null;
  code: string;
}

/** Lý do (từ chối / hủy) hoặc ghi chú (xác nhận / thanh toán) — không bắt buộc. */
export interface BookingActionInput {
  note?: string;
}
