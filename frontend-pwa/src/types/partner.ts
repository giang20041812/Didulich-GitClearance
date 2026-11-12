export type PlaceVisibility = 'DRAFT' | 'PUBLISHED' | 'UNPUBLISHED';

export type PlaceOperationStatus = 'OPERATING' | 'TEMP_CLOSED';

export interface PartnerHomestaySummaryDto {
  id: number;
  code: string;
  slug: string;
  name: string;
  address: string;
  coverImageUrl: string;
  categoryName: string;
  visibility: PlaceVisibility;
  operationStatus: PlaceOperationStatus;
  roomTypesCount: number;
  priceRefMin: number | null;
  priceRefMax: number | null;
  priceUnitNote?: string;
  lastUpdatedText: string;
  auditStatus: 'STANDARD' | 'MAINTENANCE' | 'NEEDS_DATA';
  auditStatusText: string;
  alertNote?: string;
  isReadyToPublish: boolean;
  /** UC-NCC-02 luồng phụ 4: các thông tin còn thiếu để công khai/nhận Booking. */
  missingForPublish: string[];
  /** UC-NCC-02: đang có yêu cầu xuất bản chờ Admin duyệt. */
  pendingPublish: boolean;
}

export interface PartnerHomestayStatsDto {
  totalCount: number;
  publishedCount: number;
  draftCount: number;
  unpublishedCount: number;
  operatingCount: number;
  tempClosedCount: number;
}

export interface PartnerHomestayPageResponse {
  homestays: PartnerHomestaySummaryDto[];
  stats: PartnerHomestayStatsDto;
  cooperativeName: string;
  providerCode: string;
  isProviderSuspended: boolean;
}

export interface UpdateStatusRequest {
  visibility?: PlaceVisibility;
  operationStatus?: PlaceOperationStatus;
  reason?: string;
}

export interface PartnerHomestayDetailDto {
  id: number;
  code: string;
  slug: string;
  name: string;
  description: string;
  contactPhone: string;
  contactEmail?: string;
  /** Link video TikTok đầy đủ (https://www.tiktok.com/@kenh/video/123...) — hiển thị ở trang Homestay của khách */
  reviewVideoUrl?: string;
  regionName: string;
  regionId?: number | null;
  address: string;
  latitude: number | null;
  longitude: number | null;
  /** Lưu thành liên hệ kênh GOOGLE_MAPS (place_contact). */
  googleMapLink?: string | null;
  /** Link fanpage Facebook, lưu thành liên hệ kênh FACEBOOK. */
  facebookUrl?: string | null;
  accessNote?: string;
  coverImageUrl: string;
  galleryUrls: string[];
  amenities: string[];
  /** "Tiện ích khác" NCC tự gõ, ngoài danh mục tiện nghi. */
  otherAmenities?: string;
  checkInFrom: string;
  checkOutUntil: string;
  /** Khung giờ NCC xử lý đơn "HH:mm" (BOOK-BR-11); rỗng = mặc định 05:00 - 21:00. Khớp PartnerHomestayDetailDto bên backend. */
  processingStartTime?: string;
  processingEndTime?: string;
  houseRules: string;
  cancellationPolicy: string;
  policyName?: string;
  freeCancelCutoffHours?: number | null;
  refundOnLateCancel?: 'FULL_REFUND' | 'NO_REFUND' | null;
  policyVersion?: number | null;
  /** UC-NCC-05: thời điểm phiên bản chính sách hủy hiện hành có hiệu lực. */
  policyEffectiveFrom?: string | null;
  missingForPublish?: string[];
  pendingPublish?: boolean;
  surchargeNote?: string;
  childrenPolicy?: string;
  petsPolicy?: string;
  viewHighlight?: string;
  /** Nhóm khách phù hợp (homestay_profile.suitability). */
  suitability?: string;
  /** Điểm Google Maps do hệ thống nhập từ dữ liệu đã xác thực — NCC chỉ xem. */
  googleRating?: number | null;
  visibility: PlaceVisibility;
  operationStatus: PlaceOperationStatus;
  isReadyToPublish: boolean;
  cooperativeName: string;
  providerCode: string;
  alertNote?: string;
  roomTypesCount?: number;
  roomTypesSummary?: string;
  priceRefMin?: number | null;
  priceRefMax?: number | null;
  priceUnitNote?: string | null;
  pricingSummary?: string;
  availabilitySummary?: string;
  stopSellSummary?: string;
  heroStatusBadge?: string;
}

