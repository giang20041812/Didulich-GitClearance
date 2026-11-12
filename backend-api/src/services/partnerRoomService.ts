import { tx } from '../db/pool.js';
import type { AmenityValue } from '../domain/enums.js';
import { HttpError } from '../lib/errors.js';
import { daysBetween, eachDay, today } from '../lib/time.js';
import type { AccountWithProvider } from '../repositories/accountRepo.js';
import * as partner from '../repositories/partnerRepo.js';
import * as placeRepo from '../repositories/placeRepo.js';
import * as rooms from '../repositories/roomRepo.js';
import type { InventoryDayRow, RoomTypeRow } from '../repositories/roomRepo.js';
import type { UserPrincipal } from '../security/principal.js';
import * as calendar from './roomCalendarService.js';
import { actor as actorOf, bad, owned, requireNotPublic } from './partnerHomestayService.js';

/** Màn hình Lịch phòng tải tối đa 14 ngày mỗi lần; trần này chỉ chặn truy vấn quá lớn. */
export const MAX_AVAILABILITY_DAYS = 93;

export interface BedDto {
  bedType: string;
  quantity: number;
}

export interface PhotoRef {
  imageId: string;
  url: string;
}

export interface RoomInput {
  name: string;
  description?: string | null;
  maxOccupancy: number;
  totalRoomCount: number;
  privateBathroom: AmenityValue;
  areaSqm?: number | null;
  basePrice: number;
  weekendPrice?: number | null;
  status: string;
  viewDescription?: string | null;
  beds: BedDto[];
  amenityIds: number[];
  otherAmenities?: string | null;
  photos?: PhotoRef[] | null;
}

export interface RoomDto {
  id: number;
  placeId: number;
  name: string;
  description: string | null;
  maxOccupancy: number;
  totalRoomCount: number;
  privateBathroom: AmenityValue;
  areaSqm: number | null;
  basePrice: number | null;
  weekendPrice: number | null;
  status: string;
  viewDescription: string | null;
  beds: BedDto[];
  amenityIds: number[];
  otherAmenities: string | null;
}

export interface PriceInput {
  name: string;
  periodStart: string;
  periodEnd: string;
  price: number;
}

export interface PriceDto {
  id: number;
  name: string;
  periodStart: string;
  periodEnd: string;
  price: number;
}

export interface ExpectedDay {
  stayDate: string;
  totalRooms: number;
  stopSell: boolean;
}

export interface InventoryInput {
  startDate: string;
  endDate: string;
  totalRooms: number;
  stopSell: boolean;
  reason?: string | null;
  expected?: ExpectedDay[] | null;
}

export interface RoomLockInput {
  startDate: string;
  endDate: string;
  lockedRooms?: number | null;
  closed: boolean;
  reason?: string | null;
  expected?: ExpectedDay[] | null;
}

export interface HomestayBlockInput {
  startDate: string;
  endDate: string;
  stopSell: boolean;
  reason?: string | null;
}

/** Lý do ngừng bán / khóa phòng không bắt buộc (chủ nhà không phải nhập gì); mở bán lại thì xóa lý do. */
function blockReason(blocking: boolean, reason: string | null | undefined): string | null {
  const clean = reason == null || reason.trim() === '' ? null : reason.trim();
  return blocking ? clean : null;
}

const plain = (n: number | null | undefined): string | null => (n == null ? null : String(n));

function roomSnapshot(r: RoomTypeRow): Record<string, unknown> {
  const m: Record<string, unknown> = {
    name: r.name,
    status: r.status,
    totalRoomCount: r.totalRoomCount,
    maxOccupancy: r.maxOccupancy,
    basePrice: plain(r.basePrice),
    weekendPrice: plain(r.weekendPrice),
  };
  if (r.otherAmenities != null) m.otherAmenities = r.otherAmenities;
  return m;
}

