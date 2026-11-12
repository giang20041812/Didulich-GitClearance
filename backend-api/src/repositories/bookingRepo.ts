import { exec, one, query, scalar } from '../db/pool.js';
import { insertRow, json, updateRow } from '../db/sql.js';
import type { ActorType, BookingStatus } from '../domain/enums.js';

export interface BookingRow {
  id: number;
  bookingCode: string;
  placeId: number;
  providerId: number;
  travelerId: number | null;
  checkIn: string;
  checkOut: string;
  nights: number;
  guestCount: number;
  guestName: string;
  guestPhone: string;
  guestEmail: string | null;
  guestNote: string | null;
  status: BookingStatus;
  currency: string;
  totalAmount: number;
  policyId: number | null;
  policySnapshot: Record<string, unknown>;
  accessTokenHash: string | null;
  createdAt: string;
  confirmedAt: string | null;
  closedAt: string | null;
  closeReason: string | null;
  closedByActor: ActorType | null;
  checkedInAt: string | null;
  checkedInBy: ActorType | null;
  checkedOutAt: string | null;
  checkedOutBy: ActorType | null;
}

export interface BookingWithPlace extends BookingRow {
  placeName: string;
  placeSlug: string;
  placeKind: string;
  placeAddress: string | null;
  placeLatitude: number | null;
  placeLongitude: number | null;
}

export interface BookingRoomRow {
  bookingId: number;
  roomTypeId: number;
  roomCount: number;
}

export interface BookingNightRow {
  bookingId: number;
  roomTypeId: number;
  stayDate: string;
  unitPrice: number;
}

const WITH_PLACE = `SELECT b.*, p.name AS place_name, p.slug AS place_slug, p.kind AS place_kind, p.address AS place_address,
  p.latitude AS place_latitude, p.longitude AS place_longitude
  FROM booking b JOIN place p ON p.id = b.place_id`;

export const findById = (id: number) => one<BookingRow>('SELECT * FROM booking WHERE id = $1', [id]);

export const findByIdWithPlace = (id: number) => one<BookingWithPlace>(`${WITH_PLACE} WHERE b.id = $1`, [id]);

export const findByCode = (code: string) => one<BookingRow>('SELECT * FROM booking WHERE booking_code = $1', [code]);

export const findByCodeWithPlace = (code: string) => one<BookingWithPlace>(`${WITH_PLACE} WHERE b.booking_code = $1`, [code]);

/** Khóa ghi dòng đơn (tương đương findLockedById). Phải gọi trong transaction. */
export const lockById = (id: number) => one<BookingRow>('SELECT * FROM booking WHERE id = $1 FOR UPDATE', [id]);

export async function findAllByIds(ids: readonly number[]): Promise<BookingRow[]> {
  if (ids.length === 0) return [];
  return query<BookingRow>('SELECT * FROM booking WHERE id = ANY($1)', [ids]);
}

export async function findAllWithPlaceByIds(ids: readonly number[]): Promise<BookingWithPlace[]> {
  if (ids.length === 0) return [];
  return query<BookingWithPlace>(`${WITH_PLACE} WHERE b.id = ANY($1)`, [ids]);
}

export async function existsByCode(code: string): Promise<boolean> {
  return (await scalar<boolean>('SELECT count(*) > 0 FROM booking WHERE booking_code = $1', [code])) === true;
}

export async function insertBooking(data: Partial<BookingRow> & Pick<BookingRow, 'bookingCode' | 'placeId' | 'providerId' | 'checkIn' | 'checkOut' | 'guestCount' | 'guestName' | 'guestPhone' | 'totalAmount' | 'policySnapshot' | 'createdAt'>): Promise<BookingRow> {
  const { policySnapshot, ...rest } = data;
  return insertRow<BookingRow>('booking', { status: 'PENDING', currency: 'VND', ...rest, policySnapshot: json(policySnapshot) });
}

export async function updateBooking(id: number, patch: Partial<BookingRow>): Promise<BookingRow | null> {
  const { policySnapshot, ...rest } = patch;
  return updateRow<BookingRow>('booking', id, policySnapshot === undefined ? rest : { ...rest, policySnapshot: json(policySnapshot) });
}

// ---- Phòng + giá từng đêm -----------------------------------------------------------------------------------------