export interface HomestayOptionsDto {
  regions: { id: number; name: string }[];
  amenities: { id: number; name: string }[];
}

// ---- Đăng Homestay một lần — khớp PartnerHomestayDtos.OnboardRequest / OnboardResult ----

/** Ảnh đã tải lên kho lưu trữ, chưa gắn vào đâu. */
export interface PhotoRef { imageId: string; url: string }
export interface OnboardRoom { room: import('./room').PartnerRoomInput; photos: PhotoRef[] }
export interface OnboardRequest { homestay: Partial<PartnerHomestayDetailDto>; photos: PhotoRef[]; rooms: OnboardRoom[]; submit: boolean }
/** submitted=false: đã lưu nháp, missingForPublish là các mục còn thiếu để gửi duyệt. */
export interface OnboardResult { id: number; submitted: boolean; message: string; missingForPublish: string[] }

// ---- Ảnh Homestay / loại phòng — khớp PartnerMediaDtos.java ----

export interface MediaDto {
  mediaId: number;
  url: string;
  role: 'COVER' | 'GALLERY';
  caption: string | null;
  sortOrder: number;
}

export interface DirectUploadDto {
  uploadUrl: string;
  imageId: string;
  maxFileBytes: number;
  allowedTypes: string[];
}

// ---- Đăng ký NCC (UC-NCC-08) — khớp ProviderApplicationDtos.java ----

export type ProviderApplicationStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

/** Loại hình nhà cung cấp — khớp ProviderServiceType.java. */
export type ProviderServiceType = 'HOMESTAY' | 'EXPERIENCE' | 'TRANSPORT';

/**
 * Câu hỏi riêng của từng loại hình (ProviderApplicationDetails.java) — chỉ gửi các khóa của loại hình đang chọn.
 * Homestay: propertyType, roomCount, maxGuests. Trải nghiệm: experienceTypes, durationHours, groupSizeMax, languages?,
 * guideLicenseNo?. Nhà xe: vehicleTypes, fleetSize, routes, transportLicenseNo?.
 */
export type ProviderApplicationDetails = Record<string, string | number | string[]>;

export interface ProviderRegisterInput {
  businessName: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  password: string;
  address: string;
  businessLicenseNo: string;
  description: string;
  serviceType: ProviderServiceType;
  details?: ProviderApplicationDetails;
}

/** UC-NCC-01 "Xem trạng thái" — khớp ProviderApplicationDtos.StatusInput/StatusResult */
export interface ProviderApplicationStatusInput { applicationId: number; contactPhone: string }
export interface ProviderApplicationStatusResult {
  applicationId: number;
  businessName: string;
  status: ProviderApplicationStatus;
  statusLabel: string;
  reviewNote: string | null;
  createdAt: string;
  reviewedAt: string | null;
  serviceType: ProviderServiceType;
}

export interface ProviderRegisterResult {
  applicationId: number;
  status: ProviderApplicationStatus;
  message: string;
}

// ---- Phản hồi đánh giá (UC-NCC-10) — khớp PartnerReviewDtos.ReviewDto ----

export interface PartnerReviewDto {
  id: number;
  placeId: number;
  placeName: string;
  bookingCode: string | null;
  guestName: string;
  rating: number;
  content: string | null;
  status: 'VISIBLE' | 'HIDDEN';
  createdAt: string;
  providerReply: string | null;
  providerReplyAt: string | null;
}

/** Kết quả tra tọa độ từ địa chỉ — khớp GeocodingService.GeocodeResult */
export interface GeocodeResult {
  latitude: number;
  longitude: number;
  displayName: string | null;
}