const priceSnapshot = (p: { name: string; periodStart: string; periodEnd: string; price: number | null }): Record<string, unknown> => ({
  name: p.name,
  periodStart: String(p.periodStart),
  periodEnd: String(p.periodEnd),
  price: plain(p.price),
});

/** Loại phòng thuộc Homestay của `account`; writing=true khóa dòng RoomType (thứ tự khóa: RoomType → RoomInventoryDay). */
export async function ownedRoom(account: AccountWithProvider, placeId: number, roomId: number, writing: boolean): Promise<RoomTypeRow> {
  await owned(placeId, account, false);
  const room = writing ? await rooms.lockRoomType(roomId) : await rooms.findRoomTypeById(roomId);
  if (!room) throw bad('Không tìm thấy loại phòng.');
  if (room.placeId !== placeId) throw new HttpError(404, 'Không tìm thấy loại phòng của Homestay.');
  return room;
}

export async function ownedByPrincipal(principal: UserPrincipal | undefined, placeId: number, roomId: number, writing: boolean): Promise<RoomTypeRow> {
  return ownedRoom(await actorOf(principal, writing), placeId, roomId, writing);
}

export async function options(principal: UserPrincipal | undefined) {
  await actorOf(principal, false);
  return (await partner.roomAmenityCatalog()).map((a) => ({ id: a.id, name: a.name }));
}

export async function list(principal: UserPrincipal | undefined, placeId: number): Promise<RoomDto[]> {
  return listAs(await actorOf(principal, false), placeId);
}

/** Danh sách loại phòng của Homestay thuộc NCC của `account` (dùng cả khi Admin đối chiếu yêu cầu thay đổi). */
export async function listAs(account: AccountWithProvider, placeId: number): Promise<RoomDto[]> {
  await owned(placeId, account, false);
  const list = await rooms.roomTypesByPlace(placeId);
  const ids = list.map((r) => r.id);
  if (ids.length === 0) return [];
  const [beds, amenities] = await Promise.all([rooms.bedsOf(ids), rooms.yesAmenityIds(ids)]);
  return list.map((r) => ({
    id: r.id,
    placeId,
    name: r.name,
    description: r.description,
    maxOccupancy: r.maxOccupancy,
    totalRoomCount: r.totalRoomCount,
    privateBathroom: r.privateBathroom,
    areaSqm: r.areaSqm,
    basePrice: r.basePrice,
    weekendPrice: r.weekendPrice,
    status: r.status,
    viewDescription: r.viewDescription,
    beds: beds.filter((b) => b.roomTypeId === r.id).map((b) => ({ bedType: b.bedType, quantity: b.quantity })),
    amenityIds: amenities.filter((a) => a.roomTypeId === r.id).map((a) => a.amenityId),
    otherAmenities: r.otherAmenities,
  }));
}

/** Sửa phòng ghi trực tiếp; tạo phòng mới ở Homestay đang công khai phải gửi yêu cầu chờ duyệt. */
export async function save(principal: UserPrincipal | undefined, placeId: number, roomId: number | null, input: RoomInput): Promise<RoomDto> {
  return saveAs(await actorOf(principal, true), placeId, roomId, input, false);
}

/** Áp dụng loại phòng đã được Admin duyệt. */
export const applyApproved = (submitter: AccountWithProvider, placeId: number, roomId: number | null, input: RoomInput): Promise<RoomDto> => saveAs(submitter, placeId, roomId, input, true);

