import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowRight, Check, Route, Sparkles } from 'lucide-react';
import type { BookingResponseDto, BookingTripFilters } from '@/types/booking';
import { formatVnDayShort } from '@/lib/roomAvailability';
import { tripPlannerPath } from '@/lib/tripLinks';

/** Lịch trình khách đang chọn chỗ ở (mở trang đặt phòng từ ô "Chỗ ở" của lịch trình). */
export interface BookingTripTarget {
  id: number;
  title: string;
}

interface BookingTripSectionProps {
  journey: BookingTripTarget;
  attach: boolean;
  onAttachChange: (attach: boolean) => void;
  /** Chỉ tài khoản khách gắn được đơn vào lịch trình của mình. */
  loggedIn: boolean;
}

/**
 * Trang đặt phòng mở từ ô "Chỗ ở" của một lịch trình: tùy chọn gắn đơn vào lịch trình đó (bật sẵn). Gắn xong ô "Chỗ ở"
 * của lịch trình là homestay này; lịch trình lệch ngày thì dời theo ngày nhận phòng (giữ thứ tự ngày 1, 2…).
 */
export function BookingTripSection({ journey, attach, onAttachChange, loggedIn }: BookingTripSectionProps) {
  const active = attach && loggedIn;
  return (
    <section id="booking-journey" aria-label="Lịch trình" className="scroll-mt-24 rounded-lg border border-teal-200 bg-white p-5 shadow-xs md:p-6">
      <label className={`flex items-start gap-3 ${loggedIn ? 'cursor-pointer' : 'cursor-not-allowed'}`}>
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[#edfbf7] text-[var(--color-primary)]">
          <Route className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-base font-bold text-[var(--color-ink-deep)]">Gắn vào lịch trình “{journey.title}”</span>
          <span className="mt-0.5 block text-xs leading-relaxed text-[var(--color-muted)]">
            {loggedIn
              ? 'Homestay này điền vào ô “Chỗ ở” của lịch trình; ngày đi theo ngày nhận phòng. Bỏ chọn nếu bạn đặt cho chuyến khác.'
              : 'Đăng nhập tài khoản khách để gắn đơn vào lịch trình — bạn vẫn đặt phòng được như bình thường.'}
          </span>
        </span>
        <input
          type="checkbox"
          role="switch"
          checked={active}
          disabled={!loggedIn}
          onChange={(e) => onAttachChange(e.target.checked)}
          className="peer sr-only"
        />
        <span
          aria-hidden
          className={`relative mt-1 inline-flex h-6 w-11 shrink-0 rounded-full transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--color-primary)] peer-focus-visible:ring-offset-2 ${active ? 'bg-[var(--color-primary)]' : 'bg-slate-200'}`}
        >
          <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${active ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
        </span>
      </label>
    </section>
  );
}

/** Lịch trình gợi ý khách chọn kèm khi đặt phòng ("Lưu kèm lịch trình … vào đơn" ở trang homestay). */
export interface BookingTripSuggestion {
  /** Mã lịch trình gợi ý (TripTemplate.code). */
  template: string;
  title: string | null;
  filters: BookingTripFilters | null;
}

interface BookingTripResultProps {
  result: BookingResponseDto;
  /** Lịch trình khách định gắn (có thì báo theo tên). */
  journey: BookingTripTarget | null;
  /** Đặt bằng tài khoản khách: mời thẳng sang /lich-trinh (lưu xong tự gắn đơn); chưa đăng nhập thì qua tab của đơn. */
  loggedIn: boolean;
  province: string | null;
  placeId: number | null;
  /** Lịch trình gợi ý chọn kèm ở trang homestay: thẻ nổi bật "Lưu lịch trình … cho đơn này" thay cho lời mời chung. */
  trip?: BookingTripSuggestion | null;
}

/**
 * Màn hình đặt thành công: xác nhận đơn đã gắn vào lịch trình, báo nhẹ khi chưa gắn được (đơn vẫn thành công), mời lưu
 * lịch trình gợi ý đã chọn kèm ở trang homestay, hoặc mời lên lịch trình gợi ý cho chuyến đi (tỉnh, ngày, số khách theo
 * đơn — lưu xong tự gắn vào đơn).
 */
export function BookingTripResult({ result, journey, loggedIn, province, placeId, trip = null }: BookingTripResultProps) {
  const bookingTab = `/bookings/${encodeURIComponent(result.bookingCode)}?tab=journey`;

  if (result.journeyWarning) {
    return (
      <div role="status" className="mt-5 flex items-start gap-3 rounded-md border border-amber-200 bg-amber-50 px-3.5 py-3 text-left">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
        <div className="min-w-0 text-xs text-amber-900 sm:text-sm">
          <p className="font-bold">Chưa gắn được vào lịch trình</p>
          <p className="mt-0.5 leading-relaxed">{result.journeyWarning}</p>
          <Link to={bookingTab} className="mt-1.5 inline-flex items-center gap-1 font-bold text-amber-800 underline underline-offset-2 hover:text-amber-950">
            Gắn lại ở tab Lịch trình <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    );
  }

  if (result.journeyId) {
    return (
      <div className="mt-5 overflow-hidden rounded-md border border-teal-200 text-left">
        <div className="flex items-center gap-3 bg-[#edfbf7] px-3.5 py-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary)] text-white">
            <Check className="h-4 w-4" strokeWidth={3} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-[var(--color-ink-deep)]">
              Đã gắn vào lịch trình{journey ? ` “${journey.title}”` : ''}
            </p>
            <p className="text-xs text-[var(--color-muted)]">Ô “Chỗ ở” đã có homestay này · nhắc giờ, check-in trong lịch trình</p>
          </div>
        </div>
        <Link
          to={`/journeys/${result.journeyId}`}
          className="flex h-11 items-center justify-center gap-1.5 border-t border-teal-100 bg-white text-sm font-bold text-[var(--color-primary)] transition-colors hover:bg-[#f4fbf8]"
        >
          Xem lịch trình <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    );
  }

  // Lịch trình đã chọn kèm: mở thẳng màn xem & chỉnh của đúng gói đó (ngày, số khách theo đơn, bắt đầu từ homestay vừa
  // đặt) — bấm lưu là lịch trình gắn vào đơn.
  if (trip && loggedIn) {
    const savePath = tripPlannerPath({
      province,
      checkIn: result.checkIn,
      checkOut: result.checkOut,
      guests: result.guestCount,
      stay: placeId,
      forBooking: result.bookingCode,
      template: trip.template,
      duration: trip.filters?.duration,
      dining: trip.filters?.dining,
      goals: trip.filters?.goals,
    });
    const dates = result.checkIn && result.checkOut ? `${formatVnDayShort(result.checkIn)} → ${formatVnDayShort(result.checkOut)}` : null;
    return (
      <div className="mt-5 overflow-hidden rounded-lg border-[1.5px] border-[var(--color-primary)] bg-white text-left shadow-xs">
        <div className="flex items-start gap-3 px-3.5 py-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[#fdf3d7] text-[#8a5a00]">
            <Route className="h-[18px] w-[18px]" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-extrabold leading-snug text-[var(--color-ink-deep)]">
              Lưu lịch trình {trip.title ? `“${trip.title}”` : 'đã chọn'} cho đơn này
            </p>
            <p className="mt-0.5 text-xs leading-relaxed text-[var(--color-muted)]">
              Bạn đã chọn kèm khi đặt phòng{dates ? ` · ${dates}` : ''} · bắt đầu từ homestay vừa đặt. Xem lại, chỉnh nếu cần rồi lưu —
              lịch trình tự gắn vào đơn.
            </p>
          </div>
        </div>
        <Link
          to={savePath}
          className="flex h-12 items-center justify-center gap-1.5 cta cta-primary text-sm font-extrabold text-white transition-colors "
        >
          Xem & lưu lịch trình <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      </div>
    );
  }

  const invite = loggedIn
    ? tripPlannerPath({ province, checkIn: result.checkIn, checkOut: result.checkOut, guests: result.guestCount, stay: placeId, forBooking: result.bookingCode })
    : bookingTab;
  return (
    <Link
      to={invite}
      className="group mt-5 flex items-center gap-3 rounded-md border border-dashed border-teal-300/80 px-3.5 py-3 text-left transition-colors hover:border-[var(--color-primary)] hover:bg-[#f4fbf8]"
    >
      <Sparkles className="h-4 w-4 shrink-0 text-[var(--color-primary)]" />
      <span className="min-w-0 flex-1 text-xs text-[var(--color-ink)] sm:text-sm">
        <strong className="text-[var(--color-ink-deep)]">Lên lịch trình gợi ý</strong> miễn phí cho chuyến đi này
      </span>
      <ArrowRight className="h-4 w-4 shrink-0 text-gray-400 transition-transform group-hover:translate-x-0.5 group-hover:text-[var(--color-primary)]" />
    </Link>
  );
}
