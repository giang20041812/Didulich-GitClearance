import type { AdminCheckinView } from '@/types/journey';
import axios from 'axios';
import { partnerGet } from '@/lib/partnerGet';
import { cachedFetch } from '@/lib/dataCache';
import type { BookingAction } from '../types/booking';
import type { HomestayUnits } from '../types/room';
import type {
  SosRequestDto,
  SosRequestListResponse,
  EmergencyContactDto,
  CreateEmergencyContactRequest,
  UpdateEmergencyContactRequest,
} from '../types/sos';
import type {
  AdminAccountDto,
  CreateAdminAccountRequest,
  UpdateAccountRequest,
  UpdateAccountStatusRequest,
  ResetPasswordRequest,
  UpdateAccountRoleRequest,
  AdminProviderSummaryDto,
  ProviderAccountDto,
  CreateProviderWithAccountRequest,
  UpdateProviderRequest,
  UpdateProviderStatusRequest,
  AdminPlaceSummaryDto,
  UpdatePlaceDataVerifiedRequest,
  UpdatePlaceVerificationRequest,
  UpdatePlaceVisibilityRequest,
  AdminDashboardSummaryDto,
  AuditLogEntryDto,
  AdminPlaceDetailDto,
  PlaceShowcase,
  AccountStatus,
  ProviderStatus,
  PlaceVerificationStatus,
  PageResponse,
  AdminBookingDto,
  BookingSearchParams,
  BookingStatusSummary,
  AdminBookingDetailDto,
  AddBookingNoteRequest,
  BookingNoteDto,
  AdminOverviewReport,
  ReportSearchParams,
  CreateTravelerRequest,
  PlaceSearchParams,
  PlaceVerificationSummary,
  AdminTravelerDto,
  TravelerActivity,
  TravelerActivityType,
  AccountSearchParams,
  TravelerSearchParams,
  AdminNotificationFeed,
  UpdateAdminLevelRequest,
  AdminMediaDto,
  AdminUploadConfig,
} from '../types/admin';
import type { CashflowReport, CashflowSearchParams } from '../types/cashflow';
import type { AuditLogItem, AuditLogSearchParams } from '../types/auditLog';
import type { AdminReview, AdminReviewSearchParams, ReviewModerationAction } from '../types/adminReview';
import type {
  PendingApplicationCount,
  ProviderApplicationBulkResult,
  ProviderApplicationDetail,
  ProviderApplicationSearchParams,
  ProviderApplicationSummary,
} from '../types/providerApplication';
import type {
  ChangeRequestDetail,
  ChangeRequestSearchParams,
  ChangeRequestSummary,
  PendingChangeCount,
} from '../types/changeRequest';

const API_BASE = '/api/v1/admin';

/** GET /admin/dashboard/nav-counts — pendingApplications / pendingChanges null với cấp 3. */
export interface AdminNavCounts {
  bookings: BookingStatusSummary;
  pendingApplications: number | null;
  pendingChanges: number | null;
  pendingSos: number;
}

/** Một homestay người dùng đã xem: số lần xem, lần đầu / lần cuối. */
export interface AdminViewedHomestay {
  placeId: number;
  placeName: string;
  providerName: string | null;
  regionName: string | null;
  views: number;
  firstViewedAt: string;
  lastViewedAt: string;
}
/** GET /admin/homestay-views — gom theo người dùng: người dùng A đã xem những homestay nào. */
export interface AdminTravelerViews {
  travelerId: number;
  name: string | null;
  email: string | null;
  phone: string | null;
  picture: string | null;
  totalViews: number;
  lastViewedAt: string;
  homestays: AdminViewedHomestay[];
}
export interface AdminHomestayViewSummary { totalViews: number; travelers: number; homestays: number }
export interface HomestayViewParams { keyword?: string; placeId?: number; from?: string; to?: string }

/** GET /admin/room-calendar/homestays — Homestay trong bộ chọn của Lịch phòng (Admin). */
export interface AdminCalendarHomestay {
  id: number;
  name: string;
  providerName: string | null;
  regionName: string | null;
  visibility: string | null;
}
/** Một đêm của một loại phòng: số phòng còn trống / đang giữ / có khách / khóa. */
export interface AdminRoomDay {
  date: string;
  free: number;
  held: number;
  booked: number;
  locked: number;
}
export interface AdminCalendarRoom {
  roomTypeId: number;
  name: string;
  maxOccupancy: number;
  totalRooms: number;
  days: AdminRoomDay[];
}
/** GET /admin/room-calendar — bảng nhiều ngày: số phòng còn lại từng đêm của mọi loại phòng, gom theo homestay. */
export interface AdminCalendarPlace {
  placeId: number;
  name: string;
  providerName: string | null;
  regionName: string | null;
  address: string | null;
  rooms: AdminCalendarRoom[];
}