function saveAs(account: AccountWithProvider, placeId: number, roomId: number | null, input: RoomInput, approved: boolean): Promise<RoomDto> {
  return tx(async () => {
    // Khóa cha tuần tự hóa việc sửa tên phòng và sức chứa cơ sở của Homestay.
    const place = await owned(placeId, account, true);
    if (!approved && roomId == null) requireNotPublic(place);
    const existing = roomId == null ? null : await ownedRoom(account, placeId, roomId, true);
    if ((await rooms.countRoomsNamed(placeId, input.name.trim().toLowerCase(), roomId)) > 0) throw bad('Tên loại phòng đã tồn tại trong Homestay.');
    const selected = await selectableAmenities(roomId, input.amenityIds);
    const before = existing ? roomSnapshot(existing) : null;

    if (existing && input.totalRoomCount !== existing.totalRoomCount) {
      // Đồng bộ các ngày đã có trên lịch: giữ nguyên số phòng NCC đã tạm khóa (phòng hỏng) bằng cách dịch theo chênh lệch, nhưng
      // không vượt tổng mới và không thấp hơn số phòng đang giữ / xác nhận (tránh overbooking).
      const delta = input.totalRoomCount - existing.totalRoomCount;
      const future = await rooms.futureInventory(existing.id, today());
      const conflicts: string[] = [];
      for (const day of future) {
        const next = Math.max(0, Math.min(input.totalRoomCount, day.totalRooms + delta));
        if (next < day.heldRooms + day.confirmedRooms) conflicts.push(day.stayDate);
      }
      if (conflicts.length > 0) throw bad(`Số lượng phòng mới xung đột với Booking hiện có (ngày ${conflicts.join(', ')}).`);
      await rooms.upsertInventoryDays(
        existing.id,
        future.map((day) => ({ ...day, totalRooms: Math.max(0, Math.min(input.totalRoomCount, day.totalRooms + delta)) })),
      );
    }

    const fields = {
      name: input.name.trim(),
      description: input.description ?? null,
      maxOccupancy: input.maxOccupancy,
      totalRoomCount: input.totalRoomCount,
      areaSqm: input.areaSqm ?? null,
      privateBathroom: input.privateBathroom,
      basePrice: input.basePrice,
      weekendPrice: input.weekendPrice ?? null,
      status: input.status,
      viewDescription: input.viewDescription ?? null,
      otherAmenities: input.otherAmenities == null || input.otherAmenities.trim() === '' ? null : input.otherAmenities.trim(),
    };
    const room = existing ? ((await rooms.updateRoomType(existing.id, fields)) as RoomTypeRow) : await rooms.insertRoomType({ placeId, ...fields });
    await rooms.replaceBeds(room.id, input.beds.map((b) => ({ bedType: b.bedType.trim(), quantity: b.quantity })));
    await rooms.replaceRoomAmenities(room.id, selected.map((a) => a.id));
    // Làm mới giá tham khảo hiển thị ở thẻ Homestay công khai.
    const range = await rooms.activePriceRange(placeId);
    await placeRepo.updatePlace(place, { priceRefMin: range.min, priceRefMax: range.max, priceUnitNote: 'đêm' });
    const after = roomSnapshot(room);
    if (JSON.stringify(after) !== JSON.stringify(before)) {
      await partner.recordAudit(account.id, roomId == null ? 'ROOM_CREATE' : 'ROOM_UPDATE', partner.ROOM_TYPE, room.id, null, before, after);
    }
    return {
      id: room.id,
      placeId,
      name: room.name,
      description: room.description,
      maxOccupancy: room.maxOccupancy,
      totalRoomCount: room.totalRoomCount,
      privateBathroom: room.privateBathroom,
      areaSqm: room.areaSqm,
      basePrice: room.basePrice,
      weekendPrice: room.weekendPrice,
      status: room.status,
      viewDescription: room.viewDescription,
      beds: input.beds,
      amenityIds: input.amenityIds,
      otherAmenities: room.otherAmenities,
    };
  });
}

/**
 * Tiện nghi được chọn: tiện nghi phòng đang dùng trong danh mục, cộng các tiện nghi đã gắn sẵn với loại phòng này dù sau đó bị
 * ngừng dùng / đổi phạm vi. Form NCC không hiện những tiện nghi đó nhưng vẫn gửi lại mã của chúng.
 */
