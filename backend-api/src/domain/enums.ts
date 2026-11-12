/**
 * Các kiểu liệt kê của miền nghiệp vụ (tương ứng package entity.enums của bản Java). Giá trị là chuỗi, đúng như cột
 * varchar + CHECK trong schema và JSON trả về cho frontend.
 */

const values = <T extends readonly string[]>(...v: T) => v;

export const ACCOUNT_ROLES = values('ADMIN', 'PROVIDER', 'TRAVELER');
export type AccountRole = (typeof ACCOUNT_ROLES)[number];

export const ACCOUNT_STATUSES = values('ACTIVE', 'INACTIVE');
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

export const ACTOR_TYPES = values('CUSTOMER', 'PROVIDER', 'ADMIN', 'SYSTEM');
export type ActorType = (typeof ACTOR_TYPES)[number];

export const AMENITY_SCOPES = values('PLACE', 'ROOM');
export type AmenityScope = (typeof AMENITY_SCOPES)[number];

export const AMENITY_VALUES = values('YES', 'NO', 'UNVERIFIED');
export type AmenityValue = (typeof AMENITY_VALUES)[number];

export const BOOKING_NOTE_KINDS = values('VERIFICATION', 'OUTCOME');
export type BookingNoteKind = (typeof BOOKING_NOTE_KINDS)[number];

export const BOOKING_NOTE_OUTCOMES = values('NO_ISSUE', 'SUPPORTED', 'ESCALATED', 'FOLLOW_UP');
export type BookingNoteOutcome = (typeof BOOKING_NOTE_OUTCOMES)[number];

/** PENDING → CONFIRMED → PAID; PENDING / CONFIRMED → CANCELLED. */
export const BOOKING_STATUSES = values('PENDING', 'CONFIRMED', 'PAID', 'CANCELLED');
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

/** Đơn còn giữ phòng trên lịch. */
export const holdsRooms = (s: BookingStatus): boolean => s !== 'CANCELLED';
/** Trạng thái kết thúc: không còn thao tác nào đổi được trạng thái. */
export const isFinalBookingStatus = (s: BookingStatus): boolean => s === 'PAID' || s === 'CANCELLED';

export const CATEGORY_KINDS = values(
  'HOMESTAY',
  'ATTRACTION',
  'RESTAURANT',
  'CULTURE',
  'PHOTO',
  'RENTAL',
  'TRANSPORT',
  'SERVICE',
);
export type CategoryKind = (typeof CATEGORY_KINDS)[number];

/** Tên danh mục hiển thị của từng loại địa điểm. */
export const CATEGORY_KIND_LABEL: Record<CategoryKind, string> = {
  HOMESTAY: 'Homestay',
  ATTRACTION: 'Điểm tham quan',
  RESTAURANT: 'Nhà hàng',
  CULTURE: 'Văn hóa',
  PHOTO: 'Điểm chụp ảnh',
  RENTAL: 'Thuê xe',
  TRANSPORT: 'Vận chuyển',
  SERVICE: 'Dịch vụ',
};

export const CHANGE_OPERATIONS = values('CREATE', 'UPDATE', 'DELETE', 'PUBLISH', 'TRANSFER');
export type ChangeOperation = (typeof CHANGE_OPERATIONS)[number];

export const CHANGE_REQUEST_STATUSES = values('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');
export type ChangeRequestStatus = (typeof CHANGE_REQUEST_STATUSES)[number];

export const CHANGE_TARGET_TYPES = values('HOMESTAY', 'ROOM_TYPE', 'ROOM_PRICE');
export type ChangeTargetType = (typeof CHANGE_TARGET_TYPES)[number];

export const COMBO_REQUEST_STATUSES = values('NEW', 'CONTACTED', 'CLOSED');
export type ComboRequestStatus = (typeof COMBO_REQUEST_STATUSES)[number];

export const COMBO_STATUSES = values('PENDING', 'APPROVED', 'REJECTED');
export type ComboStatus = (typeof COMBO_STATUSES)[number];

export const COMMISSION_STATUSES = values('PENDING', 'APPROVED', 'PAID', 'REJECTED');
export type CommissionStatus = (typeof COMMISSION_STATUSES)[number];

export const CONTACT_CHANNELS = values(
  'PHONE',
  'ZALO',
  'EMAIL',
  'WEBSITE',
  'FACEBOOK',
  'TIKTOK',
  'YOUTUBE',
  'GOOGLE_MAPS',
  'OTHER',
);
export type ContactChannel = (typeof CONTACT_CHANNELS)[number];

export const DAY_SESSIONS = values('MORNING', 'NOON', 'AFTERNOON', 'EVENING');
export type DaySession = (typeof DAY_SESSIONS)[number];