function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('portal_token') : null;
  return {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  };
}

// ─────────────────────────────────────────────
// 1. Dashboard Summary
// ─────────────────────────────────────────────
export const adminService = {
  /**
   * Số đếm cho huy hiệu thanh bên trong một lượt gọi (trước đây 4: bookings/summary, provider-applications/summary,
   * change-requests/summary, sos-requests?status=PENDING). Cấp 3 nhận null cho hai hàng đợi. Ưu tiên thấp: chỉ là huy hiệu.
   */
  async getNavCounts(): Promise<AdminNavCounts> {
    return partnerGet<AdminNavCounts>(`${API_BASE}/dashboard/nav-counts`, { ...getAuthHeaders(), apiPriority: 'low' });
  },

  async getDashboardSummary(): Promise<AdminDashboardSummaryDto> {
    const res = await axios.get<AdminDashboardSummaryDto>(`${API_BASE}/dashboard/summary`, getAuthHeaders());
    return res.data;
  },

  // ─────────────────────────────────────────────
  // 2. Quản lý Tài khoản (/accounts)
  // ─────────────────────────────────────────────
  async getAccounts(params?: AccountSearchParams): Promise<PageResponse<AdminAccountDto>> {
    const res = await axios.get<PageResponse<AdminAccountDto>>(`${API_BASE}/accounts`, {
      ...getAuthHeaders(),
      params,
    });
    return res.data;
  },

  async getTravelers(params?: TravelerSearchParams): Promise<PageResponse<AdminTravelerDto>> {
    const res = await axios.get<PageResponse<AdminTravelerDto>>(`${API_BASE}/travelers`, {
      ...getAuthHeaders(),
      params,
    });
    return res.data;
  },

  async updateTravelerStatus(id: number, data: { status: AccountStatus; reason?: string }): Promise<AdminTravelerDto> {
    const res = await axios.patch<AdminTravelerDto>(`${API_BASE}/travelers/${id}/status`, data, getAuthHeaders());
    return res.data;
  },

  async getTravelerActivity(id: number, type: TravelerActivityType = 'ALL', page = 0): Promise<PageResponse<TravelerActivity>> {
    const res = await axios.get<PageResponse<TravelerActivity>>(`${API_BASE}/travelers/${id}/activity`, {
      ...getAuthHeaders(), params: { type, page, size: 10 },
    });
    return res.data;
  },

  async getAccountById(id: number): Promise<AdminAccountDto> {
    const res = await axios.get<AdminAccountDto>(`${API_BASE}/accounts/${id}`, getAuthHeaders());
    return res.data;
  },

  async createAdminAccount(data: CreateAdminAccountRequest): Promise<AdminAccountDto> {
    const res = await axios.post<AdminAccountDto>(`${API_BASE}/accounts`, data, getAuthHeaders());
    return res.data;
  },

  async updateAccount(id: number, data: UpdateAccountRequest): Promise<AdminAccountDto> {
    const res = await axios.put<AdminAccountDto>(`${API_BASE}/accounts/${id}`, data, getAuthHeaders());
    return res.data;
  },

  async updateAccountStatus(id: number, data: UpdateAccountStatusRequest): Promise<AdminAccountDto> {
    const res = await axios.patch<AdminAccountDto>(`${API_BASE}/accounts/${id}/status`, data, getAuthHeaders());
    return res.data;
  },

  /** Đổi quyền ADMIN ⇄ PROVIDER (hiệu lực ngay, phiên cũ bị thu hồi, bắt buộc lý do). */
  async updateAccountRole(id: number, data: UpdateAccountRoleRequest): Promise<AdminAccountDto> {
    const res = await axios.patch<AdminAccountDto>(`${API_BASE}/accounts/${id}/role`, data, getAuthHeaders());
    return res.data;
  },

  async resetPassword(id: number, data: ResetPasswordRequest): Promise<void> {
    await axios.patch(`${API_BASE}/accounts/${id}/reset-password`, data, getAuthHeaders());
  },

  /** Xóa hẳn tài khoản Admin / NCC (chỉ cấp 1, bắt buộc lý do). */
  async deleteAccount(id: number, reason: string): Promise<void> {
    await axios.delete(`${API_BASE}/accounts/${id}`, { ...getAuthHeaders(), params: { reason } });
  },

  /** Xóa hẳn tài khoản khách (chỉ cấp 1, bắt buộc lý do); booking cũ vẫn được giữ. */
  async deleteTraveler(id: number, reason: string): Promise<void> {
    await axios.delete(`${API_BASE}/travelers/${id}`, { ...getAuthHeaders(), params: { reason } });
  },

  /** Thông tin và cấp quản trị của chính người đang đăng nhập (mọi cấp Admin). */
  /**
   * AdminGuard (xác thực phiên khi mở cổng) và trang Admin (xác nhận cấp) cùng cần: giữ kết quả 15 giây trong tab
   * để lượt thứ hai không gọi lại. Lỗi không được giữ (dataCache).
   */
  async getMe(): Promise<AdminAccountDto> {
    const token = localStorage.getItem('portal_token') ?? '';
    return cachedFetch(`admin-me:${token.slice(-24)}`, 15_000,
      async () => (await axios.get<AdminAccountDto>(`${API_BASE}/accounts/me`, getAuthHeaders())).data);
  },

  /** Đổi cấp quản trị viên (chỉ cấp 1; không tự đổi cấp của mình). */
  async updateAdminLevel(id: number, data: UpdateAdminLevelRequest): Promise<AdminAccountDto> {
    const res = await axios.patch<AdminAccountDto>(`${API_BASE}/accounts/${id}/admin-level`, data, getAuthHeaders());
    return res.data;
  },

  // ─────────────────────────────────────────────
  // Thông báo cho Admin (/notifications): NCC gửi hồ sơ đăng ký, khách đăng ký mới
  // ─────────────────────────────────────────────
  /**
   * Hai chuông (thanh bên + thanh trên) cùng gắn và cùng làm mới: gộp lượt đang bay thành một request (partnerGet).
   * Ưu tiên thấp: làm mới nền, nhường dữ liệu chính của trang.
   */
  async getNotifications(): Promise<AdminNotificationFeed> {
    return partnerGet<AdminNotificationFeed>(`${API_BASE}/notifications`, { ...getAuthHeaders(), apiPriority: 'low' });
  },

  async markNotificationRead(id: number): Promise<void> {
    await axios.post(`${API_BASE}/notifications/${id}/read`, null, getAuthHeaders());
  },

  async markAllNotificationsRead(): Promise<void> {
    await axios.post(`${API_BASE}/notifications/read-all`, null, getAuthHeaders());
  },

  /** Khóa công khai VAPID để trình duyệt đăng ký nhận thông báo đẩy. */
  async getPushPublicKey(): Promise<string> {
    const res = await axios.get<{ publicKey: string }>(`${API_BASE}/notifications/push/public-key`, getAuthHeaders());
    return res.data.publicKey;
  },

  /** Lưu đăng ký đẩy của thiết bị này (PushSubscription.toJSON()). */
  async subscribePush(subscription: PushSubscriptionJSON): Promise<void> {
    await axios.post(`${API_BASE}/notifications/push/subscribe`, subscription, getAuthHeaders());
  },

  async unsubscribePush(endpoint: string): Promise<void> {
    await axios.post(`${API_BASE}/notifications/push/unsubscribe`, { endpoint }, getAuthHeaders());
  },

  /** Gửi thử một thông báo đẩy tới các thiết bị của chính Admin đang đăng nhập. */
  async testPush(): Promise<number> {
    const res = await axios.post<{ delivered: number }>(`${API_BASE}/notifications/push/test`, null, getAuthHeaders());
    return res.data.delivered;
  },

  // ─────────────────────────────────────────────
  // Duyệt thay đổi Homestay / phòng / giá của NCC (/change-requests)
  // ─────────────────────────────────────────────
  async getChangeRequests(params?: ChangeRequestSearchParams): Promise<PageResponse<ChangeRequestSummary>> {
    const res = await axios.get<PageResponse<ChangeRequestSummary>>(`${API_BASE}/change-requests`, { ...getAuthHeaders(), params });
    return res.data;
  },

  async getPendingChangeRequestCount(): Promise<number> {
    const res = await axios.get<PendingChangeCount>(`${API_BASE}/change-requests/summary`, getAuthHeaders());
    return res.data.pending;
  },

  async getChangeRequest(id: number): Promise<ChangeRequestDetail> {
    const res = await axios.get<ChangeRequestDetail>(`${API_BASE}/change-requests/${id}`, getAuthHeaders());
    return res.data;
  },

  async approveChangeRequest(id: number, note?: string): Promise<ChangeRequestDetail> {
    const res = await axios.post<ChangeRequestDetail>(`${API_BASE}/change-requests/${id}/approve`, { note }, getAuthHeaders());
    return res.data;
  },

  async rejectChangeRequest(id: number, reason: string): Promise<ChangeRequestDetail> {
    const res = await axios.post<ChangeRequestDetail>(`${API_BASE}/change-requests/${id}/reject`, { reason }, getAuthHeaders());
    return res.data;
  },

  /** Xem xét lại yêu cầu đã từ chối: đưa về Chờ duyệt để duyệt / từ chối lại. */
  async reopenChangeRequest(id: number, note?: string): Promise<ChangeRequestDetail> {
    const res = await axios.post<ChangeRequestDetail>(`${API_BASE}/change-requests/${id}/reopen`, { note }, getAuthHeaders());
    return res.data;
  },

  // ─────────────────────────────────────────────
  // Nhật ký hệ thống (/audit-logs) — chỉ đọc
  // ─────────────────────────────────────────────
  async getAuditLogs(params?: AuditLogSearchParams): Promise<PageResponse<AuditLogItem>> {
    const res = await axios.get<PageResponse<AuditLogItem>>(`${API_BASE}/audit-logs`, { ...getAuthHeaders(), params });
    return res.data;
  },

  async getAuditLog(id: number): Promise<AuditLogItem> {
    const res = await axios.get<AuditLogItem>(`${API_BASE}/audit-logs/${id}`, getAuthHeaders());
    return res.data;
  },

  // Lịch phòng trống (chỉ xem) — cùng cách xếp phòng P.1, P.2... như màn hình Lịch phòng của NCC.
  async getCalendarHomestays(): Promise<AdminCalendarHomestay[]> {
    const res = await axios.get<AdminCalendarHomestay[]>(`${API_BASE}/room-calendar/homestays`, getAuthHeaders());
    return res.data;
  },

  /** Số phòng còn lại từng đêm trong [startDate, endDate) — tối đa 31 đêm. */
  async getRoomCalendar(startDate: string, endDate: string): Promise<AdminCalendarPlace[]> {
    const res = await axios.get<AdminCalendarPlace[]>(`${API_BASE}/room-calendar`, { ...getAuthHeaders(), params: { startDate, endDate } });
    return res.data;
  },

  /** Lịch từng phòng (P.1, P.2...) của một homestay trong [startDate, endDate) — tối đa 31 đêm. */
  async getHomestayUnits(placeId: number, startDate: string, endDate: string): Promise<HomestayUnits> {
    const res = await axios.get<HomestayUnits>(`${API_BASE}/room-calendar/homestays/${placeId}/units`, { ...getAuthHeaders(), params: { startDate, endDate } });
    return res.data;
  },

  // Lịch sử khách xem homestay (toàn hệ thống, chỉ xem).
  async getHomestayViews(params: HomestayViewParams & { page?: number; size?: number }): Promise<PageResponse<AdminTravelerViews>> {
    const res = await axios.get<PageResponse<AdminTravelerViews>>(`${API_BASE}/homestay-views`, { ...getAuthHeaders(), params });
    return res.data;
  },

  async getHomestayViewSummary(params: HomestayViewParams): Promise<AdminHomestayViewSummary> {
    const res = await axios.get<AdminHomestayViewSummary>(`${API_BASE}/homestay-views/summary`, { ...getAuthHeaders(), params });
    return res.data;
  },

  // ─────────────────────────────────────────────
  // Kiểm duyệt ảnh + lưu bút check-in địa điểm của khách (/journey-checkins)
  async getJourneyCheckins(params: { hidden?: boolean; page?: number; size?: number }): Promise<PageResponse<AdminCheckinView>> {
    const res = await axios.get<PageResponse<AdminCheckinView>>(`${API_BASE}/journey-checkins`, { ...getAuthHeaders(), params });
    return res.data;
  },

  async hideJourneyCheckin(id: number, reason: string): Promise<AdminCheckinView> {
    const res = await axios.post<AdminCheckinView>(`${API_BASE}/journey-checkins/${id}/hide`, { reason }, getAuthHeaders());
    return res.data;
  },

  async unhideJourneyCheckin(id: number): Promise<AdminCheckinView> {
    const res = await axios.post<AdminCheckinView>(`${API_BASE}/journey-checkins/${id}/unhide`, null, getAuthHeaders());
    return res.data;
  },

  // Kiểm duyệt đánh giá (/reviews)
  // ─────────────────────────────────────────────
  async getReviews(params?: AdminReviewSearchParams): Promise<PageResponse<AdminReview>> {
    const res = await axios.get<PageResponse<AdminReview>>(`${API_BASE}/reviews`, { ...getAuthHeaders(), params });
    return res.data;
  },

  async moderateReview(id: number, action: ReviewModerationAction, reason?: string): Promise<AdminReview> {
    const res = await axios.post<AdminReview>(`${API_BASE}/reviews/${id}/moderate`, { action, reason }, getAuthHeaders());
    return res.data;
  },

  // ─────────────────────────────────────────────
  // Duyệt hồ sơ đăng ký NCC (/provider-applications)
  // ─────────────────────────────────────────────
  async getProviderApplications(params?: ProviderApplicationSearchParams): Promise<PageResponse<ProviderApplicationSummary>> {
    const res = await axios.get<PageResponse<ProviderApplicationSummary>>(`${API_BASE}/provider-applications`, { ...getAuthHeaders(), params });
    return res.data;
  },

  async getPendingProviderApplicationCount(): Promise<number> {
    const res = await axios.get<PendingApplicationCount>(`${API_BASE}/provider-applications/summary`, getAuthHeaders());
    return res.data.pending;
  },

  async getProviderApplication(id: number): Promise<ProviderApplicationDetail> {
    const res = await axios.get<ProviderApplicationDetail>(`${API_BASE}/provider-applications/${id}`, getAuthHeaders());
    return res.data;
  },

  /** Hình ảnh, tiện nghi, chính sách lưu trú của hồ sơ NCC (có dữ liệu khi hồ sơ đã được duyệt và đối tác đã tạo Homestay). */
  async getProviderApplicationShowcase(id: number): Promise<PlaceShowcase> {
    const res = await axios.get<PlaceShowcase>(`${API_BASE}/provider-applications/${id}/showcase`, getAuthHeaders());
    return res.data;
  },

  async approveProviderApplication(id: number, note?: string): Promise<ProviderApplicationDetail> {
    const res = await axios.post<ProviderApplicationDetail>(`${API_BASE}/provider-applications/${id}/approve`, { note }, getAuthHeaders());
    return res.data;
  },

  async rejectProviderApplication(id: number, reason: string): Promise<ProviderApplicationDetail> {
    const res = await axios.post<ProviderApplicationDetail>(`${API_BASE}/provider-applications/${id}/reject`, { reason }, getAuthHeaders());
    return res.data;
  },

  /** Xem xét lại hồ sơ đã từ chối: đưa về Chờ duyệt để duyệt / từ chối lại. */
  async reopenProviderApplication(id: number, note?: string): Promise<ProviderApplicationDetail> {
    const res = await axios.post<ProviderApplicationDetail>(`${API_BASE}/provider-applications/${id}/reopen`, { note }, getAuthHeaders());
    return res.data;
  },

  /** Duyệt nhiều hồ sơ đăng ký cùng lúc; hồ sơ lỗi (đã xử lý, SĐT/email trùng...) không chặn các hồ sơ còn lại. */
  async bulkApproveProviderApplications(ids: number[], note?: string): Promise<ProviderApplicationBulkResult> {
    const res = await axios.post<ProviderApplicationBulkResult>(`${API_BASE}/provider-applications/bulk-approve`, { ids, note }, getAuthHeaders());
    return res.data;
  },

  /** Từ chối nhiều hồ sơ đăng ký cùng lúc với cùng một lý do. */
  async bulkRejectProviderApplications(ids: number[], reason: string): Promise<ProviderApplicationBulkResult> {
    const res = await axios.post<ProviderApplicationBulkResult>(`${API_BASE}/provider-applications/bulk-reject`, { ids, reason }, getAuthHeaders());
    return res.data;
  },

  // ─────────────────────────────────────────────
  // 3. Quản lý Đối tác / NCC (/providers)
  // ─────────────────────────────────────────────
  async getProviders(status?: ProviderStatus): Promise<AdminProviderSummaryDto[]> {
    const res = await axios.get<AdminProviderSummaryDto[]>(`${API_BASE}/providers`, {
      ...getAuthHeaders(),
      params: status ? { status } : undefined,
    });
    return res.data;
  },

  async getProviderAccounts(id: number): Promise<ProviderAccountDto[]> {
    const res = await axios.get<ProviderAccountDto[]>(`${API_BASE}/providers/${id}/accounts`, getAuthHeaders());
    return res.data;
  },

  async getProviderById(id: number): Promise<AdminProviderSummaryDto> {
    const res = await axios.get<AdminProviderSummaryDto>(`${API_BASE}/providers/${id}`, getAuthHeaders());
    return res.data;
  },

  async createProviderWithAccount(data: CreateProviderWithAccountRequest): Promise<AdminProviderSummaryDto> {
    const res = await axios.post<AdminProviderSummaryDto>(`${API_BASE}/providers`, data, getAuthHeaders());
    return res.data;
  },

  async updateProvider(id: number, data: UpdateProviderRequest): Promise<AdminProviderSummaryDto> {
    const res = await axios.put<AdminProviderSummaryDto>(`${API_BASE}/providers/${id}`, data, getAuthHeaders());
    return res.data;
  },

  async updateProviderStatus(id: number, data: UpdateProviderStatusRequest): Promise<AdminProviderSummaryDto> {
    const res = await axios.patch<AdminProviderSummaryDto>(`${API_BASE}/providers/${id}/status`, data, getAuthHeaders());
    return res.data;
  },

  // ─────────────────────────────────────────────
  // 4. Kiểm duyệt Điểm đến (/places)
  // ─────────────────────────────────────────────
  async getRecentActivity(limit = 8): Promise<AuditLogEntryDto[]> {
    const res = await axios.get<AuditLogEntryDto[]>(`${API_BASE}/dashboard/activity`, { ...getAuthHeaders(), params: { limit } });
    return res.data;
  },

  async getPlaceById(id: number): Promise<AdminPlaceDetailDto> {
    const res = await axios.get<AdminPlaceDetailDto>(`${API_BASE}/places/${id}`, getAuthHeaders());
    return res.data;
  },

  async getMediaUploadConfig(): Promise<AdminUploadConfig> {
    const res = await axios.post<AdminUploadConfig>(`${API_BASE}/media/upload-config`, null, getAuthHeaders());
    return res.data;
  },
  async getPlaceMedia(placeId: number): Promise<AdminMediaDto[]> {
    const res = await axios.get<AdminMediaDto[]>(`${API_BASE}/places/${placeId}/media`, getAuthHeaders());
    return res.data;
  },
  async attachPlaceMedia(placeId: number, imageId: string, url: string, caption?: string): Promise<AdminMediaDto[]> {
    const res = await axios.post<AdminMediaDto[]>(`${API_BASE}/places/${placeId}/media`, { imageId, url, caption }, getAuthHeaders());
    return res.data;
  },
  async removePlaceMedia(placeId: number, mediaId: number): Promise<AdminMediaDto[]> {
    const res = await axios.delete<AdminMediaDto[]>(`${API_BASE}/places/${placeId}/media/${mediaId}`, getAuthHeaders());
    return res.data;
  },
  async setPlaceCover(placeId: number, mediaId: number): Promise<AdminMediaDto[]> {
    const res = await axios.patch<AdminMediaDto[]>(`${API_BASE}/places/${placeId}/media/${mediaId}/cover`, null, getAuthHeaders());
    return res.data;
  },

  /** Hình ảnh, tiện nghi, chính sách lưu trú của điểm đến (màn Duyệt điểm đến). */
  async getPlaceShowcase(id: number): Promise<PlaceShowcase> {
    const res = await axios.get<PlaceShowcase>(`${API_BASE}/places/${id}/showcase`, getAuthHeaders());
    return res.data;
  },


  async getPlaces(params?: PlaceSearchParams): Promise<PageResponse<AdminPlaceSummaryDto>> {
    const res = await axios.get<PageResponse<AdminPlaceSummaryDto>>(`${API_BASE}/places`, {
      ...getAuthHeaders(),
      params,
    });
    return res.data;
  },

  async getBookings(params?: BookingSearchParams): Promise<PageResponse<AdminBookingDto>> {
    // Axios mặc định gửi mảng dạng status[]=A; backend nhận danh sách phân tách bằng dấu phẩy.
    const { statuses, ...rest } = params ?? {};
    const res = await axios.get<PageResponse<AdminBookingDto>>(`${API_BASE}/bookings`, {
      ...getAuthHeaders(),
      params: { ...rest, status: statuses && statuses.length > 0 ? statuses.join(',') : rest.status },
    });
    return res.data;
  },

  async getBookingsSummary(priority: 'high' | 'low' = 'high'): Promise<BookingStatusSummary> {
    const res = await axios.get<BookingStatusSummary>(`${API_BASE}/bookings/summary`, { ...getAuthHeaders(), apiPriority: priority });
    return res.data;
  },


  async getBookingDetail(id: number): Promise<AdminBookingDetailDto> {
    const res = await axios.get<AdminBookingDetailDto>(`${API_BASE}/bookings/${id}`, getAuthHeaders());
    return res.data;
  },

  /**
   * Admin xử lý đơn — cùng quy trình với NCC: CONFIRM / REJECT (chờ xác nhận), PAY / CANCEL (đã xác nhận).
   * note: lý do / ghi chú, không bắt buộc. Trả chi tiết đơn mới nhất.
   */
  async bookingAction(id: number, action: BookingAction, note?: string): Promise<AdminBookingDetailDto> {
    const path = { CONFIRM: 'confirm', REJECT: 'reject', PAY: 'pay', CANCEL: 'cancel', CHECK_IN: 'check-in' }[action];
    const res = await axios.post<AdminBookingDetailDto>(`${API_BASE}/bookings/${id}/${path}`, { note: note?.trim() || undefined }, getAuthHeaders());
    return res.data;
  },

  async addBookingNote(id: number, data: AddBookingNoteRequest): Promise<BookingNoteDto> {
    const res = await axios.post<BookingNoteDto>(`${API_BASE}/bookings/${id}/notes`, data, getAuthHeaders());
    return res.data;
  },

  async getReportOverview(params?: ReportSearchParams): Promise<AdminOverviewReport> {
    const res = await axios.get<AdminOverviewReport>(`${API_BASE}/reports/overview`, {
      ...getAuthHeaders(),
      params,
    });
    return res.data;
  },

  async createTraveler(data: CreateTravelerRequest): Promise<AdminTravelerDto> {
    const res = await axios.post<AdminTravelerDto>(`${API_BASE}/travelers`, data, getAuthHeaders());
    return res.data;
  },

  // Không có updateBookingStatus tự do: Admin (từ cấp 2) chỉ xử lý đơn qua bookingAction — đúng bộ thao tác của NCC
  // (xác nhận / từ chối / ghi nhận thanh toán / hủy / nhận phòng), bắt buộc lý do hoặc chứng từ; cấp 3 chỉ xem.

  async getPlacesSummary(): Promise<PlaceVerificationSummary> {
    const res = await axios.get<PlaceVerificationSummary>(`${API_BASE}/places/summary`, getAuthHeaders());
    return res.data;
  },

  async bulkUpdatePlaceVerification(data: {
    ids: number[];
    verification: PlaceVerificationStatus;
    reason?: string;
  }): Promise<{ updated: number }> {
    const res = await axios.patch<{ updated: number }>(`${API_BASE}/places/verification/bulk`, data, getAuthHeaders());
    return res.data;
  },

  async updatePlaceVerification(id: number, data: UpdatePlaceVerificationRequest): Promise<AdminPlaceSummaryDto> {
    const res = await axios.patch<AdminPlaceSummaryDto>(`${API_BASE}/places/${id}/verification`, data, getAuthHeaders());
    return res.data;
  },

  /** Bật / tắt cờ "dữ liệu đã xác thực" — độc lập với trạng thái duyệt nội dung. */
  async updatePlaceDataVerified(id: number, data: UpdatePlaceDataVerifiedRequest): Promise<AdminPlaceSummaryDto> {
    const res = await axios.patch<AdminPlaceSummaryDto>(`${API_BASE}/places/${id}/data-verified`, data, getAuthHeaders());
    return res.data;
  },

  async updatePlaceVisibility(id: number, data: UpdatePlaceVisibilityRequest): Promise<AdminPlaceSummaryDto> {
    const res = await axios.patch<AdminPlaceSummaryDto>(`${API_BASE}/places/${id}/visibility`, data, getAuthHeaders());
    return res.data;
  },

  /** Xóa mềm một hoặc nhiều điểm đến (bắt buộc lý do, ghi nhật ký hoạt động). */
  async deletePlaces(data: { ids: number[]; reason: string }): Promise<{ deleted: number }> {
    const res = await axios.post<{ deleted: number }>(`${API_BASE}/places/delete`, data, getAuthHeaders());
    return res.data;
  },

  // ─────────────────────────────────────────────
  // 5. Quản lý Tài chính & Hoàn tiền (/finance)
  // ─────────────────────────────────────────────
  async getRevenueSummary(): Promise<{
    grandTotal: number;
    totalTransactions: number;
    byMonth: Array<{ year: number; month: number; totalAmount: number; transactionCount: number }>;
  }> {
    const res = await axios.get(`${API_BASE}/finance/revenue-summary`, getAuthHeaders());
    return res.data;
  },

  async getRefunds(pendingOnly: boolean = false): Promise<Array<{
    id: number;
    bookingCode: string;
    amount: number;
    reason: string;
    type: string;
    status: 'PENDING' | 'PROCESSED' | 'REJECTED';
    requestedAt: string;
    processedAt?: string;
  }>> {
    const res = await axios.get(`${API_BASE}/finance/refunds`, {
      ...getAuthHeaders(),
      params: { pendingOnly },
    });
    return res.data;
  },

  async approveRefund(id: number, note?: string): Promise<void> {
    await axios.post(`${API_BASE}/finance/refunds/${id}/approve`, { note }, getAuthHeaders());
  },

  /** Dòng tiền theo NCC / Homestay (thu, hoàn, chờ hoàn, ròng) theo kỳ, có lọc, sắp xếp và phân trang. */
  async getCashflow(params?: CashflowSearchParams): Promise<CashflowReport> {
    const res = await axios.get<CashflowReport>(`${API_BASE}/finance/cashflow`, { ...getAuthHeaders(), params });
    return res.data;
  },

  async rejectRefund(id: number, note: string): Promise<void> {
    await axios.post(`${API_BASE}/finance/refunds/${id}/reject`, { note }, getAuthHeaders());
  },
};


