import { tx, withSavepoint } from '../db/pool.js';
import { isFinalBookingStatus } from '../domain/enums.js';
import { logger } from '../lib/logger.js';
import { nowLocal } from '../lib/time.js';
import * as bookings from '../repositories/bookingRepo.js';
import * as rooms from '../repositories/roomRepo.js';
import { attachRooms, type BookingFull } from './bookingModel.js';
import * as recorder from './notificationRecorder.js';
import * as calendar from './roomCalendarService.js';

/** Hệ quả bắt buộc khi Homestay / phòng / NCC ngừng phục vụ. */

export function cancelForPlace(placeId: number, fromDate: string, toDate: string, reason: string): Promise<number> {
  return tx(async () => cancelAll(await attachRooms(await bookings.activeByPlaceAndDateRange(placeId, fromDate, toDate)), reason));
}

export function cancelForRoomType(roomTypeId: number, fromDate: string, toDate: string, reason: string): Promise<number> {
  return tx(async () => cancelAll(await attachRooms(await bookings.activeByRoomTypeAndDateRange(roomTypeId, fromDate, toDate)), reason));
}

export function cancelForProvider(providerId: number, reason: string, today: string): Promise<number> {
  return tx(async () => cancelAll(await attachRooms(await bookings.activeByProvider(providerId, today)), reason));
}

async function cancelAll(candidates: BookingFull[], reason: string): Promise<number> {
  let count = 0;
  for (const booking of candidates) {
    // Đơn đã thanh toán là trạng thái kết thúc: không tự hủy — Admin / NCC liên hệ khách xử lý riêng.
    if (isFinalBookingStatus(booking.status)) continue;
    await cancelOne(booking, reason);
    count++;
  }
  return count;
}

async function cancelOne(booking: BookingFull, reason: string): Promise<void> {
  // Trả phòng mọi loại phòng của đơn (khóa RoomType theo id tăng dần như mọi luồng giữ / trả phòng).
  for (const item of [...booking.rooms].sort((a, b) => a.roomTypeId - b.roomTypeId)) {
    const room = await rooms.lockRoomType(item.roomTypeId);
    if (!room) continue;
    if (booking.status !== 'PENDING') await calendar.releaseConfirmed(room, booking.checkIn, booking.checkOut, item.roomCount);
    else await calendar.releaseHeld(room, booking.checkIn, booking.checkOut, item.roomCount);
  }
  const from = booking.status;
  const now = nowLocal();
  await bookings.updateBooking(booking.id, { status: 'CANCELLED', closedAt: now, closeReason: reason, closedByActor: 'SYSTEM' });
  await bookings.insertHistory(booking.id, from, 'CANCELLED', 'SYSTEM', null, reason, now);
  const payload = {
    booking_code: booking.bookingCode,
    bookingCode: booking.bookingCode,
    bookingStatus: 'CANCELLED',
    isRead: false,
    title: 'Đơn đặt phòng đã bị hủy',
    message: `Đơn đặt phòng đã bị hủy do Homestay/NCC ngừng phục vụ. Lý do: ${reason}`,
    homestay_name: booking.placeName ? booking.placeName : 'Homestay',
  };
  try {
    await recorder.toCustomer('BOOKING_CANCELLED_PROVIDER_LOCKED', booking.guestPhone, booking.guestEmail, 'booking', booking.id, payload);
  } catch (err) {
    // Không rollback việc ngừng phục vụ / hủy đơn chỉ vì kênh thông báo lỗi.
    logger.error('Không thể ghi thông báo hủy Booking', { bookingId: booking.id, error: (err as Error).message });
  }
}

// ---- ACC-BR-07/08/09: khóa tài khoản NCC -----------------------------------------------------------------------------------

const LOCK_TEMPLATE = 'BOOKING_CANCELLED_PROVIDER_LOCKED';

/**
 * Hệ quả khi Admin khóa tài khoản đăng nhập của NCC: các Booking đang chờ xác nhận (PENDING) chuyển Đã hủy, giải phóng phòng
 * đang giữ và báo kết quả cho khách. Booking đã xác nhận / đã thanh toán KHÔNG bị đụng tới (ACC-BR-09). Homestay ngừng nhận
 * Booking mới (ACC-BR-07) do bookingService.createBooking kiểm tra.
 *
 * @returns số Booking đã bị hủy — ghi vào audit log của thao tác khóa tài khoản.
 */
export function cancelPendingBookings(providerId: number): Promise<number> {
  return tx(async () => {
    const pending = await attachRooms(await bookings.pendingByProvider(providerId));
    let cancelled = 0;
    for (const booking of pending) {
      try {
        // Một đơn lỗi không được chặn việc khóa tài khoản hay các đơn còn lại.
        await withSavepoint(() => cancelPendingOne(booking));
        cancelled++;
      } catch (err) {
        logger.error('Không thể tự động hủy Booking khi khóa NCC', { bookingId: booking.id, providerId, error: (err as Error).message });
      }
    }
    return cancelled;
  });
}

async function cancelPendingOne(booking: BookingFull): Promise<void> {
  // Đơn chờ xác nhận: trả phòng đang giữ của mọi loại phòng (khóa RoomType theo id tăng dần).
  for (const item of [...booking.rooms].sort((a, b) => a.roomTypeId - b.roomTypeId)) {
    const room = await rooms.lockRoomType(item.roomTypeId);
    if (room) await calendar.releaseHeld(room, booking.checkIn, booking.checkOut, item.roomCount);
  }
  const from = booking.status;
  const reason = 'Nhà cung cấp tạm ngừng hoạt động, đơn tự động hủy.';
  const now = nowLocal();
  await bookings.updateBooking(booking.id, { status: 'CANCELLED', closedAt: now, closeReason: reason, closedByActor: 'SYSTEM' });
  await bookings.insertHistory(booking.id, from, 'CANCELLED', 'SYSTEM', null, reason, now);
  await recorder.toCustomer(LOCK_TEMPLATE, booking.guestPhone, booking.guestEmail, 'booking', booking.id, {
    booking_code: booking.bookingCode,
    bookingCode: booking.bookingCode,
    bookingStatus: 'CANCELLED',
    isRead: false,
    title: 'Đơn đặt phòng đã bị hủy',
    message: reason,
    homestay_name: booking.placeName,
  });
}
