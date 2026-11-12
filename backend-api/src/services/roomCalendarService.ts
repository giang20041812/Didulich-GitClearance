import { HttpError, IllegalStateError } from '../lib/errors.js';
import { daysBetween, eachDay, isoDayOfWeek } from '../lib/time.js';
import * as rooms from '../repositories/roomRepo.js';
import type { InventoryDayRow, RoomTypeRow } from '../repositories/roomRepo.js';

/**
 * Lịch bán phòng: giá từng đêm, tồn kho theo ngày, giữ / trả / xác nhận phòng. Mọi hàm ghi yêu cầu bên gọi đã khóa dòng
 * loại phòng (RoomType) trước — với đơn nhiều loại phòng thì khóa theo id tăng dần — để mọi luồng giữ / trả phòng khóa
 * cùng một thứ tự (không deadlock).
 */

export interface InventoryDto {
  stayDate: string;
  totalRooms: number;
  heldRooms: number;
  confirmedRooms: number;
  availableRooms: number;
  stopSell: boolean;
  price: number;
  blockReason: string | null;
}

export interface QuoteDto {
  roomTypeId: number;
  availableRooms: number;
  suitable: boolean;
  totalAmount: number;
  nights: InventoryDto[];
}

export function validateDates(start: string | null | undefined, end: string | null | undefined): void {
  if (!start || !end || end <= start || daysBetween(start, end) > 366) {
    throw new HttpError(400, 'Khoảng ngày phải từ 1 đến 366 đêm, không tính ngày trả phòng.');
  }
}

/** Giá từng đêm [start, end): giá gốc, giá cuối tuần (thứ Bảy / Chủ nhật), rồi giá đặc biệt (bản ghi sau đè bản ghi trước). */
export async function calendar(room: RoomTypeRow, start: string, end: string): Promise<InventoryDto[]> {
  validateDates(start, end);
  const days = new Map<string, InventoryDayRow>();
  for (const d of await rooms.inventoryRange(room.id, start, end)) days.set(d.stayDate, d);
  const prices = await rooms.specialPricesOverlapping(room.id, start, end);
  const result: InventoryDto[] = [];
  for (const date of eachDay(start, end)) {
    const d = days.get(date);
    const total = d ? d.totalRooms : room.totalRoomCount;
    const held = d ? d.heldRooms : 0;
    const confirmed = d ? d.confirmedRooms : 0;
    const stopped = room.status !== 'ACTIVE' || (d != null && d.stopSell === true);
    let price: number | null = room.basePrice;
    const dow = isoDayOfWeek(date);
    if (room.weekendPrice != null && (dow === 6 || dow === 7)) price = room.weekendPrice;
    for (const p of prices) if (date >= p.periodStart && date <= p.periodEnd) price = p.price;
    if (price == null) throw new HttpError(409, 'Loại phòng chưa có giá.');
    result.push({
      stayDate: date,
      totalRooms: total,
      heldRooms: held,
      confirmedRooms: confirmed,
      availableRooms: stopped ? 0 : Math.max(0, total - held - confirmed),
      stopSell: stopped,
      price,
      blockReason: d ? d.blockReason : null,
    });
  }
  return result;
}

/**
 * Tồn kho các đêm [start, end) của một loại phòng, đã khóa ghi (một câu SELECT ... FOR UPDATE), có sẵn dòng (chưa lưu) cho
 * đêm chưa có. Trả về theo thứ tự ngày.
 */
export async function lockedDays(room: RoomTypeRow, start: string, end: string): Promise<InventoryDayRow[]> {
  const existing = new Map<string, InventoryDayRow>();
  for (const d of await rooms.inventoryForUpdate(room.id, start, end)) existing.set(d.stayDate, d);
  return eachDay(start, end).map(
    (date) =>
      existing.get(date) ?? {
        roomTypeId: room.id,
        stayDate: date,
        totalRooms: room.totalRoomCount,
        heldRooms: 0,
        confirmedRooms: 0,
        stopSell: false,
        blockReason: null,
        availableRooms: room.totalRoomCount,
        updatedAt: '',
      },
  );
}

async function save(room: RoomTypeRow, days: InventoryDayRow[]): Promise<void> {
  await rooms.upsertInventoryDays(room.id, days);
}

/** Giữ `count` phòng mọi đêm [start, end) cho đơn chờ xác nhận; thiếu phòng / ngừng bán thì 409 (không đổi gì). */
export async function hold(room: RoomTypeRow, start: string, end: string, count: number): Promise<void> {
  const days = await lockedDays(room, start, end);
  for (const day of days) {
    if (day.stopSell) throw new IllegalStateError(`${room.name} đã tạm ngừng nhận khách vào ngày ${day.stayDate}.`);
    const available = day.totalRooms - day.heldRooms - day.confirmedRooms;
    if (available < count) throw new IllegalStateError(`${room.name}: ngày ${day.stayDate} chỉ còn ${Math.max(0, available)} phòng.`);
  }
  for (const day of days) day.heldRooms += count;
  await save(room, days);
}

async function adjust(room: RoomTypeRow, start: string, end: string, heldDelta: number, confirmedDelta: number): Promise<void> {
  const days = await lockedDays(room, start, end);
  for (const day of days) {
    day.heldRooms = Math.max(0, day.heldRooms + heldDelta);
    day.confirmedRooms = Math.max(0, day.confirmedRooms + confirmedDelta);
  }
  await save(room, days);
}

/** Trả `count` phòng đang giữ (đơn chờ xác nhận) về lịch bán, mọi đêm [start, end). */
export const releaseHeld = (room: RoomTypeRow, start: string, end: string, count: number) => adjust(room, start, end, -count, 0);

/** Trả `count` phòng đã xác nhận (đơn đã xác nhận / đã thanh toán) về lịch bán, mọi đêm [start, end). */
export const releaseConfirmed = (room: RoomTypeRow, start: string, end: string, count: number) => adjust(room, start, end, 0, -count);

/** Xác nhận đơn: `count` phòng chuyển từ đang giữ sang đã xác nhận, mọi đêm [start, end). */
export const confirmHeld = (room: RoomTypeRow, start: string, end: string, count: number) => adjust(room, start, end, -count, count);

export async function quote(room: RoomTypeRow, start: string, end: string, roomCount: number, guestCount: number): Promise<QuoteDto> {
  if (roomCount < 1 || guestCount < 1) throw new HttpError(400, 'Số phòng và số khách phải lớn hơn 0.');
  const days = await calendar(room, start, end);
  const available = days.length === 0 ? 0 : Math.min(...days.map((d) => d.availableRooms));
  return {
    roomTypeId: room.id,
    availableRooms: available,
    suitable: available >= roomCount,
    totalAmount: days.reduce((sum, d) => sum + d.price, 0) * roomCount,
    nights: days,
  };
}

