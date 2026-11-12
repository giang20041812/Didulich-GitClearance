import { groupBy } from '../lib/collections.js';
import * as bookings from '../repositories/bookingRepo.js';
import type { BookingWithPlace } from '../repositories/bookingRepo.js';
import type { BookingNoticeInfo } from './notificationService.js';

/** Đơn đặt phòng kèm các loại phòng của đơn (theo id loại phòng tăng dần) — tương đương entity Booking đã nạp `rooms`. */
export interface BookingRoomItem {
  roomTypeId: number;
  roomTypeName: string;
  roomTypeBasePrice: number | null;
  roomCount: number;
}

export type BookingFull = BookingWithPlace & { rooms: BookingRoomItem[] };

export async function attachRooms(list: readonly BookingWithPlace[]): Promise<BookingFull[]> {
  if (list.length === 0) return [];
  const rooms = await bookings.roomsOf(list.map((b) => b.id));
  const byBooking = groupBy(rooms, (r) => r.bookingId);
  return list.map((b) => ({
    ...b,
    rooms: (byBooking.get(b.id) ?? []).map((r) => ({ roomTypeId: r.roomTypeId, roomTypeName: r.roomTypeName, roomTypeBasePrice: r.roomTypeBasePrice, roomCount: r.roomCount })),
  }));
}

export async function attachRoomsTo(b: BookingWithPlace): Promise<BookingFull> {
  return (await attachRooms([b]))[0];
}

/** Tổng số phòng của đơn (mọi loại phòng). */
export const totalRooms = (b: { rooms: BookingRoomItem[] }): number => b.rooms.reduce((sum, r) => sum + (r.roomCount ?? 0), 0);

/** "Phòng đôi ×1, Phòng đơn ×2" — mô tả ngắn các loại phòng của đơn (thông báo, email). */
export function roomSummary(b: { rooms: BookingRoomItem[] }): string {
  if (b.rooms.length === 0) return '';
  return [...b.rooms]
    .sort((x, y) => x.roomTypeId - y.roomTypeId)
    .map((r) => `${r.roomTypeName ?? 'Phòng'} ×${r.roomCount}`)
    .join(', ');
}

/** Phần đơn mà thông báo trong ứng dụng cần. */
export const noticeInfo = (b: BookingFull): BookingNoticeInfo => ({
  id: b.id,
  bookingCode: b.bookingCode,
  placeName: b.placeName,
  guestEmail: b.guestEmail,
  guestPhone: b.guestPhone,
  totalAmount: b.totalAmount,
  confirmedAt: b.confirmedAt,
  checkIn: b.checkIn,
  checkOut: b.checkOut,
});
