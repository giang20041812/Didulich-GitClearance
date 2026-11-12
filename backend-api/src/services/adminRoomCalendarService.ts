import { query } from '../db/pool.js';
import { HttpError } from '../lib/errors.js';
import { addDays, daysBetween } from '../lib/time.js';
import * as placeRepo from '../repositories/placeRepo.js';
import * as rooms from '../repositories/roomRepo.js';
import type { InventoryDayRow, UnitDayRow } from '../repositories/roomRepo.js';
import { sellingFirst } from './partnerRoomService.js';
import { validateDates } from './roomCalendarService.js';
import { assign } from './roomUnitService.js';

/**
 * Lịch phòng trống cho Admin (chỉ xem), dạng bảng nhiều ngày: mỗi loại phòng (gom theo homestay) × mỗi đêm là số phòng còn lại.
 * Không sửa gì bên NCC — chỉ đọc cùng các bảng và xếp phòng bằng chính {@link assign}, nên số phòng trống của Admin trùng với số
 * ô xanh chủ nhà đang thấy.
 */

const MAX_DAYS = 31;

function checkRange(start: string, end: string): void {
  validateDates(start, end);
  if (daysBetween(start, end) > MAX_DAYS) throw new HttpError(400, `Mỗi lần chỉ xem tối đa ${MAX_DAYS} ngày.`);
}

export async function homestays() {
  return query<{ id: number; name: string; providerName: string | null; regionName: string | null; visibility: string | null }>(
    `SELECT p.id, p.name, pr.name AS provider_name, r.name AS region_name, p.visibility
       FROM place p LEFT JOIN provider pr ON pr.id = p.provider_id LEFT JOIN region r ON r.id = p.region_id
      WHERE p.kind = 'HOMESTAY' ORDER BY p.name`,
  );
}

async function inventoryMaps(ids: number[], start: string, end: string) {
  const days = new Map<string, InventoryDayRow>();
  for (const d of await rooms.inventoryForRooms(ids, start, end)) days.set(`${d.roomTypeId}|${d.stayDate}`, d);
  const stored = new Map<string, UnitDayRow[]>();
  for (const u of await rooms.unitDays(ids, start, end)) {
    const key = `${u.roomTypeId}|${u.stayDate}`;
    const list = stored.get(key);
    if (list) list.push(u);
    else stored.set(key, [u]);
  }
  return { days, stored };
}

function eachNight(start: string, end: string): string[] {
  const out: string[] = [];
  for (let d = start; d < end; d = addDays(d, 1)) out.push(d);
  return out;
}

/** Số phòng còn lại từng đêm trong [start, end) của mọi loại phòng đang bán. */
export async function calendar(start: string, end: string) {
  checkRange(start, end);
  const list = await query<{
    id: number;
    name: string;
    maxOccupancy: number | null;
    totalRoomCount: number;
    placeId: number;
    placeName: string;
    address: string | null;
    providerName: string | null;
    regionName: string | null;
  }>(
    `SELECT r.id, r.name, r.max_occupancy, r.total_room_count, p.id AS place_id, p.name AS place_name, p.address, pr.name AS provider_name, reg.name AS region_name
       FROM room_type r JOIN place p ON p.id = r.place_id LEFT JOIN provider pr ON pr.id = p.provider_id LEFT JOIN region reg ON reg.id = p.region_id
      WHERE p.kind = 'HOMESTAY' AND p.is_deleted = FALSE AND r.status = 'ACTIVE' ORDER BY p.name, r.id`,
  );
  if (list.length === 0) return [];
  const { days, stored } = await inventoryMaps(
    list.map((r) => r.id),
    start,
    end,
  );
  const nights = eachNight(start, end);
  const places = new Map<number, { placeId: number; name: string; providerName: string | null; regionName: string | null; address: string | null; rooms: unknown[] }>();
  for (const room of list) {
    let place = places.get(room.placeId);
    if (!place) {
      place = { placeId: room.placeId, name: room.placeName, providerName: room.providerName, regionName: room.regionName, address: room.address, rooms: [] };
      places.set(room.placeId, place);
    }
    const cells = nights.map((date) => {
      const units = assign(room.totalRoomCount, days.get(`${room.id}|${date}`), stored.get(`${room.id}|${date}`) ?? []);
      const count = (state: string) => units.filter((u) => u === state).length;
      return { date, free: count('FREE'), held: count('HELD'), booked: count('GUEST'), locked: count('LOCKED') };
    });
    place.rooms.push({ roomTypeId: room.id, name: room.name, maxOccupancy: room.maxOccupancy ?? 0, totalRooms: room.totalRoomCount, days: cells });
  }
  return [...places.values()];
}

/**
 * Lịch từng phòng (P.1, P.2...) của mọi loại phòng trong một Homestay, [start, end) — giống màn hình Lịch phòng của NCC nhưng không
 * kiểm tra chủ sở hữu (Admin xem được mọi Homestay). Loại phòng đang bán lên trước.
 */
export async function units(placeId: number, start: string, end: string) {
  checkRange(start, end);
  const place = await placeRepo.findById(placeId);
  if (!place || place.kind !== 'HOMESTAY') throw new HttpError(404, 'Không tìm thấy homestay.');
  const list = sellingFirst(await rooms.roomTypesByPlace(placeId));
  if (list.length === 0) return { placeId, rooms: [] };
  const { days, stored } = await inventoryMaps(
    list.map((r) => r.id),
    start,
    end,
  );
  const nights = eachNight(start, end);
  return {
    placeId,
    rooms: list.map((room) => ({
      id: room.id,
      name: room.name,
      totalRoomCount: room.totalRoomCount,
      status: room.status,
      days: nights.map((date) => ({ stayDate: date, units: assign(room.totalRoomCount, days.get(`${room.id}|${date}`), stored.get(`${room.id}|${date}`) ?? []) })),
    })),
  };
}
