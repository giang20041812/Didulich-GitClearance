/**
 * Thời gian của miền nghiệp vụ luôn là GIỜ VIỆT NAM không múi giờ (cột timestamp(6) / date / time của PostgreSQL),
 * giống LocalDateTime / LocalDate / LocalTime của bản Java chạy với TZ Asia/Ho_Chi_Minh.
 *
 * Trong mã, ba kiểu này là chuỗi: LocalDateTime = "YYYY-MM-DDTHH:mm:ss[.fff]", LocalDate = "YYYY-MM-DD",
 * LocalTime = "HH:mm:ss". Chuỗi đi thẳng từ PostgreSQL ra JSON nên định dạng khớp với Jackson (không có múi giờ),
 * và phép tính không phụ thuộc TZ của máy chủ (Việt Nam không có giờ mùa hè: UTC+7 cố định).
 */

export const VN_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Epoch ms của một LocalDateTime/LocalDate (hiểu là giờ Việt Nam). */
export function toEpochMs(local: string): number {
  const m = /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2})(?::(\d{2})(?:\.(\d+))?)?)?$/.exec(local);
  if (!m) throw new Error(`Thời gian không hợp lệ: ${local}`);
  const time = m[2] ?? '00:00';
  const sec = m[3] ?? '00';
  const ms = (m[4] ?? '').padEnd(3, '0').slice(0, 3) || '000';
  return Date.parse(`${m[1]}T${time}:${sec}.${ms}+07:00`);
}

/** LocalDateTime từ epoch ms (độ chính xác mili giây). */
export function fromEpochMs(ms: number): string {
  return new Date(ms + VN_OFFSET_MS).toISOString().slice(0, -1);
}

/** Bây giờ theo giờ Việt Nam. */
export function nowLocal(): string {
  return fromEpochMs(Date.now());
}

/** Hôm nay theo giờ Việt Nam. */
export function today(): string {
  return nowLocal().slice(0, 10);
}

export function datePart(local: string): string {
  return local.slice(0, 10);
}

/** Cộng/trừ mili giây vào một LocalDateTime. */
export function plusMs(local: string, ms: number): string {
  return fromEpochMs(toEpochMs(local) + ms);
}

export function plusSeconds(local: string, s: number): string {
  return plusMs(local, s * 1000);
}

export function plusMinutes(local: string, m: number): string {
  return plusMs(local, m * 60 * 1000);
}

export function plusHours(local: string, h: number): string {
  return plusMs(local, h * 60 * 60 * 1000);
}

export function plusDaysTime(local: string, d: number): string {
  return plusMs(local, d * DAY_MS);
}

/** Cộng ngày vào một LocalDate. */
export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date.slice(0, 10)}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Số ngày từ a đến b (b - a) của hai LocalDate. */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b.slice(0, 10)}T00:00:00Z`) - Date.parse(`${a.slice(0, 10)}T00:00:00Z`)) / DAY_MS);
}

/** Thứ trong tuần theo ISO: 1 = thứ Hai ... 7 = Chủ nhật. */
export function isoDayOfWeek(date: string): number {
  const d = new Date(`${date.slice(0, 10)}T00:00:00Z`).getUTCDay();
  return d === 0 ? 7 : d;
}

export function isValidDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/** Các ngày từ `from` (gồm) đến `to` (không gồm). */
export function eachDay(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d < to; d = addDays(d, 1)) out.push(d);
  return out;
}

/** Đầu tháng / cuối tháng của một LocalDate. */
export function startOfMonth(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

/** "HH:mm:ss" → "HH:mm" (@JsonFormat(pattern = "HH:mm")). */
export function localTimeHm(time: string): string {
  return time.slice(0, 5);
}

/** Chấp nhận "H:mm", "HH:mm" hoặc "HH:mm:ss" (Jackson đọc LocalTime ISO); trả "HH:mm:ss" hoặc null nếu sai định dạng. */
export function parseLocalTime(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(value.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  const s = Number(m[3] ?? 0);
  if (h > 23 || mi > 59 || s > 59) return null;
  return `${String(h).padStart(2, '0')}:${m[2]}:${String(s).padStart(2, '0')}`;
}

/** LocalTime.toString() của Java: bỏ phần giây khi bằng 0 ("14:00:00" → "14:00"). */
export function timeToString(time: string | null | undefined): string | null {
  if (time == null) return null;
  return /^\d{2}:\d{2}:00(\.0+)?$/.test(time) ? time.slice(0, 5) : time;
}

/** Số phút từ 00:00 của một giờ "HH:mm[:ss]". */
export function minutesOfDay(time: string): number {
  return Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
}

/** Cộng ngày vào ngày, trả ISO; số ngày giữa hai ngày (b - a) tính theo lịch. */
export function plusDays(date: string, days: number): string {
  return addDays(date, days);
}

/** So sánh hai LocalDateTime theo thời gian thực (an toàn khi độ dài phần thập phân khác nhau). */
export function compareLocal(a: string, b: string): number {
  return toEpochMs(a) - toEpochMs(b);
}

/** Instant hiện tại dạng ISO có "Z" (cho health check). */
export function nowInstant(): string {
  return new Date().toISOString();
}

/** Cộng tháng vào một LocalDate (LocalDate.plusMonths): ngày vượt quá cuối tháng đích thì lùi về ngày cuối tháng. */
export function addMonths(date: string, months: number): string {
  const y = Number(date.slice(0, 4));
  const m = Number(date.slice(5, 7)) - 1 + months;
  const d = Number(date.slice(8, 10));
  const target = new Date(Date.UTC(y, m, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, last));
  return target.toISOString().slice(0, 10);
}

/**
 * LocalDateTime.toString() của Java: bỏ phần giây khi giây = 0 và không có phần thập phân; phần thập phân in theo nhóm 3/6/9
 * chữ số ("2026-10-21T10:00", "2026-10-21T10:00:05", "2026-10-21T10:00:05.120", "...05.123456").
 */
export function ldtToString(value: string | null | undefined): string | null {
  if (value == null) return null;
  const m = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})(?::(\d{2})(?:\.(\d+))?)?$/.exec(value);
  if (!m) return value;
  const seconds = m[3] ?? '00';
  const fraction = (m[4] ?? '').padEnd(9, '0').slice(0, 9);
  if (seconds === '00' && /^0+$/.test(fraction)) return `${m[1]}T${m[2]}`;
  if (/^0+$/.test(fraction)) return `${m[1]}T${m[2]}:${seconds}`;
  const digits = fraction.endsWith('000000') ? fraction.slice(0, 3) : fraction.endsWith('000') ? fraction.slice(0, 6) : fraction;
  return `${m[1]}T${m[2]}:${seconds}.${digits}`;
}
