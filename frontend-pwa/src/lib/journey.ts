/**
 * Lịch trình của khách: tên buổi, thứ tự các mục, giờ tham quan, chế độ "Hôm nay", nhắc giờ, file lịch .ics. Mục có giờ
 * riêng (lịch trình lên ở /lich-trinh) dùng giờ đó; mục chỉ có BUỔI (sáng / trưa / chiều / tối) lấy giờ mặc định của buổi.
 */
import type { DaySession } from '@/types/journey';

export const DAY_SESSIONS: DaySession[] = ['MORNING', 'NOON', 'AFTERNOON', 'EVENING'];

export const SESSION_LABEL: Record<DaySession, string> = {
  MORNING: 'Sáng',
  NOON: 'Trưa',
  AFTERNOON: 'Chiều',
  EVENING: 'Tối',
};

/** Màu của từng buổi (viền nút trên route, nhãn buổi): sáng vàng nắng, trưa cam, chiều xanh trời, tối chàm. */
export const SESSION_TONE: Record<DaySession, { ring: string; chip: string; dot: string }> = {
  MORNING: { ring: 'ring-amber-400', chip: 'bg-amber-50 text-amber-700', dot: 'bg-amber-400' },
  NOON: { ring: 'ring-orange-400', chip: 'bg-orange-50 text-orange-700', dot: 'bg-orange-400' },
  AFTERNOON: { ring: 'ring-sky-400', chip: 'bg-sky-50 text-sky-700', dot: 'bg-sky-400' },
  EVENING: { ring: 'ring-indigo-400', chip: 'bg-indigo-50 text-indigo-700', dot: 'bg-indigo-400' },
};

/** Phút bắt đầu của mục trong ngày: giờ riêng ("HH:mm"), không có thì giờ mặc định của buổi. */
export const startMinutesOf = (stop: { session: DaySession; startTime?: string | null }) => {
  const match = stop.startTime ? /^(\d{1,2}):(\d{2})/.exec(stop.startTime) : null;
  if (match) return Number(match[1]) * 60 + Number(match[2]);
  return SESSION_START[stop.session].hour * 60 + SESSION_START[stop.session].minute;
};

/**
 * Theo ngày (chưa chọn ngày: theo "Ngày N", không có thì xếp cuối) rồi giờ bắt đầu (mục không có giờ lấy giờ của buổi);
 * cùng giờ giữ thứ tự thêm. Khớp JourneyService.CHRONOLOGICAL ở backend.
 */
export function sortStops<T extends { visitDate: string | null; session: DaySession; dayIndex?: number | null; startTime?: string | null }>(stops: T[]): T[] {
  return [...stops].sort((a, b) => {
    if (a.visitDate !== b.visitDate) {
      if (!a.visitDate) return 1;
      if (!b.visitDate) return -1;
      return a.visitDate < b.visitDate ? -1 : 1;
    }
    const dayA = a.dayIndex ?? Number.MAX_SAFE_INTEGER;
    const dayB = b.dayIndex ?? Number.MAX_SAFE_INTEGER;
    if (dayA !== dayB) return dayA - dayB;
    return startMinutesOf(a) - startMinutesOf(b);
  });
}

// ─── Giờ tham quan, chế độ "Hôm nay", nhắc giờ ─────────────────────────────

/** Giờ bắt đầu đề xuất của từng buổi — khớp JourneyReminderService (nhắc trước 30 phút). */
export const SESSION_START: Record<DaySession, { hour: number; minute: number }> = {
  MORNING: { hour: 7, minute: 0 },
  NOON: { hour: 11, minute: 0 },
  AFTERNOON: { hour: 14, minute: 0 },
  EVENING: { hour: 18, minute: 0 },
};
/** Mỗi buổi coi như kéo dài chừng này (để biết điểm nào "đang diễn ra"). */
const SESSION_LENGTH_MIN: Record<DaySession, number> = { MORNING: 240, NOON: 180, AFTERNOON: 240, EVENING: 180 };
export const REMIND_BEFORE_MIN = 30;

export const sessionTimeLabel = (session: DaySession) =>
  `${SESSION_START[session].hour}:${String(SESSION_START[session].minute).padStart(2, '0')}`;

/** Giờ Việt Nam (UTC+7) — không phụ thuộc múi giờ của máy khách. */
const VN_OFFSET_MS = 7 * 3_600_000;

