import { exec, one } from '../db/pool.js';
import type { BookingStatus } from '../domain/enums.js';
import { nowLocal } from '../lib/time.js';
import * as repo from '../repositories/notificationRepo.js';
import type { NotificationRow } from '../repositories/notificationRepo.js';

/** Thông báo trong ứng dụng cho khách (chuông thông báo): đơn đặt phòng, phản hồi đánh giá. */

export interface NotificationDto {
  id: number;
  templateCode: string | null;
  channel: string | null;
  recipientType: string | null;
  recipientEmail: string | null;
  recipientPhone: string | null;
  relatedEntityType: string | null;
  relatedEntityId: number | null;
  bookingCode: string | null;
  title: string;
  message: string;
  bookingStatus: string | null;
  isRead: boolean;
  createdAt: string;
  payload: Record<string, unknown>;
}

/** Phần đơn đặt phòng mà thông báo cần. */
export interface BookingNoticeInfo {
  id: number;
  bookingCode: string;
  placeName: string | null;
  guestEmail: string | null;
  guestPhone: string | null;
  totalAmount: number | null;
  confirmedAt: string | null;
  checkIn: string | null;
  checkOut: string | null;
}

function toDto(n: NotificationRow): NotificationDto {
  const payload = n.payload ?? {};
  return {
    id: n.id,
    templateCode: n.templateCode ?? null,
    channel: n.channel ?? null,
    recipientType: n.recipientType ?? null,
    recipientEmail: n.recipientEmail,
    recipientPhone: n.recipientPhone,
    relatedEntityType: n.relatedEntityType,
    relatedEntityId: n.relatedEntityId,
    bookingCode: payload.bookingCode != null ? String(payload.bookingCode) : null,
    title: payload.title != null ? String(payload.title) : 'Thông báo đơn đặt phòng',
    message: payload.message != null ? String(payload.message) : '',
    bookingStatus: payload.bookingStatus != null ? String(payload.bookingStatus) : null,
    isRead: payload.isRead === true,
    createdAt: n.createdAt,
    payload,
  };
}

async function ensureTemplateExists(code: string, subject: string, body: string): Promise<string> {
  const found = await repo.findTemplate(code);
  if (found) return found.code;
  await exec(
    `INSERT INTO notification_template (code, channel, subject, body_template, is_active) VALUES ($1, 'IN_APP', $2, $3, TRUE)
     ON CONFLICT (code) DO NOTHING`,
    [code, subject, body],
  );
  return code;
}

async function saveCustomerNotice(
  templateCode: string,
  booking: BookingNoticeInfo,
  relatedType: string,
  payload: Record<string, unknown>,
): Promise<NotificationDto> {
  const now = nowLocal();
  const saved = await repo.insert({
    templateCode,
    channel: 'IN_APP',
    recipientType: 'CUSTOMER',
    recipientEmail: booking.guestEmail,
    recipientPhone: booking.guestPhone,
    relatedEntityType: relatedType,
    relatedEntityId: booking.id,
    payload,
    status: 'SENT',
    createdAt: now,
    sentAt: now,
  });
  return toDto(saved);
}

/**
 * Báo khách (chuông thông báo) khi Admin / NCC đổi trạng thái đơn: đã xác nhận (chờ thanh toán), đã thanh toán, bị từ chối
 * (hủy khi chưa từng xác nhận) hoặc bị hủy. Khách tự hủy thì không báo lại cho chính khách.
 */
export async function notifyBookingStatusChange(booking: BookingNoticeInfo | null, newStatus: BookingStatus | null, reason: string | null): Promise<NotificationDto | null> {
  if (!booking || !newStatus || newStatus === 'PENDING') return null;
  const placeName = booking.placeName ?? 'Homestay';
  const reasonText = reason && reason.trim() ? ` Lý do: ${reason.trim()}` : '';
  let templateCode: string;
  let title: string;
  let message: string;
  if (newStatus === 'CONFIRMED') {
    templateCode = 'BOOKING_CONFIRMED';
    title = 'Đặt phòng đã được xác nhận';
    message = 'Đơn của bạn đã được xác nhận, vui lòng thanh toán theo hướng dẫn.';
  } else if (newStatus === 'PAID') {
    templateCode = 'BOOKING_PAID';
    title = 'Đã ghi nhận thanh toán';
    message = `Đơn ${booking.bookingCode} tại ${placeName} đã được ghi nhận thanh toán. Chúc bạn có kỳ nghỉ tuyệt vời!`;
  } else {
    // Chưa từng được xác nhận = bị từ chối; đã xác nhận rồi mới hủy = bị hủy.
    const rejected = booking.confirmedAt == null;
    templateCode = rejected ? 'BOOKING_REJECTED' : 'BOOKING_CANCELLED';
    title = rejected ? 'Đơn đặt phòng bị từ chối' : 'Đơn đặt phòng đã bị hủy';
    message =
      (rejected ? `Rất tiếc, đơn ${booking.bookingCode} tại ${placeName} đã bị từ chối.` : `Đơn ${booking.bookingCode} tại ${placeName} đã bị hủy.`) +
      reasonText;
  }
  const code = await ensureTemplateExists(templateCode, title, message);
  const payload: Record<string, unknown> = {
    title,
    message,
    bookingCode: booking.bookingCode,
    bookingStatus: newStatus,
    placeName,
    isRead: false,
  };
  if (booking.totalAmount != null) payload.totalAmount = booking.totalAmount;
  return saveCustomerNotice(code, booking, 'booking', payload);
}

