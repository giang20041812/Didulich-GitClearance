/**
 * Hồ sơ đăng ký NCC chờ Admin thẩm định (FR-AD-16).
 * Khớp com.dulichso.bookingapi.dto.admin.AdminProviderApplicationDtos (backend-api). Không có trường mật khẩu.
 */
import type { ProviderServiceType } from './partner';

export type ProviderApplicationStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

/** ApplicationSummaryDto */
export interface ProviderApplicationSummary {
  id: number;
  businessName: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string | null;
  address: string;
  businessLicenseNo: string | null;
  status: ProviderApplicationStatus;
  createdAt: string;
  reviewedAt: string | null;
  reviewedByName: string | null;
  reviewNote: string | null;
  providerId: number | null;
  /** Loại hình đăng ký; hồ sơ cũ là HOMESTAY. */
  serviceType: ProviderServiceType;
}

/** ApplicationDetailDto. phoneTaken/emailTaken = SĐT/email đã thuộc tài khoản khác, hồ sơ không thể duyệt. */
export interface ProviderApplicationDetail {
  summary: ProviderApplicationSummary;
  description: string | null;
  phoneTaken: boolean;
  emailTaken: boolean;
  /** Câu trả lời riêng của loại hình (ProviderApplicationDetails.java); null = hồ sơ gửi trước khi có câu hỏi riêng. */
  details: Record<string, unknown> | null;
}

export interface ProviderApplicationSearchParams {
  status?: ProviderApplicationStatus;
  serviceType?: ProviderServiceType;
  keyword?: string;
  from?: string;
  to?: string;
  sortDir?: 'asc' | 'desc';
  page?: number;
  size?: number;
}

/** PendingApplicationCountDto */
export interface PendingApplicationCount {
  pending: number;
}

/** BulkFailureDto — lỗi khi xử lý 1 hồ sơ trong yêu cầu duyệt/từ chối hàng loạt. */
export interface ProviderApplicationBulkFailure {
  id: number;
  message: string;
}

/** BulkActionResultDto — mỗi hồ sơ xử lý độc lập, hồ sơ lỗi không chặn các hồ sơ còn lại. */
export interface ProviderApplicationBulkResult {
  succeededIds: number[];
  failed: ProviderApplicationBulkFailure[];
}
