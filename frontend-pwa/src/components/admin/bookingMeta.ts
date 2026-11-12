import type {
  BookingNoteOutcome,
  BookingStatus,
} from '@/types/admin';
import type { StatusTone } from './StatusBadge';
import { BOOKING_STATUS_LABEL } from '@/lib/bookingStatus';

/** Nhãn trạng thái đơn — dùng chung với cổng NCC và trang khách (lib/bookingStatus). */
export const STATUS_LABEL: Record<BookingStatus, string> = BOOKING_STATUS_LABEL;

/** Màu: Chờ xác nhận = vàng (cần xử lý) · Đã xác nhận = lam (chờ thanh toán) · Đã thanh toán = xanh · Đã hủy = xám. */
export const STATUS_TONE: Record<BookingStatus, StatusTone> = {
  PENDING: 'warning',
  CONFIRMED: 'info',
  PAID: 'success',
  CANCELLED: 'neutral',
};

/** Trạng thái cần Admin / NCC thao tác (nhấp nháy để dễ thấy). */
export const isPendingStatus = (s: BookingStatus) => s === 'PENDING' || s === 'CONFIRMED';

/** Nền mờ tỉ lệ theo số lượng, dùng cho danh sách phân bố trạng thái trong báo cáo. */
export const STATUS_FILL: Record<BookingStatus, string> = {
  PENDING: 'bg-sun/10',
  CONFIRMED: 'bg-secondary/10',
  PAID: 'bg-accent/10',
  CANCELLED: 'bg-muted/10',
};

export const OUTCOME_LABEL: Record<BookingNoteOutcome, string> = {
  NO_ISSUE: 'Đã kiểm tra, không có vấn đề',
  SUPPORTED: 'Đã hỗ trợ xong',
  ESCALATED: 'Đã chuyển NCC / bộ phận liên quan',
  FOLLOW_UP: 'Cần tiếp tục theo dõi',
};

export const OUTCOME_TONE: Record<BookingNoteOutcome, StatusTone> = {
  NO_ISSUE: 'success',
  SUPPORTED: 'success',
  ESCALATED: 'info',
  FOLLOW_UP: 'warning',
};

export const vnd = (n?: number | null) => (n == null ? '—' : new Intl.NumberFormat('vi-VN').format(n) + 'đ');
export const fmtDate = (d?: string | null) => (d ? new Date(d).toLocaleDateString('vi-VN') : '—');
export const fmtDateTime = (d?: string | null) => (d ? new Date(d).toLocaleString('vi-VN') : '—');