async function selectableAmenities(roomId: number | null, requested: readonly number[]) {
  const ids = [...new Set(requested)];
  if (ids.length === 0) return [];
  const found = await rooms.amenitiesByIds(ids);
  const attached = new Set(roomId == null ? [] : await rooms.attachedAmenityIds(roomId));
  const selected = found.filter((a) => attached.has(a.id) || (a.scope === 'ROOM' && a.isActive === true));
  if (selected.length !== ids.length) throw bad('Tiện nghi phòng không hợp lệ.');
  return selected;
}

// ---- Giá theo mùa ------------------------------------------------------------------------------------------------------------

export async function prices(principal: UserPrincipal | undefined, placeId: number, id: number): Promise<PriceDto[]> {
  return pricesAs(await actorOf(principal, false), placeId, id);
}

export async function pricesAs(account: AccountWithProvider, placeId: number, id: number): Promise<PriceDto[]> {
  await ownedRoom(account, placeId, id, false);
  return (await rooms.specialPricesOf(id)).map((v) => ({ id: v.id, name: v.name, periodStart: v.periodStart, periodEnd: v.periodEnd, price: v.price }));
}

/** Ghi trực tiếp bảng giá của Homestay chưa công khai; Homestay đang công khai phải gửi yêu cầu chờ duyệt. */
export function savePrice(principal: UserPrincipal | undefined, placeId: number, id: number, priceId: number | null, input: PriceInput): Promise<PriceDto> {
  return tx(async () => {
    const account = await actorOf(principal, true);
    const room = await ownedRoom(account, placeId, id, true);
    const place = await owned(room.placeId, account, false);
    requireNotPublic(place);
    return savePriceAs(account, id, priceId, input);
  });
}

/** Áp dụng bảng giá đã được Admin duyệt. */
export function applyPrice(submitter: AccountWithProvider, placeId: number, id: number, priceId: number | null, input: PriceInput): Promise<PriceDto> {
  return tx(async () => {
    await ownedRoom(submitter, placeId, id, true);
    return savePriceAs(submitter, id, priceId, input);
  });
}

async function savePriceAs(account: AccountWithProvider, id: number, priceId: number | null, input: PriceInput): Promise<PriceDto> {
  if (input.periodEnd < input.periodStart) throw bad('Ngày kết thúc giá phải bằng hoặc sau ngày bắt đầu.');
  if ((await rooms.countPriceOverlap(id, input.periodStart, input.periodEnd, priceId)) > 0) throw bad('Khoảng giá bị trùng với một bảng giá đã có.');
  const current = priceId == null ? null : await rooms.specialPriceById(priceId);
  if (priceId != null && (!current || current.roomTypeId !== id)) throw bad('Không tìm thấy bảng giá.');
  const before = current ? priceSnapshot(current) : null;
  const saved = current
    ? (await rooms.updateSpecialPrice(current.id, input.name.trim(), input.periodStart, input.periodEnd, input.price))!
    : await rooms.insertSpecialPrice(id, input.name.trim(), input.periodStart, input.periodEnd, input.price, account.id);
  await partner.recordAudit(account.id, priceId == null ? 'SPECIAL_PRICE_CREATE' : 'SPECIAL_PRICE_UPDATE', partner.ROOM_TYPE, id, null, before, priceSnapshot(saved));
  return { id: saved.id, name: saved.name, periodStart: saved.periodStart, periodEnd: saved.periodEnd, price: saved.price };
}

/** Xóa trực tiếp bảng giá của Homestay chưa công khai; Homestay đang công khai phải gửi yêu cầu chờ duyệt. */
export function deletePrice(principal: UserPrincipal | undefined, placeId: number, id: number, priceId: number): Promise<void> {
  return tx(async () => {
    const account = await actorOf(principal, true);
    const room = await ownedRoom(account, placeId, id, true);
    requireNotPublic(await owned(room.placeId, account, false));
    await deletePriceAs(account, id, priceId);
  });
}

