import type {
  BookedDateRangeDto, BookingNavigationState, BookingResponseDto, BookingRoomChoice, BookingRoomDto, BookingTripFilters,
} from '@/types/booking';
import type { RoomTypeDto } from '@/types/room';
import { addDaysKey, availableOn, buildOccupancy, minAvailableInRange, nightsBetween, stayPrice } from '@/lib/roomAvailability';

/**
 * Chọn nhiều loại phòng trong một đơn (trang Homestay → trang đặt phòng → sửa đơn): tiền phòng, phòng trống và câu
 * tóm tắt của cả lựa chọn. Loại phòng có 0 phòng được bỏ qua.
 */

/** Mỗi đơn tối đa 20 phòng — khớp giới hạn của backend. */
export const MAX_ROOMS_PER_BOOKING = 20;

/** Loại phòng đặt được (đang bán, có giá) → lựa chọn mang theo sang trang đặt phòng; null nếu chưa có giá. */
export function roomChoiceFrom(room: RoomTypeDto, roomCount: number): BookingRoomChoice | null {
  if (room.basePrice == null) return null;
  return {
    roomTypeId: Number(room.id),
    roomTypeName: room.name,
    roomCount,
    basePrice: room.basePrice,
    weekendPrice: room.weekendPrice ?? null,
    totalRoomCount: Math.max(1, room.totalRoomCount || 1),
    maxOccupancy: room.maxOccupancy,
    bedInfo: room.bedType || '',
    hasBreakfast: room.hasBreakfast || false,
  };
}

/** Các loại phòng có ít nhất một phòng. */
export const chosenRooms = <T extends { roomCount: number }>(rooms: T[]) => rooms.filter((r) => r.roomCount > 0);

export const totalRoomCount = (rooms: { roomCount: number }[]) => rooms.reduce((sum, r) => sum + Math.max(0, r.roomCount), 0);

/** Số khách gợi ý tối đa: sức chứa × số phòng của từng loại. */
export const suggestedGuestCount = (rooms: BookingRoomChoice[]) =>
  rooms.reduce((sum, r) => sum + r.maxOccupancy * Math.max(0, r.roomCount), 0);

/** "Phòng đôi ×1, Phòng đơn ×2". */
export const roomSummary = (rooms: { roomTypeName: string; roomCount: number }[]) =>
  chosenRooms(rooms).map((r) => `${r.roomTypeName} ×${r.roomCount}`).join(', ');

export interface ChoicePrice {
  choice: BookingRoomChoice;
  total: number;
  nights: number;
  weekendNights: number;
  weekdayNights: number;
}

/** Tiền phòng của từng loại (đêm T7, CN dùng giá cuối tuần) và tổng cả đơn. */
export function selectionPrice(rooms: BookingRoomChoice[], checkIn: string, checkOut: string) {
  const lines: ChoicePrice[] = chosenRooms(rooms).map((choice) => ({
    choice,
    ...stayPrice(choice.basePrice, choice.weekendPrice, checkIn, checkOut, choice.roomCount),
  }));
  return { lines, total: lines.reduce((sum, line) => sum + line.total, 0), nights: nightsBetween(checkIn, checkOut) };
}

export interface RoomShortage {
  choice: BookingRoomChoice;
  /** Đêm đầu tiên không đủ phòng (YYYY-MM-DD). */
  night: string;
  available: number;
}

/** Loại phòng đầu tiên không đủ phòng cho khoảng ngày (kèm đêm thiếu); null khi mọi loại đều đủ. */
export function firstShortage(
  rooms: BookingRoomChoice[], bookedDates: BookedDateRangeDto[], checkIn: string, checkOut: string,
): RoomShortage | null {
  for (const choice of chosenRooms(rooms)) {
    const occupancy = buildOccupancy(bookedDates, choice.roomTypeId);
    for (let key = checkIn, guard = 0; key < checkOut && guard < 400; key = addDaysKey(key, 1), guard += 1) {
      const available = availableOn(occupancy, choice.totalRoomCount, key);
      if (available < choice.roomCount) return { choice, night: key, available };
    }
  }
  return null;
}

/** Số phòng còn đặt được cả khoảng ngày của một loại phòng. */
export const availableForRange = (
  bookedDates: BookedDateRangeDto[], roomTypeId: number, totalRooms: number, checkIn: string, checkOut: string,
) => minAvailableInRange(buildOccupancy(bookedDates, roomTypeId), totalRooms, checkIn, checkOut);

