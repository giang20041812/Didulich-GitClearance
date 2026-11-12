import { tx } from '../db/pool.js';
import { HttpError } from '../lib/errors.js';
import { addDays, daysBetween, eachDay, today } from '../lib/time.js';
import * as partner from '../repositories/partnerRepo.js';
import * as rooms from '../repositories/roomRepo.js';
import type { InventoryDayRow, UnitDayRow } from '../repositories/roomRepo.js';
import type { UserPrincipal } from '../security/principal.js';
import * as calendar from './roomCalendarService.js';
import { actor as actorOf, bad, namesOf, owned } from './partnerHomestayService.js';
import { MAX_AVAILABILITY_DAYS, ownedRoom, sellingFirst } from './partnerRoomService.js';

/**
 * Lịch phòng theo từng phòng (Phòng 1, Phòng 2...): chủ nhà bấm một ô để khóa / mở đúng phòng đó trong một ngày. Số lượng bán
 * vẫn nằm ở room_inventory_day (total_rooms = tổng phòng − số phòng khóa) nên luồng đặt phòng không đổi; bảng room_unit_day chỉ
 * nhớ vị trí để ô vừa bấm là ô đổi màu và các ô khác đứng yên.
 */

/** GUEST = khách đã được xác nhận, HELD = khách đang giữ phòng (đơn chờ chủ nhà xác nhận). Cả hai lưu vị trí là GUEST. */
const FREE = 'FREE';
const GUEST = 'GUEST';
const HELD = 'HELD';
const LOCKED = 'LOCKED';

export interface UnitInput {
  stayDate: string;
  locked: boolean;
}

/** Lịch từng phòng của mọi loại phòng trong Homestay, [start, end). */
export async function units(principal: UserPrincipal | undefined, placeId: number, start: string, end: string) {
  await owned(placeId, await actorOf(principal, false), false);
  return unitsOf(placeId, start, end);
}

/**
 * Mở trang Lịch phòng trong một lượt gọi: danh sách Homestay + lịch của Homestay đang xem. Homestay đang xem = id đầu tiên trong
 * `prefer` thuộc NCC này (đường dẫn, lựa chọn lần trước), không có thì Homestay đầu tiên — cùng quy tắc với frontend.
 */
export async function bootstrap(principal: UserPrincipal | undefined, prefer: number[] | undefined, start: string, end: string) {
  const names = await namesOf(await actorOf(principal, false));
  const ownedIds = new Set(names.map((n) => n.id));
  const placeId = (prefer ?? []).find((id) => ownedIds.has(id)) ?? (names.length === 0 ? null : names[0].id);
  // Quyền sở hữu đã xác định qua danh sách trên: không cần nạp lại Place.
  return { homestays: names, placeId, units: placeId == null ? null : await unitsOf(placeId, start, end) };
}

async function unitsOf(placeId: number, start: string, end: string) {
  calendar.validateDates(start, end);
  if (daysBetween(start, end) > MAX_AVAILABILITY_DAYS) throw bad(`Mỗi lần chỉ xem tối đa ${MAX_AVAILABILITY_DAYS} ngày.`);
  // Loại phòng đang bán lên trước, cùng trạng thái thì theo thứ tự tạo.
  const list = sellingFirst(await rooms.roomTypesByPlace(placeId));
  if (list.length === 0) return { placeId, rooms: [] };
  const ids = list.map((r) => r.id);
  const days = new Map<string, InventoryDayRow>();
  for (const d of await rooms.inventoryForRooms(ids, start, end)) days.set(`${d.roomTypeId}|${d.stayDate}`, d);
  const stored = new Map<string, UnitDayRow[]>();
  for (const u of await rooms.unitDays(ids, start, end)) {
    const key = `${u.roomTypeId}|${u.stayDate}`;
    const list2 = stored.get(key);
    if (list2) list2.push(u);
    else stored.set(key, [u]);
  }
  const result = list.map((room) => ({
    id: room.id,
    name: room.name,
    totalRoomCount: room.totalRoomCount,
    status: room.status,
    days: eachDay(start, end).map((date) => ({
      stayDate: date,
      units: assign(room.totalRoomCount, days.get(`${room.id}|${date}`), stored.get(`${room.id}|${date}`) ?? []),
    })),
  }));
  return { placeId, rooms: result };
}

/**
 * Khóa / mở một phòng trong một ngày. Mở một phòng của ngày đang ngừng bán: bỏ ngừng bán, các phòng khác giữ nguyên trạng thái
 * khóa. Khóa phòng đang hiển thị có khách: khách chỉ được tính theo số lượng của loại phòng (đơn không gắn với P.1, P.2...), nên
 * chuyển khách sang phòng trống số nhỏ nhất rồi khóa phòng này — đơn và số phòng bán không đổi. Hết phòng trống thì 409: chủ nhà
 * phải xử lý đơn trước (đổi ngày / hủy đơn), không bao giờ tự hủy đơn của khách.
 */
