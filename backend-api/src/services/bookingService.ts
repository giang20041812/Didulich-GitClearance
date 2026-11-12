import { randomInt } from 'node:crypto';
import { tx } from '../db/pool.js';
import { IllegalArgumentError, IllegalStateError, BookingNotFoundError, isDataIntegrityViolation } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import { addDays, addMonths, compareLocal, daysBetween, nowLocal, today } from '../lib/time.js';
import { groupedValues } from '../lib/collections.js';
import * as accounts from '../repositories/accountRepo.js';
import * as bookings from '../repositories/bookingRepo.js';
import * as placeRepo from '../repositories/placeRepo.js';
import * as providers from '../repositories/providerRepo.js';
import * as reviews from '../repositories/reviewRepo.js';
import * as rooms from '../repositories/roomRepo.js';
import type { RoomTypeRow } from '../repositories/roomRepo.js';
import * as accessTokens from './bookingAccessTokens.js';
import { attachRooms, attachRoomsTo, roomSummary, totalRooms, type BookingFull } from './bookingModel.js';
import * as notifier from './bookingNotifier.js';
import * as stays from './bookingStayService.js';
import * as workflow from './bookingWorkflowService.js';
import type { OutgoingMail } from './mailService.js';
import * as calendar from './roomCalendarService.js';

/** Số đêm tối đa của một đơn đặt qua API công khai (mỗi đơn giữ tồn kho phòng cho mọi đêm). */
export const MAX_NIGHTS_PER_BOOKING = 30;
/** Tổng số phòng tối đa của một đơn (mọi loại phòng cộng lại). */
export const MAX_ROOMS_PER_BOOKING = 20;
/** Crockford base32: không có I, L, O, U để khách đọc / gõ lại mã không nhầm. */
const BOOKING_CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const BOOKING_CODE_LENGTH = 8;
/** Khách viết đánh giá trong vòng chừng này ngày kể từ ngày trả phòng (REV-BR-06). */
export const REVIEW_WINDOW_DAYS = 14;
const DUPLICATE_BOOKING_MESSAGE =
  'Bạn đã có một đơn khác còn hiệu lực tại chỗ nghỉ này cho khoảng ngày này. Vui lòng kiểm tra lại danh sách đơn của bạn.';

/** Quyền của người gọi: mã truy cập đơn (header) và/hoặc khách đã đăng nhập (travelerEmail chỉ điền khi email đã xác minh). */
export interface Credentials {
  accessToken: string | null;
  travelerId: number | null;
  travelerEmail: string | null;
}

export interface RoomSelection {
  roomTypeId: number;
  roomCount: number;
}

export interface CreateBookingInput {
  placeId: number;
  rooms?: Array<RoomSelection | null> | null;
  roomTypeId?: number | null;
  checkIn: string;
  checkOut: string;
  roomCount?: number | null;
  guestCount: number;
  guestName: string;
  guestPhone: string;
  guestEmail?: string | null;
  guestNote?: string | null;
  specialRequests?: Array<string | null | undefined> | null;
  journey?: { journeyId?: number | null; title?: string | null; stops?: unknown[] | null } | null;
  journeyId?: number | null;
}

export interface UpdateBookingInput {
  guestName?: string | null;
  guestPhone?: string | null;
  guestEmail?: string | null;
  guestNote?: string | null;
  checkIn?: string | null;
  checkOut?: string | null;
  rooms?: Array<RoomSelection | null> | null;
  roomCount?: number | null;
  guestCount?: number | null;
  reason?: string | null;
}

export interface CreateReviewInput {
  rating: number;
  content: string;
  images?: Array<string | null | undefined> | null;
}

export interface BookingRoomView {
  roomTypeId: number;
  roomTypeName: string;
  roomCount: number;
  subtotal: number | null;
}

export interface BookingResponse {
  id: number;
  bookingCode: string;
  placeId: number;
  placeName: string;
  placeAddress: string | null;
  latitude: number | null;
  longitude: number | null;
  coverImageUrl: string | null;
  rooms: BookingRoomView[];
  roomTypeId: number | null;
  roomTypeName: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  roomCount: number;
  guestCount: number;
  guestName: string;
  guestPhone: string;
  guestEmail: string | null;
  guestNote: string | null;
  status: string;
  currency: string;
  unitPrice: number;
  totalAmount: number;
  createdAt: string;
  confirmedAt: string | null;
  closeReason: string | null;
  policySnapshot: Record<string, unknown>;
  canEdit: boolean;
  canCancel: boolean;
  canReview: boolean;
  checkedInAt: string | null;
  checkedOutAt: string | null;
  canCheckIn: boolean;
  /** Chỉ có trong phản hồi tạo đơn (trả một lần). */
  accessToken?: string;
  journeyId?: number;
  journeyWarning?: string;
}

export interface ReviewView {
  id: number;
  placeId: number | null;
  bookingCode: string | null;
  rating: number;
  content: string | null;
  images: string[];
  providerReply: string | null;
  providerReplyAt: string | null;
  guestName: string | null;
  createdAt: string;
  editableUntil: string;
}

/** Loại phòng đã chọn: `rooms` nếu có, không thì cặp roomTypeId / roomCount. Gộp loại phòng trùng, thứ tự theo id loại phòng. */
export function roomSelections(request: Pick<CreateBookingInput, 'rooms' | 'roomTypeId' | 'roomCount'>): RoomSelection[] {
  const counts = new Map<number, number>();
  if (request.rooms && request.rooms.length > 0) {
    for (const r of request.rooms) {
      if (!r || r.roomTypeId == null || r.roomCount == null) continue;
      counts.set(r.roomTypeId, (counts.get(r.roomTypeId) ?? 0) + r.roomCount);
    }
  } else if (request.roomTypeId != null && request.roomCount != null) {
    counts.set(request.roomTypeId, request.roomCount);
  }
  return [...counts.entries()].sort((a, b) => a[0] - b[0]).map(([roomTypeId, roomCount]) => ({ roomTypeId, roomCount }));
}

/** Ít nhất một loại phòng, mỗi loại tối thiểu 1 phòng, tổng không quá MAX_ROOMS_PER_BOOKING phòng. */
function validateSelections(selections: RoomSelection[]): void {
  if (selections.length === 0) throw new IllegalArgumentError('Vui lòng chọn ít nhất một loại phòng.');
  let total = 0;
  for (const s of selections) {
    if (s.roomCount < 1) throw new IllegalArgumentError('Số phòng mỗi loại tối thiểu là 1.');
    total += s.roomCount;
  }
  if (total > MAX_ROOMS_PER_BOOKING) throw new IllegalArgumentError(`Mỗi đơn đặt tối đa ${MAX_ROOMS_PER_BOOKING} phòng.`);
}

