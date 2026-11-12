/**
 * Types cho module Quản trị hệ thống (Admin Portal).
 * Tên field khớp 100% với các DTOs ở backend-api:
 * AdminAccountDtos, AdminProviderDtos, AdminPlaceDtos, AdminDashboardDtos.
 */

import type { ProviderServiceType } from './partner';

export type AccountRole = 'ADMIN' | 'PROVIDER' | 'CUSTOMER';
export type AccountStatus = 'ACTIVE' | 'INACTIVE';
export type ProviderStatus = 'ACTIVE' | 'SUSPENDED' | 'TERMINATED';
export type PlaceVisibility = 'DRAFT' | 'PUBLISHED' | 'UNPUBLISHED';
export type PlaceOperationStatus = 'OPERATING' | 'TEMPORARILY_CLOSED' | 'PERMANENTLY_CLOSED';
export type PlaceVerificationStatus = 'VERIFIED' | 'UNVERIFIED' | 'NEEDS_UPDATE' | 'ARCHIVED';
/** Khớp enum CategoryKind ở backend — định nghĩa gốc nằm ở types/home.ts. */
export type { CategoryKind } from './home';
import type { CategoryKind } from './home';
import type { PlaceContactItem, PlaceHighlightItem } from './homestay';

export interface AdminAccountDto {
  id: number;
  /** null với tài khoản NCC cũ chỉ đăng nhập bằng SĐT. */
  email: string | null;
  phone?: string | null;
  /** null khi tài khoản chưa cập nhật họ tên. */
  fullName: string | null;
  role: AccountRole;
  /** Cấp quản trị 1..3 — chỉ có với role ADMIN (khớp AccountDto.adminLevel ở backend). */
  adminLevel?: AdminLevel | null;
  status: AccountStatus;
  providerId?: number;
  providerName?: string;
  lastLoginAt?: string;
  createdAt: string;
}

/** Cấp quản trị viên: 1 = cao nhất (toàn quyền) … 3 = thấp nhất (chỉ xem + kiểm duyệt đánh giá). */
export type AdminLevel = 1 | 2 | 3;

/** Khớp AdminNotificationDtos.NotificationItemDto (thông báo trong ứng dụng gửi cho Admin). */
export interface AdminNotificationItem {
  id: number;
  title: string | null;
  message: string | null;
  /** Mục của cổng quản trị cần mở khi bấm thông báo (vd: "applications", "accounts"). */
  target: string | null;
  entityType: string | null;
  entityId: number | null;
  read: boolean;
  createdAt: string;
}

/** Khớp AdminNotificationDtos.NotificationFeedDto */
export interface AdminNotificationFeed {
  items: AdminNotificationItem[];
  unread: number;
}

/** Khớp AdminAccountDtos.UpdateAdminLevelRequest */
export interface UpdateAdminLevelRequest {
  adminLevel: AdminLevel;
  reason?: string;
}

/** Khớp Spring Data Page<T> trả về từ backend-api. */
export interface PageResponse<T> {
  content: T[];
  totalElements: number;
  totalPages: number;
  number: number;
  size: number;
}

/** Khớp AdminTravelerService.TravelerDto */
export type TravelerSignupMethod = 'GOOGLE' | 'EMAIL';

export interface AdminTravelerDto {
  id: number;
  email: string;
  phone?: string | null;
  fullName?: string | null;
  pictureUrl?: string | null;
  status: AccountStatus;
  signupMethod: TravelerSignupMethod;
  lastLoginAt?: string | null;
  createdAt: string;
}

export type TravelerActivityType = 'ALL' | 'LOGIN' | 'HOMESTAY_VIEW';

export interface TravelerActivity {
  id: number;
  type: Exclude<TravelerActivityType, 'ALL'>;
  loginMethod: 'EMAIL' | 'GOOGLE' | null;
  placeId: number | null;
  placeName: string | null;
  /** ISO 8601 có múi giờ +07:00. */
  occurredAt: string;
}

export interface AccountSearchParams {
  role?: AccountRole;
  status?: AccountStatus;
  keyword?: string;
  providerStatus?: ProviderStatus;
  createdFrom?: string;
  createdTo?: string;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
  page?: number;
  size?: number;
}

export interface TravelerSearchParams {
  status?: AccountStatus;
  keyword?: string;
  signupMethod?: TravelerSignupMethod;
  createdFrom?: string;
  createdTo?: string;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
  page?: number;
  size?: number;
}

export interface CreateAdminAccountRequest {
  email: string;
  phone: string;
  password: string;
  fullName: string;
  /** Không nêu thì backend gán cấp 3 (ít quyền nhất). */
  adminLevel?: AdminLevel;
}