/** Áp dụng việc xóa bảng giá đã được Admin duyệt. */
export function applyDeletePrice(submitter: AccountWithProvider, placeId: number, id: number, priceId: number): Promise<void> {
  return tx(async () => {
    await ownedRoom(submitter, placeId, id, true);
    await deletePriceAs(submitter, id, priceId);
  });
}

async function deletePriceAs(account: AccountWithProvider, id: number, priceId: number): Promise<void> {
  const price = await rooms.specialPriceById(priceId);
  if (!price || price.roomTypeId !== id) throw bad('Không tìm thấy bảng giá.');
  await partner.recordAudit(account.id, 'SPECIAL_PRICE_DELETE', partner.ROOM_TYPE, id, null, priceSnapshot(price), null);
  await rooms.deleteSpecialPrice(priceId);
}

// ---- Lịch bán ----------------------------------------------------------------------------------------------------------------

export async function calendarOf(principal: UserPrincipal | undefined, placeId: number, id: number, start: string, end: string) {
  return calendar.calendar(await ownedByPrincipal(principal, placeId, id, false), start, end);
}

export async function quote(principal: UserPrincipal | undefined, placeId: number, id: number, start: string, end: string, roomCount: number, guests: number) {
  return calendar.quote(await ownedByPrincipal(principal, placeId, id, false), start, end, roomCount, guests);
}

const expectedByDate = (list: ExpectedDay[] | null | undefined): Map<string, ExpectedDay> => new Map((list ?? []).map((e) => [e.stayDate, e]));

function checkExpected(seen: ExpectedDay | undefined, day: InventoryDayRow): void {
  if (seen && (seen.totalRooms !== day.totalRooms || seen.stopSell !== (day.stopSell === true))) throw new HttpError(409, 'Dữ liệu đã thay đổi, vui lòng kiểm tra lại.');
}

/** Cập nhật số phòng mở bán / ngừng bán theo ngày cho một loại phòng, kèm lý do (phòng hỏng, bảo trì, nghỉ phục vụ...). */
export function inventory(principal: UserPrincipal | undefined, placeId: number, id: number, input: InventoryInput): Promise<void> {
  return tx(async () => {
    const account = await actorOf(principal, true);
    const room = await ownedRoom(account, placeId, id, true);
    calendar.validateDates(input.startDate, input.endDate);
    if (input.startDate < today()) throw bad('Không sửa tồn phòng trong quá khứ.');
    if (input.totalRooms > room.totalRoomCount) throw bad('Số phòng đưa vào bán không được vượt số phòng thực tế của loại phòng.');
    const reason = blockReason(input.stopSell || input.totalRooms < room.totalRoomCount, input.reason);
    const days = await calendar.lockedDays(room, input.startDate, input.endDate);
    const expected = expectedByDate(input.expected);
    const conflicts: string[] = [];
    for (const day of days) {
      checkExpected(expected.get(day.stayDate), day);
      if (input.totalRooms < day.heldRooms + day.confirmedRooms) conflicts.push(day.stayDate);
    }
    if (conflicts.length > 0) throw bad(`Số phòng đưa vào bán xung đột với các Booking hiện có (ngày ${conflicts.join(', ')}).`);
    for (const day of days) {
      day.totalRooms = input.totalRooms;
      day.stopSell = input.stopSell;
      day.blockReason = reason;
    }
    await rooms.upsertInventoryDays(room.id, days);
    await partner.recordAudit(account.id, 'INVENTORY_UPDATE', partner.ROOM_TYPE, id, reason, null, {
      startDate: input.startDate,
      endDate: input.endDate,
      totalRooms: input.totalRooms,
      stopSell: input.stopSell,
    });
  });
}