const trimToNull = (s: string | null | undefined): string | null => (s == null || s.trim() === '' ? null : s.trim());

/** "1.500.000" — định dạng tiền kiểu Việt Nam (làm tròn đến đồng). */
export function formatMoney(amount: number): string {
  return Math.round(amount)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

const dmy = (date: string): string => `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}`;
const dm = (date: string): string => `${date.slice(8, 10)}/${date.slice(5, 7)}`;

/** Một loại phòng đã khóa ghi cùng số phòng và giá từng đêm (theo thứ tự ngày). */
interface PricedRoom {
  room: RoomTypeRow;
  count: number;
  nights: calendar.InventoryDto[];
}

const perRoom = (p: PricedRoom): number => p.nights.reduce((sum, n) => sum + n.price, 0);
const subtotal = (p: PricedRoom): number => perRoom(p) * p.count;

// ---- Tạo đơn ------------------------------------------------------------------------------------------------------------

export function createBooking(request: CreateBookingInput, travelerId: number | null): Promise<BookingResponse> {
  return tx(async () => {
    const selections = roomSelections(request);
    logger.info('Bắt đầu xử lý đặt phòng', { placeId: request.placeId, rooms: selections });

    // 1. Kiểm tra ngày nhận / trả phòng
    if (!request.checkIn || !request.checkOut) throw new IllegalArgumentError('Ngày nhận phòng và trả phòng không được để trống.');
    if (request.checkOut <= request.checkIn) throw new IllegalArgumentError('Ngày trả phòng phải sau ngày nhận phòng.');
    if (daysBetween(request.checkIn, request.checkOut) > MAX_NIGHTS_PER_BOOKING) {
      throw new IllegalArgumentError(`Mỗi đơn đặt phòng tối đa ${MAX_NIGHTS_PER_BOOKING} đêm.`);
    }
    if (request.checkIn < today()) throw new IllegalArgumentError('Không thể đặt phòng trong quá khứ.');
    validateSelections(selections);

    // 2. Homestay và nhà cung cấp
    const place = await placeRepo.findById(request.placeId);
    if (!place) throw new IllegalArgumentError(`Không tìm thấy chỗ nghỉ với ID: ${request.placeId}`);
    if (place.providerId == null) throw new IllegalStateError('Chỗ nghỉ chưa được liên kết với nhà cung cấp (Provider).');
    // ACC-BR-07: NCC ngừng hoạt động (Provider) hoặc tài khoản đăng nhập của NCC bị khóa (Account) đều phải chặn Booking mới
    // cho các Homestay của NCC đó — hai trạng thái độc lập, phải kiểm tra cả hai.
    const provider = await providers.findById(place.providerId);
    if (!provider || provider.status !== 'ACTIVE') throw new IllegalStateError('Nhà cung cấp hiện không hoạt động, không thể đặt phòng.');
    const providerAccount = await accounts.findFirstByProviderId(place.providerId);
    if (providerAccount && providerAccount.status !== 'ACTIVE') throw new IllegalStateError('Nhà cung cấp hiện không hoạt động, không thể đặt phòng.');
    if (place.visibility !== 'PUBLISHED' || place.operationStatus !== 'OPERATING' || place.isDeleted) {
      throw new IllegalStateError('Chỗ nghỉ hoặc loại phòng đang ngừng nhận đặt phòng.');
    }

    // 3. Khóa từng loại phòng (theo id tăng dần — mọi luồng giữ / trả phòng cùng thứ tự), tính giá rồi giữ phòng.
    const priced = await lockAndHold(place.id, selections, request.checkIn, request.checkOut);
    const totalAmount = priced.reduce((sum, p) => sum + subtotal(p), 0);

    // 4. Mã đặt phòng duy nhất + mã truy cập đơn (chỉ lưu hash, mã gốc trả cho khách một lần)
    const bookingCode = await generateUniqueBookingCode();
    const accessToken = accessTokens.generate();

    // 5. Snapshot chính sách hủy phòng
    const policySnapshot: Record<string, unknown> = {};
    const profile = await rooms.homestayProfile(place.id);
    const policy = profile?.currentPolicyId != null ? await rooms.policyById(profile.currentPolicyId) : null;
    if (policy) {
      policySnapshot.policyId = policy.id;
      policySnapshot.policyVersion = policy.version;
      policySnapshot.policyName = policy.name;
      policySnapshot.freeCancelCutoffHours = policy.freeCancelCutoffHours;
      policySnapshot.refundType = policy.refundOnLateCancel;
      policySnapshot.description = policy.contentText;
    }

    // 6. Tạo đơn. Không còn hạn chờ xác nhận: đơn giữ phòng tới khi Admin / NCC xử lý hoặc khách hủy.
    const now = nowLocal();
    let saved: bookings.BookingRow;
    try {
      saved = await bookings.insertBooking({
        bookingCode,
        placeId: place.id,
        providerId: place.providerId,
        checkIn: request.checkIn,
        checkOut: request.checkOut,
        guestCount: request.guestCount,
        guestName: request.guestName,
        guestPhone: request.guestPhone,
        guestEmail: request.guestEmail ?? null,
        guestNote: request.guestNote ?? null,
        status: 'PENDING',
        currency: 'VND',
        totalAmount,
        policySnapshot,
        policyId: policy ? policy.id : null,
        createdAt: now,
        accessTokenHash: accessTokens.hash(accessToken),
        travelerId,
      });
    } catch (err) {
      // Unique index chống trùng đơn (cùng homestay + SĐT + ngày, còn hiệu lực): bấm "Đặt phòng" hai lần / mạng tự gửi lại
      // không tạo hai đơn cùng giữ phòng. Ném lỗi để rollback cả phần giữ tồn kho ở trên.
      if (isDataIntegrityViolation(err)) {
        logger.info('Từ chối đơn trùng', { placeId: place.id, checkIn: request.checkIn, checkOut: request.checkOut });
        throw new IllegalStateError(DUPLICATE_BOOKING_MESSAGE);
      }
      throw err;
    }

    // 7. Loại phòng + giá từng đêm của từng loại phòng
    for (const p of priced) {
      await bookings.insertRoom(saved.id, p.room.id, p.count);
      await bookings.insertNights(saved.id, p.room.id, p.nights.map((n) => ({ stayDate: n.stayDate, unitPrice: n.price })));
    }
    logger.info('Tạo booking thành công', { bookingCode });

    // 8. Lịch sử + báo Admin và NCC có đơn mới chờ xác nhận (trong cổng; đẩy ra màn hình sau khi commit)
    await bookings.insertHistory(saved.id, null, 'PENDING', 'CUSTOMER', null, 'Khách đặt phòng', now);
    const full = await fullById(saved.id);
    await notifier.newBooking(full);

    const response = (await toResponses([full]))[0];
    response.accessToken = accessToken;
    return response;
  });
}

/**
 * Khóa các loại phòng theo id tăng dần (selections đã sắp theo id), kiểm tra thuộc homestay + đang bán, tính giá từng đêm
 * (giá cuối tuần / giá đặc biệt; thiếu giá thì lỗi) rồi giữ phòng mọi đêm. Thiếu phòng một loại thì cả đơn lỗi.
 */
async function lockAndHold(placeId: number, selections: RoomSelection[], checkIn: string, checkOut: string): Promise<PricedRoom[]> {
  const priced: PricedRoom[] = [];
  for (const s of selections) {
    const room = await rooms.lockRoomType(s.roomTypeId);
    if (!room) throw new IllegalArgumentError(`Không tìm thấy loại phòng với ID: ${s.roomTypeId}`);
    if (room.placeId !== placeId) throw new IllegalArgumentError('Loại phòng không thuộc chỗ nghỉ này.');
    if (room.status !== 'ACTIVE') throw new IllegalStateError(`Loại phòng ${room.name} đang ngừng nhận đặt phòng.`);
    const nights = await calendar.calendar(room, checkIn, checkOut);
    await calendar.hold(room, checkIn, checkOut, s.roomCount);
    priced.push({ room, count: s.roomCount, nights });
  }
  return priced;
}

/** Mã đơn mới: "VJ-" + 8 ký tự Crockford base32 ngẫu nhiên (~10^12 giá trị) — không đoán / dò tuần tự được. */
async function generateUniqueBookingCode(): Promise<string> {
  for (let i = 0; i < 10; i++) {
    let code = 'VJ-';
    for (let c = 0; c < BOOKING_CODE_LENGTH; c++) code += BOOKING_CODE_ALPHABET[randomInt(BOOKING_CODE_ALPHABET.length)];
    if (!(await bookings.existsByCode(code))) return code;
  }
  throw new IllegalStateError('Không sinh được mã đơn đặt phòng. Vui lòng thử lại.');
}

// ---- Email báo NCC ------------------------------------------------------------------------------------------------------

/**
 * Soạn email báo NCC có đơn mới vừa tạo (KHÔNG gửi): route gọi sau khi createBooking đã commit — đơn bị rollback thì không có gì
 * để báo. Gửi tới email liên hệ của NCC, không có thì email tài khoản đầu tiên của NCC. Không kèm thông tin liên hệ của khách.
 */
export const partnerNewBookingMail = (booking: BookingResponse | null): Promise<OutgoingMail | null> => partnerMail(booking, false);

/** Như {@link partnerNewBookingMail} khi khách vừa sửa đơn (đơn cần xác nhận lại). */
export const partnerUpdatedBookingMail = (booking: BookingResponse | null): Promise<OutgoingMail | null> => partnerMail(booking, true);

async function partnerMail(booking: BookingResponse | null, updated: boolean): Promise<OutgoingMail | null> {
  if (!booking || booking.placeId == null || !booking.bookingCode) return null;
  const place = await placeRepo.findById(booking.placeId);
  const provider = place?.providerId != null ? await providers.findById(place.providerId) : null;
  if (!place || !provider) return null;
  const to =
    provider.contactEmail && provider.contactEmail.trim() !== ''
      ? provider.contactEmail.trim()
      : ((await accounts.findFirstByProviderId(provider.id))?.email ?? null);
  if (!to || to.trim() === '' || !to.includes('@')) return null;

  const nights = daysBetween(booking.checkIn, booking.checkOut);
  const subject = `${updated ? 'Khách thay đổi đơn ' : 'Đơn đặt phòng mới '}${booking.bookingCode} — ${place.name}`;
  const roomLines =
    booking.rooms.length === 0 ? booking.roomTypeName : booking.rooms.map((r) => `${r.roomTypeName} ×${r.roomCount}`).join(', ');
  let body =
    `Xin chào ${provider.name ? provider.name : 'Quý đối tác'},\n\n` +
    (updated
      ? `Khách vừa thay đổi một đơn đặt phòng tại "${place.name}". Đơn đã quay về chờ xác nhận, thông tin mới:\n`
      : `Chỗ nghỉ "${place.name}" vừa nhận một đơn đặt phòng mới đang chờ xác nhận:\n`) +
    `- Mã đơn: ${booking.bookingCode}\n` +
    `- Phòng: ${roomLines}\n` +
    `- Nhận phòng: ${dmy(booking.checkIn)} — Trả phòng: ${dmy(booking.checkOut)} (${nights} đêm)\n` +
    `- Tổng số phòng: ${booking.roomCount} — Số khách: ${booking.guestCount}\n`;
  if (booking.totalAmount != null) body += `- Tổng tiền: ${formatMoney(booking.totalAmount)} ${booking.currency ? booking.currency : 'VND'}\n`;
  body += '\nVui lòng đăng nhập cổng Nhà cung cấp để xem chi tiết và xác nhận hoặc từ chối đơn.\n';
  return { to, subject, body };
}

// ---- Quyền truy cập đơn -------------------------------------------------------------------------------------------------

/**
 * Quyền thao tác với một đơn: (1) mã truy cập của đơn khớp, hoặc (2) khách du lịch đang đăng nhập là người đặt đơn
 * (traveler_id). KHÔNG dùng email/SĐT: email khách gõ khi đặt và email đăng ký tài khoản đều có thể là của người khác.
 */
export function hasOwnerAccess(booking: bookings.BookingRow | null, credentials: Credentials | null): boolean {
  if (!booking || !credentials) return false;
  if (accessTokens.matches(credentials.accessToken, booking.accessTokenHash)) return true;
  return credentials.travelerId != null && credentials.travelerId === booking.travelerId;
}

/**
 * Quyền XEM một đơn: quyền thao tác, hoặc — chỉ với đơn cũ chưa có mã truy cập lẫn traveler_id — tài khoản khách có email ĐÃ
 * XÁC MINH trùng email khách của đơn. Đơn cũ không bao giờ được hủy / sửa qua đường email.
 */
export function hasAccess(booking: bookings.BookingRow | null, credentials: Credentials | null): boolean {
  if (hasOwnerAccess(booking, credentials)) return true;
  if (!booking || !credentials || credentials.travelerId == null) return false;
  return (
    booking.travelerId == null &&
    booking.accessTokenHash == null &&
    credentials.travelerEmail != null &&
    booking.guestEmail != null &&
    booking.guestEmail.trim() !== '' &&
    booking.guestEmail.trim().toLowerCase() === credentials.travelerEmail.trim().toLowerCase()
  );
}

/** So SĐT sau khi chuẩn hóa (bỏ ký tự không phải số, +84/84 → 0); SĐT trống không bao giờ khớp. */
export function phoneMatches(bookingPhone: string | null, givenPhone: string | null): boolean {
  const expected = normalizePhone(bookingPhone);
  const actual = normalizePhone(givenPhone);
  return expected != null && actual != null && expected === actual;
}

function normalizePhone(phone: string | null): string | null {
  if (phone == null) return null;
  let digits = phone.replace(/[^0-9]/g, '');
  if (digits.startsWith('84') && digits.length >= 11) digits = `0${digits.slice(2)}`;
  return digits.length >= 9 ? digits : null;
}

async function fullById(id: number): Promise<BookingFull> {
  const b = await bookings.findByIdWithPlace(id);
  if (!b) throw new BookingNotFoundError();
  return attachRoomsTo(b);
}

async function findBooking(bookingCode: string | null | undefined): Promise<BookingFull> {
  if (bookingCode == null || bookingCode.trim() === '') throw new BookingNotFoundError();
  const b = await bookings.findByCodeWithPlace(bookingCode.trim());
  if (!b) throw new BookingNotFoundError();
  return attachRoomsTo(b);
}

/** Đơn theo mã cho thao tác ĐỌC; không có quyền đọc thì 404. */
async function requireReadAccess(bookingCode: string, credentials: Credentials): Promise<BookingFull> {
  const booking = await findBooking(bookingCode);
  if (!hasAccess(booking, credentials)) throw new BookingNotFoundError();
  return booking;
}

/** Đơn theo mã cho thao tác GHI (hủy, sửa, đánh giá, tải ảnh đánh giá): chỉ mã truy cập của đơn hoặc tài khoản đã đặt đơn. */
async function requireOwnerAccess(bookingCode: string, credentials: Credentials): Promise<BookingFull> {
  const booking = await findBooking(bookingCode);
  if (!hasOwnerAccess(booking, credentials)) throw new BookingNotFoundError();
  return booking;
}

/** Khóa ghi dòng đơn rồi đọc lại đầy đủ (kèm loại phòng) — dữ liệu sau khóa là bản mới nhất. */
async function lockedFull(id: number): Promise<BookingFull> {
  await bookings.lockById(id);
  return fullById(id);
}

// ---- Tra cứu ------------------------------------------------------------------------------------------------------------

export async function getBookingByCode(bookingCode: string, phone: string | null, credentials: Credentials): Promise<BookingResponse> {
  const booking = await findBooking(bookingCode);
  // Không có quyền đọc: chỉ cho tra cứu CHỈ ĐỌC khi có cả mã đơn và đúng SĐT đặt phòng. Không tìm thấy và sai SĐT trả cùng một
  // lỗi để không dò được mã đơn nào tồn tại.
  if (!hasAccess(booking, credentials) && !phoneMatches(booking.guestPhone, phone)) throw new BookingNotFoundError();
  return (await toResponses([booking]))[0];
}

export async function findMyBookings(travelerId: number | null, verifiedEmail: string | null): Promise<BookingResponse[]> {
  if (travelerId == null) return [];
  // Email chưa xác minh không được dùng để nhận đơn cũ (ai cũng đăng ký được bằng email của người khác).
  const found = verifiedEmail && verifiedEmail.trim() !== '' ? await bookings.findForTraveler(travelerId, verifiedEmail.trim()) : await bookings.findLinkedToTraveler(travelerId);
  return toResponses(await attachRooms(found));
}

export async function findMyBookingStatuses(travelerId: number | null, verifiedEmail: string | null): Promise<Array<{ bookingCode: string; status: string | null }>> {
  if (travelerId == null) return [];
  const rows = verifiedEmail && verifiedEmail.trim() !== '' ? await bookings.findStatusesForTraveler(travelerId, verifiedEmail.trim()) : await bookings.findStatusesLinkedToTraveler(travelerId);
  return rows.map((r) => ({ bookingCode: r.bookingCode, status: r.status ?? null }));
}

export async function findBookingsByAccessTokens(tokensByCode: Map<string, string>): Promise<BookingResponse[]> {
  if (tokensByCode.size === 0) return [];
  const found = (await bookings.findByCodesWithPlace([...tokensByCode.keys()])).filter((b) => accessTokens.matches(tokensByCode.get(b.bookingCode), b.accessTokenHash));
  return toResponses(await attachRooms(found));
}

/** Dùng khi sửa đơn (trừ phòng của chính đơn đó khi kiểm tra còn phòng): cần quyền thao tác, không chỉ quyền xem. */
export async function canAccess(bookingCode: string | null | undefined, credentials: Credentials): Promise<boolean> {
  if (bookingCode == null || bookingCode.trim() === '') return false;
  const b = await bookings.findByCode(bookingCode.trim());
  return b != null && hasOwnerAccess(b, credentials);
}

/**
 * Đánh giá mở khi đơn đã thanh toán và đã tới ngày trả phòng, trong REVIEW_WINDOW_DAYS ngày sau đó (không còn bước nhận / trả
 * phòng nên mốc là ngày trả phòng của đơn).
 */
export function reviewOpen(booking: Pick<bookings.BookingRow, 'status' | 'checkOut'>, day: string): boolean {
  return booking.status === 'PAID' && booking.checkOut != null && day >= booking.checkOut && day <= addDays(booking.checkOut, REVIEW_WINDOW_DAYS);
}

export async function assertReviewMediaUploadAllowed(bookingCode: string, credentials: Credentials): Promise<void> {
  const booking = await requireOwnerAccess(bookingCode, credentials);
  if (!reviewOpen(booking, today())) throw new IllegalStateError('Chỉ tải ảnh đánh giá cho đơn đã thanh toán, từ ngày trả phòng.');
}

// ---- Dựng phản hồi ------------------------------------------------------------------------------------------------------

/**
 * Chuyển nhiều đơn sang phản hồi: ảnh bìa và thành tiền từng loại phòng của mọi đơn lấy theo lô thay vì từng đơn — trang
 * "Chuyến đi của tôi" và thẻ đơn gần nhất ở trang chủ gọi API này thường xuyên.
 */
export async function toResponses(list: BookingFull[]): Promise<BookingResponse[]> {
  if (list.length === 0) return [];
  const placeMedia = groupedValues(await placeRepo.publicUrlsByPlaceIds([...new Set(list.map((b) => b.placeId))]));
  // Ảnh phòng chỉ cần cho đơn mà chỗ nghỉ không có ảnh nào.
  const roomsNeedingCover = [...new Set(list.filter((b) => !placeMedia.get(b.placeId)?.[0] && b.rooms.length > 0).map((b) => b.rooms[0].roomTypeId))];
  const roomMedia = roomsNeedingCover.length === 0 ? new Map<number, string[]>() : groupedValues(await rooms.roomImageUrls(roomsNeedingCover));
  const totals = await bookings.nightTotals(list.map((b) => b.id));
  const perRoomTotals = new Map<string, number>();
  for (const t of totals) perRoomTotals.set(`${t.bookingId}:${t.roomTypeId}`, t.total);
  const nowStr = nowLocal();
  const day = nowStr.slice(0, 10);
  return list.map((b) => {
    const first = b.rooms[0] ?? null;
    const cover = placeMedia.get(b.placeId)?.[0] ?? (first ? (roomMedia.get(first.roomTypeId)?.[0] ?? null) : null);
    return buildResponse(b, perRoomTotals, cover, nowStr, day);
  });
}

function buildResponse(b: BookingFull, perRoomTotals: Map<string, number>, coverUrl: string | null, nowStr: string, day: string): BookingResponse {
  const first = b.rooms[0] ?? null;
  const roomViews: BookingRoomView[] = b.rooms.map((r) => {
    const perRoomTotal = perRoomTotals.get(`${b.id}:${r.roomTypeId}`);
    return { roomTypeId: r.roomTypeId, roomTypeName: r.roomTypeName, roomCount: r.roomCount, subtotal: perRoomTotal == null ? null : perRoomTotal * r.roomCount };
  });
  // Giờ trả phòng mặc định: danh sách đơn không nạp hồ sơ homestay; nhận phòng thật vẫn kiểm tra đúng giờ.
  return {
    id: b.id,
    bookingCode: b.bookingCode,
    placeId: b.placeId,
    placeName: b.placeName,
    placeAddress: b.placeAddress,
    latitude: b.placeLatitude,
    longitude: b.placeLongitude,
    coverImageUrl: coverUrl,
    rooms: roomViews,
    roomTypeId: first ? first.roomTypeId : null,
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
    status: b.status,
    currency: b.currency,
    unitPrice: first?.roomTypeBasePrice ?? 0,
    totalAmount: b.totalAmount,
    createdAt: b.createdAt,
    confirmedAt: b.confirmedAt,
    closeReason: b.closeReason,
    policySnapshot: b.policySnapshot,
    canEdit: b.status === 'PENDING',
    // Đã nhận phòng thì không tự hủy được nữa (đang ở / đã ở).
    canCancel: (b.status === 'PENDING' || b.status === 'CONFIRMED') && b.checkedInAt == null,
    canReview: reviewOpen(b, day),
    checkedInAt: b.checkedInAt,
    checkedOutAt: stays.effectiveCheckedOutAtOf(b, null, nowStr),
    canCheckIn: stays.checkInBlockReasonOf(b, null, nowStr) == null,
  };
}

// ---- Đánh giá -----------------------------------------------------------------------------------------------------------

/** Ảnh đính kèm đánh giá: URL ảnh đã tải lên (bỏ dòng trống, tối đa 1000 ký tự mỗi URL). */
function imageUrls(images: Array<string | null | undefined> | null | undefined): string[] {
  const urls: string[] = [];
  if (!images) return urls;
  for (const image of images) {
    if (image == null || image.trim() === '') continue;
    const url = image.trim();
    if (url.length > 1000) throw new IllegalArgumentError('Đường dẫn ảnh đánh giá quá dài.');
    urls.push(url);
  }
  return urls;
}

/** Làm tròn HALF_UP 2 chữ số thập phân (BigDecimal.setScale(2, RoundingMode.HALF_UP)). */
const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

async function reviewView(review: reviews.ReviewRow, booking: BookingFull, withBookingCode: boolean, imageList?: string[]): Promise<ReviewView> {
  const images = imageList ?? (await reviews.imagesOf([review.id])).map((i) => i.value);
  return {
    id: review.id,
    placeId: review.placeId,
    bookingCode: withBookingCode ? booking.bookingCode : null,
    rating: review.rating,
    content: review.content,
    images,
    providerReply: review.providerReply,
    providerReplyAt: review.providerReplyAt,
    guestName: booking.guestName,
    createdAt: review.createdAt,
    editableUntil: review.editableUntil,
  };
}

export function createBookingReview(bookingCode: string, request: CreateReviewInput, credentials: Credentials): Promise<ReviewView> {
  return tx(async () => {
    const booking = await requireOwnerAccess(bookingCode, credentials);
    if (booking.status !== 'PAID') throw new IllegalStateError('Chỉ đơn đã thanh toán mới có thể gửi đánh giá.');
    if (booking.checkOut != null && today() < booking.checkOut) throw new IllegalStateError(`Bạn có thể đánh giá từ ngày trả phòng (${booking.checkOut}).`);
    if (await reviews.existsByBookingId(booking.id)) throw new IllegalStateError('Đơn đặt phòng này đã được gửi đánh giá trước đó.');
    // REV-BR-06: Trong vòng 14 ngày kể từ ngày trả phòng (checkout)
    const checkoutDate = booking.checkOut;
    if (checkoutDate != null && today() > addDays(checkoutDate, REVIEW_WINDOW_DAYS)) throw new IllegalStateError('Đã quá thời hạn 14 ngày kể từ khi trả phòng để gửi đánh giá.');

    const place = await placeRepo.findByIdForUpdate(booking.placeId);
    if (!place) throw new BookingNotFoundError();
    const now = nowLocal();
    const urls = imageUrls(request.images);
    const saved = await reviews.insertReview({
      placeId: place.id,
      bookingId: booking.id,
      rating: request.rating,
      content: request.content != null ? request.content.trim() : '',
      status: 'VISIBLE',
      editableUntil: checkoutDate != null ? `${addDays(checkoutDate, 14)}T23:59:59` : addDays(now.slice(0, 10), 14) + now.slice(10),
      createdAt: now,
      updatedAt: now,
    });
    await reviews.replaceImages(saved.id, urls);

    // Cập nhật rating trung bình và tổng số đánh giá của Place
    const currentCount = place.ratingCount ?? 0;
    const currentAvg = place.ratingAvg ?? 0;
    const newCount = currentCount + 1;
    await placeRepo.setRating(place.id, round2((currentAvg * currentCount + request.rating) / newCount), newCount);
    return reviewView(saved, booking, true, urls);
  });
}

export function updateBookingReview(bookingCode: string, request: CreateReviewInput, credentials: Credentials): Promise<ReviewView> {
  return tx(async () => {
    const booking = await requireOwnerAccess(bookingCode, credentials);
    const review = await reviews.findByBookingId(booking.id);
    if (!review) throw new IllegalArgumentError('Chưa có đánh giá cho đơn đặt phòng này.');
    if (compareLocal(nowLocal(), review.editableUntil) > 0) throw new IllegalStateError('Đã quá thời hạn 14 ngày để chỉnh sửa đánh giá này.');

    const place = await placeRepo.findByIdForUpdate(review.placeId);
    const oldRating = review.rating;
    const newRating = request.rating;
    const patch: Partial<reviews.ReviewRow> = { rating: newRating, content: request.content != null ? request.content.trim() : '', updatedAt: nowLocal() };
    const saved = (await reviews.updateReview(review.id, patch)) ?? review;
    let urls: string[];
    if (request.images != null) {
      urls = imageUrls(request.images);
      await reviews.replaceImages(review.id, urls);
    } else {
      urls = (await reviews.imagesOf([review.id])).map((i) => i.value);
    }

    // Cập nhật lại rating nếu thay đổi số sao
    if (oldRating !== newRating && place) {
      const count = place.ratingCount != null && place.ratingCount !== 0 ? place.ratingCount : 1;
      const currentAvg = place.ratingAvg ?? oldRating;
      await placeRepo.setRating(place.id, round2((currentAvg * count - oldRating + newRating) / count), place.ratingCount);
    }
    return reviewView(saved, booking, false, urls);
  });
}

export function deleteBookingReview(bookingCode: string, credentials: Credentials): Promise<void> {
  return tx(async () => {
    const booking = await requireOwnerAccess(bookingCode, credentials);
    const review = await reviews.findByBookingId(booking.id);
    if (!review) throw new IllegalArgumentError('Chưa có đánh giá cho đơn đặt phòng này.');
    const place = await placeRepo.findByIdForUpdate(review.placeId);
    const oldRating = review.rating;
    await reviews.deleteReview(review.id);

    // Tính lại rating của Place
    if (place) {
      const currentCount = place.ratingCount != null && place.ratingCount !== 0 ? place.ratingCount : 1;
      if (currentCount <= 1) {
        await placeRepo.setRating(place.id, 0, 0);
      } else {
        const currentAvg = place.ratingAvg ?? 0;
        const newCount = currentCount - 1;
        await placeRepo.setRating(place.id, round2((currentAvg * currentCount - oldRating) / newCount), newCount);
      }
    }
  });
}

export async function getBookingReview(bookingCode: string, credentials: Credentials): Promise<ReviewView | null> {
  const booking = await requireReadAccess(bookingCode, credentials);
  const review = await reviews.findByBookingId(booking.id);
  return review ? reviewView(review, booking, true) : null;
}

// ---- Hủy / sửa đơn ------------------------------------------------------------------------------------------------------

/**
 * Khách hủy đơn: được khi đơn còn chờ xác nhận hoặc đã xác nhận (chưa thanh toán). Trả phòng về lịch, ghi lịch sử và báo
 * Admin + NCC.
 */
export function cancelBooking(bookingCode: string, reason: string | null, note: string | null, credentials: Credentials): Promise<BookingResponse> {
  return tx(async () => {
    const found = await requireOwnerAccess(bookingCode, credentials);
    const locked = await lockedFull(found.id);
    if (locked.status === 'CANCELLED') throw new IllegalStateError('Đơn đặt phòng này đã được hủy trước đó.');
    if (locked.status === 'PAID') {
      throw new IllegalStateError('Đơn đã được ghi nhận thanh toán nên không thể tự hủy. Vui lòng liên hệ chỗ nghỉ hoặc bộ phận hỗ trợ.');
    }
    if (locked.checkedInAt != null) {
      throw new IllegalStateError('Bạn đã nhận phòng nên không thể tự hủy đơn. Vui lòng liên hệ chỗ nghỉ hoặc bộ phận hỗ trợ.');
    }

    const now = nowLocal();
    const snapshot: Record<string, unknown> = { ...(locked.policySnapshot ?? {}) };
    snapshot.cancelReason = reason;
    if (note && note.trim() !== '') snapshot.cancelNote = note;
    snapshot.cancelledAt = now;

    const closeReason = reason && reason.trim() !== '' ? reason.trim() : 'Khách yêu cầu hủy phòng';
    const from = locked.status;
    await workflow.releaseRooms(locked);
    await bookings.updateBooking(locked.id, { status: 'CANCELLED', closedAt: now, closeReason, closedByActor: 'CUSTOMER', policySnapshot: snapshot });
    await bookings.insertHistory(locked.id, from, 'CANCELLED', 'CUSTOMER', null, closeReason, now);
    const saved = await fullById(locked.id);
    await notifier.cancelledByCustomer(saved, closeReason);
    return (await toResponses([saved]))[0];
  });
}

/**
 * Khách sửa đơn — chỉ khi đơn còn chờ xác nhận. Thay đổi áp dụng ngay; đơn ở lại / quay về Chờ xác nhận, lịch sử ghi tóm tắt
 * thay đổi và Admin + NCC được báo lại để xác nhận lại. Đổi ngày / loại phòng / số phòng thì trả phòng cũ, giữ phòng mới và
 * tính lại tiền theo giá từng đêm (giá cuối tuần / giá đặc biệt) như lúc đặt.
 */
export function updateBookingDetails(bookingCode: string, request: UpdateBookingInput, credentials: Credentials): Promise<BookingResponse> {
  return tx(async () => {
    const found = await requireOwnerAccess(bookingCode, credentials);
    const booking = await lockedFull(found.id);
    if (booking.status !== 'PENDING') {
      throw new IllegalStateError(
        booking.status === 'CONFIRMED'
          ? 'Đơn đã được xác nhận nên không thể thay đổi nữa. Bạn vẫn có thể hủy đơn và đặt lại.'
          : `Không thể thay đổi đơn ở trạng thái ${workflow.label(booking.status)}.`,
      );
    }
    const targetCheckIn = request.checkIn ?? booking.checkIn;
    const targetCheckOut = request.checkOut ?? booking.checkOut;
    if ((request.checkIn != null || request.checkOut != null) && daysBetween(targetCheckIn, targetCheckOut) > MAX_NIGHTS_PER_BOOKING) {
      throw new IllegalArgumentError(`Mỗi đơn đặt phòng tối đa ${MAX_NIGHTS_PER_BOOKING} đêm.`);
    }

    const patch: Partial<bookings.BookingRow> = {};
    const changes = await applyDirectBookingChanges(booking, request, patch);
    // Không đổi gì thì không báo lại Admin / NCC (và không gửi email "khách thay đổi đơn").
    if (changes.length === 0) throw new IllegalArgumentError('Bạn chưa thay đổi thông tin nào của đơn.');

    const from = booking.status;
    patch.status = 'PENDING';
    patch.confirmedAt = null;
    await bookings.updateBooking(booking.id, patch);
    const summary = changes.join('; ');
    const reason = `Khách thay đổi đơn: ${summary}`;
    await bookings.insertHistory(booking.id, from, 'PENDING', 'CUSTOMER', null, reason.length > 500 ? reason.slice(0, 500) : reason, nowLocal());
    const saved = await fullById(booking.id);
    await notifier.updatedByCustomer(saved, summary);
    logger.info('Khách thay đổi đơn', { bookingCode: saved.bookingCode, summary });
    return (await toResponses([saved]))[0];
  });
}

/** Số phòng theo loại phòng của đơn (id tăng dần). */
function roomCounts(booking: BookingFull): Map<number, number> {
  const counts = new Map<number, number>();
  for (const r of [...booking.rooms].sort((a, b) => a.roomTypeId - b.roomTypeId)) counts.set(r.roomTypeId, (counts.get(r.roomTypeId) ?? 0) + r.roomCount);
  return counts;
}

/**
 * Loại phòng sau khi sửa: danh sách `rooms` nếu gửi; giao diện cũ chỉ gửi `roomCount` — áp cho đơn có đúng một loại phòng;
 * không gửi gì thì giữ nguyên.
 */
function requestedRooms(request: UpdateBookingInput, current: Map<number, number>): Map<number, number> {
  if (request.rooms != null) {
    const counts = new Map<number, number>();
    for (const r of request.rooms) {
      if (!r || r.roomTypeId == null || r.roomCount == null) continue;
      counts.set(r.roomTypeId, (counts.get(r.roomTypeId) ?? 0) + r.roomCount);
    }
    return new Map([...counts.entries()].sort((a, b) => a[0] - b[0]));
  }
  if (request.roomCount != null) {
    if (current.size !== 1) throw new IllegalArgumentError('Đơn có nhiều loại phòng: vui lòng chọn lại số phòng của từng loại.');
    return new Map([[[...current.keys()][0], request.roomCount]]);
  }
  return current;
}

const sameCounts = (a: Map<number, number>, b: Map<number, number>): boolean => a.size === b.size && [...a].every(([k, v]) => b.get(k) === v);

/**
 * Loại phòng chủ nhà đã khóa (ngừng bán): đơn cũ vẫn giữ, nhưng khách sửa đơn chỉ được giữ nguyên hoặc rút bớt — không thêm
 * phòng, không dời / kéo dài ra ngoài khoảng ngày đã đặt.
 */
export function onlyBookedNights(oldCount: number | undefined, newCount: number, oldCheckIn: string, oldCheckOut: string, newCheckIn: string, newCheckOut: string): boolean {
  return oldCount != null && newCount <= oldCount && newCheckIn >= oldCheckIn && newCheckOut <= oldCheckOut;
}

/** Áp thay đổi của khách lên đơn (ghi vào `patch`); trả về danh sách thay đổi thật sự (rỗng = không có gì đổi). */
async function applyDirectBookingChanges(booking: BookingFull, request: UpdateBookingInput, patch: Partial<bookings.BookingRow>): Promise<string[]> {
  const changes: string[] = [];
  const name = trimToNull(request.guestName);
  if (name != null && name !== booking.guestName) {
    changes.push('họ tên');
    patch.guestName = name;
  }
  const phone = trimToNull(request.guestPhone);
  if (phone != null && phone !== booking.guestPhone) {
    changes.push('số điện thoại');
    patch.guestPhone = phone;
  }
  if (request.guestEmail != null) {
    const email = trimToNull(request.guestEmail);
    if (email !== trimToNull(booking.guestEmail)) {
      changes.push('email');
      patch.guestEmail = email;
    }
  }
  if (request.guestNote != null) {
    const note = trimToNull(request.guestNote);
    if (note !== trimToNull(booking.guestNote)) {
      changes.push('ghi chú');
      patch.guestNote = note;
    }
  }

  const oldCheckIn = booking.checkIn;
  const oldCheckOut = booking.checkOut;
  const newCheckIn = request.checkIn ?? oldCheckIn;
  const newCheckOut = request.checkOut ?? oldCheckOut;
  const oldRooms = roomCounts(booking);
  const newRooms = requestedRooms(request, oldRooms);
  const newGuests = request.guestCount ?? booking.guestCount;

  const datesChanged = newCheckIn !== oldCheckIn || newCheckOut !== oldCheckOut;
  const roomsChanged = !sameCounts(newRooms, oldRooms);
  if (datesChanged || roomsChanged) {
    if (newCheckIn < today()) throw new IllegalArgumentError('Không thể chọn ngày nhận phòng trước ngày hiện tại.');
    if (newCheckOut <= newCheckIn) throw new IllegalArgumentError('Ngày trả phòng phải sau ngày nhận phòng.');
    validateSelections([...newRooms].map(([roomTypeId, roomCount]) => ({ roomTypeId, roomCount })));

    // Khóa mọi loại phòng liên quan (cũ + mới) theo id tăng dần trước khi chạm tồn kho — cùng thứ tự với lúc đặt.
    const roomIds = [...new Set([...oldRooms.keys(), ...newRooms.keys()])].sort((a, b) => a - b);
    const locked = new Map<number, RoomTypeRow>();
    for (const id of roomIds) {
      const room = await rooms.lockRoomType(id);
      if (!room) throw new IllegalStateError('Không tìm thấy loại phòng của đơn.');
      if (newRooms.has(id)) {
        if (room.placeId !== booking.placeId) throw new IllegalArgumentError('Loại phòng không thuộc chỗ nghỉ này.');
        if (room.status !== 'ACTIVE' && !onlyBookedNights(oldRooms.get(id), newRooms.get(id)!, oldCheckIn, oldCheckOut, newCheckIn, newCheckOut)) {
          throw new IllegalStateError(
            oldRooms.has(id)
              ? `Loại phòng ${room.name} đang ngừng nhận đặt mới: bạn chỉ có thể giữ nguyên hoặc bớt ngày / số phòng đã đặt.`
              : `Loại phòng ${room.name} đang ngừng nhận đặt phòng.`,
          );
        }
      }
      locked.set(id, room);
    }
    // 1. Trả phòng đang giữ của khoảng ngày cũ; 2. giữ phòng mới và tính giá từng đêm như lúc đặt.
    for (const id of roomIds) {
      const count = oldRooms.get(id);
      if (count != null) await calendar.releaseHeld(locked.get(id)!, oldCheckIn, oldCheckOut, count);
    }
    const priced: PricedRoom[] = [];
    for (const id of roomIds) {
      const count = newRooms.get(id);
      if (count == null) continue;
      const room = locked.get(id)!;
      const nights = await calendar.calendar(room, newCheckIn, newCheckOut);
      await calendar.hold(room, newCheckIn, newCheckOut, count);
      priced.push({ room, count, nights });
    }
    // 3. Thay loại phòng + giá từng đêm (xóa loại phòng kéo theo giá từng đêm rồi thêm lại).
    await bookings.deleteRoomsAndNights(booking.id);
    for (const p of priced) {
      await bookings.insertRoom(booking.id, p.room.id, p.count);
      await bookings.insertNights(booking.id, p.room.id, p.nights.map((n) => ({ stayDate: n.stayDate, unitPrice: n.price })));
    }
    const newTotal = priced.reduce((sum, p) => sum + subtotal(p), 0);

    if (datesChanged) changes.push(`ngày ở ${dm(oldCheckIn)}–${dm(oldCheckOut)} → ${dm(newCheckIn)}–${dm(newCheckOut)}`);
    if (roomsChanged) changes.push(`phòng → ${roomSummary({ rooms: priced.map((p) => ({ roomTypeId: p.room.id, roomTypeName: p.room.name, roomTypeBasePrice: p.room.basePrice, roomCount: p.count })) })}`);
    if (booking.totalAmount == null || newTotal !== booking.totalAmount) changes.push(`tổng tiền ${formatMoney(newTotal)}đ`);
    patch.checkIn = newCheckIn;
    patch.checkOut = newCheckOut;
    patch.totalAmount = newTotal;
  }

  if (newGuests !== booking.guestCount) {
    changes.push(`số khách ${booking.guestCount} → ${newGuests}`);
    patch.guestCount = newGuests;
  }
  return changes;
}

// ---- Lịch trống / báo giá -----------------------------------------------------------------------------------------------

export interface BookedDateRange {
  roomTypeId: number;
  checkIn: string;
  checkOut: string;
  roomCount: number;
}

/**
 * Một ngày không bán hết được, quy về "số phòng đã bận" để lịch phía khách cộng chung với đơn đặt: ngừng bán = bận toàn bộ
 * phòng; chủ nhà khóa bớt = bận đúng số phòng đang khóa.
 */
function unsellableRange(d: rooms.DisabledDayRow): BookedDateRange {
  const capacity = d.capacity ?? 0;
  const total = d.totalRooms ?? capacity;
  const busy = d.stopSell ? Math.max(capacity, 1) : Math.max(0, capacity - total);
  return { roomTypeId: d.roomTypeId, checkIn: d.stayDate, checkOut: addDays(d.stayDate, 1), roomCount: busy };
}

export async function getBookedDatesByRoomType(roomTypeId: number, startDate: string | undefined, endDate: string | undefined): Promise<BookedDateRange[]> {
  const start = startDate ?? addDays(today(), -15);
  const end = endDate ?? addMonths(today(), 3);
  const booked = await bookings.bookedRangesByRoomType(roomTypeId, start, end);
  const disabled = (await rooms.disabledDaysByRoomType(roomTypeId, start, end)).map(unsellableRange);
  return [...booked, ...disabled];
}

export async function getBookedDatesByPlace(placeId: number, startDate: string | undefined, endDate: string | undefined): Promise<BookedDateRange[]> {
  const start = startDate ?? addDays(today(), -15);
  const end = endDate ?? addMonths(today(), 3);
  const booked = await bookings.bookedRangesByPlace(placeId, start, end);
  const disabled = (await rooms.disabledDaysByPlace(placeId, start, end)).map(unsellableRange);
  return [...booked, ...disabled];
}

export interface AvailabilityResponse {
  available: boolean;
  requestedRooms: number;
  minAvailableRooms: number;
  message: string;
}

export async function checkAvailability(roomTypeId: number, checkIn: string | undefined, checkOut: string | undefined, roomCount: number, excludeBookingCode: string | null): Promise<AvailabilityResponse> {
  const fail = (message: string, minAvailableRooms = 0): AvailabilityResponse => ({ available: false, requestedRooms: roomCount, minAvailableRooms, message });
  if (!checkIn || !checkOut) return fail('Ngày nhận phòng và trả phòng không được để trống.');
  if (checkOut <= checkIn) return fail('Ngày trả phòng phải sau ngày nhận phòng.');
  if (roomCount <= 0) return fail('Số lượng phòng yêu cầu tối thiểu là 1.');

  const roomType = await rooms.findRoomTypeById(roomTypeId);
  if (!roomType) throw new IllegalArgumentError(`Không tìm thấy hạng phòng với ID: ${roomTypeId}`);
  const totalCapacity = roomType.totalRoomCount ?? 5;

  // Đơn đang sửa (nếu có): phòng của chính đơn đó cho loại phòng này không tính là đã bận.
  let excludeBooking: bookings.BookingWithPlace | null = null;
  let excludedRooms = 0;
  if (excludeBookingCode && excludeBookingCode.trim() !== '') {
    const found = await bookings.findByCodeWithPlace(excludeBookingCode.trim());
    if (found) {
      excludeBooking = found;
      excludedRooms = roomCounts(await attachRoomsTo(found)).get(roomTypeId) ?? 0;
    }
  }

  let minAvailable = Number.MAX_SAFE_INTEGER;
  // Tồn kho cả khoảng ngày trong một câu thay vì hỏi từng đêm.
  const inventory = new Map<string, rooms.InventoryDayRow>();
  for (const day of await rooms.inventoryRange(roomTypeId, checkIn, checkOut)) inventory.set(day.stayDate, day);

  for (let d = checkIn; d < checkOut; d = addDays(d, 1)) {
    const inv = inventory.get(d);
    if (inv && inv.stopSell) return fail(`Phòng đã tạm ngừng nhận khách vào ngày: ${d}`);
    let occupied = inv ? (inv.heldRooms ?? 0) + (inv.confirmedRooms ?? 0) : 0;
    // Nếu ngày này đang được giữ bởi chính booking đang chỉnh sửa, không tính số phòng đó là occupied
    if (excludeBooking && d >= excludeBooking.checkIn && d < excludeBooking.checkOut) occupied = Math.max(0, occupied - excludedRooms);
    const dayTotal = inv && inv.totalRooms != null ? inv.totalRooms : totalCapacity;
    const available = Math.max(0, dayTotal - occupied);
    if (available < minAvailable) minAvailable = available;
    if (available < roomCount) {
      return fail(`Ngày ${d} chỉ còn trống ${available} phòng (yêu cầu ${roomCount} phòng). Vui lòng chọn ngày khác!`, available);
    }
  }
  const finalMin = minAvailable === Number.MAX_SAFE_INTEGER ? totalCapacity : minAvailable;
  return { available: true, requestedRooms: roomCount, minAvailableRooms: finalMin, message: `Phòng khả dụng! Hiện còn ${finalMin} phòng trống cho khoảng thời gian này.` };
}

export async function quote(
  roomTypeId: number,
  checkIn: string,
  checkOut: string,
  roomCount: number,
  guestCount: number,
): Promise<{ roomTypeId: number; availableRooms: number; suitable: boolean; totalAmount: number }> {
  const roomType = await rooms.findRoomTypeById(roomTypeId);
  if (!roomType) throw new IllegalArgumentError(`Không tìm thấy loại phòng với ID: ${roomTypeId}`);
  const q = await calendar.quote(roomType, checkIn, checkOut, roomCount, guestCount);
  return { roomTypeId: q.roomTypeId, availableRooms: q.availableRooms, suitable: q.suitable, totalAmount: q.totalAmount };
}