export function setUnit(principal: UserPrincipal | undefined, placeId: number, roomId: number, unitNo: number, input: UnitInput) {
  return tx(async () => {
    const account = await actorOf(principal, true);
    const room = await ownedRoom(account, placeId, roomId, true);
    const date = input.stayDate;
    if (date < today()) throw bad('Không sửa lịch của ngày đã qua.');
    const capacity = room.totalRoomCount;
    if (unitNo < 1 || unitNo > capacity) throw new HttpError(404, 'Không tìm thấy phòng.');
    const [day] = await calendar.lockedDays(room, date, addDays(date, 1));
    const stored = await rooms.unitDaysOf(roomId, date);
    const units = assign(capacity, day, stored);
    const current = units[unitNo - 1];
    let movedTo = 0;
    if (current === GUEST || current === HELD) {
      if (!input.locked) throw new HttpError(409, 'Phòng này đang có khách.');
      const free = units.indexOf(FREE);
      if (free < 0) {
        throw new HttpError(409, 'Ngày này không còn phòng trống để chuyển khách sang. Muốn khóa phòng này, bạn cần xử lý đơn của khách trước (đổi ngày hoặc hủy đơn).');
      }
      units[free] = current;
      movedTo = free + 1;
    }
    if (input.locked === (current === LOCKED)) return { stayDate: date, units };
    units[unitNo - 1] = input.locked ? LOCKED : FREE;
    if (movedTo > 0) label(units, day.confirmedRooms);
    const locked = units.filter((u) => u === LOCKED).length;
    // Khóa thêm chỉ xảy ra khi ngày đang bán (ngày ngừng bán thì phòng đã LOCKED ở trên); mở thì luôn bán lại.
    day.stopSell = false;
    day.totalRooms = capacity - locked;
    if (locked === 0) day.blockReason = null;
    await rooms.upsertInventoryDays(room.id, [day]);
    await save(roomId, date, units, stored);
    const after: Record<string, unknown> = { stayDate: date, unitNo };
    if (movedTo > 0) after.guestMovedTo = movedTo;
    await partner.recordAudit(account.id, input.locked ? 'UNIT_LOCK' : 'UNIT_UNLOCK', partner.ROOM_TYPE, roomId, null, null, after);
    return { stayDate: date, units };
  });
}

/**
 * Trạng thái từng phòng của một ngày. Số lượng lấy từ lịch bán: khách = giữ chỗ + đã xác nhận, khóa = tổng phòng − số phòng đang
 * bán. Vị trí lấy từ các dòng đã lưu; phần chưa có vị trí (khách mới đặt, khóa theo số lượng từ màn hình khác) xếp khách vào
 * phòng trống số nhỏ nhất, phòng khóa vào phòng trống số lớn nhất. Trong các phòng có khách: số nhỏ là khách đã xác nhận (GUEST),
 * phần còn lại là khách đang giữ phòng (HELD). Ngày ngừng bán: mọi phòng không có khách đều khóa.
 */
export function assign(capacity: number, day: InventoryDayRow | undefined, stored: UnitDayRow[]): string[] {
  const units: string[] = new Array<string>(capacity).fill(FREE);
  let guests = day ? Math.max(0, Math.min(capacity, day.heldRooms + day.confirmedRooms)) : 0;
  let locks = day ? Math.max(0, Math.min(capacity - guests, capacity - day.totalRooms)) : 0;
  const placed = stored.filter((u) => u.unitNo >= 1 && u.unitNo <= capacity).sort((a, b) => a.unitNo - b.unitNo);
  for (const u of placed) {
    if (locks > 0 && u.state === LOCKED) {
      units[u.unitNo - 1] = LOCKED;
      locks--;
    }
  }
  for (const u of placed) {
    if (guests > 0 && u.state === GUEST) {
      units[u.unitNo - 1] = GUEST;
      guests--;
    }
  }
  for (let i = 0; i < capacity && guests > 0; i++) {
    if (units[i] === FREE) {
      units[i] = GUEST;
      guests--;
    }
  }
  for (let i = capacity - 1; i >= 0 && locks > 0; i--) {
    if (units[i] === FREE) {
      units[i] = LOCKED;
      locks--;
    }
  }
  if (day && day.stopSell === true) for (let i = 0; i < capacity; i++) if (units[i] === FREE) units[i] = LOCKED;
  label(units, day ? day.confirmedRooms : 0);
  return units;
}

/** Trong các phòng có khách: `confirmed` phòng số nhỏ nhất là GUEST (đã xác nhận), còn lại HELD (đang giữ). */
function label(units: string[], confirmed: number): void {
  let left = Math.max(0, confirmed);
  for (let i = 0; i < units.length; i++) if (units[i] === GUEST || units[i] === HELD) units[i] = left-- > 0 ? GUEST : HELD;
}

/** Lưu vị trí sau khi khóa / mở: mỗi phòng không trống một dòng, phòng trống (hoặc vượt số phòng hiện có) thì xóa dòng. */
async function save(roomId: number, date: string, units: string[], stored: UnitDayRow[]): Promise<void> {
  for (const row of stored) {
    if (row.unitNo < 1 || row.unitNo > units.length || units[row.unitNo - 1] === FREE) await rooms.deleteUnitDay(roomId, date, row.unitNo);
  }
  for (let i = 0; i < units.length; i++) {
    if (units[i] === FREE) continue;
    await rooms.upsertUnitDay(roomId, date, i + 1, units[i] === HELD ? GUEST : units[i]);
  }
}