export async function roomsOf(bookingIds: readonly number[]): Promise<Array<BookingRoomRow & { roomTypeName: string; roomTypeBasePrice: number | null }>> {
  if (bookingIds.length === 0) return [];
  return query(
    `SELECT r.booking_id, r.room_type_id, r.room_count, t.name AS room_type_name, t.base_price AS room_type_base_price FROM booking_room r JOIN room_type t ON t.id = r.room_type_id
      WHERE r.booking_id = ANY($1) ORDER BY r.booking_id, r.room_type_id`,
    [bookingIds],
  );
}

export async function nightsOf(bookingId: number): Promise<BookingNightRow[]> {
  return query<BookingNightRow>('SELECT * FROM booking_night WHERE booking_id = $1 ORDER BY room_type_id, stay_date', [bookingId]);
}

/** Tổng giá từng đêm (giá MỘT phòng) theo đơn + loại phòng: mỗi dòng {bookingId, roomTypeId, total}. */
export async function nightTotals(bookingIds: readonly number[]): Promise<Array<{ bookingId: number; roomTypeId: number; total: number }>> {
  if (bookingIds.length === 0) return [];
  return query(
    'SELECT booking_id, room_type_id, sum(unit_price) AS total FROM booking_night WHERE booking_id = ANY($1) GROUP BY booking_id, room_type_id',
    [bookingIds],
  );
}

export async function insertRoom(bookingId: number, roomTypeId: number, roomCount: number): Promise<void> {
  await exec('INSERT INTO booking_room (booking_id, room_type_id, room_count) VALUES ($1, $2, $3)', [bookingId, roomTypeId, roomCount]);
}

export async function insertNight(bookingId: number, roomTypeId: number, stayDate: string, unitPrice: number): Promise<void> {
  await exec('INSERT INTO booking_night (booking_id, room_type_id, stay_date, unit_price) VALUES ($1, $2, $3, $4)', [bookingId, roomTypeId, stayDate, unitPrice]);
}

export async function deleteRoomsAndNights(bookingId: number): Promise<void> {
  await exec('DELETE FROM booking_room WHERE booking_id = $1', [bookingId]); // booking_night xóa theo (ON DELETE CASCADE)
}

// ---- Truy vấn theo trạng thái -------------------------------------------------------------------------------------

/** Số đơn theo trạng thái, tùy chọn của một nhà cung cấp. */
export async function countGroupedByStatus(providerId?: number | null): Promise<Record<string, number>> {
  const rows = await query<{ status: string; n: number }>(
    `SELECT status, count(*) AS n FROM booking WHERE ($1::bigint IS NULL OR provider_id = $1) GROUP BY status`,
    [providerId ?? null],
  );
  const out: Record<string, number> = {};
  for (const r of rows) out[r.status] = r.n;
  return out;
}

export async function countCreatedBetween(start: string, end: string): Promise<number> {
  return (await scalar<number>('SELECT count(*) FROM booking WHERE created_at >= $1 AND created_at <= $2', [start, end])) ?? 0;
}

export async function existsByPlaceAndStatuses(placeId: number, statuses: readonly BookingStatus[]): Promise<boolean> {
  return (await scalar<boolean>('SELECT count(*) > 0 FROM booking WHERE place_id = $1 AND status = ANY($2)', [placeId, statuses])) === true;
}

export async function existsByPlaceStatusCheckOutAfter(placeId: number, status: BookingStatus, date: string): Promise<boolean> {
  return (await scalar<boolean>('SELECT count(*) > 0 FROM booking WHERE place_id = $1 AND status = $2 AND check_out > $3', [placeId, status, date])) === true;
}

// ---- Đơn của khách du lịch ------------------------------------------------------------------------------------------

/**
 * Đơn của một khách đã đăng nhập: đơn gắn traveler_id; riêng đơn cũ (tạo trước khi có traveler_id / mã truy cập) khớp theo
 * email ĐÃ XÁC MINH. $1 = travelerId, $2 = email đã xác minh.
 */
const TRAVELER_OR_EMAIL = `(b.traveler_id = $1 OR (b.traveler_id IS NULL AND b.access_token_hash IS NULL
  AND b.guest_email IS NOT NULL AND b.guest_email <> '' AND lower(b.guest_email) = lower($2)))`;

