/**
 * Tiện ích giao diện dùng chung cho các màn lịch trình (trang lịch trình, tab lịch trình của đơn, trang chia sẻ):
 * đồng hồ "bây giờ", điểm tiếp theo chưa check-in, nhãn giai đoạn chuyến, mở Chỉ đường, nhận biết máy cảm ứng.
 */
import { useEffect, useState } from 'react';
import type { DaySession, SightStopView } from '@/types/journey';
import { dayNumberOf, journeyPhase, journeyRange, nextStopToday, vnTodayKey, type JourneyPhase } from '@/lib/journey';
import { openGoogleMapsDirections } from '@/lib/mapUtils';

/** Thời điểm hiện tại, tự cập nhật theo chu kỳ (đếm ngược, điểm tiếp theo). */
export function useNow(intervalMs = 30_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);
  return now;
}

/** Điểm tham quan tiếp theo hôm nay — bỏ qua điểm đã check-in (khách đã tới rồi thì không nhắc nữa). */
export function nextOpenStop(stops: SightStopView[], now: Date) {
  return nextStopToday(stops.filter((s) => !s.checkin), now);
}

/** Nhãn giai đoạn chuyến cho chip đầu trang / thẻ chuyến đi. */
export function phaseChip(
  journey: { startDate: string | null; endDate: string | null; stops: { visitDate: string | null; session: DaySession }[] },
  today = vnTodayKey(),
): { phase: JourneyPhase; label: string; className: string; dot: string } {
  const phase = journeyPhase(journey, today);
  const { first, last } = journeyRange(journey);
  if (phase === 'today') {
    const day = dayNumberOf(first, today);
    const total = dayNumberOf(first, last);
    return {
      phase,
      label: day && total && total > 1 ? `Đang đi · Ngày ${day}/${total}` : 'Đang đi · Hôm nay',
      className: 'bg-[#0a7d64] text-white',
      dot: 'bg-emerald-300',
    };
  }
  if (phase === 'upcoming') {
    const days = first ? (dayNumberOf(today, first) ?? 1) - 1 : null;
    return {
      phase,
      label: days === 1 ? 'Sắp đi · ngày mai' : days ? `Sắp đi · còn ${days} ngày` : 'Sắp đi',
      className: 'bg-amber-100 text-amber-800',
      dot: 'bg-amber-500',
    };
  }
  if (phase === 'past') return { phase, label: 'Đã đi', className: 'bg-slate-100 text-slate-600', dot: 'bg-slate-400' };
  return { phase, label: 'Chưa chọn ngày', className: 'bg-slate-100 text-slate-600', dot: 'bg-slate-400' };
}

/** Mở Google Maps chỉ đường tới một điểm (ghim tọa độ nếu có, không thì theo địa chỉ / tên). */
export function directionsTo(stop: { latitude?: number | null; longitude?: number | null; address?: string | null; placeName: string }) {
  const hasPin = stop.latitude != null && stop.longitude != null && Number(stop.latitude) !== 0;
  openGoogleMapsDirections(
    hasPin ? Number(stop.latitude) : undefined,
    hasPin ? Number(stop.longitude) : undefined,
    stop.address || stop.placeName,
  );
}

/** Máy cảm ứng (điện thoại, máy tính bảng): mở ứng dụng camera của máy thay cho camera trong trang. */
export const isTouchDevice = () => {
  try {
    return window.matchMedia('(pointer: coarse)').matches;
  } catch {
    return false;
  }
};

/** Trình duyệt mở được camera ngay trong trang (máy tính có webcam, trang chạy HTTPS / localhost). */
export const canStreamCamera = () =>
  typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && window.isSecureContext !== false;