/** "YYYY-MM-DD" hôm nay theo giờ Việt Nam. */
export const vnTodayKey = (now: Date = new Date()) => new Date(now.getTime() + VN_OFFSET_MS).toISOString().slice(0, 10);

/** Thời điểm bắt đầu buổi tham quan (giờ Việt Nam) của một ngày. */
export function sessionStartsAt(dateKey: string, session: DaySession): Date {
  const { hour, minute } = SESSION_START[session];
  return new Date(Date.parse(`${dateKey}T00:00:00Z`) + (hour * 60 + minute) * 60_000 - VN_OFFSET_MS);
}

export function sessionEndsAt(dateKey: string, session: DaySession): Date {
  return new Date(sessionStartsAt(dateKey, session).getTime() + SESSION_LENGTH_MIN[session] * 60_000);
}

interface DatedStop { visitDate: string | null; session: DaySession; startTime?: string | null; endTime?: string | null }

/** Thời điểm bắt đầu của một mục (giờ Việt Nam): giờ riêng của mục, không có thì giờ của buổi. */
export function stopStartsAt(dateKey: string, stop: DatedStop): Date {
  return new Date(Date.parse(`${dateKey}T00:00:00Z`) + startMinutesOf(stop) * 60_000 - VN_OFFSET_MS);
}

/** Thời điểm kết thúc: giờ kết thúc của mục, có giờ bắt đầu mà thiếu giờ kết thúc thì 1 tiếng, không có thì hết buổi. */
export function stopEndsAt(dateKey: string, stop: DatedStop): Date {
  const match = stop.endTime ? /^(\d{1,2}):(\d{2})/.exec(stop.endTime) : null;
  if (match) return new Date(Date.parse(`${dateKey}T00:00:00Z`) + (Number(match[1]) * 60 + Number(match[2])) * 60_000 - VN_OFFSET_MS);
  if (stop.startTime) return new Date(stopStartsAt(dateKey, stop).getTime() + 60 * 60_000);
  return sessionEndsAt(dateKey, stop.session);
}

/** Nhãn giờ của mục: "05:30" (giờ riêng) hoặc giờ mặc định của buổi. */
export const stopTimeLabel = (stop: { session: DaySession; startTime?: string | null }) =>
  stop.startTime ? stop.startTime.slice(0, 5) : sessionTimeLabel(stop.session);

/** Khoảng ngày của chuyến: ngày đi / về khách chọn, mở rộng theo ngày tham quan của các điểm. */
export function journeyRange(journey: { startDate: string | null; endDate: string | null; stops: DatedStop[] }): { first: string | null; last: string | null } {
  const dates = journey.stops.map((s) => s.visitDate).filter((d): d is string => !!d).sort();
  const first = [journey.startDate, dates[0]].filter((d): d is string => !!d).sort()[0] ?? null;
  const last = [journey.endDate, dates[dates.length - 1]].filter((d): d is string => !!d).sort().pop() ?? null;
  return { first, last };
}

export type JourneyPhase = 'undated' | 'upcoming' | 'today' | 'past';

/** Chuyến đang ở giai đoạn nào so với hôm nay (giờ Việt Nam) — "Hôm nay" tự bật theo ngày, không theo trạng thái đơn. */
export function journeyPhase(journey: { startDate: string | null; endDate: string | null; stops: DatedStop[] }, today = vnTodayKey()): JourneyPhase {
  const { first, last } = journeyRange(journey);
  if (!first || !last) return 'undated';
  if (today < first) return 'upcoming';
  if (today > last) return 'past';
  return 'today';
}

/**
 * Điểm tiếp theo trong ngày hôm nay: điểm đang diễn ra (đã tới giờ, chưa hết buổi) hoặc sắp tới gần nhất. Hết điểm
 * trong ngày thì null.
 */
export function nextStopToday<T extends DatedStop>(stops: T[], now: Date = new Date()): { stop: T; startsAt: Date; ongoing: boolean } | null {
  const today = vnTodayKey(now);
  const todays = sortStops(stops.filter((s) => s.visitDate === today));
  for (const stop of todays) {
    const startsAt = stopStartsAt(today, stop);
    const endsAt = stopEndsAt(today, stop);
    if (now < endsAt) return { stop, startsAt, ongoing: now >= startsAt };
  }
  return null;
}

