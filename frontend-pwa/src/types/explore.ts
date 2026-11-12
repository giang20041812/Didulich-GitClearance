/** EP02 "Khám phá quanh Homestay" — khớp ExploreDtos ở backend. */

/** Danh mục (BR-02.01): Ăn uống, Tham quan, Check-in, Trải nghiệm, Dịch vụ địa phương. */
export type ExploreCategory = 'FOOD' | 'SIGHTSEEING' | 'CHECKIN' | 'EXPERIENCE' | 'LOCAL_SERVICE';
export type PlaceApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
export type PlaceEditStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

// ─────────────── phía khách (US02.03, US02.04)

export interface ExploreHomestay {
  id: number;
  name: string;
  latitude: number | null;
  longitude: number | null;
}

export interface ExploreCard {
  id: number;
  name: string;
  category: ExploreCategory;
  categoryLabel: string;
  summary: string | null;
  imageUrl: string | null;
  distanceKm: number;
  distanceText: string;
  pinned: boolean;
  latitude: number | null;
  longitude: number | null;
}

export interface CategoryCount {
  code: ExploreCategory;
  label: string;
  count: number;
}

export interface ExplorePage {
  homestay: ExploreHomestay;
  items: ExploreCard[];
  page: number;
  size: number;
  totalElements: number;
  hasMore: boolean;
  categories: CategoryCount[];
  radiusKm: number;
}

export interface OpeningHour {
  dayOfWeek: number;
  dayName: string;
  closed: boolean;
  open: string | null;
  close: string | null;
}

export interface ExplorePlaceDetail {
  id: number;
  name: string;
  category: ExploreCategory;
  categoryLabel: string;
  summary: string | null;
  description: string | null;
  address: string | null;
  phone: string | null;
  website: string | null;
  images: string[];
  openingHours: OpeningHour[];
  openStatus: { open: boolean; text: string } | null;
  latitude: number | null;
  longitude: number | null;
  distanceKm: number | null;
  distanceText: string | null;
  homestay: ExploreHomestay | null;
}

// ─────────────── quản trị / NCC (US02.01, US02.02)

export interface ImageInput {
  mediaId?: number | null;
  imageId?: string | null;
  url?: string | null;
}

export interface OpeningHourInput {
  dayOfWeek: number;
  closed: boolean;
  open: string | null;
  close: string | null;
}

/**
 * Nhóm dịch vụ nhà xe (LOCAL_MOTO … SHARED_CAR, loại TRANSPORT) và trải nghiệm (TREKKING … FARM, loại CULTURE) —
 * khớp ServiceGroup.java.
 */
export type ServiceGroup =
  | 'LOCAL_MOTO' | 'TOUR_MOTO' | 'SELF_DRIVE' | 'INTERCITY_BUS' | 'SHARED_CAR'
  | 'TREKKING' | 'CRAFT' | 'CUISINE' | 'CULTURE' | 'ADVENTURE' | 'FARM';

/** Thông tin riêng của dịch vụ (ExploreDtos.ServiceProfileInput); trường không áp dụng cho loại thì bỏ trống. */
export interface ServiceProfileInput {
  serviceGroup: ServiceGroup | null;
  vehicleType?: string | null;
  routeFrom?: string | null;
  routeTo?: string | null;
  departureTimes?: string | null;
  durationMinutes?: number | null;
  seats?: number | null;
  groupSizeMax?: number | null;
  /** Mã VI, EN, HMONG, THAI, OTHER. */
  languages?: string[] | null;
  includes?: string | null;
}

export interface ServiceProfile {
  serviceGroup: ServiceGroup;
  serviceGroupLabel: string;
  vehicleType: string | null;
  routeFrom: string | null;
  routeTo: string | null;
  departureTimes: string | null;
  durationMinutes: number | null;
  seats: number | null;
  groupSizeMax: number | null;
  languages: string[];
  includes: string | null;
}

export interface PlaceInput {
  name: string;
  category: ExploreCategory | null;
  summary: string;
  description: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  phone: string;
  website: string;
  openingHours: OpeningHourInput[];
  images: ImageInput[];
  coordVerified?: boolean | null;
  visible?: boolean | null;
  /**
   * Chỉ form dịch vụ nhà xe / trải nghiệm gửi: khác null thì giá và thông tin dịch vụ được ghi theo form; bỏ trống = giữ
   * nguyên (form địa điểm khám phá không có các ô này).
   */
  priceFrom?: number | null;
  priceUnit?: string | null;
  service?: ServiceProfileInput | null;
}

export interface PlaceImage {
  mediaId: number;
  url: string;
  cover: boolean;
}

export interface EditRequest {
  id: number;
  status: PlaceEditStatus;
  rejectReason: string | null;
  submittedAt: string;
  changes: PlaceInput;
}

export interface PlaceRow {
  id: number;
  name: string;
  category: ExploreCategory;
  categoryLabel: string;
  imageUrl: string | null;
  providerId: number | null;
  providerName: string | null;
  visible: boolean;
  approvalStatus: PlaceApprovalStatus;
  rejectReason: string | null;
  hasCoordinates: boolean;
  coordVerified: boolean;
  pendingEdit: boolean;
  updatedAt: string;
}

export interface PlaceForm {
  id: number;
  name: string;
  category: ExploreCategory;
  summary: string | null;
  description: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  phone: string | null;
  website: string | null;
  openingHours: OpeningHour[];
  images: PlaceImage[];
  visible: boolean;
  approvalStatus: PlaceApprovalStatus;
  rejectReason: string | null;
  coordVerified: boolean;
  coordVerifiedAt: string | null;
  providerId: number | null;
  providerName: string | null;
  pendingEdit: EditRequest | null;
  /** Loại địa điểm thật (TRANSPORT, CULTURE, RESTAURANT…) — một danh mục khám phá gộp nhiều loại. */
  kind: string;
  priceFrom: number | null;
  priceUnit: string | null;
  service: ServiceProfile | null;
}

export type StatusFilter = 'VISIBLE' | 'HIDDEN' | 'PENDING' | 'REJECTED';
export type CoordFilter = 'VERIFIED' | 'UNVERIFIED' | 'MISSING';

export interface ExploreSettings {
  radiusKm: number;
  radiusMinKm: number;
  radiusMaxKm: number;
}

export interface AdminExploreItem {
  id: number;
  name: string;
  category: ExploreCategory | null;
  categoryLabel: string | null;
  distanceKm: number | null;
  distanceText: string | null;
  pinned: boolean;
  eligible: boolean;
  notEligibleReason: string | null;
}

export interface AdminHomestayExplore {
  homestayId: number;
  homestayName: string;
  hasCoordinates: boolean;
  radiusKm: number;
  pinMax: number;
  pins: AdminExploreItem[];
  inRadius: AdminExploreItem[];
  preview: ExploreCard[];
}

export interface HomestayOption {
  id: number;
  name: string;
  address: string | null;
  hasCoordinates: boolean;
}
