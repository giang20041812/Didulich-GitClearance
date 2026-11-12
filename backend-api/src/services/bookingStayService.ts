import { randomInt } from 'node:crypto';
import { tx } from '../db/pool.js';
import type { ActorType, BookingStatus } from '../domain/enums.js';
import { HttpError } from '../lib/errors.js';
import { compareLocal, daysBetween, localTimeHm, nowLocal, today } from '../lib/time.js';
import * as bookings from '../repositories/bookingRepo.js';
import * as rooms from '../repositories/roomRepo.js';
import * as placeRepo from '../repositories/placeRepo.js';
import { attachRooms, roomSummary, totalRooms, type BookingFull } from './bookingModel.js';
import * as notifier from './bookingNotifier.js';

/**
 * Nhận phòng / trả phòng của đơn — MỐC THỜI GIAN riêng (checked_in_at / checked_out_at), không phải trạng thái đơn:
 * vòng thanh toán Chờ xác nhận → Đã xác nhận → Đã thanh toán / Đã hủy giữ nguyên (bookingWorkflowService).
 *  - Mỗi homestay có sẵn một mã QR tĩnh (homestay_profile.checkin_code) để chủ nhà in / để ra cho khách quét. Khách quét bằng
 *    camera điện thoại → trang /qr/{mã} → bấm "Nhận phòng"; quét không được thì gõ mã in dưới QR ở trang chi tiết đơn.
 *    Admin / NCC bấm "Khách đã nhận phòng" giúp khách không dùng điện thoại (thao tác CHECK_IN của workflow).
 *  - Chỉ đơn ĐÃ THANH TOÁN mới nhận phòng được, từ 00:00 ngày nhận phòng tới hạn trả phòng (giờ trả phòng của homestay,
 *    mặc định 12:00, vào ngày trả phòng).
 *  - Trả phòng tự động: hết hạn trả phòng thì job cron ghi checked_out_at (SYSTEM). Màn hình dùng mốc hiệu lực
 *    ({@link effectiveCheckedOutAt}) nên vẫn đúng khi cron chưa kịp chạy.
 */

/** Giờ trả phòng khi homestay chưa khai báo. */
export const DEFAULT_CHECK_OUT = '12:00:00';
/** Chữ số + chữ cái dễ đọc (bỏ 0/O, 1/I/L) — khách gõ tay được khi không quét được mã. */
const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const CODE_LENGTH = 8;
/** Đơn chưa thanh toán không nhận phòng được. */
export const CHECK_IN_STATUSES: readonly BookingStatus[] = ['PAID'];

// ---- Quy tắc dùng chung (DTO của khách, Admin, NCC và thao tác CHECK_IN) -----------------------------------------------

const dayFmt = (date: string): string => `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}`;
const momentFmt = (at: string): string => `${at.slice(11, 16)} ngày ${at.slice(8, 10)}/${at.slice(5, 7)}`;

/** Hạn trả phòng: giờ trả phòng của homestay (mặc định 12:00) vào ngày trả phòng. */
export function checkoutDeadline(checkOut: string, checkOutUntil: string | null | undefined): string {
  return `${checkOut.slice(0, 10)}T${checkOutUntil ?? DEFAULT_CHECK_OUT}`;
}

/**
 * Mốc trả phòng hiệu lực: đã ghi thì lấy mốc đã ghi; đã nhận phòng mà quá hạn trả phòng (job chưa kịp ghi) thì coi như đã
 * trả phòng lúc hết hạn. `checkOutUntil` null = giờ mặc định (danh sách không nạp hồ sơ homestay).
 */
export function effectiveCheckedOutAt(
  checkOut: string | null,
  checkedInAt: string | null,
  checkedOutAt: string | null,
  checkOutUntil: string | null | undefined,
  now: string,
): string | null {
  if (checkedOutAt != null) return checkedOutAt;
  if (checkedInAt == null || checkOut == null) return null;
  const deadline = checkoutDeadline(checkOut, checkOutUntil);
  if (compareLocal(now, deadline) < 0) return null;
  return compareLocal(deadline, checkedInAt) < 0 ? checkedInAt : deadline;
}

