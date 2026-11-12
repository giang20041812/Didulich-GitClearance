import { useEffect, useRef, useState } from 'react';
import { Camera, Check, ChevronRight, Clock, Mountain, Navigation, PartyPopper } from 'lucide-react';
import ImagePlaceholder from '@/components/ui/ImagePlaceholder';
import { directionsTo, nextOpenStop, useNow } from '@/components/journey/journeyUi';
import type { SightStopView } from '@/types/journey';
import { SESSION_LABEL, countdownLabel, dayNumberOf, sortStops, stopTimeLabel, vnTodayKey } from '@/lib/journey';
import { formatVnDayShort } from '@/lib/roomAvailability';
import { mediaUrl } from '@/lib/mediaUrl';

interface TodayPanelProps {
  stops: SightStopView[];
  onOpenGuide: (stop: SightStopView) => void;
  /** Check-in nhanh điểm tiếp theo: mở cẩm nang ngay ở mục check-in (nút Chụp ảnh). */
  onCheckin?: (stop: SightStopView) => void;
  /** Ngày đầu / cuối chuyến để hiện "Ngày 1/3". */
  firstDay?: string | null;
  lastDay?: string | null;
}

/**
 * Chế độ "Hôm nay" — tự bật vào những ngày của chuyến (theo ngày lịch trình, không phụ thuộc đơn đã thanh toán hay
 * chưa): điểm tiếp theo chưa check-in, đếm ngược tới giờ bắt đầu của buổi, Chỉ đường + Check-in (mở thẳng mục chụp
 * ảnh), bấm vào điểm để mở cẩm nang, và dải các điểm của hôm nay để nhìn nhanh đã đi tới đâu.
 */
