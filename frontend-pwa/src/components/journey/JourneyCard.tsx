import { Link } from 'react-router-dom';
import { ArrowRight, CalendarDays, Globe2, Home, MapPin, Mountain } from 'lucide-react';
import ImagePlaceholder from '@/components/ui/ImagePlaceholder';
import MiniRoute from '@/components/journey/MiniRoute';
import { phaseChip } from '@/components/journey/journeyUi';
import { isSightStop, type JourneyView } from '@/types/journey';
import { dayNumberOf, journeyRange, journeyTitle, sortStops } from '@/lib/journey';
import { formatVnDayShort } from '@/lib/roomAvailability';
import { mediaUrl } from '@/lib/mediaUrl';

/**
 * Thẻ một lịch trình trong "Của tôi" (trang Lịch trình): ảnh bìa + giai đoạn chuyến (+ "Công khai" nếu đã đăng), tên, ngày,
 * chỗ nghỉ (chưa có thì tỉnh), lộ trình thu nhỏ các điểm tham quan và tiến độ check-in. Cả thẻ là link; chuyến đang đi được
 * tô nổi với lối vào chế độ "Hôm nay". wide: thẻ nằm ngang chiếm cả hàng (từ 640px) khi nhóm chỉ có một chuyến.
 */
export default function JourneyCard({ journey, wide = false }: { journey: JourneyView; wide?: boolean }) {
  const { first, last } = journeyRange(journey);
  const chip = phaseChip(journey);
  // Lộ trình thu nhỏ chỉ vẽ điểm tham quan; bữa ăn, di chuyển, hoạt động… đếm thành "mục khác".
  const ordered = sortStops(journey.stops.filter(isSightStop));
  const others = journey.stops.length - ordered.length;
  const cover = ordered.find((s) => s.checkin?.photoUrl)?.checkin?.photoUrl ?? journey.basePlace?.coverImageUrl ?? ordered.find((s) => s.coverImageUrl)?.coverImageUrl;
  const checkedIn = ordered.filter((s) => s.checkin).length;
  const days = first && last ? dayNumberOf(first, last) : null;
  const live = chip.phase === 'today';

  return (
    <Link
      to={`/journeys/${journey.id}`}
      className={`group flex flex-col overflow-hidden rounded-3xl bg-white shadow-xs ring-1 transition-all hover:-translate-y-0.5 hover:shadow-[var(--shadow-card-hover)] ${
        live ? 'ring-2 ring-[#0a7d64]' : 'ring-slate-200 hover:ring-teal-300'
      } ${wide ? 'sm:col-span-2 sm:flex-row' : ''}`}
    >
      <div className={`relative h-28 shrink-0 overflow-hidden bg-slate-100 sm:h-32 ${wide ? 'sm:h-auto sm:min-h-44 sm:w-2/5' : ''}`}>
        {cover ? (
          <img src={mediaUrl(cover)} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-500" />
        ) : (
          <ImagePlaceholder Icon={Mountain} />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/35 via-transparent to-transparent" />
        <span className={`absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-extrabold shadow-sm ${chip.className}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${chip.dot}`} aria-hidden /> {chip.label}
        </span>
        {journey.publishedAt && !journey.feedHidden && (
          <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-white/90 px-2 py-0.5 text-[11px] font-extrabold text-[#06604a] shadow-sm backdrop-blur-sm">
            <Globe2 className="h-3 w-3" aria-hidden /> Công khai
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col p-4">
        <p className="line-clamp-1 text-base font-extrabold text-slate-900">{journeyTitle(journey)}</p>
        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-500">
          <span className="inline-flex items-center gap-1">
            <CalendarDays className="h-3.5 w-3.5 shrink-0" />
            {first && last ? `${formatVnDayShort(first)} → ${formatVnDayShort(last)}${days ? ` · ${days} ngày` : ''}` : 'Chưa chọn ngày'}
          </span>
          {journey.basePlace ? (
            <span className="inline-flex min-w-0 items-center gap-1">
              <Home className="h-3.5 w-3.5 shrink-0" /> <span className="truncate">{journey.basePlace.name}</span>
            </span>
          ) : journey.regionName ? (
            <span className="inline-flex min-w-0 items-center gap-1">
              <MapPin className="h-3.5 w-3.5 shrink-0" /> <span className="truncate">{journey.regionName}</span>
            </span>
          ) : null}
        </p>

        {ordered.length > 0 ? (
          <MiniRoute
            className="mt-3"
            stops={ordered.map((s) => ({ key: s.id, imageUrl: s.checkin?.photoUrl ?? s.coverImageUrl, session: s.session, done: !!s.checkin }))}
          />
        ) : (
          <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2.5 text-xs text-slate-500">
            {others > 0 ? `${others} mục, chưa có điểm tham quan — mở để thêm.` : 'Chưa có điểm nào — mở để thêm điểm đến.'}
          </p>
        )}

        <div className="mt-auto flex items-center justify-between gap-2 pt-3 text-xs">
          <span className="font-semibold text-slate-500">
            {ordered.length} điểm{others > 0 ? ` · ${others} mục khác` : ''}{checkedIn > 0 ? <> · <span className="text-emerald-700">đã check-in {checkedIn}</span></> : ''}
          </span>
          <span className="inline-flex shrink-0 items-center gap-1 font-extrabold text-[#0a7d64]">
            {live && 'Mở chế độ Hôm nay'} <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
          </span>
        </div>
      </div>
    </Link>
  );
}
