import type { BookingStatus } from '@/types/booking';

/**
 * Sự kiện trạng thái đơn trong trình duyệt của khách — BookingStatusWatcher (gắn ở CustomerRoute) hỏi máy chủ vài giây
 * một lần khi khách còn đơn chờ xác nhận và phát các sự kiện này cho trang đang mở.
 */

/** Đơn vừa đổi trạng thái do Admin / NCC (detail: BookingStatusChange). */
export const BOOKING_STATUS_CHANGED = 'booking_status_changed';
/** Thiết bị này vừa tạo đơn hoặc tự đổi trạng thái đơn (hủy, sửa): cập nhật mốc mà không báo khách. */
const BOOKING_LOCAL_STATUS = 'booking_local_status';

export interface BookingStatusChange {
  bookingCode: string;
  from: BookingStatus;
  to: BookingStatus;
}

export function emitBookingStatusChange(change: BookingStatusChange) {
  window.dispatchEvent(new CustomEvent<BookingStatusChange>(BOOKING_STATUS_CHANGED, { detail: change }));
}

export function onBookingStatusChange(handler: (change: BookingStatusChange) => void): () => void {
  const listener = (e: Event) => handler((e as CustomEvent<BookingStatusChange>).detail);
  window.addEventListener(BOOKING_STATUS_CHANGED, listener);
  return () => window.removeEventListener(BOOKING_STATUS_CHANGED, listener);
}

/** Gọi sau khi khách tự tạo / hủy / sửa đơn trên thiết bị này — bộ theo dõi coi đó là mốc mới, không hiện thông báo. */
export function noteLocalBookingStatus(bookingCode: string, status: BookingStatus) {
  window.dispatchEvent(new CustomEvent(BOOKING_LOCAL_STATUS, { detail: { bookingCode, status } }));
}

export function onLocalBookingStatus(handler: (bookingCode: string, status: BookingStatus) => void): () => void {
  const listener = (e: Event) => {
    const { bookingCode, status } = (e as CustomEvent<{ bookingCode: string; status: BookingStatus }>).detail;
    handler(bookingCode, status);
  };
  window.addEventListener(BOOKING_LOCAL_STATUS, listener);
  return () => window.removeEventListener(BOOKING_LOCAL_STATUS, listener);
}

/**
 * Màn hình đang có dữ liệu khách nhập dở (form đặt phòng, hộp sửa / hủy đơn...) giữ "khóa": khi có đơn được xác nhận,
 * bộ theo dõi chỉ hiện thông báo kèm nút "Xem đơn" thay vì tự chuyển trang làm mất dữ liệu.
 */
let holds = 0;
export function holdAutoNavigate(): () => void {
  holds += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    holds = Math.max(0, holds - 1);
  };
}
export const isAutoNavigateHeld = () => holds > 0;
