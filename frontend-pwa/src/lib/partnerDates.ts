/**
 * Ngày dạng YYYY-MM-DD theo giờ máy người dùng — không dùng toISOString() vì từ 0h đến 7h sáng
 * giờ Việt Nam nó trả về ngày hôm trước (UTC).
 */
const pad = (n: number) => String(n).padStart(2, '0');

export const isoDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const todayIso = () => isoDate(new Date());
export const parseIso = (value: string) => {
  const [y = 1970, m = 1, d = 1] = value.split('-').map(Number);
  return new Date(y, m - 1, d);
};
export const addDaysIso = (value: string, n: number) => {
  const d = parseIso(value);
  d.setDate(d.getDate() + n);
  return isoDate(d);
};
/** Số ngày từ `from` tới `to` (to - from). */
export const daysBetween = (from: string, to: string) => Math.round((parseIso(to).getTime() - parseIso(from).getTime()) / 86_400_000);

const WEEKDAY_SHORT = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
const WEEKDAY_LONG = ['Chủ nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];

export const weekdayShort = (value: string) => WEEKDAY_SHORT[parseIso(value).getDay()] ?? '';
export const weekdayLong = (value: string) => WEEKDAY_LONG[parseIso(value).getDay()] ?? '';
/** 05/10 */
export const dayMonth = (value: string) => `${value.slice(8, 10)}/${value.slice(5, 7)}`;
/** 05/10/2026 */
export const fullDate = (value: string) => `${dayMonth(value)}/${value.slice(0, 4)}`;
/** "05/10" khi 1 ngày, "05/10 → 07/10" khi nhiều ngày (lastDay tính cả ngày đó). */
export const rangeLabel = (firstDay: string, lastDay: string) => (firstDay === lastDay ? dayMonth(firstDay) : `${dayMonth(firstDay)} → ${dayMonth(lastDay)}`);