/** SOS — yêu cầu hỗ trợ khẩn cấp của du khách (Admin SOS API). */
export const sosAdminService = {
  /** priority 'low' cho lượt làm mới nền (mỗi 30 giây). */
  async getSosRequests(status?: string, priority: 'high' | 'low' = 'high'): Promise<SosRequestListResponse> {
    const res = await axios.get<SosRequestListResponse>(`${API_BASE}/sos-requests`, {
      ...getAuthHeaders(),
      apiPriority: priority,
      params: status ? { status } : undefined,
    });
    return res.data;
  },

  async getSosRequest(id: number): Promise<SosRequestDto> {
    const res = await axios.get<SosRequestDto>(`${API_BASE}/sos-requests/${id}`, getAuthHeaders());
    return res.data;
  },

  async dispatchSos(id: number, assignedContactId: number, note?: string): Promise<SosRequestDto> {
    const res = await axios.post<SosRequestDto>(`${API_BASE}/sos-requests/${id}/dispatch`, { assignedContactId, note }, getAuthHeaders());
    return res.data;
  },

  async resolveSos(id: number): Promise<SosRequestDto> {
    const res = await axios.post<SosRequestDto>(`${API_BASE}/sos-requests/${id}/resolve`, {}, getAuthHeaders());
    return res.data;
  },

  async cancelSos(id: number): Promise<SosRequestDto> {
    const res = await axios.post<SosRequestDto>(`${API_BASE}/sos-requests/${id}/cancel`, {}, getAuthHeaders());
    return res.data;
  },

  async getEmergencyContacts(activeOnly = false, priority: 'high' | 'low' = 'high'): Promise<EmergencyContactDto[]> {
    const res = await axios.get<EmergencyContactDto[]>(`${API_BASE}/emergency-contacts`, {
      ...getAuthHeaders(),
      apiPriority: priority,
      params: { activeOnly },
    });
    return res.data;
  },

  async createEmergencyContact(req: CreateEmergencyContactRequest): Promise<EmergencyContactDto> {
    const res = await axios.post<EmergencyContactDto>(`${API_BASE}/emergency-contacts`, req, getAuthHeaders());
    return res.data;
  },

  async updateEmergencyContact(id: number, req: UpdateEmergencyContactRequest): Promise<EmergencyContactDto> {
    const res = await axios.put<EmergencyContactDto>(`${API_BASE}/emergency-contacts/${id}`, req, getAuthHeaders());
    return res.data;
  },

  async deleteEmergencyContact(id: number): Promise<void> {
    await axios.delete(`${API_BASE}/emergency-contacts/${id}`, getAuthHeaders());
  },
};