/** Các loại phòng của đơn — đơn lưu trên máy từ bản cũ chưa có `rooms` thì dựng một dòng từ loại phòng chính. */
export function bookingRooms(booking: Pick<BookingResponseDto, 'rooms' | 'roomTypeId' | 'roomTypeName' | 'roomCount' | 'totalAmount'>): BookingRoomDto[] {
  if (booking.rooms?.length) return booking.rooms;
  return [{
    roomTypeId: booking.roomTypeId,
    roomTypeName: booking.roomTypeName,
    roomCount: booking.roomCount || 1,
    subtotal: booking.totalAmount,
  }];
}

/** Khoảng ngày đã đặt của một đơn theo từng loại phòng (lịch phòng trên máy, trừ phòng của chính đơn đang sửa). */
export const bookingRanges = (booking: BookingResponseDto): BookedDateRangeDto[] =>
  bookingRooms(booking).map((room) => ({
    roomTypeId: room.roomTypeId, checkIn: booking.checkIn, checkOut: booking.checkOut, roomCount: room.roomCount,
  }));

/** Lịch trình đang chọn chỗ ở (từ trang homestay) — bỏ qua giá trị lạ trong lịch sử trình duyệt. */
function journeyOf(state: { journeyId?: unknown; journeyTitle?: unknown }): Pick<BookingNavigationState, 'journeyId' | 'journeyTitle'> {
  const id = Number(state.journeyId);
  if (!Number.isInteger(id) || id <= 0) return { journeyId: undefined, journeyTitle: undefined };
  return { journeyId: id, journeyTitle: typeof state.journeyTitle === 'string' ? state.journeyTitle.slice(0, 160) : undefined };
}

const TRIP_CODE_MAX = 64;
const tripSlug = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() && value.trim().length <= TRIP_CODE_MAX ? value.trim() : null;

/**
 * Lịch trình gợi ý đi kèm đơn (khách tick "Lưu kèm lịch trình … vào đơn" ở trang homestay): mã gói ≤ 64 ký tự, tên ≤ 160,
 * tag lọc đúng kiểu — bỏ qua giá trị lạ trong lịch sử trình duyệt.
 */
function tripOf(state: { tripTemplate?: unknown; tripTitle?: unknown; tripFilters?: unknown }): Pick<BookingNavigationState, 'tripTemplate' | 'tripTitle' | 'tripFilters'> {
  const code = tripSlug(state.tripTemplate);
  if (!code) return { tripTemplate: undefined, tripTitle: undefined, tripFilters: undefined };
  const title = typeof state.tripTitle === 'string' && state.tripTitle.trim() ? state.tripTitle.trim().slice(0, 160) : undefined;
  const raw = state.tripFilters && typeof state.tripFilters === 'object' ? state.tripFilters as Record<string, unknown> : null;
  const tripFilters: BookingTripFilters | undefined = raw ? {
    duration: typeof raw.duration === 'string' && /^\d{1,2}-\d{1,2}$/.test(raw.duration) ? raw.duration : null,
    dining: tripSlug(raw.dining),
    goals: Array.isArray(raw.goals) ? raw.goals.map(tripSlug).filter((g): g is string => g != null).slice(0, 10) : [],
  } : undefined;
  return { tripTemplate: code, tripTitle: title, tripFilters };
}

type LegacyNavigationState = Partial<BookingNavigationState> & {
  roomTypeId?: number;
  roomTypeName?: string;
  basePrice?: number;
  weekendPrice?: number;
  totalRoomCount?: number;
  maxOccupancy?: number;
  roomCount?: number;
  bedInfo?: string;
  hasBreakfast?: boolean;
};

/**
 * State điều hướng sang trang đặt phòng. Bản cũ chỉ có một loại phòng (roomTypeId / basePrice / roomCount...) —
 * vẫn đọc được khi trình duyệt khôi phục lịch sử từ trước bản cập nhật.
 */
export function bookingNavState(raw: unknown): BookingNavigationState | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const state = raw as LegacyNavigationState;
  if (!state.placeId) return undefined;
  const journey = journeyOf(state);
  const trip = tripOf(state);
  if (Array.isArray(state.rooms) && state.rooms.length > 0) return { ...(state as BookingNavigationState), ...journey, ...trip };
  if (!state.roomTypeId || state.basePrice == null) return undefined;
  return {
    ...(state as BookingNavigationState),
    ...journey,
    ...trip,
    rooms: [{
      roomTypeId: state.roomTypeId,
      roomTypeName: state.roomTypeName || 'Phòng nghỉ',
      roomCount: Math.max(1, state.roomCount || 1),
      basePrice: state.basePrice,
      weekendPrice: state.weekendPrice ?? null,
      totalRoomCount: Math.max(1, state.totalRoomCount || 1),
      maxOccupancy: Math.max(1, state.maxOccupancy || 2),
      bedInfo: state.bedInfo,
      hasBreakfast: state.hasBreakfast,
    }],
  };
}
