import { HttpError } from '../lib/errors.js';
import { daysBetween, nowLocal, timeToString } from '../lib/time.js';
import type { PageJson } from '../lib/page.js';
import * as bookings from '../repositories/bookingRepo.js';
import * as rooms from '../repositories/roomRepo.js';
import type { UserPrincipal } from '../security/principal.js';
import type { BookingDto } from './adminBookingService.js';
import { attachRoomsTo, totalRooms, type BookingFull } from './bookingModel.js';
import * as stays from './bookingStayService.js';
import * as workflow from './bookingWorkflowService.js';
import type { Action } from './bookingWorkflowService.js';
import * as journeyService from './journeyService.js';
import { actor as actorOf } from './partnerHomestayService.js';

/**
 * Nhà cung cấp xử lý đơn của chính mình: xác nhận / từ chối đơn chờ, ghi nhận đã thanh toán / hủy đơn đã xác nhận. Cùng quy trình
 * và cùng thông báo với Admin (bookingWorkflowService); phạm vi luôn là nhà cung cấp của tài khoản, không nhận từ client.
 */

const ownedBy = (b: Pick<BookingFull, 'providerId'>, providerId: number | null | undefined): boolean => providerId != null && b.providerId === providerId;

/** Danh sách đơn kèm các thao tác nhanh hợp lệ của từng dòng (giờ trả phòng mặc định — không nạp hồ sơ homestay). */
export function rows(page: PageJson<BookingDto>): PageJson<BookingDto & { actions: Action[] }> {
  const now = nowLocal();
  return { ...page, content: page.content.map((b) => ({ ...b, actions: workflow.allowedActions(b as unknown as bookings.BookingRow, null, now) })) };
}

export async function detail(principal: UserPrincipal | undefined, id: number) {
  const account = await actorOf(principal, false);
  const found = await bookings.findByIdWithPlace(id);
  if (!found || !ownedBy(found, account.provider!.id)) throw new HttpError(404, 'Không tìm thấy đơn đặt phòng của bạn.');
  return toDetail(await attachRoomsTo(found));
}

export async function act(principal: UserPrincipal | undefined, id: number, action: Action, note: string | null | undefined) {
  const account = await actorOf(principal, true);
  const booking = await workflow.apply(id, (b) => ownedBy(b, account.provider!.id), action, { type: 'PROVIDER', accountId: account.id }, note);
  return toDetail(booking);
}

async function toDetail(b: BookingFull) {
  const nightRows = await bookings.nightsOf(b.id);
  const roomsById = new Map(b.rooms.map((r) => [r.roomTypeId, r]));
  const nights = [...nightRows]
    .sort((x, y) => (x.stayDate < y.stayDate ? -1 : x.stayDate > y.stayDate ? 1 : x.roomTypeId - y.roomTypeId))
    .map((n) => {
      const room = roomsById.get(n.roomTypeId);
      return { stayDate: n.stayDate, unitPrice: n.unitPrice, roomCount: room ? room.roomCount : null, roomTypeId: n.roomTypeId, roomTypeName: room ? room.roomTypeName : null };
    });
  const subtotals = new Map<number, number>();
  for (const n of nightRows) {
    const room = roomsById.get(n.roomTypeId);
    if (!room) continue;
    subtotals.set(room.roomTypeId, (subtotals.get(room.roomTypeId) ?? 0) + n.unitPrice * room.roomCount);
  }
  const roomViews = b.rooms.map((r) => ({ roomTypeId: r.roomTypeId, roomTypeName: r.roomTypeName, roomCount: r.roomCount, subtotal: subtotals.get(r.roomTypeId) ?? null }));
  const history = (await bookings.historyOf(b.id)).map((h) => ({ fromStatus: h.fromStatus, toStatus: h.toStatus, actor: h.actor, reason: h.reason, createdAt: h.createdAt }));
  const profile = await rooms.homestayProfile(b.placeId);
  const checkOutUntil = profile?.checkOutUntil ?? null;
  const now = nowLocal();
  return {
    id: b.id,
    bookingCode: b.bookingCode,
    status: b.status,
    placeId: b.placeId,
    placeName: b.placeName,
    roomTypeId: b.rooms.length > 0 ? b.rooms[0].roomTypeId : null,
    roomTypeName: roomViews.map((r) => r.roomTypeName).join(', '),
    checkIn: b.checkIn,
    checkOut: b.checkOut,
    nights: daysBetween(b.checkIn, b.checkOut),
    roomCount: totalRooms(b),
    guestCount: b.guestCount,
    guestName: b.guestName,
    guestPhone: b.guestPhone,
    guestEmail: b.guestEmail,
    guestNote: b.guestNote,
    totalAmount: b.totalAmount,
    currency: b.currency,
    createdAt: b.createdAt,
    confirmedAt: b.confirmedAt,
    closedAt: b.closedAt,
    closeReason: b.closeReason,
    policySnapshot: b.policySnapshot ?? {},
    nightPrices: nights,
    history,
    actions: workflow.allowedActions(b, checkOutUntil, now),
    checkInFrom: profile?.checkInFrom ? timeToString(profile.checkInFrom) : null,
    checkOutUntil: checkOutUntil ? timeToString(checkOutUntil) : null,
    // Lịch trình khách gắn với đơn: NCC chỉ xem (biết khách định đi đâu, buổi nào) — không thao tác.
    guestJourney: await journeyService.guestJourney(b.id),
    checkedInAt: b.checkedInAt,
    checkedInBy: b.checkedInBy,
    checkedOutAt: stays.effectiveCheckedOutAtOf(b, checkOutUntil, now),
    checkedOutBy: stays.effectiveCheckedOutBy(b, checkOutUntil, now),
    rooms: roomViews,
  };
}

