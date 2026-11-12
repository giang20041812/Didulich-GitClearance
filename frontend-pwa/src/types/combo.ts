/** Gói combo du lịch — khớp ComboDtos (backend-api). */

export type ComboStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
export type ComboRequestStatus = 'NEW' | 'CONTACTED' | 'CLOSED';

export interface ComboStopInput {
  dayNo: number;
  /** "HH:mm", không bắt buộc. */
  startTime: string | null;
  endTime: string | null;
  placeId: number | null;
  title: string;
  note: string | null;
}

export interface ComboRestaurantInput {
  placeId: number;
  note: string | null;
}

/** Nội dung combo; giá là giá "từ" mỗi khách (đồng); ăn uống luôn không bao gồm. */
export interface ComboInput {
  title: string;
  summary: string;
  description: string | null;
  days: number | null;
  nights: number | null;
  priceFrom: number | null;
  priceNote: string | null;
  groupSizeMin: number | null;
  groupSizeMax: number | null;
  /** Mỗi dòng một mục. */
  includes: string | null;
  excludes: string | null;
  coverImageUrl: string | null;
  stops: ComboStopInput[];
  restaurants: ComboRestaurantInput[];
}

export interface PlaceRef {
  id: number;
  slug: string | null;
  name: string;
  kind: string;
  label: string | null;
  imageUrl: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  /** false = địa điểm đã ẩn / ngừng, khách không mở được. */
  available: boolean;
}

export interface ComboRow {
  id: number;
  slug: string;
  title: string;
  days: number;
  nights: number;
  durationText: string;
  priceFrom: number;
  coverImageUrl: string | null;
  providerId: number | null;
  providerName: string | null;
  status: ComboStatus;
  visible: boolean;
  paused: boolean;
  pendingEdit: boolean;
  rejectReason: string | null;
  newRequests: number;
  publiclyVisible: boolean;
  updatedAt: string;
}

export interface ComboFormData {
  id: number;
  slug: string;
  status: ComboStatus;
  visible: boolean;
  paused: boolean;
  rejectReason: string | null;
  providerId: number | null;
  providerName: string | null;
  content: ComboInput;
  pendingChanges: ComboInput | null;
  pendingSubmittedAt: string | null;
  pendingRejectReason: string | null;
  places: PlaceRef[];
  publiclyVisible: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ComboCard {
  id: number;
  slug: string;
  title: string;
  summary: string;
  days: number;
  nights: number;
  durationText: string;
  priceFrom: number;
  priceNote: string | null;
  coverImageUrl: string | null;
  providerName: string | null;
  highlights: string[];
  stopCount: number;
}

export interface ComboStop {
  id: number;
  dayNo: number;
  startTime: string | null;
  endTime: string | null;
  title: string;
  note: string | null;
  place: PlaceRef | null;
}

export interface ComboDay {
  dayNo: number;
  stops: ComboStop[];
}

export interface ComboRestaurant {
  placeId: number;
  slug: string | null;
  name: string;
  imageUrl: string | null;
  address: string | null;
  priceFrom: number | null;
  priceTo: number | null;
  note: string | null;
  /** true = người tạo combo chọn; false = hệ thống chọn theo đánh giá quanh lộ trình. */
  pinned: boolean;
  nearStop: string | null;
  distanceKm: number | null;
  distanceText: string | null;
}

export interface ComboDetail {
  id: number;
  slug: string;
  title: string;
  summary: string;
  description: string | null;
  days: number;
  nights: number;
  durationText: string;
  priceFrom: number;
  priceNote: string | null;
  groupSizeMin: number | null;
  groupSizeMax: number | null;
  includes: string[];
  excludes: string[];
  coverImageUrl: string | null;
  providerName: string | null;
  itinerary: ComboDay[];
  restaurants: ComboRestaurant[];
}

export interface ComboRequestInput {
  contactName: string;
  contactPhone: string;
  /** yyyy-MM-dd */
  startDate: string;
  guests: number | null;
  note: string;
}

export interface ComboRequestRow {
  id: number;
  comboId: number;
  comboTitle: string;
  comboSlug: string;
  contactName: string;
  contactPhone: string;
  startDate: string;
  guests: number;
  note: string | null;
  status: ComboRequestStatus;
  fromAccount: boolean;
  createdAt: string;
  handledAt: string | null;
  handledByName: string | null;
}