export default function TodayPanel({ stops, onOpenGuide, onCheckin, firstDay = null, lastDay = null }: TodayPanelProps) {
  const now = useNow();
  const today = vnTodayKey(now);
  const todays = sortStops(stops.filter((s) => s.visitDate === today));
  const next = nextOpenStop(stops, now);
  const upcoming = sortStops(stops.filter((s) => !!s.visitDate && (s.visitDate as string) > today))[0];
  const dayNumber = dayNumberOf(firstDay, today);
  const dayTotal = dayNumberOf(firstDay, lastDay);
  const doneToday = todays.filter((s) => s.checkin).length;
  const cover = next?.stop.checkin?.photoUrl ?? next?.stop.coverImageUrl;
  // Dải "Lịch hôm nay" còn điểm bên phải (chưa cuộn hết): mờ mép phải để thấy là vuốt được, không cắt cụt giữa chữ.
  const stripRef = useRef<HTMLOListElement>(null);
  const [stripMore, setStripMore] = useState(false);
  useEffect(() => {
    const strip = stripRef.current;
    if (!strip) return undefined;
    const update = () => setStripMore(strip.scrollLeft + strip.clientWidth < strip.scrollWidth - 4);
    update();
    strip.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => { strip.removeEventListener('scroll', update); window.removeEventListener('resize', update); };
  }, [todays.length]);

  return (
    <section aria-label="Hôm nay" className="overflow-hidden rounded-3xl bg-gradient-to-br from-[#0a7d64] via-[#087259] to-[#06604a] text-white shadow-[0_8px_24px_-6px_rgba(6,96,74,0.45)]">
      <div className="flex items-center gap-2 px-4 pt-4">
        <span className="relative flex h-2.5 w-2.5" aria-hidden>
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-300 opacity-75" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-300" />
        </span>
        <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-white/85">Hôm nay · {formatVnDayShort(today)}</p>
        {dayNumber && dayTotal && dayTotal > 1 && (
          <span className="ml-auto rounded-full bg-white/15 px-2.5 py-0.5 text-[11px] font-bold">Ngày {dayNumber}/{dayTotal}</span>
        )}
      </div>

      {next ? (
        <div className="px-4 pb-4 pt-3">
          <button type="button" onClick={() => onOpenGuide(next.stop)} className="flex w-full items-center gap-3 rounded-2xl text-left cursor-pointer" aria-label={`Mở cẩm nang ${next.stop.placeName}`}>
            <span className="h-16 w-16 shrink-0 overflow-hidden rounded-2xl bg-white/10 ring-2 ring-white/30">
              {cover ? <img src={mediaUrl(cover)} alt="" className="h-full w-full object-cover" /> : <ImagePlaceholder Icon={Mountain} />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[11px] font-extrabold uppercase tracking-[0.12em] text-amber-200">{next.ongoing ? 'Đang diễn ra' : 'Điểm tiếp theo'}</span>
              <span className="mt-0.5 line-clamp-2 block text-lg font-extrabold leading-snug">{next.stop.placeName}</span>
              <span className="mt-0.5 block text-xs font-semibold text-white/75">{SESSION_LABEL[next.stop.session]} · từ {stopTimeLabel(next.stop)} · Cẩm nang</span>
            </span>
            <ChevronRight className="h-5 w-5 shrink-0 text-white/60" aria-hidden />
          </button>

          <div className="mt-3 flex items-center gap-2.5 rounded-2xl bg-white/10 px-3.5 py-2.5 ring-1 ring-white/15">
            <Clock className="h-5 w-5 shrink-0 text-amber-200" />
            {next.ongoing ? (
              <p className="text-sm font-bold">Đã đến giờ tham quan — chúc bạn có buổi đi thật vui!</p>
            ) : (
              <p className="text-sm text-white/80">
                Bắt đầu sau <strong className="ml-0.5 text-lg font-extrabold text-amber-200">{countdownLabel(next.startsAt.getTime() - now.getTime())}</strong>
              </p>
            )}
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => directionsTo(next.stop)}
              className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl bg-white px-3 text-sm font-extrabold text-[#06604a] shadow-sm transition-colors hover:bg-amber-50 cursor-pointer"
            >
              <Navigation className="h-4 w-4" /> Chỉ đường
            </button>
            <button
              type="button"
              onClick={() => (onCheckin ?? onOpenGuide)(next.stop)}
              className={`inline-flex h-11 items-center justify-center gap-1.5 rounded-xl px-3 text-sm font-extrabold transition-colors cursor-pointer ${
                next.ongoing ? 'bg-amber-300 text-amber-950 shadow-sm hover:bg-amber-200' : 'bg-white/15 text-white ring-1 ring-white/25 hover:bg-white/25'
              }`}
            >
              <Camera className="h-4 w-4" /> Check-in
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-3 px-4 pb-4 pt-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white/15">
            <PartyPopper className="h-5 w-5 text-amber-200" />
          </span>
          <div className="min-w-0 text-sm">
            <p className="font-extrabold">{todays.length > 0 ? 'Hôm nay đã đi hết lịch trình!' : 'Hôm nay là ngày nghỉ ngơi.'}</p>
            <p className="mt-0.5 text-xs text-white/75">
              {todays.length > 0 && doneToday < todays.length ? 'Đừng quên check-in để lưu lại kỷ niệm nhé.' : 'Thư giãn ở chỗ nghỉ và chuẩn bị cho chặng tiếp theo.'}
            </p>
            {upcoming?.visitDate && (
              <button type="button" onClick={() => onOpenGuide(upcoming)} className="mt-2 inline-flex max-w-full items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-bold ring-1 ring-white/20 hover:bg-white/25 cursor-pointer">
                <span className="truncate">Tiếp theo: {upcoming.placeName}</span>
                <span className="shrink-0 text-white/70">· {SESSION_LABEL[upcoming.session]} {formatVnDayShort(upcoming.visitDate)}</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Dải điểm của hôm nay: nhìn nhanh đã đi tới đâu */}
      {todays.length > 0 && (
        <div className="border-t border-white/10 bg-black/10 px-4 py-3">
          <p className="mb-2 text-[11px] font-bold text-white/70">Lịch hôm nay · đã check-in {doneToday}/{todays.length}</p>
          <ol
            ref={stripRef}
            className={`scrollbar-hide -mx-1 flex gap-1.5 overflow-x-auto px-1 ${stripMore ? 'pr-6 [mask-image:linear-gradient(to_right,#000_calc(100%-32px),transparent)]' : ''}`}
          >
            {todays.map((stop) => {
              const isNext = next?.stop.id === stop.id;
              return (
                <li key={stop.id} className="shrink-0">
                  <button
                    type="button"
                    onClick={() => onOpenGuide(stop)}
                    className={`inline-flex max-w-[11rem] items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-bold transition-colors cursor-pointer ${
                      isNext ? 'bg-amber-300 text-amber-950' : stop.checkin ? 'bg-white/20 text-white' : 'bg-white/10 text-white/80 hover:bg-white/20'
                    }`}
                  >
                    {stop.checkin ? (
                      <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-400 text-emerald-950"><Check className="h-3 w-3" strokeWidth={3.5} /></span>
                    ) : (
                      <span className={`h-2 w-2 shrink-0 rounded-full ${isNext ? 'bg-amber-950' : 'bg-white/50'}`} />
                    )}
                    <span className="shrink-0 tabular-nums">{stopTimeLabel(stop)}</span>
                    <span className="truncate font-semibold">{stop.placeName}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </section>
  );
}