type StayFields = Pick<bookings.BookingRow, 'status' | 'checkIn' | 'checkOut' | 'checkedInAt' | 'checkedOutAt' | 'checkedOutBy'>;

export const effectiveCheckedOutAtOf = (b: StayFields, checkOutUntil: string | null | undefined, now: string): string | null =>
  effectiveCheckedOutAt(b.checkOut, b.checkedInAt, b.checkedOutAt, checkOutUntil, now);

/** Ai ghi trả phòng (theo mốc hiệu lực): job tự trả phòng là SYSTEM. */
export function effectiveCheckedOutBy(b: StayFields, checkOutUntil: string | null | undefined, now: string): ActorType | null {
  if (b.checkedOutAt != null) return b.checkedOutBy;
  return effectiveCheckedOutAtOf(b, checkOutUntil, now) != null ? 'SYSTEM' : null;
}

/** Lý do chưa nhận phòng được; null = nhận phòng được ngay. Cùng quy tắc cho khách (quét mã) và Admin / NCC (bấm giúp). */
export function checkInBlockReason(
  status: BookingStatus | null,
  checkIn: string | null,
  checkOut: string | null,
  checkedInAt: string | null,
  checkedOutAt: string | null,
  checkOutUntil: string | null | undefined,
  now: string,
): string | null {
  if (status == null || status === 'CANCELLED') return 'Đơn đã hủy.';
  if (status === 'PENDING') return 'Đơn đang chờ chủ nhà xác nhận — xác nhận và thanh toán xong mới nhận phòng được.';
  if (!CHECK_IN_STATUSES.includes(status)) return 'Đơn chưa thanh toán — thanh toán xong mới nhận phòng được.';
  if (checkedOutAt != null) return 'Đơn đã trả phòng.';
  if (checkedInAt != null) return `Đã nhận phòng lúc ${momentFmt(checkedInAt)}.`;
  if (checkIn == null || checkOut == null) return 'Đơn thiếu ngày ở.';
  if (now.slice(0, 10) < checkIn) return `Chưa tới ngày nhận phòng (${dayFmt(checkIn)}).`;
  if (compareLocal(now, checkoutDeadline(checkOut, checkOutUntil)) >= 0) return 'Đã quá giờ trả phòng của đơn này.';
  return null;
}

/** Như {@link checkInBlockReason} trên một đơn (mốc trả phòng hiệu lực). */
export function checkInBlockReasonOf(b: StayFields, checkOutUntil: string | null | undefined, now: string): string | null {
  return checkInBlockReason(b.status, b.checkIn, b.checkOut, b.checkedInAt, effectiveCheckedOutAtOf(b, checkOutUntil, now), checkOutUntil, now);
}

/** Giờ trả phòng của homestay (null = chưa khai báo → mặc định). */
export async function checkOutUntil(placeId: number | null | undefined): Promise<string | null> {
  if (placeId == null) return null;
  return (await rooms.homestayProfile(placeId))?.checkOutUntil ?? null;
}

// ---- Khách: trang quét mã QR ----------------------------------------------------------------------------------------------

export interface QrPlaceView {
  placeId: number;
  placeName: string;
  address: string | null;
  coverImageUrl: string | null;
  checkInFrom: string | null;
  checkOutUntil: string | null;
}

export interface StayView {
  bookingCode: string;
  roomTypeName: string;
  checkIn: string | null;
  checkOut: string | null;
  nights: number | null;
  roomCount: number;
  guestCount: number;
  status: BookingStatus | null;
  checkedInAt: string | null;
  checkedOutAt: string | null;
  checkoutDeadline: string | null;
  canCheckIn: boolean;
  blockReason: string | null;
}

export interface QrStaysView {
  place: QrPlaceView;
  stays: StayView[];
}

export interface CheckinQrView {
  placeId: number;
  placeName: string;
  address: string | null;
  code: string;
}

const notFound = (message: string) => new HttpError(404, message);
const bad = (message: string) => new HttpError(400, message);

/** "k7m2-px9q", "K7M2 PX9Q" → "K7M2PX9Q"; null khi sai định dạng (không cần hỏi DB). */
export function normalizeCode(code: string | null | undefined): string | null {
  if (code == null) return null;
  const c = code.replace(/[\s-]/g, '').toUpperCase();
  if (c.length !== CODE_LENGTH) return null;
  for (const ch of c) if (!CODE_ALPHABET.includes(ch)) return null;
  return c;
}

