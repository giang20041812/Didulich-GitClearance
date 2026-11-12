/**
 * Kiểm duyệt đánh giá của Admin (FR-AD-15).
 * Khớp com.dulichso.bookingapi.dto.admin.AdminReviewDtos (backend-api). Không có SĐT/email của khách.
 */
export type AdminReviewStatus = 'VISIBLE' | 'HIDDEN' | 'REMOVED';

/** KEEP giữ nguyên · HIDE ẩn (khôi phục được) · REMOVE gỡ (không khôi phục) · RESTORE hiển thị lại đánh giá đang ẩn. */
export type ReviewModerationAction = 'KEEP' | 'HIDE' | 'REMOVE' | 'RESTORE';

/** ReviewDto */
export interface AdminReview {
  id: number;
  placeId: number;
  placeName: string;
  providerId: number | null;
  providerName: string | null;
  bookingId: number | null;
  bookingCode: string | null;
  guestName: string;
  rating: number;
  content: string | null;
  images: string[] | null;
  status: AdminReviewStatus;
  createdAt: string;
  providerReply: string | null;
  providerReplyAt: string | null;
  moderatedByName: string | null;
  moderatedAt: string | null;
  moderationReason: string | null;
}

export interface AdminReviewSearchParams {
  status?: AdminReviewStatus;
  /** true = đã có quyết định kiểm duyệt (moderatedAt != null); false = chưa xử lý. */
  processed?: boolean;
  placeId?: number;
  providerId?: number;
  rating?: number;
  keyword?: string;
  from?: string;
  to?: string;
  page?: number;
  size?: number;
}
