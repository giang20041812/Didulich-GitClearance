import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, BedDouble, CalendarDays, Loader2, ReceiptText, RefreshCw, Users } from 'lucide-react';
import CompactPlaceCard from '@/components/ui/CompactPlaceCard';
import ImagePlaceholder from '@/components/ui/ImagePlaceholder';
import type { HomestayDetailDto, HomestayDto } from '@/types/homestay';
import type { JourneyView } from '@/types/journey';
import { BOOKING_STATUS_LABEL, BOOKING_STATUS_TONE } from '@/lib/bookingStatus';
import { formatVnd } from '@/lib/compactCard';
import { journeyRange, journeyTitle } from '@/lib/journey';
import { mediaUrl } from '@/lib/mediaUrl';
import { addDaysKey, formatVnDayShort, nightsBetween, todayKey } from '@/lib/roomAvailability';
import { rememberStayContext, stayDetailPath, stayListPath, type JourneyStayContext } from '@/lib/stayContext';
import { preferredStayOf } from '@/lib/tripPlanner';
import { getApiErrorMessage } from '@/lib/apiError';
import { fetchHomestays, getHomestayById, prefetchHomestay } from '@/services/homestayService';
import { journeyInputOnDates, updateJourney } from '@/services/journeyService';

interface StaySlotProps {
  journey: JourneyView;
  onChange: (journey: JourneyView) => void;
  /** Vừa lưu lịch trình (?new=1): ô nổi bật để khách thấy bước tiếp theo. */
  highlight?: boolean;
}

/** Ngày nhận / trả phòng của chuyến: ngày đầu → ngày cuối (chuyến trong ngày vẫn tính 1 đêm). */
function journeyStay(journey: JourneyView): { checkIn: string; checkOut: string } | null {
  const { first, last } = journeyRange(journey);
  if (!first) return null;
  return { checkIn: first, checkOut: last && last > first ? last : addDaysKey(first, 1) };
}

/** Một homestay gợi ý trong ô "Chỗ ở". */
interface StayPick {
  id: string;
  name: string;
  coverImageUrl: string | null;
  location: string | null;
  price: number;
  rating: number;
  /** Hết phòng đúng ngày của chuyến. */
  soldOut: boolean;
  /** Homestay khách đang xem khi lên lịch trình (?stay=). */
  viewed: boolean;
}

const pickOf = (h: HomestayDto, viewed: boolean): StayPick => ({
  id: String(h.id),
  name: h.name,
  coverImageUrl: h.coverImageUrl || null,
  location: h.district || null,
  price: h.price,
  rating: h.ratingScore,
  soldOut: h.availableForSelectedDates === false,
  viewed,
});

const pickOfDetail = (d: HomestayDetailDto): StayPick => ({
  id: String(d.id),
  name: d.name,
  coverImageUrl: d.images?.[0] ?? null,
  location: d.regionName ?? d.district ?? null,
  price: d.priceRefMin ?? 0,
  rating: d.ratingAvg ?? 0,
  soldOut: false,
  viewed: true,
});

/**
 * Tối đa 3 gợi ý: homestay khách đang xem khi lên lịch trình đứng đầu (kể cả khi không nằm trong trang kết quả), rồi
 * các homestay còn phòng đúng ngày đang hoạt động; không còn chỗ nào trống thì vẫn hiện để khách xem ngày khác.
 */
async function loadPicks(
  query: { province: string | null; checkIn: string; checkOut: string; guests: number | null },
  viewedId: number | null,
): Promise<StayPick[]> {
  const page = await fetchHomestays({
    province: query.province ?? undefined,
    checkIn: query.checkIn,
    checkOut: query.checkOut,
    guests: query.guests ?? undefined,
    size: 6,
    sort: 'recommended',
  });
  const open = page.content.filter((h) => h.availableForSelectedDates !== false && (h.operationStatus ?? 'OPERATING') === 'OPERATING');
  const picks = (open.length > 0 ? open : page.content).map((h) => pickOf(h, Number(h.id) === viewedId));
  if (!viewedId) return picks.slice(0, 3);
  const listed = page.content.find((h) => Number(h.id) === viewedId);
  const detail = listed ? null : await getHomestayById(String(viewedId), 'low');
  const viewed = listed ? pickOf(listed, true) : detail ? pickOfDetail(detail) : null;
  return (viewed ? [viewed, ...picks.filter((p) => p.id !== viewed.id)] : picks).slice(0, 3);
}

/**
 * Ô "Chỗ ở" của lịch trình đã lưu — bước sau khi lên lịch trình: đã đặt phòng thì hiện homestay + trạng thái đơn; chưa
 * có thì gợi ý 3 homestay còn phòng ở tỉnh của chuyến (đúng ngày, đủ chỗ cho số khách) và link xem tất cả — đặt xong đơn
 * tự gắn vào lịch trình. Chưa chọn ngày đi: chọn ngày ngay tại ô (các mục "Ngày N" tự xếp vào ngày thật).
 */