/** Mã mới ngẫu nhiên (CSPRNG) — homestay mới nhận mã ngay khi tạo. */
export function newCode(): string {
  let out = '';
  for (let i = 0; i < CODE_LENGTH; i++) out += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return out;
}

async function livePlace(code: string): Promise<rooms.CheckinPlaceView> {
  const normalized = normalizeCode(code);
  const place = normalized == null ? null : await rooms.findCheckinPlaceByCode(normalized);
  if (!place || place.isDeleted) throw notFound('Mã QR không đúng hoặc không còn hiệu lực.');
  return place;
}

async function qrPlace(place: rooms.CheckinPlaceView): Promise<{ view: QrPlaceView; checkOutUntil: string | null }> {
  const profile = await rooms.homestayProfile(place.id);
  const covers = await placeRepo.publicUrlsByPlaceIds([place.id]);
  return {
    view: {
      placeId: place.id,
      placeName: place.name,
      address: place.address,
      coverImageUrl: covers.length > 0 ? covers[0].value : null,
      checkInFrom: profile?.checkInFrom ? localTimeHm(profile.checkInFrom) : null,
      checkOutUntil: profile?.checkOutUntil ? localTimeHm(profile.checkOutUntil) : null,
    },
    checkOutUntil: profile?.checkOutUntil ?? null,
  };
}

/** Đơn chưa hủy của khách tại địa điểm, ngày trả phòng từ `from`. Email chỉ dùng khi đã xác minh. */
async function ownStays(placeId: number, travelerId: number | null, verifiedEmail: string | null, from: string): Promise<BookingFull[]> {
  if (travelerId == null) return [];
  const found = await bookings.findStaysAtPlace(placeId, travelerId, verifiedEmail ? verifiedEmail.trim() : '', from);
  return (await attachRooms(found)).filter((b) => b.status !== 'CANCELLED');
}

/** `checkedInAt`: mốc nhận phòng hiện tại (vừa ghi bằng UPDATE thì dòng đã đọc chưa có). */
function view(b: BookingFull, checkedInAt: string | null, until: string | null, now: string): StayView {
  const checkedOutAt = effectiveCheckedOutAt(b.checkOut, checkedInAt, b.checkedOutAt, until, now);
  const reason = checkInBlockReason(b.status, b.checkIn, b.checkOut, checkedInAt, checkedOutAt, until, now);
  return {
    bookingCode: b.bookingCode,
    roomTypeName: roomSummary(b),
    checkIn: b.checkIn,
    checkOut: b.checkOut,
    nights: b.checkIn && b.checkOut ? daysBetween(b.checkIn, b.checkOut) : null,
    roomCount: totalRooms(b),
    guestCount: b.guestCount,
    status: b.status,
    checkedInAt,
    checkedOutAt,
    checkoutDeadline: b.checkOut ? checkoutDeadline(b.checkOut, until) : null,
    canCheckIn: reason == null,
    blockReason: reason,
  };
}

/** Địa điểm của mã QR — trang /qr/{mã} hiện tên homestay cả khi khách chưa đăng nhập. */
export async function placeOf(code: string): Promise<QrPlaceView> {
  return (await qrPlace(await livePlace(code))).view;
}

/** Các đơn (chưa hủy, ngày trả phòng từ hôm nay) của khách tại homestay của mã QR, kèm nhận phòng được hay chưa. */
export async function staysAt(code: string, travelerId: number, verifiedEmail: string | null): Promise<QrStaysView> {
  const place = await qrPlace(await livePlace(code));
  const now = nowLocal();
  const stays = (await ownStays(place.view.placeId, travelerId, verifiedEmail, now.slice(0, 10))).map((b) => view(b, b.checkedInAt, place.checkOutUntil, now));
  return { place: place.view, stays };
}

/**
 * Khách bấm "Nhận phòng" (sau khi quét mã QR, hoặc gõ mã in dưới QR ở trang chi tiết đơn). Mã phải là mã của chính homestay
 * của đơn; đơn phải của khách. Đã nhận phòng rồi thì trả lại trạng thái hiện tại (bấm hai lần không lỗi).
 */