/** "MORNING,AFTERNOON" → ['MORNING','AFTERNOON']: theo thứ tự sáng → tối, không trùng, bỏ qua mã lạ; null → rỗng. */
export function parseDaySessions(raw: string | null | undefined): DaySession[] {
  if (!raw || !raw.trim()) return [];
  const found = new Set<DaySession>();
  for (const token of raw.split(',')) {
    const code = token.trim().toUpperCase();
    for (const s of DAY_SESSIONS) if (s === code) found.add(s);
  }
  return DAY_SESSIONS.filter((s) => found.has(s));
}

/** Buổi của một giờ "HH:mm[:ss]": trước 11:00 sáng, trước 14:00 trưa, trước 18:00 chiều, còn lại tối. */
export function daySessionOfTime(time: string): DaySession {
  const hhmm = time.slice(0, 5);
  if (hhmm < '11:00') return 'MORNING';
  if (hhmm < '14:00') return 'NOON';
  if (hhmm < '18:00') return 'AFTERNOON';
  return 'EVENING';
}

/** Giờ bắt đầu mặc định của buổi. */
export function daySessionDefaultStart(s: DaySession): string {
  switch (s) {
    case 'MORNING':
      return '07:00:00';
    case 'NOON':
      return '11:00:00';
    case 'AFTERNOON':
      return '14:00:00';
    case 'EVENING':
      return '18:00:00';
  }
}

export const EMERGENCY_CONTACT_TYPES = values('POLICE', 'MEDICAL', 'FIRE', 'TOURISM_SUPPORT');
export type EmergencyContactType = (typeof EMERGENCY_CONTACT_TYPES)[number];

export const EXPLORE_CATEGORIES = values('FOOD', 'SIGHTSEEING', 'CHECKIN', 'EXPERIENCE', 'LOCAL_SERVICE');
export type ExploreCategory = (typeof EXPLORE_CATEGORIES)[number];

export const EXPLORE_CATEGORY_INFO: Record<
  ExploreCategory,
  { label: string; defaultKind: CategoryKind; kinds: CategoryKind[] }
> = {
  FOOD: { label: 'Ăn uống', defaultKind: 'RESTAURANT', kinds: ['RESTAURANT'] },
  SIGHTSEEING: { label: 'Tham quan', defaultKind: 'ATTRACTION', kinds: ['ATTRACTION'] },
  CHECKIN: { label: 'Check-in', defaultKind: 'PHOTO', kinds: ['PHOTO'] },
  EXPERIENCE: { label: 'Trải nghiệm', defaultKind: 'CULTURE', kinds: ['CULTURE'] },
  LOCAL_SERVICE: { label: 'Dịch vụ địa phương', defaultKind: 'SERVICE', kinds: ['SERVICE', 'RENTAL', 'TRANSPORT'] },
};

/** Danh mục của một loại địa điểm; undefined với HOMESTAY. */
export function exploreCategoryOf(kind: CategoryKind): ExploreCategory | undefined {
  return EXPLORE_CATEGORIES.find((c) => EXPLORE_CATEGORY_INFO[c].kinds.includes(kind));
}

/** Mọi loại địa điểm thuộc 5 danh mục. */
export function exploreAllKinds(): CategoryKind[] {
  return EXPLORE_CATEGORIES.flatMap((c) => EXPLORE_CATEGORY_INFO[c].kinds);
}

export const HIGHLIGHT_TYPES = values('PRO', 'CON', 'TIP', 'PAIN_POINT');
export type HighlightType = (typeof HIGHLIGHT_TYPES)[number];

export const JOURNEY_ITEM_KINDS = values('PLACE', 'MEAL', 'ACTIVITY', 'TRANSPORT', 'STAY', 'FREE');
export type JourneyItemKind = (typeof JOURNEY_ITEM_KINDS)[number];

export const JOURNEY_SOURCES = values('SUGGESTED', 'TRAVELER');
export type JourneySource = (typeof JOURNEY_SOURCES)[number];

export const JOURNEY_STOP_ORIGINS = values('SUGGESTED', 'CUSTOM');
export type JourneyStopOrigin = (typeof JOURNEY_STOP_ORIGINS)[number];

export const MEDIA_PROVIDERS = values('CLOUDINARY', 'SUPABASE');
export type MediaProvider = (typeof MEDIA_PROVIDERS)[number];

export const MEDIA_ROLES = values('COVER', 'GALLERY');
export type MediaRole = (typeof MEDIA_ROLES)[number];

export const NOTIFICATION_CHANNELS = values('SMS', 'EMAIL', 'ZALO', 'IN_APP', 'PUSH');
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export const NOTIFICATION_STATUSES = values('PENDING', 'SENT', 'FAILED');
export type NotificationStatus = (typeof NOTIFICATION_STATUSES)[number];

export const PAYMENT_STATUSES = values('INITIATED', 'SUCCESS', 'FAILED', 'CANCELLED', 'EXPIRED');
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const PLACE_APPROVAL_STATUSES = values('PENDING', 'APPROVED', 'REJECTED');
export type PlaceApprovalStatus = (typeof PLACE_APPROVAL_STATUSES)[number];