export async function notifyReviewReply(booking: BookingNoticeInfo | null, providerReply: string | null): Promise<NotificationDto | null> {
  if (!booking || !providerReply || !providerReply.trim()) return null;
  const placeName = booking.placeName ?? 'Homestay';
  const title = 'Nhà cung cấp đã phản hồi đánh giá';
  const message = `NCC tại ${placeName} đã phản hồi đánh giá của bạn cho đơn ${booking.bookingCode}.`;
  const code = await ensureTemplateExists('REVIEW_PROVIDER_REPLY', title, message);
  return saveCustomerNotice(code, booking, 'review', {
    title,
    message,
    bookingCode: booking.bookingCode,
    bookingStatus: 'REVIEW_REPLY',
    placeName,
    isRead: false,
  });
}

const dayMonth = (date: string) => `${date.slice(8, 10)}/${date.slice(5, 7)}`;

/** Báo khách trong ứng dụng rằng yêu cầu đặt phòng đã được gửi; gọi sau khi đơn đã lưu xong. */
export async function notifyBookingCreated(booking: BookingNoticeInfo | null): Promise<NotificationDto | null> {
  if (!booking) return null;
  const placeName = booking.placeName ?? 'Homestay';
  const stay = booking.checkIn == null || booking.checkOut == null ? '' : ` (${dayMonth(booking.checkIn)} → ${dayMonth(booking.checkOut)})`;
  const title = 'Đã đặt phòng thành công';
  const message = `Yêu cầu đặt phòng ${booking.bookingCode} tại ${placeName}${stay} đã được gửi. Bạn sẽ nhận thông báo ngay khi đơn được xác nhận.`;
  const code = await ensureTemplateExists('BOOKING_CREATED', title, message);
  const payload: Record<string, unknown> = {
    title,
    message,
    bookingCode: booking.bookingCode,
    bookingStatus: 'PENDING',
    placeName,
    isRead: false,
  };
  if (booking.totalAmount != null) payload.totalAmount = booking.totalAmount;
  return saveCustomerNotice(code, booking, 'booking', payload);
}

export async function getNotificationsForCustomer(email: string | null, phone: string | null, accountId: number | null): Promise<NotificationDto[]> {
  const safeEmail = email && email.trim() ? email.trim() : null;
  const safePhone = phone && phone.trim() ? phone.trim() : null;
  if (safeEmail == null && safePhone == null && accountId == null) return [];
  return (await repo.findForCustomer(safeEmail, safePhone, accountId)).map(toDto);
}

export async function markAsRead(id: number | null): Promise<NotificationDto | null> {
  if (id == null) return null;
  // Endpoint công khai: chỉ thông báo của khách; thông báo gửi cho Admin có API riêng (cần đăng nhập ADMIN).
  const n = await one<NotificationRow>(`SELECT * FROM notification WHERE id = $1 AND recipient_type = 'CUSTOMER'`, [id]);
  if (!n) return null;
  const payload = { ...(n.payload ?? {}), isRead: true };
  await repo.updatePayload(n.id, payload);
  return toDto({ ...n, payload });
}

export async function markAllAsRead(email: string | null, phone: string | null, accountId: number | null): Promise<void> {
  const safeEmail = email && email.trim() ? email.trim() : null;
  const safePhone = phone && phone.trim() ? phone.trim() : null;
  for (const n of await repo.findForCustomer(safeEmail, safePhone, accountId)) {
    if (n.payload && n.payload.isRead === false) await repo.updatePayload(n.id, { ...n.payload, isRead: true });
  }
}
