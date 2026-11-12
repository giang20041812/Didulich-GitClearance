import { withSavepoint } from '../db/pool.js';
import type { ActorType, BookingStatus } from '../domain/enums.js';
import { logger } from '../lib/logger.js';
import * as notifications from './notificationService.js';
import * as recorder from './notificationRecorder.js';
import { noticeInfo, totalRooms, type BookingFull } from './bookingModel.js';

/**
 * Thông báo về đơn đặt phòng cho ba phía, gom một chỗ để Admin và NCC luôn nhận cùng một loại tin:
 *  - khách đặt / sửa / hủy đơn → Admin và NCC của chỗ nghỉ (trong cổng + đẩy ra màn hình sau khi commit);
 *  - Admin hoặc NCC xác nhận / ghi nhận thanh toán / từ chối / hủy → khách, và phía còn lại (NCC xử lý thì báo Admin,
 *    Admin xử lý thì báo NCC).
 * Lỗi gửi thông báo không bao giờ làm hỏng nghiệp vụ chính.
 */

const TARGET = 'bookings';

const dayMonth = (date: string): string => `${date.slice(8, 10)}/${date.slice(5, 7)}`;
const placeName = (b: BookingFull): string => (b.placeName ? b.placeName : 'Homestay');
const stay = (b: BookingFull): string => (!b.checkIn || !b.checkOut ? '' : `${dayMonth(b.checkIn)} → ${dayMonth(b.checkOut)}, ${totalRooms(b)} phòng`);
const reasonText = (reason: string | null | undefined): string => (!reason || !reason.trim() ? '.' : `. Lý do: ${reason.trim()}`);

async function toStaff(b: BookingFull, adminTemplate: string, partnerTemplate: string, message: string): Promise<void> {
  await recorder.toAdmins(adminTemplate, 'Booking', b.id, message, TARGET);
  await recorder.toProvider(b.providerId, partnerTemplate, 'Booking', b.id, message, TARGET);
}

/** Khách vừa đặt đơn mới (đang chờ xác nhận). Gọi sau khi đơn đã lưu. */
export async function newBooking(b: BookingFull): Promise<void> {
  const message = `Đơn ${b.bookingCode} · ${placeName(b)} · ${stay(b)} — đang chờ xác nhận.`;
  await toStaff(b, 'ADMIN_NEW_BOOKING', 'PARTNER_NEW_BOOKING', message);
}

/** Khách vừa sửa đơn: đơn quay về chờ xác nhận, Admin và NCC cần xem lại. `changes`: tóm tắt thay đổi. */
export async function updatedByCustomer(b: BookingFull, changes: string | null): Promise<void> {
  const message = `Khách vừa thay đổi đơn ${b.bookingCode} · ${placeName(b)}${!changes || !changes.trim() ? '' : ` (${changes})`} — cần xác nhận lại.`;
  await toStaff(b, 'ADMIN_BOOKING_UPDATED', 'PARTNER_BOOKING_UPDATED', message);
}

/** Khách tự hủy đơn: phòng đã được trả lại lịch. */
export async function cancelledByCustomer(b: BookingFull, reason: string | null): Promise<void> {
  const message = `Khách đã hủy đơn ${b.bookingCode} · ${placeName(b)} · ${stay(b)}${reasonText(reason)}`;
  await toStaff(b, 'ADMIN_BOOKING_CANCELLED', 'PARTNER_BOOKING_CANCELLED', message);
}

/**
 * Admin / NCC vừa đổi trạng thái đơn: báo khách, và báo phía còn lại (Admin xử lý → NCC; NCC xử lý → Admin).
 * `rejected`: hủy khi đơn còn chờ xác nhận (từ chối).
 */
export async function statusChangedByStaff(b: BookingFull, to: BookingStatus, actor: ActorType, rejected: boolean, reason: string | null): Promise<void> {
  try {
    await withSavepoint(() => notifications.notifyBookingStatusChange(noticeInfo(b), to, reason));
  } catch (err) {
    logger.warn('Không tạo được thông báo cho khách về đơn', { bookingCode: b.bookingCode, error: (err as Error).message });
  }
  const who = actor === 'ADMIN' ? 'Quản trị viên' : 'Nhà cung cấp';
  const action = to === 'CONFIRMED' ? 'đã xác nhận đơn' : to === 'PAID' ? 'đã ghi nhận thanh toán đơn' : rejected ? 'đã từ chối đơn' : 'đã hủy đơn';
  const message =
    `${who} ${action} ${b.bookingCode} · ${placeName(b)}` +
    (to === 'CONFIRMED' ? ' — chờ khách thanh toán.' : to === 'CANCELLED' ? reasonText(reason) : '.');
  const suffix = to === 'CONFIRMED' ? 'BOOKING_CONFIRMED' : to === 'PAID' ? 'BOOKING_PAID' : 'BOOKING_CANCELLED';
  if (actor === 'ADMIN') await recorder.toProvider(b.providerId, `PARTNER_${suffix}`, 'Booking', b.id, message, TARGET);
  else await recorder.toAdmins(`ADMIN_${suffix}`, 'Booking', b.id, message, TARGET);
}

/** Khách đã nhận phòng: khách tự quét mã QR → báo Admin và NCC; NCC bấm giúp → báo Admin; Admin bấm giúp → báo NCC. */
export async function checkedIn(b: BookingFull, actor: ActorType): Promise<void> {
  const guest = !b.guestName || !b.guestName.trim() ? 'Khách' : `Khách ${b.guestName.trim()}`;
  const how = actor === 'CUSTOMER' ? ' (quét mã QR)' : actor === 'PROVIDER' ? ' (nhà cung cấp ghi nhận)' : actor === 'ADMIN' ? ' (quản trị viên ghi nhận)' : '';
  const message = `${guest} đã nhận phòng${how} · đơn ${b.bookingCode} · ${placeName(b)} · ${stay(b)}.`;
  if (actor !== 'ADMIN') await recorder.toAdmins('ADMIN_BOOKING_CHECKED_IN', 'Booking', b.id, message, TARGET);
  if (actor !== 'PROVIDER') await recorder.toProvider(b.providerId, 'PARTNER_BOOKING_CHECKED_IN', 'Booking', b.id, message, TARGET);
}