export const PLACE_EDIT_STATUSES = values('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');
export type PlaceEditStatus = (typeof PLACE_EDIT_STATUSES)[number];

export const PLACE_OPERATION_STATUSES = values('OPERATING', 'TEMP_CLOSED');
export type PlaceOperationStatus = (typeof PLACE_OPERATION_STATUSES)[number];

export const PLACE_VERIFICATION_STATUSES = values('VERIFIED', 'UNVERIFIED', 'NEEDS_UPDATE', 'ARCHIVED');
export type PlaceVerificationStatus = (typeof PLACE_VERIFICATION_STATUSES)[number];

export const PLACE_VISIBILITIES = values('DRAFT', 'PUBLISHED', 'UNPUBLISHED');
export type PlaceVisibility = (typeof PLACE_VISIBILITIES)[number];

export const PROVIDER_APPLICATION_STATUSES = values('PENDING', 'APPROVED', 'REJECTED');
export type ProviderApplicationStatus = (typeof PROVIDER_APPLICATION_STATUSES)[number];

export const PROVIDER_SERVICE_TYPES = values('HOMESTAY', 'EXPERIENCE', 'TRANSPORT');
export type ProviderServiceType = (typeof PROVIDER_SERVICE_TYPES)[number];
export const PROVIDER_SERVICE_TYPE_LABEL: Record<ProviderServiceType, string> = {
  HOMESTAY: 'Homestay',
  EXPERIENCE: 'Trải nghiệm',
  TRANSPORT: 'Nhà xe',
};

export const PROVIDER_STATUSES = values('ACTIVE', 'SUSPENDED', 'TERMINATED');
export type ProviderStatus = (typeof PROVIDER_STATUSES)[number];

export const RECIPIENT_TYPES = values('CUSTOMER', 'ACCOUNT');
export type RecipientType = (typeof RECIPIENT_TYPES)[number];

export const REFUND_STATUSES = values('PENDING', 'PROCESSED', 'REJECTED');
export type RefundStatus = (typeof REFUND_STATUSES)[number];

export const REFUND_TYPES = values('FULL_REFUND', 'NO_REFUND');
export type RefundType = (typeof REFUND_TYPES)[number];

export const REVIEW_STATUSES = values('VISIBLE', 'HIDDEN', 'REMOVED');
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export const SERVICE_GROUPS = values(
  'LOCAL_MOTO',
  'TOUR_MOTO',
  'SELF_DRIVE',
  'INTERCITY_BUS',
  'SHARED_CAR',
  'TREKKING',
  'CRAFT',
  'CUISINE',
  'CULTURE',
  'ADVENTURE',
  'FARM',
);
export type ServiceGroup = (typeof SERVICE_GROUPS)[number];
export const SERVICE_GROUP_INFO: Record<ServiceGroup, { label: string; kind: CategoryKind }> = {
  LOCAL_MOTO: { label: 'Xe ôm, xe máy địa phương', kind: 'TRANSPORT' },
  TOUR_MOTO: { label: 'Tour xe máy', kind: 'TRANSPORT' },
  SELF_DRIVE: { label: 'Thuê xe tự lái', kind: 'TRANSPORT' },
  INTERCITY_BUS: { label: 'Xe khách liên tỉnh', kind: 'TRANSPORT' },
  SHARED_CAR: { label: 'Xe ghép, taxi', kind: 'TRANSPORT' },
  TREKKING: { label: 'Đi bộ, leo núi', kind: 'CULTURE' },
  CRAFT: { label: 'Làm nghề thủ công', kind: 'CULTURE' },
  CUISINE: { label: 'Ẩm thực bản địa', kind: 'CULTURE' },
  CULTURE: { label: 'Văn hóa, lễ hội', kind: 'CULTURE' },
  ADVENTURE: { label: 'Mạo hiểm (dù lượn, zipline…)', kind: 'CULTURE' },
  FARM: { label: 'Làm nông, hái chè', kind: 'CULTURE' },
};

export const SOS_REQUEST_STATUSES = values('PENDING', 'DISPATCHED', 'RESOLVED', 'CANCELLED');
export type SosRequestStatus = (typeof SOS_REQUEST_STATUSES)[number];

export const SOS_REQUEST_TYPES = values('MEDICAL', 'SECURITY', 'ACCIDENT', 'LOST', 'OTHER');
export type SosRequestType = (typeof SOS_REQUEST_TYPES)[number];

export const SOURCE_TYPES = values('OFFICIAL', 'PROVIDER', 'PUBLIC_TRUSTED', 'SOCIAL_COMMUNITY');
export type SourceType = (typeof SOURCE_TYPES)[number];

/** Kiểm tra một chuỗi có thuộc tập giá trị enum không (dùng khi đọc tham số query). */
export function isOneOf<T extends string>(list: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && (list as readonly string[]).includes(value);
}