/** Lịch tổng hợp cho màn hình Lịch phòng: mọi loại phòng của Homestay × các ngày trong [start, end). */
export async function availability(principal: UserPrincipal | undefined, placeId: number, start: string, end: string) {
  await owned(placeId, await actorOf(principal, false), false);
  calendar.validateDates(start, end);
  if (daysBetween(start, end) > MAX_AVAILABILITY_DAYS) throw bad(`Mỗi lần chỉ xem tối đa ${MAX_AVAILABILITY_DAYS} ngày.`);
  // Loại phòng đang bán lên trước, cùng trạng thái thì theo thứ tự tạo.
  const list = sellingFirst(await rooms.roomTypesByPlace(placeId));
  if (list.length === 0) return { placeId, startDate: start, endDate: end, rooms: [] };
  const stored = new Map<string, InventoryDayRow>();
  for (const d of await rooms.inventoryForRooms(list.map((r) => r.id), start, end)) stored.set(`${d.roomTypeId}|${d.stayDate}`, d);
  const result = list.map((room) => {
    const active = room.status === 'ACTIVE';
    const cells = eachDay(start, end).map((date) => {
      const d = stored.get(`${room.id}|${date}`);
      const total = d ? d.totalRooms : room.totalRoomCount;
      const held = d ? d.heldRooms : 0;
      const confirmed = d ? d.confirmedRooms : 0;
      const stopSell = d != null && d.stopSell === true;
      // Cùng công thức với calendar: loại phòng tắt bán hoặc ngày đóng thì khách không đặt được.
      const available = !active || stopSell ? 0 : Math.max(0, total - held - confirmed);
      return {
        stayDate: date,
        totalRooms: total,
        heldRooms: held,
        confirmedRooms: confirmed,
        availableRooms: available,
        lockedRooms: Math.max(0, room.totalRoomCount - total),
        stopSell,
        blockReason: d ? d.blockReason : null,
      };
    });
    return { id: room.id, name: room.name, totalRoomCount: room.totalRoomCount, status: room.status, priced: room.basePrice != null, days: cells };
  });
  return { placeId, startDate: start, endDate: end, rooms: result };
}

export const sellingFirst = (list: RoomTypeRow[]): RoomTypeRow[] =>
  [...list].sort((a, b) => Number(a.status !== 'ACTIVE') - Number(b.status !== 'ACTIVE') || a.id - b.id);

/**
 * Khóa / mở phòng của một loại phòng cho mỗi ngày trong khoảng (phòng hỏng, khách đặt ngoài, nhà dùng riêng...). Phòng khách đã
 * đặt không khóa được: ngày nào không đủ phòng trống thì khóa tối đa có thể và trả lại ngày đó thay vì từ chối cả yêu cầu. Đóng
 * cả loại phòng giữ nguyên số phòng đang khóa để lần mở lại không bị mất.
 */
export function lockRooms(principal: UserPrincipal | undefined, placeId: number, id: number, input: RoomLockInput) {
  return tx(async () => {
    const account = await actorOf(principal, true);
    const room = await ownedRoom(account, placeId, id, true);
    calendar.validateDates(input.startDate, input.endDate);
    if (input.startDate < today()) throw bad('Không sửa lịch trong quá khứ.');
    if (!input.closed && input.lockedRooms == null) throw bad('Vui lòng chọn số phòng muốn khóa.');
    const capacity = room.totalRoomCount;
    const locked = input.closed ? 0 : input.lockedRooms!;
    if (locked > capacity) throw bad(`Loại phòng này chỉ có ${capacity} phòng.`);
    const reason = blockReason(input.closed || locked > 0, input.reason);
    const expected = expectedByDate(input.expected);
    const limited: string[] = [];
    const days = await calendar.lockedDays(room, input.startDate, input.endDate);
    for (const day of days) {
      checkExpected(expected.get(day.stayDate), day);
      if (input.closed) {
        day.stopSell = true;
        day.blockReason = reason;
      } else {
        const booked = Math.min(capacity, day.heldRooms + day.confirmedRooms);
        const total = Math.max(capacity - locked, booked);
        if (total !== capacity - locked) limited.push(day.stayDate);
        day.totalRooms = total;
        day.stopSell = false;
        day.blockReason = total < capacity ? reason : null;
      }
    }
    await rooms.upsertInventoryDays(room.id, days);
    const after: Record<string, unknown> = { startDate: input.startDate, endDate: input.endDate, stopSell: input.closed };
    if (!input.closed) after.lockedRooms = locked;
    await partner.recordAudit(account.id, 'INVENTORY_UPDATE', partner.ROOM_TYPE, id, reason, null, after);
    return { updatedDays: days.length, limitedDays: limited };
  });
}

