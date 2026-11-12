import { tx } from '../db/pool.js';
import type { ActorType, BookingStatus } from '../domain/enums.js';
import { holdsRooms } from '../domain/enums.js';
import { HttpError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import { nowLocal } from '../lib/time.js';
import * as bookings from '../repositories/bookingRepo.js';
import * as rooms from '../repositories/roomRepo.js';
import { attachRoomsTo, type BookingFull } from './bookingModel.js';
import * as notifier from './bookingNotifier.js';
import * as calendar from './roomCalendarService.js';
import * as stays from './bookingStayService.js';

/**
 * Quy trình xử lý đơn dùng chung cho Admin và NCC — hai cổng có đúng cùng một bộ thao tác:
 *
 *   PENDING   ── Xác nhận (CONFIRM) ──▶ CONFIRMED ── Đã thanh toán (PAY) ──▶ PAID
 *      │                                   │
 *      └── Từ chối (REJECT) ──▶ CANCELLED ◀┘── Hủy đơn (CANCEL)
 *
 * Không còn hạn chờ xác nhận. Tồn kho: đơn chờ giữ held_rooms; xác nhận chuyển sang confirmed_rooms; đã thanh toán giữ nguyên;
 * hủy trả phòng về lịch. Mọi thao tác khóa đơn trước, ghi lịch sử và báo khách + phía còn lại (bookingNotifier). Ghi nhận
 * thanh toán tạo một giao dịch thủ công (cổng MANUAL) để báo cáo doanh thu và chi tiết đơn thấy được khoản đã thu.
 *
 * Nhận phòng KHÔNG phải trạng thái: "Khách đã nhận phòng" (CHECK_IN) chỉ ghi mốc checked_in_at khi đơn Đã thanh toán, trong
 * khoảng ngày ở — cho khách không tự quét mã QR được. Trả phòng tự động.
 */

export type Action = 'CONFIRM' | 'REJECT' | 'PAY' | 'CANCEL' | 'CHECK_IN';

/** Người thao tác: ADMIN hoặc PROVIDER, kèm tài khoản để ghi lịch sử. */
export interface Actor {
  type: ActorType;
  accountId: number | null;
}

const MANUAL_GATEWAY = 'MANUAL';
const MAX_NOTE = 500;

/** Thao tác đổi trạng thái hợp lệ ở mỗi trạng thái (chưa tính "Khách đã nhận phòng"). */
export function allowedActionsFor(status: BookingStatus | null): Action[] {
  if (status == null) return [];
  if (status === 'PENDING') return ['CONFIRM', 'REJECT'];
  if (status === 'CONFIRMED') return ['PAY', 'CANCEL'];
  return [];
}

/**
 * Thao tác hợp lệ của một đơn — giao diện Admin và NCC hiển thị nút theo danh sách này: theo trạng thái, thêm "Khách đã
 * nhận phòng" khi đơn Đã thanh toán, chưa nhận phòng, đang trong khoảng ngày ở. `checkOutUntil`: giờ trả phòng của homestay
 * (null = mặc định 12:00 — danh sách không nạp hồ sơ homestay).
 */
export function allowedActions(b: bookings.BookingRow, checkOutUntil: string | null, now: string): Action[] {
  const actions = allowedActionsFor(b.status);
  if (stays.checkInBlockReasonOf(b, checkOutUntil, now) != null) return actions;
  return [...actions, 'CHECK_IN'];
}

/** Nhãn tiếng Việt của trạng thái (thông báo lỗi, lịch sử). */
export function label(status: BookingStatus | null): string {
  switch (status) {
    case 'PENDING':
      return 'Chờ xác nhận';
    case 'CONFIRMED':
      return 'Đã xác nhận · chờ thanh toán';
    case 'PAID':
      return 'Đã thanh toán';
    case 'CANCELLED':
      return 'Đã hủy';
    default:
      return '';
  }
}

function actionLabel(action: Action): string {
  switch (action) {
    case 'CONFIRM':
      return 'xác nhận';
    case 'REJECT':
      return 'từ chối';
    case 'PAY':
      return 'ghi nhận thanh toán';
    case 'CANCEL':
      return 'hủy';
    case 'CHECK_IN':
      return 'ghi nhận khách đã nhận phòng';
  }
}

function defaultHistoryReason(action: Action): string {
  switch (action) {
    case 'CONFIRM':
      return 'Xác nhận đơn';
    case 'REJECT':
      return 'Từ chối đơn';
    case 'PAY':
      return 'Ghi nhận đã thanh toán';
    case 'CANCEL':
      return 'Hủy đơn';
    case 'CHECK_IN':
      return 'Khách đã nhận phòng';
  }
}

function trimToNull(s: string | null | undefined): string | null {
  if (s == null || s.trim() === '') return null;
  const t = s.trim();
  return t.length > MAX_NOTE ? t.slice(0, MAX_NOTE) : t;
}

/**
 * Thực hiện một thao tác trên đơn `bookingId`. `visible`: phạm vi của người gọi (NCC chỉ đơn của mình) — ngoài phạm vi trả
 * 404 như không tồn tại. `note`: lý do / ghi chú, không bắt buộc.
 */
export function apply(bookingId: number, visible: (b: BookingFull) => boolean, action: Action, actor: Actor, note: string | null | undefined): Promise<BookingFull> {
  return tx(async () => {
    const lockedRow = await bookings.lockById(bookingId);
    const found = lockedRow ? await bookings.findByIdWithPlace(bookingId) : null;
    const booking = found ? await attachRoomsTo(found) : null;
    if (!booking || !visible(booking)) throw new HttpError(404, 'Không tìm thấy đơn đặt phòng.');
    if (action === 'CHECK_IN') return checkIn(booking, actor, nowLocal());
    if (!allowedActionsFor(booking.status).includes(action)) {
      throw new HttpError(409, `Đơn đang ở trạng thái “${label(booking.status)}”, không thể ${actionLabel(action)}. Vui lòng tải lại.`);
    }
    const reason = trimToNull(note);
    const from = booking.status;
    const now = nowLocal();
    const patch: Partial<bookings.BookingRow> = {};
    switch (action) {
      case 'CONFIRM':
        await moveHeldToConfirmed(booking);
        patch.status = 'CONFIRMED';
        patch.confirmedAt = now;
        break;
      case 'PAY':
        patch.status = 'PAID';
        patch.closedAt = now;
        patch.closedByActor = actor.type;
        await recordManualPayment(booking, actor, now);
        break;
      case 'REJECT':
      case 'CANCEL':
        await releaseRooms(booking);
        patch.status = 'CANCELLED';
        patch.closedAt = now;
        patch.closedByActor = actor.type;
        patch.closeReason = reason ?? (action === 'REJECT' ? 'Đơn bị từ chối.' : 'Đơn bị hủy.');
        break;
    }
    await bookings.updateBooking(booking.id, patch);
    Object.assign(booking, patch);
    await bookings.insertHistory(booking.id, from, booking.status, actor.type, actor.accountId, reason ?? defaultHistoryReason(action), now);
    await notifier.statusChangedByStaff(booking, booking.status, actor.type, action === 'REJECT', reason);
    return booking;
  });
}

/**
 * "Khách đã nhận phòng" do Admin / NCC bấm giúp: chỉ ghi mốc nhận phòng (trạng thái đơn, tồn kho, lịch sử trạng thái giữ
 * nguyên) rồi báo phía còn lại. Cùng điều kiện với khách tự quét mã QR (checkInBlockReason).
 */
async function checkIn(booking: BookingFull, actor: Actor, now: string): Promise<BookingFull> {
  const until = await stays.checkOutUntil(booking.placeId);
  const blocked = stays.checkInBlockReasonOf(booking, until, now);
  if (blocked != null) throw new HttpError(409, `${blocked} Vui lòng tải lại.`);
  await bookings.updateBooking(booking.id, { checkedInAt: now, checkedInBy: actor.type });
  booking.checkedInAt = now;
  booking.checkedInBy = actor.type;
  await notifier.checkedIn(booking, actor.type);
  return booking;
}

/** Loại phòng của đơn theo id tăng dần — thứ tự khóa chung của mọi luồng giữ / trả phòng. */
const sortedRooms = (booking: BookingFull) => [...booking.rooms].sort((a, b) => a.roomTypeId - b.roomTypeId);

/**
 * Trả phòng của đơn về lịch bán (đơn chờ: held_rooms; đã xác nhận / đã thanh toán: confirmed_rooms), mọi loại phòng của đơn.
 * Gọi TRƯỚC khi đổi trạng thái đơn. Khóa từng RoomType (id tăng dần) rồi tồn kho — cùng thứ tự với lúc đặt đơn.
 */
export async function releaseRooms(booking: Pick<BookingFull, 'status' | 'checkIn' | 'checkOut' | 'rooms'>): Promise<void> {
  const status = booking.status;
  if (status == null || !holdsRooms(status)) return;
  const held = status === 'PENDING';
  for (const item of [...booking.rooms].sort((a, b) => a.roomTypeId - b.roomTypeId)) {
    const room = await rooms.lockRoomType(item.roomTypeId);
    if (!room) continue;
    if (held) await calendar.releaseHeld(room, booking.checkIn, booking.checkOut, item.roomCount);
    else await calendar.releaseConfirmed(room, booking.checkIn, booking.checkOut, item.roomCount);
  }
}

/** Xác nhận: phòng đang giữ cho đơn chuyển từ held_rooms sang confirmed_rooms trên mọi đêm, mọi loại phòng. */
async function moveHeldToConfirmed(booking: BookingFull): Promise<void> {
  for (const item of sortedRooms(booking)) {
    const room = await rooms.lockRoomType(item.roomTypeId);
    if (!room) throw new HttpError(404, 'Không tìm thấy loại phòng của đơn.');
    await calendar.confirmHeld(room, booking.checkIn, booking.checkOut, item.roomCount);
  }
}

/** Giao dịch SUCCESS qua cổng MANUAL: chỉ một lần cho mỗi đơn; thiếu cổng MANUAL (chưa chạy migration) thì bỏ qua. */
async function recordManualPayment(booking: BookingFull, actor: Actor, now: string): Promise<void> {
  if (await bookings.hasPaymentWithStatus(booking.id, 'SUCCESS')) return;
  const gateway = await bookings.gatewayByCode(MANUAL_GATEWAY);
  if (!gateway) {
    logger.warn('Chưa có cổng thanh toán, không ghi giao dịch cho đơn', { gateway: MANUAL_GATEWAY, bookingCode: booking.bookingCode });
    return;
  }
  await bookings.insertPayment({
    bookingId: booking.id,
    gatewayId: gateway.id,
    externalTxnId: `MANUAL-${booking.bookingCode}`,
    amount: booking.totalAmount,
    currency: booking.currency ? booking.currency : 'VND',
    status: 'SUCCESS',
    initiatedAt: now,
    paidAt: now,
    rawCallback: { recordedBy: actor.type, accountId: actor.accountId },
  });
}