export interface UpdateAccountRequest {
  email?: string;
  phone?: string;
  fullName?: string;
}

/** Khớp AdminAccountDtos.UpdateAccountRoleRequest (FR-AD-05). Chuyển sang PROVIDER phải có providerId. */
export interface UpdateAccountRoleRequest {
  role: AccountRole;
  providerId?: number;
  reason: string;
}

export interface UpdateAccountStatusRequest {
  status: AccountStatus;
  reason?: string;
}

export interface ResetPasswordRequest {
  newPassword: string;
  reason?: string;
}

export interface AdminProviderSummaryDto {
  id: number;
  name: string;
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
  address?: string;
  note?: string;
  status: ProviderStatus;
  /** Loại hình (Homestay / Trải nghiệm / Nhà xe) — quyết định công cụ trong cổng đối tác. */
  serviceType: ProviderServiceType;
  placeCount: number;
  accountCount: number;
  createdAt: string;
  updatedAt: string;
}

/** Khớp AdminProviderDtos.ProviderAccountDto (backend). Không có mật khẩu: backend chỉ lưu băm BCrypt. */
export interface ProviderAccountDto {
  id: number;
  email: string;
  phone?: string | null;
  fullName: string;
  status: string | null;
  lastLoginAt?: string | null;
}

export interface CreateProviderWithAccountRequest {
  name: string;
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
  address?: string;
  note?: string;
  accountEmail: string;
  accountPhone?: string;
  accountPassword: string;
  accountFullName: string;
  /** Bỏ trống = Homestay. */
  serviceType?: ProviderServiceType;
}

export interface UpdateProviderRequest {
  name: string;
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
  address?: string;
  note?: string;
}

export interface UpdateProviderStatusRequest {
  status: ProviderStatus;
  reason?: string;
}

