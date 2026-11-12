import type { BookedDateRangeDto } from '@/types/booking';

/**
 * Tính phòng trống theo đêm cho lịch phòng phía khách (trang chi tiết Homestay, trang đặt phòng).
 * Ngày luôn ở dạng khóa "YYYY-MM-DD" theo giờ địa phương — không qua Date.toISOString() để khỏi lệch múi giờ UTC.
 * Một "đêm" mang ngày bắt đầu của nó: đơn 15→17 chiếm đêm 15 và 16, ngày 17 (trả phòng) vẫn trống.
 */

const pad = (n: number) => String(n).padStart(2, '0');

export const toDateKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export const parseDateKey = (key: string) => {
  const [y = 1970, m = 1, d = 1] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
};

export const todayKey = () => toDateKey(new Date());

export const addDaysKey = (key: string, days: number) => {
  const d = parseDateKey(key);
  d.setDate(d.getDate() + days);
  return toDateKey(d);
};

export const isDateKey = (value: string | null | undefined): value is string =>
  !!value && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(parseDateKey(value).getTime());

/** Số đêm giữa hai ngày (0 nếu thiếu hoặc ngày trả không sau ngày nhận). */
export const nightsBetween = (checkIn: string | null | undefined, checkOut: string | null | undefined) => {
  if (!checkIn || !checkOut || checkOut <= checkIn) return 0;
  return Math.round((parseDateKey(checkOut).getTime() - parseDateKey(checkIn).getTime()) / 86_400_000);
};

const WEEKDAY_SHORT = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

/** "15/10/2026" — thống nhất ngày/tháng/năm. */
export const formatVnDate = (key: string) => `${key.slice(8, 10)}/${key.slice(5, 7)}/${key.slice(0, 4)}`;

/** "T5, 15/10" — gọn cho thanh tóm tắt ngày ở. */
export const formatVnDayShort = (key: string) =>
  `${WEEKDAY_SHORT[parseDateKey(key).getDay()] ?? ''}, ${key.slice(8, 10)}/${key.slice(5, 7)}`;

export type Occupancy = Record<string, number>;

/** Số phòng đã đặt theo từng đêm của một loại phòng (đơn không ghi loại phòng tính cho mọi loại). */
export function buildOccupancy(bookedDates: BookedDateRangeDto[], roomTypeId?: number | null): Occupancy {
  const map: Occupancy = {};
  for (const b of bookedDates) {
    if (!b.checkIn || !b.checkOut) continue;
    if (roomTypeId != null && b.roomTypeId && Number(b.roomTypeId) !== 0 && Number(b.roomTypeId) !== Number(roomTypeId)) continue;
    let key = b.checkIn;
    // Chặn vòng lặp vô hạn nếu dữ liệu hỏng (ngày trả trước ngày nhận).
    for (let guard = 0; key < b.checkOut && guard < 400; guard += 1) {
      map[key] = (map[key] ?? 0) + (b.roomCount || 1);
      key = addDaysKey(key, 1);
    }
  }
  return map;
}

export const availableOn = (occupancy: Occupancy, totalRooms: number, key: string) =>
  Math.max(0, Math.max(1, totalRooms) - (occupancy[key] ?? 0));

/** Số phòng trống ít nhất trên các đêm của khoảng ngày (= số phòng còn đặt được cho cả khoảng). */
export function minAvailableInRange(occupancy: Occupancy, totalRooms: number, checkIn: string, checkOut: string) {
  let min = Math.max(1, totalRooms);
  for (let key = checkIn, guard = 0; key < checkOut && guard < 400; key = addDaysKey(key, 1), guard += 1) {
    min = Math.min(min, availableOn(occupancy, totalRooms, key));
  }
  return min;
}

/** Tiền phòng cho khoảng ngày: đêm T7, CN dùng giá cuối tuần nếu có (khớp cách tính của trang chi tiết trước đây). */
export function stayPrice(basePrice: number, weekendPrice: number | null | undefined, checkIn: string, checkOut: string, roomCount: number) {
  const useWeekendPrice = !!weekendPrice && weekendPrice !== basePrice;
  let perRoom = 0;
  let weekendNights = 0;
  let nights = 0;
  for (let key = checkIn, guard = 0; key < checkOut && guard < 400; key = addDaysKey(key, 1), guard += 1) {
    const day = parseDateKey(key).getDay();
    const weekend = useWeekendPrice && (day === 0 || day === 6);
    if (weekend) weekendNights += 1;
    perRoom += weekend && weekendPrice ? weekendPrice : basePrice;
    nights += 1;
  }
  return { total: perRoom * Math.max(1, roomCount), nights, weekendNights, weekdayNights: nights - weekendNights };
}
