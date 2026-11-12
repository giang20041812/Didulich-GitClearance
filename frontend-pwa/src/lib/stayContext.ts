/**
 * Chọn chỗ ở cho một lịch trình đã lưu: ô "Chỗ ở" của trang lịch trình mở danh sách / chi tiết homestay kèm
 * ?forJourney={id}. Tên, tỉnh, ngày, số khách của lịch trình giữ trong phiên (sessionStorage) để trang homestay và trang
 * đặt phòng hiện dải "Đang chọn chỗ ở cho lịch trình…" mà không phải tải lại lịch trình. Đặt phòng xong, đơn tự gắn vào
 * lịch trình (journeyId trong yêu cầu đặt phòng).
 */
import { isDateKey } from '@/lib/roomAvailability';

export interface JourneyStayContext {
  journeyId: number;
  title: string;
  /** Tỉnh / thành của lịch trình (lọc danh sách homestay). */
  province: string | null;
  checkIn: string | null;
  checkOut: string | null;
  guests: number | null;
}

const KEY = 'journey_stay_ctx_v1';

/** ?forJourney= hợp lệ (số nguyên dương) hoặc null. */
export const parseJourneyId = (value: string | null | undefined): number | null => {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
};

export function rememberStayContext(context: JourneyStayContext): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(context));
  } catch {
    // Chế độ riêng tư: dải chỉ hiện tên chung "lịch trình của bạn".
  }
}

/** Ngữ cảnh đã lưu của đúng lịch trình này (null = không có / của lịch trình khác). */
export function readStayContext(journeyId: number | null): JourneyStayContext | null {
  if (!journeyId) return null;
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<JourneyStayContext>;
    if (parsed.journeyId !== journeyId) return null;
    const guests = Number(parsed.guests);
    return {
      journeyId,
      title: typeof parsed.title === 'string' && parsed.title.trim() ? parsed.title : 'Lịch trình của bạn',
      province: typeof parsed.province === 'string' && parsed.province.trim() ? parsed.province : null,
      checkIn: isDateKey(parsed.checkIn) ? parsed.checkIn : null,
      checkOut: isDateKey(parsed.checkOut) ? parsed.checkOut : null,
      guests: Number.isInteger(guests) && guests > 0 ? guests : null,
    };
  } catch {
    return null;
  }
}

/**
 * Ngữ cảnh của ?forJourney= trên trang homestay / đặt phòng: bản đã lưu trong phiên, hoặc bản tối thiểu khi mở link ở tab
 * khác (sessionStorage không theo sang) — dải vẫn hiện "lịch trình của bạn" và đơn vẫn gắn đúng lịch trình.
 */
export function stayContextFor(journeyId: number | null): JourneyStayContext | null {
  if (!journeyId) return null;
  return readStayContext(journeyId) ?? { journeyId, title: 'lịch trình của bạn', province: null, checkIn: null, checkOut: null, guests: null };
}

/** Tham số tìm chỗ ở theo lịch trình: tỉnh, ngày nhận / trả phòng, số khách, forJourney. */
export function stayQuery(context: JourneyStayContext, withProvince = true): string {
  const params = new URLSearchParams();
  if (withProvince && context.province) params.set('province', context.province);
  if (context.checkIn) params.set('checkIn', context.checkIn);
  if (context.checkOut) params.set('checkOut', context.checkOut);
  if (context.guests) params.set('guests', String(context.guests));
  params.set('forJourney', String(context.journeyId));
  return params.toString();
}

/** Link danh sách homestay của tỉnh / chi tiết một homestay, mang theo lịch trình đang chọn chỗ ở. */
export const stayListPath = (context: JourneyStayContext) => `/homestays?${stayQuery(context)}`;
export const stayDetailPath = (context: JourneyStayContext, placeId: number | string) =>
  `/homestays/${encodeURIComponent(String(placeId))}?${stayQuery(context, false)}`;