export const findForTraveler = (travelerId: number, email: string) =>
  query<BookingWithPlace>(`${WITH_PLACE} WHERE ${TRAVELER_OR_EMAIL} ORDER BY b.created_at DESC`, [travelerId, email]);

export const findLinkedToTraveler = (travelerId: number) =>
  query<BookingWithPlace>(`${WITH_PLACE} WHERE b.traveler_id = $1 ORDER BY b.created_at DESC`, [travelerId]);

export interface BookingStatusView {
  bookingCode: string;
  status: BookingStatus;
}

export const findStatusesForTraveler = (travelerId: number, email: string) =>
  query<BookingStatusView>(`SELECT b.booking_code, b.status FROM booking b WHERE ${TRAVELER_OR_EMAIL} ORDER BY b.created_at DESC`, [travelerId, email]);

export const findStatusesLinkedToTraveler = (travelerId: number) =>
  query<BookingStatusView>('SELECT b.booking_code, b.status FROM booking b WHERE b.traveler_id = $1 ORDER BY b.created_at DESC', [travelerId]);

export async function findByCodesWithPlace(codes: readonly string[]): Promise<BookingWithPlace[]> {
  if (codes.length === 0) return [];
  return query<BookingWithPlace>(`${WITH_PLACE} WHERE b.booking_code = ANY($1) ORDER BY b.created_at DESC`, [codes]);
}

/** Đơn của khách tại một địa điểm có ngày trả phòng từ `from` — trang quét mã QR nhận phòng. */
export const findStaysAtPlace = (placeId: number, travelerId: number, email: string, from: string) =>
  query<BookingWithPlace>(
    `${WITH_PLACE} WHERE b.place_id = $3 AND b.check_out >= $4 AND ${TRAVELER_OR_EMAIL} ORDER BY b.check_in ASC, b.created_at ASC`,
    [travelerId, email, placeId, from],
  );

// ---- Nhận / trả phòng -----------------------------------------------------------------------------------------------

/** Đơn đang ở (đã nhận, chưa trả phòng) có ngày trả phòng tới `day` — job tự trả phòng. */
export const findInHouseCheckingOutBy = (day: string) =>
  query<BookingWithPlace>(`${WITH_PLACE} WHERE b.checked_in_at IS NOT NULL AND b.checked_out_at IS NULL AND b.check_out <= $1`, [day]);

/** Chỉ ghi khi đơn chưa nhận phòng và đang ở một trong `statuses` — hai lần bấm cùng lúc không ghi đè nhau. */
export const markCheckedIn = (id: number, at: string, by: ActorType, statuses: readonly BookingStatus[]) =>
  exec('UPDATE booking SET checked_in_at = $2, checked_in_by = $3 WHERE id = $1 AND checked_in_at IS NULL AND status = ANY($4)', [id, at, by, statuses]);

/** Chỉ ghi khi chưa ghi trả phòng, nên job chạy trùng ở container khác cũng không ghi đè. */
export const markCheckedOut = (id: number, at: string, by: ActorType) =>
  exec('UPDATE booking SET checked_out_at = $2, checked_out_by = $3 WHERE id = $1 AND checked_out_at IS NULL', [id, at, by]);

// ---- Đơn còn giữ phòng theo phạm vi ---------------------------------------------------------------------------------

const HOLDING = `('PENDING', 'CONFIRMED', 'PAID')`;

export interface BookedRange {
  roomTypeId: number;
  checkIn: string;
  checkOut: string;
  roomCount: number;
}

/** Phòng đã đặt của một loại phòng giao với [start, end] — 4 cột lịch phòng cần, không nạp cả đơn. */
export const bookedRangesByRoomType = (roomTypeId: number, start: string, end: string) =>
  query<BookedRange>(
    `SELECT r.room_type_id, b.check_in, b.check_out, r.room_count FROM booking_room r JOIN booking b ON b.id = r.booking_id
      WHERE r.room_type_id = $1 AND b.status IN ${HOLDING} AND b.check_in < $3 AND b.check_out > $2`,
    [roomTypeId, start, end],
  );

