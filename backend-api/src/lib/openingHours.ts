/**
 * Trạng thái mở / đóng cửa của địa điểm tại một thời điểm, theo giờ Việt Nam (BR-C07, AC-02.23).
 *  - Khung giờ là nửa mở [mở, đóng): đúng giờ đóng là đã đóng.
 *  - Giờ đóng nhỏ hơn giờ mở (vd 18:00–02:00) = mở qua đêm sang ngày hôm sau.
 *  - Giờ mở bằng giờ đóng = mở cả ngày (dữ liệu cũ; form mới không cho nhập).
 *  - Không có dữ liệu giờ của hôm nay → không kết luận được, trả null (BR-C08: ẩn dòng trạng thái).
 */

/** Giờ của một ngày: `dayOfWeek` 1 = thứ Hai … 7 = Chủ nhật (giống place_opening_hour); open/close dạng "HH:mm[:ss]". */
export interface DayHours {
  dayOfWeek: number;
  closed: boolean;
  open: string | null;
  close: string | null;
}

export interface OpenStatus {
  open: boolean;
  text: string;
}

const DAY_NAMES = ['', 'thứ Hai', 'thứ Ba', 'thứ Tư', 'thứ Năm', 'thứ Sáu', 'thứ Bảy', 'Chủ nhật'];

export const dayName = (dayOfWeek: number): string => (dayOfWeek >= 1 && dayOfWeek <= 7 ? DAY_NAMES[dayOfWeek] : '');

const hhmm = (time: string): string => time.slice(0, 5);
const full = (time: string): string => (time.length === 5 ? `${time}:00` : time.slice(0, 8));

const isOpenDay = (d: DayHours | undefined): d is DayHours & { open: string; close: string } => !!d && !d.closed && d.open != null && d.close != null;
const overnight = (d: { open: string; close: string }): boolean => full(d.close) < full(d.open);
const allDay = (d: { open: string; close: string }): boolean => full(d.close) === full(d.open);

/** ISO thứ trong tuần của một LocalDate: 1 = thứ Hai … 7 = Chủ nhật. */
function isoDay(date: string): number {
  const d = new Date(`${date}T00:00:00Z`).getUTCDay();
  return d === 0 ? 7 : d;
}

/** Trạng thái tại thời điểm `nowVn` (LocalDateTime "YYYY-MM-DDTHH:mm:ss", đã là giờ Việt Nam). */
export function statusAt(week: DayHours[], nowVn: string): OpenStatus | null {
  if (!week || week.length === 0) return null;
  const byDay = new Map<number, DayHours>();
  for (const d of week) if (d && d.dayOfWeek >= 1 && d.dayOfWeek <= 7) byDay.set(d.dayOfWeek, d);
  const today = isoDay(nowVn.slice(0, 10));
  const time = full(nowVn.slice(11, 19));

  // Khung qua đêm của hôm qua còn kéo sang sáng nay.
  const yesterday = byDay.get(today === 1 ? 7 : today - 1);
  if (isOpenDay(yesterday) && overnight(yesterday) && time < full(yesterday.close)) return openUntil(yesterday.close);

  const current = byDay.get(today);
  if (!current) return null;
  if (isOpenDay(current)) {
    if (allDay(current)) return { open: true, text: 'Đang mở cửa cả ngày' };
    if (overnight(current)) {
      if (time >= full(current.open)) return openUntil(current.close);
      return closedOpensAt(current.open);
    }
    if (time >= full(current.open) && time < full(current.close)) return openUntil(current.close);
    if (time < full(current.open)) return closedOpensAt(current.open);
  }
  const prefix = isOpenDay(current) ? 'Đã đóng cửa' : 'Hôm nay nghỉ';
  for (let offset = 1; offset <= 7; offset++) {
    const day = ((today - 1 + offset) % 7) + 1;
    const next = byDay.get(day);
    if (isOpenDay(next)) return { open: false, text: `${prefix}, mở lúc ${hhmm(next.open)} ${dayName(day)}` };
  }
  return { open: false, text: prefix };
}

const openUntil = (close: string): OpenStatus => ({ open: true, text: `Đang mở cửa, đóng lúc ${hhmm(close)}` });
const closedOpensAt = (open: string): OpenStatus => ({ open: false, text: `Đã đóng cửa, mở lúc ${hhmm(open)}` });