/** "2 giờ 15 phút", "8 phút" — đếm ngược tới giờ bắt đầu. */
export function countdownLabel(ms: number): string {
  const totalMin = Math.max(0, Math.ceil(ms / 60_000));
  const hours = Math.floor(totalMin / 60);
  const minutes = totalMin % 60;
  if (hours === 0) return `${minutes} phút`;
  return minutes === 0 ? `${hours} giờ` : `${hours} giờ ${minutes} phút`;
}

const icsDate = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const icsText = (value: string) => value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

/**
 * Tệp lịch .ics cho các điểm đã có ngày: mỗi điểm một sự kiện theo giờ bắt đầu của buổi, báo trước 30 phút. Dự phòng
 * cho iPhone chưa cài ứng dụng (Safari không nhận thông báo đẩy) — ứng dụng Lịch tự nhắc.
 */
export function buildJourneyIcs(
  journey: { id: number; title: string | null; stops: (DatedStop & { id: number; placeName: string | null; title?: string | null; address?: string | null })[] },
  linkOf: (stopId: number) => string,
): string | null {
  const dated = sortStops(journey.stops.filter((s) => !!s.visitDate));
  if (dated.length === 0) return null;
  const stamp = icsDate(new Date());
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//VietTrek//Lich trinh//VI', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
  for (const stop of dated) {
    const start = stopStartsAt(stop.visitDate as string, stop);
    const end = stopEndsAt(stop.visitDate as string, stop);
    const link = linkOf(stop.id);
    const name = stop.title?.trim() || stop.placeName || 'Lịch trình';
    lines.push(
      'BEGIN:VEVENT',
      `UID:viettrek-journey-${journey.id}-stop-${stop.id}@viettrek`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${icsDate(start)}`,
      `DTEND:${icsDate(end)}`,
      `SUMMARY:${icsText(`${SESSION_LABEL[stop.session]}: ${name}`)}`,
      `DESCRIPTION:${icsText(`Có vẻ đã đến lúc ${name} rồi, mở lịch trình: ${link}`)}`,
      ...(stop.address ? [`LOCATION:${icsText(stop.address)}`] : []),
      `URL:${link}`,
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `DESCRIPTION:${icsText(`Sắp đến giờ: ${name}`)}`,
      `TRIGGER:-PT${REMIND_BEFORE_MIN}M`,
      'END:VALARM',
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

/** Tải tệp .ics về máy (iPhone mở thẳng bằng ứng dụng Lịch). */
export function downloadIcs(content: string, fileName: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: 'text/calendar;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Tên hiển thị của lịch trình: tên khách đặt, không có thì theo chỗ nghỉ, rồi theo tỉnh của chuyến. */
export const journeyTitle = (journey: { title: string | null; basePlace?: { name: string } | null; regionName?: string | null }) =>
  journey.title?.trim()
  || (journey.basePlace ? `Chuyến đi ${journey.basePlace.name}` : journey.regionName ? `Chuyến đi ${journey.regionName}` : 'Lịch trình của tôi');

/** "Ngày 1" … theo khoảng cách tới ngày đầu chuyến. */
export function dayNumberOf(first: string | null, day: string | null): number | null {
  if (!first || !day) return null;
  return Math.round((Date.parse(`${day}T00:00:00Z`) - Date.parse(`${first}T00:00:00Z`)) / 86_400_000) + 1;
}

/** Link mở cẩm nang của một điểm (thông báo / lịch .ics): tab lịch trình của đơn nếu lịch trình gắn đơn. */
export const stopLink = (journey: { id: number; bookingCode?: string | null }, stopId: number) =>
  journey.bookingCode
    ? `${window.location.origin}/bookings/${encodeURIComponent(journey.bookingCode)}?tab=journey&stop=${stopId}`
    : `${window.location.origin}/journeys/${journey.id}?stop=${stopId}`;

/**
 * Link sửa lịch trình: trang lên lịch trình (/lich-trinh/:id) — dòng thời gian + bản đồ thêm điểm. Mở từ tab "Lịch
 * trình" của đơn thì lưu / thoát quay về tab đó.
 */
export const journeyEditPath = (journey: { id: number }, from?: 'booking'): string =>
  `/lich-trinh/${journey.id}${from ? `?from=${from}` : ''}`;