export interface AdminPlaceSummaryDto {
  id: number;
  slug: string;
  name: string;
  kind: CategoryKind;
  categoryName?: string;
  providerId?: number;
  providerName?: string;
  regionId?: number;
  regionName?: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  priceRefMin?: number;
  priceRefMax?: number;
  visibility: PlaceVisibility;
  operationStatus: PlaceOperationStatus;
  verification: PlaceVerificationStatus;
  lastVerifiedAt?: string;
  /** Cờ Admin "dữ liệu đã xác thực" (chính thống) — độc lập với `verification` là trạng thái duyệt nội dung. */
  dataVerified: boolean;
  ratingAvg?: number;
  ratingCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface PlaceSearchParams {
  keyword?: string;
  visibility?: PlaceVisibility;
  verification?: PlaceVerificationStatus;
  dataVerified?: boolean;
  kind?: CategoryKind;
  providerId?: number;
  regionId?: number;
  createdFrom?: string;
  createdTo?: string;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
  page?: number;
  size?: number;
}

export type PlaceVerificationSummary = Record<PlaceVerificationStatus, number>;

export interface UpdatePlaceVerificationRequest {
  verification: PlaceVerificationStatus;
  reason?: string;
}

export interface UpdatePlaceDataVerifiedRequest {
  dataVerified: boolean;
  reason?: string;
}

export interface UpdatePlaceVisibilityRequest {
  visibility: PlaceVisibility;
  reason?: string;
}

export interface AdminDashboardSummaryDto {
  totalPlaces: number;
  unverifiedPlaces: number;
  totalProviders: number;
  activeProviders: number;
  suspendedProviders: number;
  totalAccounts: number;
  activeAccounts: number;
  monthlyBookingsCount: number;
  monthlyRevenue: number;
  pendingRefundsCount: number;
  terminatedProviders: number;
  needsUpdatePlaces: number;
  pendingSosCount: number;
  totalTravelers: number;
  newTravelers7d: number;
  newTravelers30d: number;
  lockedTravelers: number;
  revenueTrend: MonthlyRevenuePoint[];
  /** Giá trị đặt phòng (GMV) 6 tháng — dùng thay khi doanh thu đối soát = 0đ. */
  gmvTrend?: MonthlyRevenuePoint[];
}

/** Khớp AdminDashboardDtos.AuditLogEntryDto */
export interface AuditLogEntryDto {
  id: number;
  action: string;
  entityType: string | null;
  entityId: number | null;
  reason: string | null;
  actorName: string;
  createdAt: string;
}

/** Khớp AdminPlaceDtos.AdminPlaceDetailDto */
export interface AdminPlaceDetailDto {
  id: number;
  slug: string;
  name: string;
  kind: CategoryKind;
  categoryName?: string | null;
  providerId?: number | null;
  providerName?: string | null;
  regionId?: number | null;
  regionName?: string | null;
  address?: string | null;
  description?: string | null;
  accessNote?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  priceRefMin?: number | null;
  priceRefMax?: number | null;
  priceUnitNote?: string | null;
  visibility: PlaceVisibility;
  operationStatus: PlaceOperationStatus;
  verification: PlaceVerificationStatus;
  lastVerifiedAt?: string | null;
  dataVerified?: boolean;
  ratingAvg?: number | null;
  ratingCount?: number | null;
  /** Điểm Google Maps (0-5) từ dữ liệu đã xác thực; Admin chỉ xem. */
  googleRating?: number | null;
  /** Hồ sơ Homestay — chỉ có với kind = HOMESTAY. */
  viewHighlight?: string | null;
  suitability?: string | null;
  contacts?: PlaceContactItem[];
  highlights?: PlaceHighlightItem[];
  attributes?: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

// ─────────────────────────────────────────────
// Admin media
// ─────────────────────────────────────────────
export interface AdminMediaDto {
  mediaId: number;
  url: string | null;
  role: 'COVER' | 'GALLERY';
  caption: string | null;
  sortOrder: number;
}

export interface AdminUploadConfig {
  provider: 'CLOUDINARY' | 'SUPABASE';
  cloudName?: string;
  apiKey?: string;
  timestamp?: number;
  signature?: string;
  uploadUrl?: string;
  maxFileBytes?: number;
}

// ─────────────────────────────────────────────
// Hình ảnh / tiện nghi / chính sách lưu trú ở màn chi tiết Admin (khớp PlaceShowcaseDtos)
// ─────────────────────────────────────────────
export interface PlaceShowcaseImage {
  url: string;
  caption: string | null;
  /** Ảnh bìa (luôn đứng đầu danh sách). */
  cover: boolean;
}

/** Chính sách lưu trú của Homestay; trường chữ rỗng khi NCC chưa khai. */
export interface PlaceStayPolicy {
  checkInFrom: string;
  checkOutUntil: string;
  houseRules: string;
  surchargeNote: string;
  childrenPolicy: string;
  petsPolicy: string;
  /** Nhóm khách phù hợp (homestay_profile.suitability). */
  suitability: string;
  cancellationPolicyName: string;
  cancellationPolicy: string;
  freeCancelCutoffHours: number | null;
  refundOnLateCancel: 'FULL_REFUND' | 'NO_REFUND' | null;
}

/** SeasonalPriceDto — giá theo mùa của loại phòng. */
export interface PlaceSeasonalPrice {
  name: string;
  periodStart: string;
  periodEnd: string;
  price: number;
}

/** RoomShowcaseDto — loại phòng với đủ các trường NCC khai; `beds` đã ghép sẵn dạng "2 giường đôi". */
export interface PlaceShowcaseRoom {
  id: number;
  name: string;
  totalRoomCount: number;
  maxOccupancy: number;
  areaSqm: number | null;
  privateBathroom: 'YES' | 'NO' | 'UNVERIFIED' | null;
  basePrice: number | null;
  weekendPrice: number | null;
  status: 'ACTIVE' | 'INACTIVE' | string;
  viewDescription: string;
  description: string;
  beds: string[];
  amenities: string[];
  seasonalPrices: PlaceSeasonalPrice[];
}

/** placeId/placeName null khi chưa có cơ sở làm nguồn (vd hồ sơ NCC chưa được duyệt); stayPolicy null khi không phải Homestay / chưa khai. */
export interface PlaceShowcase {
  placeId: number | null;
  placeName: string | null;
  images: PlaceShowcaseImage[];
  amenities: string[];
  stayPolicy: PlaceStayPolicy | null;
  /** Loại phòng (chỉ Homestay). */
  rooms: PlaceShowcaseRoom[];
}

export interface MonthlyRevenuePoint {
  year: number;
  month: number;
  totalAmount: number;
  transactionCount: number;
}

import type { BookingAction, BookingStatus } from './booking';
export type { BookingAction, BookingStatus };

export interface AdminBookingDto {
  id: number;
  bookingCode: string;
  placeId: number;
  placeName: string;
  roomTypeName: string;
  providerId: number;
  providerName: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  roomCount: number;
  guestCount: number;
  guestName: string;
  guestPhone: string;
  guestEmail?: string | null;
  guestNote?: string | null;
  status: BookingStatus;
  totalAmount?: number | null;
  currency?: string | null;
  createdAt: string;
  confirmedAt?: string | null;
  closedAt?: string | null;
  closeReason?: string | null;
  /** Nhận / trả phòng (mốc thời gian, không phải trạng thái). */
  checkedInAt?: string | null;
  checkedInBy?: import('./booking').StayActor | null;
  checkedOutAt?: string | null;
  checkedOutBy?: import('./booking').StayActor | null;
}

export interface BookingSearchParams {
  status?: BookingStatus;
  /** Nhiều trạng thái cùng lúc (cổng Admin: tab nhóm trạng thái). Được gửi lên thành `status=A,B,C`. */
  statuses?: BookingStatus[];
  keyword?: string;
  /** Lọc theo khách: tên, SĐT hoặc email */
  guest?: string;
  /** Lọc theo tên homestay */
  place?: string;
  placeId?: number;
  providerId?: number;
  checkInFrom?: string;
  checkInTo?: string;
  createdFrom?: string;
  createdTo?: string;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
  page?: number;
  size?: number;
}

export type BookingStatusSummary = Record<BookingStatus, number>;

// ─────────────────────────────────────────────
// Giám sát Booking (khớp AdminBookingMonitorService)
// ─────────────────────────────────────────────
export type BookingNoteKind = 'VERIFICATION' | 'OUTCOME';
export type BookingNoteOutcome = 'NO_ISSUE' | 'SUPPORTED' | 'ESCALATED' | 'FOLLOW_UP';

export interface BookingNoteDto {
  id: number;
  kind: BookingNoteKind;
  outcome: BookingNoteOutcome | null;
  content: string;
  adminName: string | null;
  createdAt: string;
}

export interface BookingHistoryDto {
  fromStatus: BookingStatus | null;
  toStatus: BookingStatus;
  actor: string | null;
  actorId: number | null;
  reason: string | null;
  createdAt: string;
}

export interface BookingPaymentDto {
  id: number;
  gateway: string;
  externalTxnId: string | null;
  amount: number;
  currency: string;
  status: string;
  initiatedAt: string;
  paidAt: string | null;
}

export interface AdminBookingDetailDto {
  booking: AdminBookingDto;
  closedByActor: string | null;
  /** Thao tác Admin làm được ở trạng thái hiện tại (giống hệt NCC). */
  actions: BookingAction[];
  history: BookingHistoryDto[];
  payments: BookingPaymentDto[];
  notes: BookingNoteDto[];
}

export interface AddBookingNoteRequest {
  kind: BookingNoteKind;
  outcome?: BookingNoteOutcome;
  content: string;
}

// ─────────────────────────────────────────────
// Báo cáo (khớp AdminReportService)
// ─────────────────────────────────────────────
export type ReportGroup = 'ALL' | 'CONFIRMED' | 'OPEN' | 'LOST';

export interface ReportSearchParams {
  from?: string;
  to?: string;
  providerId?: number;
  group?: ReportGroup;
}

export interface ReportKpi {
  totalBookings: number;
  confirmedBookings: number;
  openBookings: number;
  lostBookings: number;
  bookingValue: number;
  /** null = không đủ dữ liệu để tính (chưa có đơn xác nhận nào trong kỳ) — không tự quy về 0 (RPT-BR-02). */
  averageValue: number | null;
  paidRevenue: number;
  /** null = không đủ dữ liệu để tính (chưa có đơn nào trong kỳ) — không tự quy về 0 (RPT-BR-02). */
  confirmationRate: number | null;
  /** null khi đang lọc theo một NCC */
  newProviders: number | null;
  newPlaces: number | null;
}

export interface ReportSeriesPoint {
  key: string;
  label: string;
  from: string;
  to: string;
  bookings: number;
  value: number;
}

export interface ReportTopProvider {
  id: number;
  name: string;
  bookings: number;
  value: number;
}

export interface ReportTopPlace {
  id: number;
  name: string;
  providerId: number;
  providerName: string;
  bookings: number;
  value: number;
}

export interface AdminOverviewReport {
  from: string;
  to: string;
  providerId: number | null;
  granularity: 'DAY' | 'MONTH';
  /** Thời điểm chốt số liệu (= cập nhật gần nhất, vì báo cáo luôn tính lại theo thời gian thực mỗi lần tải). */
  generatedAt: string;
  kpi: ReportKpi;
  byStatus: { status: BookingStatus; count: number }[];
  series: ReportSeriesPoint[];
  topProviders: ReportTopProvider[];
  topPlaces: ReportTopPlace[];
}

export interface CreateTravelerRequest {
  fullName: string;
  email: string;
  phone?: string;
  password: string;
}