export const bookedRangesByPlace = (placeId: number, start: string, end: string) =>
  query<BookedRange>(
    `SELECT r.room_type_id, b.check_in, b.check_out, r.room_count FROM booking_room r JOIN booking b ON b.id = r.booking_id
      WHERE b.place_id = $1 AND b.status IN ${HOLDING} AND b.check_in < $3 AND b.check_out > $2`,
    [placeId, start, end],
  );

export const activeByPlaceAndDateRange = (placeId: number, start: string, end: string) =>
  query<BookingWithPlace>(`${WITH_PLACE} WHERE b.place_id = $1 AND b.status IN ${HOLDING} AND b.check_in < $3 AND b.check_out > $2`, [placeId, start, end]);

export const activeByRoomTypeAndDateRange = (roomTypeId: number, start: string, end: string) =>
  query<BookingWithPlace>(
    `${WITH_PLACE} WHERE b.status IN ${HOLDING} AND b.check_in < $3 AND b.check_out > $2
       AND EXISTS (SELECT 1 FROM booking_room r WHERE r.booking_id = b.id AND r.room_type_id = $1)`,
    [roomTypeId, start, end],
  );

export const activeByProvider = (providerId: number, fromDate: string) =>
  query<BookingWithPlace>(`${WITH_PLACE} WHERE b.provider_id = $1 AND b.status IN ${HOLDING} AND b.check_out > $2`, [providerId, fromDate]);

export const pendingByProvider = (providerId: number) =>
  query<BookingWithPlace>(`${WITH_PLACE} WHERE b.provider_id = $1 AND b.status = 'PENDING'`, [providerId]);

// ---- Lịch sử trạng thái ---------------------------------------------------------------------------------------------

export interface StatusHistoryRow {
  id: number;
  bookingId: number;
  fromStatus: BookingStatus | null;
  toStatus: BookingStatus;
  actor: ActorType;
  actorId: number | null;
  reason: string | null;
  createdAt: string;
}

export async function insertHistory(
  bookingId: number,
  fromStatus: BookingStatus | null,
  toStatus: BookingStatus,
  actor: ActorType,
  actorId: number | null,
  reason: string | null,
  createdAt: string,
): Promise<void> {
  await exec(
    `INSERT INTO booking_status_history (booking_id, from_status, to_status, actor, actor_id, reason, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [bookingId, fromStatus, toStatus, actor, actorId, reason, createdAt],
  );
}

export const historyOf = (bookingId: number) =>
  query<StatusHistoryRow>('SELECT * FROM booking_status_history WHERE booking_id = $1 ORDER BY created_at ASC, id ASC', [bookingId]);

// ---- Thanh toán -----------------------------------------------------------------------------------------------------

export async function hasPaymentWithStatus(bookingId: number, status: string): Promise<boolean> {
  return (await scalar<boolean>('SELECT count(*) > 0 FROM payment_transaction WHERE booking_id = $1 AND status = $2', [bookingId, status])) === true;
}

export const gatewayByCode = (code: string) => one<{ id: number; code: string; name: string; isActive: boolean }>('SELECT * FROM payment_gateway WHERE code = $1', [code]);

export async function insertPayment(p: {
  bookingId: number;
  gatewayId: number;
  externalTxnId: string;
  amount: number;
  currency: string;
  status: string;
  initiatedAt: string;
  paidAt: string | null;
  rawCallback: Record<string, unknown>;
}): Promise<void> {
  await exec(
    `INSERT INTO payment_transaction (booking_id, gateway_id, external_txn_id, amount, currency, status, initiated_at, paid_at, raw_callback)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [p.bookingId, p.gatewayId, p.externalTxnId, p.amount, p.currency, p.status, p.initiatedAt, p.paidAt, json(p.rawCallback)],
  );
}

/** Giá từng đêm của MỘT loại phòng trong đơn — một câu INSERT cho cả khoảng ngày. */
export async function insertNights(bookingId: number, roomTypeId: number, nights: ReadonlyArray<{ stayDate: string; unitPrice: number }>): Promise<void> {
  if (nights.length === 0) return;
  await exec(
    `INSERT INTO booking_night (booking_id, room_type_id, stay_date, unit_price)
     SELECT $1, $2, x.d, x.p FROM unnest($3::date[], $4::numeric[]) AS x(d, p)`,
    [bookingId, roomTypeId, nights.map((n) => n.stayDate), nights.map((n) => n.unitPrice)],
  );
}