export function selfCheckIn(code: string, bookingCode: string | null | undefined, travelerId: number, verifiedEmail: string | null): Promise<StayView> {
  return tx(async () => {
    if (bookingCode == null || bookingCode.trim() === '') throw bad('Thiếu mã đơn.');
    const placeRow = await livePlace(code);
    const now = nowLocal();
    const booking = (await ownStays(placeRow.id, travelerId, verifiedEmail, now.slice(0, 10))).find(
      (b) => b.bookingCode.toLowerCase() === bookingCode.trim().toLowerCase(),
    );
    if (!booking) throw notFound(`Mã QR này của ${placeRow.name} — không khớp với đơn của bạn. Hãy quét mã dán tại đúng chỗ nghỉ đã đặt.`);
    const until = await checkOutUntil(placeRow.id);
    const reason = checkInBlockReasonOf(booking, until, now);
    if (reason != null) {
      if (booking.checkedInAt != null) return view(booking, booking.checkedInAt, until, now);
      throw new HttpError(409, reason);
    }
    // UPDATE có điều kiện thay vì sửa dòng đã đọc: hai lần bấm cùng lúc không ghi đè nhau.
    if ((await bookings.markCheckedIn(booking.id, now, 'CUSTOMER', CHECK_IN_STATUSES)) === 0) {
      throw new HttpError(409, 'Đơn vừa thay đổi — vui lòng tải lại trang.');
    }
    await notifier.checkedIn(booking, 'CUSTOMER');
    return view(booking, now, until, now);
  });
}

// ---- Admin / NCC: mã QR để in ---------------------------------------------------------------------------------------------

/**
 * Mã QR nhận phòng của một homestay — có sẵn từ khi tạo homestay (homestay cũ: migration), không bao giờ đổi để mã đã in
 * dùng mãi. Homestay nhập tay bằng SQL chưa có mã thì tạo ngay lần đầu mở (ngẫu nhiên, không đoán được).
 */
export function qrFor(placeId: number): Promise<CheckinQrView> {
  return tx(async () => {
    const place = await rooms.findCheckinPlaceById(placeId);
    if (!place || place.isDeleted) throw notFound('Không tìm thấy homestay.');
    if (place.kind !== 'HOMESTAY') throw bad('Mã QR nhận phòng chỉ dành cho homestay.');
    let code = place.checkinCode;
    for (let attempt = 0; code == null && attempt < 5; attempt++) {
      const candidate = newCode();
      if (await rooms.existsCheckinCode(candidate)) continue;
      // 0 dòng: người khác vừa tạo mã cho homestay này — dùng mã đó.
      code = (await rooms.assignCheckinCode(placeId, candidate)) === 1 ? candidate : ((await rooms.findCheckinPlaceById(placeId))?.checkinCode ?? null);
    }
    if (code == null) throw new HttpError(409, 'Chưa tạo được mã QR, vui lòng thử lại.');
    return { placeId: place.id, placeName: place.name, address: place.address, code };
  });
}

// ---- Job: tự trả phòng ----------------------------------------------------------------------------------------------------

/**
 * Ghi trả phòng (SYSTEM) cho đơn đã nhận phòng mà hết hạn trả phòng, mốc = hạn trả phòng. Chạy mỗi phút trong
 * /api/internal/cron/tick (và job nền khi chạy liên tục); chạy trùng ở container khác cũng không ghi đè.
 */
export function autoCheckout(now: string = nowLocal()): Promise<{ checkedOut: number }> {
  return tx(async () => {
    const due = await bookings.findInHouseCheckingOutBy(now.slice(0, 10) || today());
    if (due.length === 0) return { checkedOut: 0 };
    const untilByPlace = new Map<number, string>();
    for (const p of await rooms.homestayProfiles([...new Set(due.map((b) => b.placeId))])) {
      if (p.checkOutUntil) untilByPlace.set(p.placeId, p.checkOutUntil);
    }
    let count = 0;
    for (const b of due) {
      const at = effectiveCheckedOutAtOf(b, untilByPlace.get(b.placeId), now);
      if (at != null) count += await bookings.markCheckedOut(b.id, at, 'SYSTEM');
    }
    return { checkedOut: count };
  });
}
