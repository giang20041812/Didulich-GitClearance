import { Link } from 'react-router-dom';
import { Route, X } from 'lucide-react';
import type { JourneyStayContext } from '@/lib/stayContext';
import { formatVnDayShort } from '@/lib/roomAvailability';

interface JourneyContextBannerProps {
  context: JourneyStayContext;
  /** Bỏ chế độ chọn chỗ ở cho lịch trình (xem / đặt phòng như bình thường). */
  onDismiss?: () => void;
  className?: string;
}

/**
 * Dải "Đang chọn chỗ ở cho lịch trình …" — danh sách, chi tiết homestay và trang đặt phòng khi mở từ ô "Chỗ ở" của một
 * lịch trình (?forJourney=). Bấm tên lịch trình để quay lại; đặt phòng xong đơn tự gắn vào lịch trình.
 */
export default function JourneyContextBanner({ context, onDismiss, className = '' }: JourneyContextBannerProps) {
  const dates = context.checkIn && context.checkOut ? `${formatVnDayShort(context.checkIn)} → ${formatVnDayShort(context.checkOut)}` : null;
  const detail = [dates, context.guests ? `${context.guests} khách` : null].filter(Boolean).join(' · ');
  return (
    <div role="status" className={`flex items-center gap-3 rounded-2xl bg-[var(--color-ink-deep)] px-3.5 py-2.5 text-white shadow-md ${className}`}>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/10 text-amber-300">
        <Route className="h-4 w-4" aria-hidden />
      </span>
      <p className="min-w-0 flex-1 text-sm leading-snug">
        <span className="text-white/75">Đang chọn chỗ ở cho </span>
        <Link to={`/journeys/${context.journeyId}`} className="font-extrabold underline decoration-white/40 underline-offset-2 hover:decoration-white">
          {context.title}
        </Link>
        {detail && <span className="block text-xs text-white/70">{detail}</span>}
      </p>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Bỏ chọn chỗ ở cho lịch trình"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white/70 transition-colors hover:bg-white/10 hover:text-white cursor-pointer"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
