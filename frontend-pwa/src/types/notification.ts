/**
 * Trạng thái trong thông báo của khách: 4 trạng thái hiện hành (PENDING / CONFIRMED / PAID / CANCELLED) và các mã cũ
 * còn nằm trong thông báo đã lưu trước khi gộp trạng thái (REJECTED, EXPIRED, NO_SHOW, CHANGE_*).
 */
export type NotificationBookingStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'PAID'
  | 'CANCELLED'
  | 'REJECTED'
  | 'EXPIRED'
  | 'NO_SHOW'
  | 'CHANGE_APPROVED'
  | 'CHANGE_REJECTED'
  | 'REVIEW_REPLY';

export interface NotificationPayload {
  title?: string;
  message?: string;
  bookingCode?: string;
  bookingStatus?: NotificationBookingStatus | string;
  placeName?: string;
  isRead?: boolean;
  totalAmount?: number;
  [key: string]: unknown;
}

export interface CustomerNotification {
  id: number;
  templateCode?: string;
  channel?: string;
  recipientType?: string;
  recipientEmail?: string | null;
  recipientPhone?: string | null;
  relatedEntityType?: string | null;
  relatedEntityId?: number | null;
  bookingCode?: string | null;
  title: string;
  message: string;
  bookingStatus?: NotificationBookingStatus | null;
  isRead: boolean;
  createdAt: string;
  payload?: NotificationPayload;
}