export default function StaySlot({ journey, onChange, highlight = false }: StaySlotProps) {
  const stay = journeyStay(journey);
  const guests = journey.guestCount ?? null;
  const province = journey.regionName ?? null;
  const booked = !!journey.bookingCode && !!journey.basePlace && journey.bookingStatus !== 'CANCELLED';
  const context: JourneyStayContext = {
    journeyId: journey.id,
    title: journeyTitle(journey),
    province,
    checkIn: stay?.checkIn ?? null,
    checkOut: stay?.checkOut ?? null,
    guests,
  };
  const contextKey = JSON.stringify(context);

  const viewedId = preferredStayOf(journey);
  const [suggestions, setSuggestions] = useState<StayPick[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [startDraft, setStartDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  // Trang homestay / đặt phòng đọc lại để hiện "Đang chọn chỗ ở cho lịch trình…".
  useEffect(() => {
    if (!booked) rememberStayContext(JSON.parse(contextKey) as JourneyStayContext);
  }, [booked, contextKey]);

  useEffect(() => {
    if (booked || !stay) return undefined;
    let alive = true;
    setSuggestions(null);
    setLoadError('');
    loadPicks({ province, checkIn: stay.checkIn, checkOut: stay.checkOut, guests }, viewedId)
      .then((picks) => { if (alive) setSuggestions(picks); })
      .catch((err: unknown) => { if (alive) setLoadError(getApiErrorMessage(err, 'Chưa tải được gợi ý chỗ ở.')); });
    return () => { alive = false; };
    // stay là đối tượng mới mỗi lần vẽ — theo dõi theo giá trị.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [booked, stay?.checkIn, stay?.checkOut, province, guests, viewedId, attempt]);

  const pickDates = async () => {
    if (!startDraft) return;
    setSaving(true);
    setSaveError('');
    try {
      onChange(await updateJourney(journey.id, journeyInputOnDates(journey, startDraft)));
    } catch (err) {
      setSaveError(getApiErrorMessage(err, 'Chưa lưu được ngày đi.'));
    } finally {
      setSaving(false);
    }
  };

  const nights = stay ? nightsBetween(stay.checkIn, stay.checkOut) : 0;
  const frame = `rounded-3xl bg-white p-4 shadow-xs ring-1 sm:p-5 ${highlight ? 'ring-2 ring-[#0a7d64] shadow-[0_0_0_6px_rgba(10,125,100,0.10)]' : 'ring-slate-200'}`;

  if (booked && journey.basePlace) {
    const status = journey.bookingStatus ?? null;
    return (
      <section id="stay-slot" aria-label="Chỗ ở" className={`${frame} scroll-mt-28`}>
        <div className="flex items-center gap-3">
          <Link to={`/homestays/${journey.basePlace.id}`} className="block h-16 w-16 shrink-0 overflow-hidden rounded-2xl bg-slate-100 ring-1 ring-black/5">
            {journey.basePlace.coverImageUrl
              ? <img src={mediaUrl(journey.basePlace.coverImageUrl, 160)} alt="" className="h-full w-full object-cover" />
              : <ImagePlaceholder Icon={BedDouble} />}
          </Link>
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wider text-[#0a7d64]">
              <BedDouble className="h-3.5 w-3.5" aria-hidden /> Chỗ ở
              {status && <span className={`rounded-full border px-2 py-0.5 text-[10px] normal-case tracking-normal ${BOOKING_STATUS_TONE[status]}`}>{BOOKING_STATUS_LABEL[status]}</span>}
            </p>
            <Link to={`/homestays/${journey.basePlace.id}`} className="mt-0.5 block truncate text-base font-extrabold text-slate-900 hover:text-[#0a7d64]">
              {journey.basePlace.name}
            </Link>
            {stay && <p className="text-xs text-slate-500">{formatVnDayShort(stay.checkIn)} → {formatVnDayShort(stay.checkOut)} · {nights} đêm</p>}
          </div>
          <Link
            to={`/bookings/${encodeURIComponent(journey.bookingCode!)}`}
            className="hidden h-10 shrink-0 items-center gap-1.5 rounded-xl bg-[#edfbf7] px-3 text-sm font-bold text-[#06604a] ring-1 ring-teal-200 hover:ring-[#0a7d64] sm:inline-flex"
          >
            <ReceiptText className="h-4 w-4" /> Đơn #{journey.bookingCode}
          </Link>
        </div>
        <Link
          to={`/bookings/${encodeURIComponent(journey.bookingCode!)}`}
          className="mt-3 flex h-10 items-center justify-center gap-1.5 rounded-xl bg-[#edfbf7] text-sm font-bold text-[#06604a] ring-1 ring-teal-200 sm:hidden"
        >
          <ReceiptText className="h-4 w-4" /> Xem đơn #{journey.bookingCode}
        </Link>
      </section>
    );
  }

  return (
    <section id="stay-slot" aria-label="Chỗ ở" className={`${frame} scroll-mt-28`}>
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border-2 border-dashed border-[#0a7d64]/60 bg-teal-50/60 text-[#0a7d64]">
          <BedDouble className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-extrabold uppercase tracking-wider text-[#0a7d64]">Chỗ ở · bước tiếp theo</p>
          <h2 className="mt-0.5 text-base font-extrabold leading-snug text-slate-900 sm:text-lg">
            {journey.bookingStatus === 'CANCELLED' ? 'Đơn chỗ ở đã hủy — chọn chỗ ở khác' : 'Đặt homestay để hoàn thiện lịch trình'}
          </h2>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-semibold text-slate-500">
            {stay && (
              <span className="inline-flex items-center gap-1">
                <CalendarDays className="h-3.5 w-3.5 text-[#0a7d64]" aria-hidden />
                {formatVnDayShort(stay.checkIn)} → {formatVnDayShort(stay.checkOut)} · {nights} đêm
              </span>
            )}
            {guests && <span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5 text-[#0a7d64]" aria-hidden /> {guests} khách</span>}
            {province && <span>Homestay ở {province}</span>}
          </p>
        </div>
      </div>

      {!stay ? (
        <form
          className="mt-4 rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-200"
          onSubmit={(e) => { e.preventDefault(); void pickDates(); }}
        >
          <label htmlFor="stay-start" className="block text-sm font-bold text-slate-800">Bạn đi ngày nào?</label>
          <p className="text-xs text-slate-500">Chọn ngày đi để xem homestay còn phòng — các mục “Ngày 1, 2…” tự xếp vào đúng ngày.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <input
              id="stay-start"
              type="date"
              min={todayKey()}
              value={startDraft}
              onChange={(e) => setStartDraft(e.target.value)}
              className="h-11 min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 text-base font-semibold text-slate-800 focus:border-[#0a7d64] focus:outline-none sm:flex-none"
            />
            <button
              type="submit"
              disabled={!startDraft || saving}
              className="inline-flex h-11 items-center gap-1.5 rounded-xl bg-[#0a7d64] px-4 text-sm font-extrabold text-white shadow-sm transition-colors hover:bg-[#06604a] disabled:opacity-50 cursor-pointer"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />} Xem chỗ ở
            </button>
          </div>
          {saveError && <p role="alert" className="mt-2 text-xs font-semibold text-rose-600">{saveError}</p>}
        </form>
      ) : loadError ? (
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl bg-rose-50 p-3 text-sm font-semibold text-rose-700 ring-1 ring-rose-200">
          {loadError}
          <button type="button" onClick={() => setAttempt((n) => n + 1)} className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-white px-3 text-sm font-bold text-rose-700 ring-1 ring-rose-200 cursor-pointer">
            <RefreshCw className="h-4 w-4" /> Thử lại
          </button>
        </div>
      ) : !suggestions ? (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3" role="status" aria-label="Đang tìm chỗ ở">
          {[0, 1, 2].map((i) => <div key={i} className={`aspect-[4/5] animate-pulse rounded-lg bg-slate-100 ${i === 2 ? 'hidden sm:block' : ''}`} />)}
        </div>
      ) : suggestions.length === 0 ? (
        <p className="mt-4 rounded-2xl bg-slate-50 p-3 text-sm text-slate-600 ring-1 ring-slate-200">
          Chưa thấy homestay {province ? `ở ${province} ` : ''}đủ chỗ cho {guests ?? 'số'} khách vào ngày này — thử xem tất cả hoặc đổi ngày đi.
        </p>
      ) : (
        <div className="mt-4 grid grid-cols-2 items-start gap-3 sm:grid-cols-3">
          {suggestions.map((h, index) => (
            <div key={h.id} className={index === 2 ? 'hidden sm:block' : undefined}>
              <CompactPlaceCard
                to={stayDetailPath(context, h.id)}
                name={h.name}
                imageUrl={h.coverImageUrl}
                FallbackIcon={BedDouble}
                location={h.location}
                price={formatVnd(h.price)}
                priceUnit={h.price > 0 ? 'đêm' : null}
                onIntent={() => prefetchHomestay(h.id)}
                notice={h.soldOut
                  ? <span className="text-[11px] font-bold text-rose-600">Hết phòng ngày này</span>
                  : h.viewed ? <span className="text-[11px] font-bold text-[#0a7d64]">Bạn đã xem</span>
                    : h.rating > 0 ? <span className="text-[11px] font-bold text-amber-700">★ {h.rating.toFixed(1)}</span> : null}
              />
            </div>
          ))}
        </div>
      )}

      {stay && (
        <Link
          to={stayListPath(context)}
          className="mt-4 inline-flex items-center gap-1.5 text-sm font-extrabold text-[#0a7d64] hover:underline"
        >
          Xem tất cả homestay{province ? ` ở ${province}` : ''} <ArrowRight className="h-4 w-4" />
        </Link>
      )}
    </section>
  );
}
