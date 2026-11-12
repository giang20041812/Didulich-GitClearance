import { exec, one, query, scalar } from '../db/pool.js';
import { insertRow, updateRow } from '../db/sql.js';
import type { AmenityValue, MediaRole, RefundType } from '../domain/enums.js';
import type { AmenityRow } from './placeRepo.js';
import { nowLocal } from '../lib/time.js';

export interface RoomTypeRow {
  id: number;
  placeId: number;
  name: string;
  description: string | null;
  viewDescription: string | null;
  otherAmenities: string | null;
  maxOccupancy: number;
  totalRoomCount: number;
  privateBathroom: AmenityValue;
  areaSqm: number | null;
  basePrice: number | null;
  weekendPrice: number | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface InventoryDayRow {
  roomTypeId: number;
  stayDate: string;
  totalRooms: number;
  heldRooms: number;
  confirmedRooms: number;
  stopSell: boolean;
  blockReason: string | null;
  availableRooms: number;
  updatedAt: string;
}

export interface HomestayProfileRow {
  placeId: number;
  checkInFrom: string | null;
  checkOutUntil: string | null;
  processingStartTime: string | null;
  processingEndTime: string | null;
  houseRules: string | null;
  surchargeNote: string | null;
  childrenPolicy: string | null;
  petsPolicy: string | null;
  viewHighlight: string | null;
  suitability: string | null;
  otherAmenities: string | null;
  currentPolicyId: number | null;
  checkinCode: string | null;
  updatedAt: string;
}

export interface CancellationPolicyRow {
  id: number;
  placeId: number;
  version: number;
  name: string;
  freeCancelCutoffHours: number;
  refundOnLateCancel: RefundType;
  contentText: string;
  effectiveFrom: string;
  createdBy: number | null;
}

export interface HomestayServiceOfferRow {
  id: number;
  placeId: number;
  name: string;
  description: string | null;
  price: number | null;
  priceUnit: string | null;
  active: boolean;
}

export interface RoomMediaItem {
  roomTypeId: number;
  mediaId: number;
  role: MediaRole;
  caption: string | null;
  sortOrder: number;
  publicUrl: string | null;
}

export async function findRoomTypeById(id: number): Promise<RoomTypeRow | null> {
  return one<RoomTypeRow>('SELECT * FROM room_type WHERE id = $1', [id]);
}

/** Khóa ghi dòng loại phòng (thứ tự khóa: RoomType → RoomInventoryDay). Phải gọi trong transaction. */
export async function lockRoomType(id: number): Promise<RoomTypeRow | null> {
  return one<RoomTypeRow>('SELECT * FROM room_type WHERE id = $1 FOR UPDATE', [id]);
}

export async function roomTypesByPlace(placeId: number): Promise<RoomTypeRow[]> {
  return query<RoomTypeRow>('SELECT * FROM room_type WHERE place_id = $1 ORDER BY id', [placeId]);
}

export async function roomTypesByPlaceAndStatus(placeId: number, status: string): Promise<RoomTypeRow[]> {
  return query<RoomTypeRow>('SELECT * FROM room_type WHERE place_id = $1 AND status = $2 ORDER BY id', [placeId, status]);
}

export async function roomTypesByPlaceIdsAndStatus(placeIds: readonly number[], status: string): Promise<RoomTypeRow[]> {
  if (placeIds.length === 0) return [];
  return query<RoomTypeRow>('SELECT * FROM room_type WHERE place_id = ANY($1) AND status = $2 ORDER BY id', [placeIds, status]);
}

export async function roomTypesByIds(ids: readonly number[]): Promise<RoomTypeRow[]> {
  if (ids.length === 0) return [];
  return query<RoomTypeRow>('SELECT * FROM room_type WHERE id = ANY($1) ORDER BY id', [ids]);
}

export async function insertRoomType(data: Partial<RoomTypeRow> & Pick<RoomTypeRow, 'placeId' | 'name' | 'maxOccupancy' | 'totalRoomCount'>): Promise<RoomTypeRow> {
  const now = nowLocal();
  return insertRow<RoomTypeRow>('room_type', { privateBathroom: 'UNVERIFIED', status: 'ACTIVE', createdAt: now, updatedAt: now, ...data });
}

export async function updateRoomType(id: number, patch: Partial<RoomTypeRow>): Promise<RoomTypeRow | null> {
  return updateRow<RoomTypeRow>('room_type', id, { ...patch, updatedAt: nowLocal() });
}

/** Ảnh của nhiều loại phòng: mỗi dòng {id: roomTypeId, value: url}, ảnh COVER đứng đầu. */
export async function roomImageUrls(roomTypeIds: readonly number[]): Promise<Array<{ id: number; value: string }>> {
  if (roomTypeIds.length === 0) return [];
  return query(
    `SELECT rtm.room_type_id AS id, ma.public_url AS value FROM room_type_media rtm JOIN media_asset ma ON ma.id = rtm.media_id
      WHERE rtm.room_type_id = ANY($1)
      ORDER BY rtm.room_type_id, CASE WHEN rtm.role = 'COVER' THEN 0 ELSE 1 END, rtm.sort_order ASC`,
    [roomTypeIds],
  );
}

/** Tên tiện ích (YES) của nhiều loại phòng: mỗi dòng {id: roomTypeId, value: tên}. */
export async function roomAmenityNames(roomTypeIds: readonly number[]): Promise<Array<{ id: number; value: string }>> {
  if (roomTypeIds.length === 0) return [];
  return query(
    `SELECT ra.room_type_id AS id, a.name AS value FROM room_amenity ra JOIN amenity a ON a.id = ra.amenity_id
      WHERE ra.room_type_id = ANY($1) AND ra.value = 'YES' ORDER BY ra.room_type_id, a.sort_order`,
    [roomTypeIds],
  );
}

// ---- Tồn phòng theo ngày ------------------------------------------------------------------------------------------

/** Đọc tồn kho (không khóa) của nhiều loại phòng trong [start, end). */
export async function inventoryForRooms(roomTypeIds: readonly number[], start: string, end: string): Promise<InventoryDayRow[]> {
  if (roomTypeIds.length === 0) return [];
  return query<InventoryDayRow>(
    'SELECT * FROM room_inventory_day WHERE room_type_id = ANY($1) AND stay_date >= $2 AND stay_date < $3',
    [roomTypeIds, start, end],
  );
}

/** Khóa ghi và đọc toàn bộ tồn kho của một loại phòng trong [start, end) — một câu duy nhất. */
export async function inventoryForUpdate(roomTypeId: number, start: string, end: string): Promise<InventoryDayRow[]> {
  return query<InventoryDayRow>(
    'SELECT * FROM room_inventory_day WHERE room_type_id = $1 AND stay_date >= $2 AND stay_date < $3 ORDER BY stay_date FOR UPDATE',
    [roomTypeId, start, end],
  );
}

export async function inventoryRange(roomTypeId: number, start: string, end: string): Promise<InventoryDayRow[]> {
  return query<InventoryDayRow>(
    'SELECT * FROM room_inventory_day WHERE room_type_id = $1 AND stay_date >= $2 AND stay_date < $3 ORDER BY stay_date',
    [roomTypeId, start, end],
  );
}

export async function upsertInventoryDay(
  roomTypeId: number,
  stayDate: string,
  v: { totalRooms: number; heldRooms: number; confirmedRooms: number; stopSell: boolean; blockReason: string | null },
): Promise<void> {
  await exec(
    `INSERT INTO room_inventory_day (room_type_id, stay_date, total_rooms, held_rooms, confirmed_rooms, stop_sell, block_reason, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (room_type_id, stay_date) DO UPDATE SET total_rooms = EXCLUDED.total_rooms, held_rooms = EXCLUDED.held_rooms,
       confirmed_rooms = EXCLUDED.confirmed_rooms, stop_sell = EXCLUDED.stop_sell, block_reason = EXCLUDED.block_reason,
       updated_at = EXCLUDED.updated_at`,
    [roomTypeId, stayDate, v.totalRooms, v.heldRooms, v.confirmedRooms, v.stopSell, v.blockReason, nowLocal()],
  );
}

/** Ghi nhiều ngày tồn kho của một loại phòng trong MỘT câu (các dòng đã khóa / vừa tạo trong transaction). */
export async function upsertInventoryDays(
  roomTypeId: number,
  days: ReadonlyArray<{ stayDate: string; totalRooms: number; heldRooms: number; confirmedRooms: number; stopSell: boolean; blockReason: string | null }>,
): Promise<void> {
  if (days.length === 0) return;
  await exec(
    `INSERT INTO room_inventory_day (room_type_id, stay_date, total_rooms, held_rooms, confirmed_rooms, stop_sell, block_reason, updated_at)
     SELECT $1, x.d, x.t, x.h, x.c, x.s, x.r, $8
       FROM unnest($2::date[], $3::int[], $4::int[], $5::int[], $6::boolean[], $7::text[]) AS x(d, t, h, c, s, r)
     ON CONFLICT (room_type_id, stay_date) DO UPDATE SET total_rooms = EXCLUDED.total_rooms, held_rooms = EXCLUDED.held_rooms,
       confirmed_rooms = EXCLUDED.confirmed_rooms, stop_sell = EXCLUDED.stop_sell, block_reason = EXCLUDED.block_reason,
       updated_at = EXCLUDED.updated_at`,
    [
      roomTypeId,
      days.map((d) => d.stayDate),
      days.map((d) => d.totalRooms),
      days.map((d) => d.heldRooms),
      days.map((d) => d.confirmedRooms),
      days.map((d) => d.stopSell),
      days.map((d) => d.blockReason),
      nowLocal(),
    ],
  );
}

export interface SpecialPriceRow {
  id: number;
  roomTypeId: number;
  name: string;
  periodStart: string;
  periodEnd: string;
  price: number;
}

/** Giá đặc biệt giao với [start, end) (period_end tính cả ngày cuối), theo thứ tự tạo — bản ghi sau đè bản ghi trước. */
export async function specialPricesOverlapping(roomTypeId: number, start: string, end: string): Promise<SpecialPriceRow[]> {
  return query<SpecialPriceRow>(
    'SELECT * FROM room_special_price WHERE room_type_id = $1 AND period_start < $3 AND period_end >= $2 ORDER BY id',
    [roomTypeId, start, end],
  );
}

export interface DisabledDayRow {
  roomTypeId: number;
  stayDate: string;
  totalRooms: number;
  stopSell: boolean;
  capacity: number;
}

/** Ngày khách không đặt hết được: ngừng bán, hoặc chủ nhà khóa bớt phòng (total_rooms nhỏ hơn số phòng của loại phòng). Cả hai đầu mút. */
export async function disabledDaysByRoomType(roomTypeId: number, start: string, end: string): Promise<DisabledDayRow[]> {
  return query<DisabledDayRow>(
    `SELECT r.room_type_id, r.stay_date, r.total_rooms, r.stop_sell, rt.total_room_count AS capacity
       FROM room_inventory_day r JOIN room_type rt ON rt.id = r.room_type_id
      WHERE r.room_type_id = $1 AND r.stay_date >= $2 AND r.stay_date <= $3 AND (r.stop_sell = TRUE OR r.total_rooms < rt.total_room_count)`,
    [roomTypeId, start, end],
  );
}

export async function disabledDaysByPlace(placeId: number, start: string, end: string): Promise<DisabledDayRow[]> {
  return query<DisabledDayRow>(
    `SELECT r.room_type_id, r.stay_date, r.total_rooms, r.stop_sell, rt.total_room_count AS capacity
       FROM room_inventory_day r JOIN room_type rt ON rt.id = r.room_type_id
      WHERE rt.place_id = $1 AND r.stay_date >= $2 AND r.stay_date <= $3 AND (r.stop_sell = TRUE OR r.total_rooms < rt.total_room_count)`,
    [placeId, start, end],
  );
}

// ---- Hồ sơ homestay -------------------------------------------------------------------------------------------------

export async function homestayProfile(placeId: number): Promise<HomestayProfileRow | null> {
  return one<HomestayProfileRow>('SELECT * FROM homestay_profile WHERE place_id = $1', [placeId]);
}

export async function homestayProfiles(placeIds: readonly number[]): Promise<HomestayProfileRow[]> {
  if (placeIds.length === 0) return [];
  return query<HomestayProfileRow>('SELECT * FROM homestay_profile WHERE place_id = ANY($1)', [placeIds]);
}

/** Homestay của mã QR nhận phòng — chỉ các cột trang quét mã cần. */
export interface CheckinPlaceView {
  id: number;
  name: string;
  address: string | null;
  kind: string;
  isDeleted: boolean;
  checkinCode: string | null;
}

export async function findCheckinPlaceByCode(code: string): Promise<CheckinPlaceView | null> {
  return one<CheckinPlaceView>(
    `SELECT p.id, p.name, p.address, p.kind, p.is_deleted, h.checkin_code FROM homestay_profile h JOIN place p ON p.id = h.place_id WHERE h.checkin_code = $1`,
    [code],
  );
}

export async function findCheckinPlaceById(id: number): Promise<CheckinPlaceView | null> {
  return one<CheckinPlaceView>(
    `SELECT p.id, p.name, p.address, p.kind, p.is_deleted, h.checkin_code FROM place p LEFT JOIN homestay_profile h ON h.place_id = p.id WHERE p.id = $1`,
    [id],
  );
}

export async function existsCheckinCode(code: string): Promise<boolean> {
  return (await one<{ n: number }>('SELECT count(*) AS n FROM homestay_profile WHERE checkin_code = $1', [code]))?.n === 1;
}

/** Gán mã QR cho homestay CHƯA có mã. Trả 0 khi đã có mã hoặc chưa có hồ sơ homestay. */
export async function assignCheckinCode(placeId: number, code: string): Promise<number> {
  return exec('UPDATE homestay_profile SET checkin_code = $2 WHERE place_id = $1 AND checkin_code IS NULL', [placeId, code]);
}

export async function policyById(id: number): Promise<CancellationPolicyRow | null> {
  return one<CancellationPolicyRow>('SELECT * FROM cancellation_policy WHERE id = $1', [id]);
}

/** Dịch vụ thêm của homestay; onlyActive = chỉ dịch vụ đang cung cấp. */
export async function serviceOffers(placeId: number, onlyActive: boolean): Promise<HomestayServiceOfferRow[]> {
  return query<HomestayServiceOfferRow>(
    `SELECT * FROM homestay_service_offer WHERE place_id = $1 AND ($2::boolean = FALSE OR active = TRUE) ORDER BY id`,
    [placeId, onlyActive],
  );
}

// ---- Quản trị loại phòng của NCC -------------------------------------------------------------------------------------------

export interface RoomBedRow {
  id: number;
  roomTypeId: number;
  bedType: string;
  quantity: number;
}

export async function bedsOf(roomTypeIds: readonly number[]): Promise<RoomBedRow[]> {
  if (roomTypeIds.length === 0) return [];
  return query<RoomBedRow>('SELECT * FROM room_bed WHERE room_type_id = ANY($1) ORDER BY id', [roomTypeIds]);
}

/** Mã tiện nghi (value = YES) của nhiều loại phòng. */
export async function yesAmenityIds(roomTypeIds: readonly number[]): Promise<Array<{ roomTypeId: number; amenityId: number }>> {
  if (roomTypeIds.length === 0) return [];
  return query(`SELECT room_type_id, amenity_id FROM room_amenity WHERE room_type_id = ANY($1) AND value = 'YES'`, [roomTypeIds]);
}

/** Mọi tiện nghi đã gắn với loại phòng (mọi giá trị). */
export async function attachedAmenityIds(roomTypeId: number): Promise<number[]> {
  const rows = await query<{ amenityId: number }>('SELECT amenity_id FROM room_amenity WHERE room_type_id = $1', [roomTypeId]);
  return rows.map((r) => r.amenityId);
}

export async function amenitiesByIds(ids: readonly number[]): Promise<AmenityRow[]> {
  if (ids.length === 0) return [];
  return query<AmenityRow>('SELECT * FROM amenity WHERE id = ANY($1)', [ids]);
}

export async function countRoomsNamed(placeId: number, lowerName: string, excludeId: number | null): Promise<number> {
  return (
    (await scalar<number>('SELECT count(*) FROM room_type WHERE place_id = $1 AND lower(name) = $2 AND ($3::bigint IS NULL OR id <> $3)', [placeId, lowerName, excludeId])) ?? 0
  );
}

export async function futureInventory(roomTypeId: number, fromDate: string): Promise<InventoryDayRow[]> {
  return query<InventoryDayRow>('SELECT * FROM room_inventory_day WHERE room_type_id = $1 AND stay_date >= $2 ORDER BY stay_date FOR UPDATE', [roomTypeId, fromDate]);
}

export async function replaceBeds(roomTypeId: number, beds: ReadonlyArray<{ bedType: string; quantity: number }>): Promise<void> {
  await exec('DELETE FROM room_bed WHERE room_type_id = $1', [roomTypeId]);
  for (const b of beds) await exec('INSERT INTO room_bed (room_type_id, bed_type, quantity) VALUES ($1,$2,$3)', [roomTypeId, b.bedType, b.quantity]);
}

export async function replaceRoomAmenities(roomTypeId: number, amenityIds: readonly number[]): Promise<void> {
  await exec('DELETE FROM room_amenity WHERE room_type_id = $1', [roomTypeId]);
  for (const id of amenityIds) await exec(`INSERT INTO room_amenity (room_type_id, amenity_id, value) VALUES ($1,$2,'YES')`, [roomTypeId, id]);
}

/** Giá tham khảo [min, max] của các loại phòng đang mở bán của Homestay (null khi chưa có). */
export async function activePriceRange(placeId: number): Promise<{ min: number | null; max: number | null }> {
  const row = await one<{ min: number | null; max: number | null }>(`SELECT min(base_price) AS min, max(base_price) AS max FROM room_type WHERE place_id = $1 AND status = 'ACTIVE'`, [placeId]);
  return { min: row?.min ?? null, max: row?.max ?? null };
}

export interface SpecialPriceFull extends SpecialPriceRow {
  createdAt: string;
  createdBy: number | null;
}

export const specialPricesOf = (roomTypeId: number) => query<SpecialPriceFull>('SELECT * FROM room_special_price WHERE room_type_id = $1 ORDER BY period_start, id', [roomTypeId]);

export const specialPriceById = (id: number) => one<SpecialPriceFull>('SELECT * FROM room_special_price WHERE id = $1', [id]);

export async function countPriceOverlap(roomTypeId: number, start: string, end: string, excludeId: number | null): Promise<number> {
  return (
    (await scalar<number>(
      'SELECT count(*) FROM room_special_price WHERE room_type_id = $1 AND period_start <= $3 AND period_end >= $2 AND ($4::bigint IS NULL OR id <> $4)',
      [roomTypeId, start, end, excludeId],
    )) ?? 0
  );
}

export const insertSpecialPrice = (roomTypeId: number, name: string, start: string, end: string, price: number, createdBy: number | null) =>
  insertRow<SpecialPriceFull>('room_special_price', { roomTypeId, name, periodStart: start, periodEnd: end, price, createdAt: nowLocal(), createdBy });

export const updateSpecialPrice = (id: number, name: string, start: string, end: string, price: number) =>
  updateRow<SpecialPriceFull>('room_special_price', id, { name, periodStart: start, periodEnd: end, price });

export const deleteSpecialPrice = (id: number) => exec('DELETE FROM room_special_price WHERE id = $1', [id]);

export interface UnitDayRow {
  roomTypeId: number;
  stayDate: string;
  unitNo: number;
  state: 'GUEST' | 'LOCKED';
}

export async function unitDays(roomTypeIds: readonly number[], start: string, end: string): Promise<UnitDayRow[]> {
  if (roomTypeIds.length === 0) return [];
  return query<UnitDayRow>('SELECT * FROM room_unit_day WHERE room_type_id = ANY($1) AND stay_date >= $2 AND stay_date < $3', [roomTypeIds, start, end]);
}

export const unitDaysOf = (roomTypeId: number, date: string) => query<UnitDayRow>('SELECT * FROM room_unit_day WHERE room_type_id = $1 AND stay_date = $2', [roomTypeId, date]);

export const deleteUnitDay = (roomTypeId: number, date: string, unitNo: number) =>
  exec('DELETE FROM room_unit_day WHERE room_type_id = $1 AND stay_date = $2 AND unit_no = $3', [roomTypeId, date, unitNo]);

export const upsertUnitDay = (roomTypeId: number, date: string, unitNo: number, state: string) =>
  exec(
    `INSERT INTO room_unit_day (room_type_id, stay_date, unit_no, state) VALUES ($1,$2,$3,$4)
     ON CONFLICT (room_type_id, stay_date, unit_no) DO UPDATE SET state = EXCLUDED.state`,
    [roomTypeId, date, unitNo, state],
  );

/** Đơn còn hiệu lực (chưa trả phòng) của loại phòng, theo ngày nhận phòng: chỉ ngày ở và số phòng. */
export const upcomingStaysOf = (roomTypeId: number, today: string) =>
  query<{ checkIn: string; checkOut: string; roomCount: number }>(
    `SELECT b.check_in, b.check_out, r.room_count FROM booking_room r JOIN booking b ON b.id = r.booking_id
      WHERE r.room_type_id = $1 AND b.check_out > $2 AND b.status IN ('PENDING','CONFIRMED','PAID') ORDER BY b.check_in, b.id`,
    [roomTypeId, today],
  );