/**
 * Ngừng / mở phục vụ cả Homestay trong khoảng ngày: áp dụng cho mọi loại phòng (khóa theo thứ tự id để tránh deadlock). Ngày
 * ngừng phục vụ vẫn giữ nguyên các đơn đã giữ / xác nhận; chỉ chặn khách đặt mới.
 */
export function blockHomestay(principal: UserPrincipal | undefined, placeId: number, input: HomestayBlockInput): Promise<number> {
  return tx(async () => {
    const account = await actorOf(principal, true);
    await owned(placeId, account, true);
    calendar.validateDates(input.startDate, input.endDate);
    if (input.startDate < today()) throw bad('Không sửa lịch trong quá khứ.');
    const reason = blockReason(input.stopSell, input.reason);
    const list = [...(await rooms.roomTypesByPlace(placeId))].sort((a, b) => a.id - b.id);
    if (list.length === 0) throw bad('Homestay chưa có loại phòng nào.');
    let bookedDays = 0;
    // Các lần ngừng phục vụ được lưu theo từng ngày. Booking hiện hữu vẫn giữ nguyên; chỉ chặn booking mới trong các ngày được đóng.
    for (const r of list) {
      const room = (await rooms.lockRoomType(r.id))!;
      const days = await calendar.lockedDays(room, input.startDate, input.endDate);
      for (const day of days) {
        if (input.stopSell && day.heldRooms + day.confirmedRooms > 0) bookedDays++;
        day.stopSell = input.stopSell;
        day.blockReason = input.stopSell ? reason : day.totalRooms < room.totalRoomCount ? day.blockReason : null;
      }
      await rooms.upsertInventoryDays(room.id, days);
    }
    await partner.recordAudit(account.id, input.stopSell ? 'HOMESTAY_CLOSE_DAYS' : 'HOMESTAY_OPEN_DAYS', partner.HOMESTAY, placeId, reason, null, {
      startDate: input.startDate,
      endDate: input.endDate,
      roomTypes: list.length,
    });
    return bookedDays;
  });
}

/**
 * Đơn còn hiệu lực (chờ xác nhận / đã xác nhận / đã thanh toán) chưa trả phòng của loại phòng, theo ngày nhận phòng. Chủ nhà xem
 * trước khi khóa loại phòng: khóa chỉ chặn đơn mới, các đơn này vẫn phải phục vụ.
 */
export async function upcomingStays(principal: UserPrincipal | undefined, placeId: number, id: number) {
  await ownedRoom(await actorOf(principal, false), placeId, id, false);
  return (await rooms.upcomingStaysOf(id, today())).map((r) => ({ checkIn: r.checkIn, checkOut: r.checkOut, roomCount: r.roomCount }));
}

export async function changeLog(principal: UserPrincipal | undefined, placeId: number) {
  await owned(placeId, await actorOf(principal, false), false);
  const roomIds = (await rooms.roomTypesByPlace(placeId)).map((r) => r.id);
  return (await partner.changeLogOf(placeId, roomIds)).map((a) => ({
    id: a.id,
    action: a.action,
    entityType: a.entityType,
    entityId: a.entityId,
    reason: a.reason,
    before: a.beforeData,
    after: a.afterData,
    createdAt: a.createdAt,
  }));
}

