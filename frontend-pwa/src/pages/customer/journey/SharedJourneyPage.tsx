import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import { AlertCircle, ArrowLeft, BedDouble, Copy, Loader2, Quote } from 'lucide-react';
import ImagePlaceholder from '@/components/ui/ImagePlaceholder';
import Stepper from '@/components/ui/Stepper';
import TripTimeline from '@/components/trip/TripTimeline';
import { rowsFromShared } from '@/components/trip/timelineRows';
import HelpfulButton from '@/components/experience/HelpfulButton';
import ShareLinkButton from '@/components/experience/ShareLinkButton';
import { useHelpfulVotes } from '@/components/experience/useHelpfulVotes';
import JourneyRoute, { type RouteStop } from '@/components/journey/JourneyRoute';
import JourneySheet from '@/components/journey/JourneySheet';
import StopGuideSheet from '@/components/journey/StopGuideSheet';
import type { SharedJourneyView, SharedStopView, SightStopView } from '@/types/journey';
import type { TripCatalog } from '@/types/trip';
import { startMinutesOf } from '@/lib/journey';
import { addDaysKey, formatVnDayShort, isDateKey, todayKey } from '@/lib/roomAvailability';
import { mediaUrl } from '@/lib/mediaUrl';
import { getApiErrorMessage } from '@/lib/apiError';
import { useStickyBottomBar } from '@/hooks/useStickyBottomBar';
import { getCurrentCustomer } from '@/services/authService';
import { copySharedJourney, fetchSharedJourney } from '@/services/journeyService';
import { fetchTripCatalog } from '@/services/tripService';
import { installAxiosBoot } from '@/lib/axiosBoot';

// Trang dùng axios: cài cấu hình (hàng đợi / hedge / interceptor) trước request đầu tiên.
installAxiosBoot();

/** Điểm trên trang chia sẻ → dạng điểm của cẩm nang (chỉ xem: video, ảnh, Chỉ đường, khoảnh khắc của chủ lịch trình). */
const asGuideStop = (stop: SharedStopView, index: number): SightStopView => ({
  id: index,
  placeId: stop.placeId,
  placeName: stop.placeName,
  placeSlug: stop.placeSlug,
  coverImageUrl: stop.coverImageUrl,
  latitude: stop.latitude,
  longitude: stop.longitude,
  visitDate: stop.visitDate,
  session: stop.session,
  startTime: stop.startTime ?? null,
  tiktokUrl: stop.tiktokUrl,
  checkin: stop.checkinPhotoUrl || stop.checkinNote
    ? { id: index, photoUrl: stop.checkinPhotoUrl ?? null, note: stop.checkinNote ?? null, hidden: false, hiddenReason: null, createdAt: '' }
    : null,
});

/** Bìa khi chưa có ảnh: nền xanh thương hiệu, mặt trời lúa chín và các tầng ruộng bậc thang. */
function HeroArt() {
  return (
    <div className="h-full w-full bg-gradient-to-br from-[#12a283] via-[#0a7d64] to-[#06604a]">
      <svg viewBox="0 0 400 200" preserveAspectRatio="xMidYMax slice" className="h-full w-full" aria-hidden>
        <circle cx="318" cy="58" r="46" fill="#fcd34d" opacity="0.16" />
        <circle cx="318" cy="58" r="26" fill="#fcd34d" opacity="0.9" />
        <path d="M0,112 Q60,88 120,108 T240,100 T400,112 L400,200 L0,200 Z" fill="#ffffff" opacity="0.07" />
        <path d="M0,138 Q70,116 140,134 T280,128 T400,140 L400,200 L0,200 Z" fill="#ffffff" opacity="0.09" />
        <path d="M0,164 Q80,146 160,160 T320,154 T400,166 L400,200 L0,200 Z" fill="#000000" opacity="0.12" />
      </svg>
    </div>
  );
}

/** Theo ngày (chưa xếp ngày cuối) rồi giờ (giờ riêng, không có thì giờ của buổi); cùng giờ giữ thứ tự máy chủ trả. */
const ordered = (stops: SharedStopView[]) =>
  stops
    .map((stop, i) => ({ stop, i }))
    .sort((a, b) => (a.stop.dayNumber ?? 999) - (b.stop.dayNumber ?? 999)
      || startMinutesOf(a.stop) - startMinutesOf(b.stop)
      || a.i - b.i)
    .map(({ stop }) => stop);

/**
 * Trang lịch trình công khai (/j/:token) — ai có link đều xem được, không cần đăng nhập. Không có mã đơn, giá, SĐT; chuyến
 * chưa đi xong chỉ hiện "Ngày 1, 2". Bố cục: ảnh bìa + tên + một dòng tóm tắt, "Hữu ích" · "Chia sẻ", rồi lộ trình mỗi
 * ngày một trang (vuốt / ‹ › / tab ngày; bấm một điểm mở cẩm nang) — ảnh check-in và lưu bút của người đăng nằm ngay dưới
 * ngày tương ứng, không lặp thành một "nhật ký" dài riêng. Hai nút chính luôn trong tầm tay (thanh dính đáy trên điện
 * thoại, cột phải trên máy tính): "Áp dụng lịch trình này" (chép nguyên lịch trình — chọn ngày đi, số người; chưa đăng
 * nhập: đăng nhập trước rồi chép) và "Đặt homestay này".
 */
export default function SharedJourneyPage() {
  const { token = '' } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [journey, setJourney] = useState<SharedJourneyView | null>(null);
  const [error, setError] = useState('');
  const [guideIndex, setGuideIndex] = useState<number | null>(null);
  const [applyOpen, setApplyOpen] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState('');
  /** Số người khi áp dụng (null = theo chuyến gốc). */
  const [guests, setGuests] = useState<number | null>(null);
  /** Danh mục của tỉnh: tên dịch vụ thêm, ảnh món, tên từng ngày của gói (công khai, giữ trong tab 10 phút). */
  const [catalog, setCatalog] = useState<TripCatalog | null>(null);
  const loggedIn = getCurrentCustomer()?.role === 'TRAVELER';
  /** Mở từ mục Khám phá của trang Lịch trình: nút quay lại trở về đúng chỗ đang xem (giữ danh sách đã tải). */
  const fromFeed = (location.state as { from?: string } | null)?.from === 'feed';
  useStickyBottomBar(!!journey);
  const votes = useHelpfulVotes(token ? [token] : []);

  useEffect(() => {
    let alive = true;
    fetchSharedJourney(token)
      .then((data) => { if (alive) setJourney(data); })
      .catch((err: unknown) => {
        if (!alive) return;
        setError(axios.isAxiosError(err) && err.response?.status === 404
          ? 'Lịch trình không tồn tại hoặc chủ lịch trình đã tắt chia sẻ.'
          : getApiErrorMessage(err, 'Không tải được lịch trình.'));
      });
    return () => { alive = false; };
  }, [token]);

  const stops = useMemo(() => ordered(journey?.stops ?? []), [journey]);
  const regionName = journey?.regionName ?? null;
  const hasItems = (journey?.items?.length ?? 0) > 0;
  useEffect(() => {
    if (!regionName || !hasItems) return undefined;
    let alive = true;
    fetchTripCatalog(regionName).then((data) => { if (alive) setCatalog(data); }).catch(() => undefined);
    return () => { alive = false; };
  }, [regionName, hasItems]);

  const apply = async () => {
    if (!journey) return;
    const start = isDateKey(startDate) ? startDate : null;
    setApplyError('');
    // Lịch trình chép vào tài khoản (sửa ở trang lên lịch trình) — chưa đăng nhập thì đăng nhập rồi quay lại đây.
    if (!loggedIn) {
      navigate('/login', { state: { returnUrl: location.pathname, message: 'Đăng nhập để áp dụng lịch trình này — miễn phí.' } });
      return;
    }
    setApplying(true);
    try {
      const copy = await copySharedJourney(token, start, guests ?? journey.guestCount ?? 2);
      // Lịch trình mới chưa có chỗ ở: mở với ô "Chỗ ở" nổi bật (homestay của chuyến gốc đứng đầu gợi ý).
      navigate(`/journeys/${copy.id}?new=1`);
    } catch (err) {
      setApplyError(getApiErrorMessage(err, 'Chưa áp dụng được lịch trình. Vui lòng thử lại.'));
    } finally {
      setApplying(false);
    }
  };

  if (error) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-6">
        <div className="max-w-md rounded-3xl bg-white p-8 text-center ring-1 ring-slate-200">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-50 text-rose-500">
            <AlertCircle className="h-6 w-6" />
          </span>
          <p className="mt-3 text-sm font-semibold text-slate-700">{error}</p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Link to="/lich-trinh" className="inline-flex h-10 items-center rounded-xl bg-[#052620] px-4 text-sm font-bold text-white">Xem lịch trình khác</Link>
            <Link to="/" className="inline-flex h-10 items-center rounded-xl px-4 text-sm font-bold text-slate-600 ring-1 ring-slate-200">Về trang chủ</Link>
          </div>
        </div>
      </div>
    );
  }
  if (!journey) {
    return (
      <div className="mx-auto max-w-5xl space-y-6 px-4 pt-6 sm:px-6" role="status" aria-label="Đang tải">
        <div className="h-60 animate-pulse rounded-3xl bg-[#e3efe9]" />
        <div className="h-96 animate-pulse rounded-2xl bg-[#eaf5f0]" />
      </div>
    );
  }

  const heading = journey.title?.trim() || (journey.ownerName ? `Hành trình của ${journey.ownerName}` : 'Hành trình Đi Du Lịch');
  const memories = stops
    .map((stop, index) => ({ stop, index }))
    .filter(({ stop }) => stop.checkinPhotoUrl || stop.checkinNote);
  const hero = memories.find(({ stop }) => stop.checkinPhotoUrl)?.stop.checkinPhotoUrl
    ?? journey.basePlace?.coverImageUrl
    ?? stops.find((s) => s.coverImageUrl)?.coverImageUrl;
  const dates = journey.completed && journey.startDate && journey.endDate
    ? `${formatVnDayShort(journey.startDate)} → ${formatVnDayShort(journey.endDate)}`
    : null;
  const dayLabelOf = (stop: SharedStopView) => {
    const day = stop.dayNumber ? `Ngày ${stop.dayNumber}` : 'Chưa xếp ngày';
    return journey.completed && stop.visitDate ? `${day} · ${formatVnDayShort(stop.visitDate)}` : day;
  };
  const routeStops: RouteStop[] = stops.map((stop, index) => ({
    key: index,
    name: stop.placeName,
    imageUrl: stop.checkinPhotoUrl ?? stop.coverImageUrl,
    session: stop.session,
    startTime: stop.startTime ?? null,
    visitDate: journey.completed ? stop.visitDate : null,
    dayNumber: stop.dayNumber,
    status: stop.checkinPhotoUrl || stop.checkinNote ? 'done' : undefined,
  }));
  const guideStop = guideIndex != null ? stops[guideIndex] : undefined;
  const base = journey.basePlace;
  // Trọn lịch trình theo giờ, mỗi ngày một trang (bản backend cũ không có danh sách mục → lộ trình các điểm tham quan).
  const items = journey.items ?? [];
  const hasTimeline = items.length > 0;
  const template = catalog?.templates.find((t) => t.code === journey.templateCode) ?? null;
  const rows = rowsFromShared(items, catalog, template);
  const timelineDays = Math.max(1, journey.dayCount ?? 1, ...items.map((item) => item.dayNumber ?? 1));
  /** Bấm một điểm tham quan trên lộ trình: mở cẩm nang của đúng điểm đó. */
  const openItem = (key: string) => {
    const item = items[Number(key)];
    if (!item) return;
    const exact = stops.findIndex((s) => s.placeId === item.placeId && s.dayNumber === item.dayNumber
      && (s.startTime ?? null) === (item.startTime ?? null));
    const index = exact >= 0 ? exact : stops.findIndex((s) => s.placeId === item.placeId);
    if (index >= 0) setGuideIndex(index);
  };
  const applyGuests = guests ?? journey.guestCount ?? 2;
  const vote = votes.voteOf(token, journey.helpfulCount ?? 0);
  const toggleHelpful = () => { void votes.toggle(token, journey.helpfulCount ?? 0); };

  const applyButton = (className: string) => (
    <button type="button" onClick={() => { setApplyError(''); setApplyOpen(true); }} className={`inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#052620] font-extrabold text-white shadow-sm transition-colors hover:bg-[#0a3a31] cursor-pointer ${className}`}>
      <Copy className="h-4 w-4" /> Áp dụng lịch trình này
    </button>
  );
  const bookLink = (className: string, label = 'Đặt homestay này') => base && (
    <Link to={`/homestays/${base.id}`} className={`inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#f97316] font-extrabold text-white shadow-[var(--shadow-coral)] transition-colors hover:bg-[#ea580c] ${className}`}>
      <BedDouble className="h-4 w-4" /> {label}
    </Link>
  );

  /** Ảnh check-in + lưu bút của một ngày (hoặc cả chuyến khi không chia theo ngày) — bấm mở cẩm nang của điểm đó. */
  const momentsOf = (day: number | null) => {
    const list = memories.filter(({ stop }) => day == null || (stop.dayNumber ?? 1) === day);
    if (list.length === 0) return null;
    return (
      <section aria-label={day == null ? 'Khoảnh khắc' : `Khoảnh khắc ngày ${day}`} className="rounded-2xl bg-white p-4 border border-slate-200/80 shadow-xs sm:p-5">
        <p className="text-[11px] font-extrabold uppercase tracking-[0.08em] text-[#59766e]">
          Khoảnh khắc{journey.ownerName ? ` của ${journey.ownerName}` : ''}
        </p>
        <ul className="mt-2.5 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          {list.map(({ stop, index }) => (
            <li key={`${stop.placeId}-${index}`} className="min-w-0">
              <button type="button" onClick={() => setGuideIndex(index)} className="group block w-full text-left cursor-pointer">
                <span className="block aspect-[4/3] overflow-hidden rounded-md bg-slate-100">
                  {stop.checkinPhotoUrl ? (
                    <img src={mediaUrl(stop.checkinPhotoUrl)} alt={`Ảnh check-in tại ${stop.placeName}`} loading="lazy" className="h-full w-full object-cover transition-transform duration-500" />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center bg-[#f3f6ee] text-[#9fb0a8]"><Quote className="h-6 w-6" aria-hidden /></span>
                  )}
                </span>
                <span className="mt-1.5 block truncate text-[13px] font-extrabold text-slate-900 group-hover:text-[#052620]">{stop.placeName}</span>
                {stop.checkinNote && <span className="mt-0.5 line-clamp-2 text-xs leading-snug text-slate-600">“{stop.checkinNote}”</span>}
              </button>
            </li>
          ))}
        </ul>
      </section>
    );
  };
  // Tên đã nói số ngày ("… 2 ngày 1 đêm") thì dòng tóm tắt không nhắc lại.
  const daysInTitle = !!journey.dayCount && heading.toLowerCase().includes(`${journey.dayCount} ngày`);
  const facts = [
    journey.completed ? 'Đã đi trọn vẹn' : null,
    journey.dayCount && !daysInTitle ? `${journey.dayCount} ngày` : null,
    `${stops.length} điểm`,
    base ? `Nghỉ tại ${base.name}` : null,
  ].filter(Boolean).join(' · ');

  return (
    <div className="min-h-screen bg-[#F6FAF8] pb-28 lg:pb-16">
      <div className="mx-auto max-w-5xl px-4 pt-4 sm:px-6 sm:pt-6">
        <Link
          to="/lich-trinh"
          onClick={(e) => {
            if (fromFeed || ((window.history.state as { idx?: number } | null)?.idx ?? 0) > 0) {
              e.preventDefault();
              navigate(-1);
            }
          }}
          className="mb-3 inline-flex min-h-10 items-center gap-1.5 rounded-full pr-2 text-sm font-bold text-[#052620] hover:underline"
        >
          <ArrowLeft className="h-4 w-4" /> Lịch trình du khách
        </Link>
        {/* Ảnh bìa + tên + một dòng tóm tắt (người đăng, ngày đi, số ngày, số điểm, nơi nghỉ) */}
        <section className="relative overflow-hidden rounded-3xl bg-[#0a2e26] text-white shadow-[var(--shadow-card)]">
          <div className="absolute inset-0">
            {hero ? <img src={mediaUrl(hero)} alt="" className="h-full w-full object-cover" /> : <HeroArt />}
          </div>
          <div className={`absolute inset-0 bg-gradient-to-t ${hero ? 'from-[#0a2e26] via-[#0a2e26]/55 to-[#0a2e26]/5' : 'from-[#0a2e26]/70 via-transparent to-transparent'}`} />
          <div className="relative flex min-h-[220px] flex-col justify-end p-5 sm:min-h-[300px] sm:p-8">
            <h1 className="text-2xl font-extrabold leading-tight text-white sm:text-4xl">{heading}</h1>
            {journey.ownerName && (
              <p className="mt-1.5 text-sm text-white/85">
                của <strong className="font-extrabold text-white">{journey.ownerName}</strong>{dates ? ` · ${dates}` : ''}
              </p>
            )}
            <p className="mt-2 text-sm font-semibold text-white/90">{facts}</p>
          </div>
        </section>

        {/* Thanh thao tác của bài: Hữu ích (tim) + Chia sẻ */}
        <div className="mt-2 flex flex-wrap items-center gap-x-6 gap-y-1 px-2">
          <HelpfulButton vote={vote} onToggle={toggleHelpful} />
          <ShareLinkButton token={token} title={heading} />
        </div>

        <div className="mt-5 lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start lg:gap-8">
          <section aria-label="Lộ trình" className="min-w-0">
            <div className="mb-1 px-1">
              <h2 className="text-lg font-extrabold text-slate-900">Lộ trình từng ngày</h2>
              <p className="text-xs text-slate-500">Chạm một điểm để xem chi tiết, video và chỉ đường.</p>
            </div>
            {hasTimeline ? (
              <TripTimeline
                rows={rows}
                days={timelineDays}
                startDate={journey.completed ? journey.startDate : null}
                dayTitles={template?.content.dayTitles}
                dayNotes={template?.content.dayNotes}
                addons={catalog?.addons ?? []}
                stayName={base?.name ?? null}
                stayHint="Chỗ ở của chuyến"
                onOpenPlace={openItem}
                paged={{ stickyTop: 'var(--app-header-offset, 72px)' }}
                dayFooter={momentsOf}
              />
            ) : (
              <div className="space-y-3">
                <JourneyRoute
                  stops={routeStops}
                  home={base ? { name: base.name } : null}
                  firstDay={journey.completed ? journey.startDate : null}
                  hideDates={!journey.completed}
                  onSelect={(key) => setGuideIndex(Number(key))}
                  selectedKey={guideIndex}
                />
                {momentsOf(null)}
              </div>
            )}
          </section>

          {/* Cột phải (máy tính): hai nút chính + chỗ nghỉ — điện thoại dùng thanh dính đáy */}
          <aside className="hidden lg:sticky lg:top-[calc(var(--app-header-offset,72px)+16px)] lg:block">
            <div className="rounded-3xl bg-white p-5 shadow-[var(--shadow-card)] ring-1 ring-slate-200">
              <p className="text-base font-extrabold text-slate-900">Muốn đi như thế này?</p>
              <p className="mt-1 text-sm leading-relaxed text-slate-500">Chép nguyên lịch trình — giờ giấc, ăn uống, di chuyển, ghi chú — cho chuyến của bạn rồi sửa thoải mái. Miễn phí.</p>
              {applyButton('mt-4 h-12 w-full text-sm')}
              {base && (
                <div className="mt-5 border-t border-slate-100 pt-5">
                  <div className="flex items-center gap-3">
                    <span className="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-slate-100">
                      {base.coverImageUrl ? <img src={mediaUrl(base.coverImageUrl)} alt="" className="h-full w-full object-cover" /> : <ImagePlaceholder Icon={BedDouble} />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[11px] font-bold uppercase tracking-wider text-slate-500">Nghỉ tại</span>
                      <span className="block truncate text-sm font-extrabold text-slate-900">{base.name}</span>
                    </span>
                  </div>
                  {bookLink('mt-3 h-12 w-full text-sm')}
                </div>
              )}
            </div>
          </aside>
        </div>
      </div>

      {/* Thanh dính đáy (điện thoại): hai nút chính */}
      <div className="fixed inset-x-0 bottom-0 z-40 flex gap-2 border-t border-slate-200 bg-white/95 px-4 pb-[calc(0.75rem+var(--safe-bottom))] pt-3 shadow-[0_-4px_16px_rgba(10,46,38,0.10)] backdrop-blur-md lg:hidden">
        {applyButton(`h-12 text-sm ${base ? 'flex-1' : 'w-full'}`)}
        {bookLink('h-12 flex-1 text-sm', 'Đặt homestay')}
      </div>

      <JourneySheet
        open={applyOpen}
        onClose={() => setApplyOpen(false)}
        title="Áp dụng lịch trình này"
        description={loggedIn
          ? 'Chép nguyên lịch trình (mọi mục, giờ, ghi chú, dịch vụ) thành lịch trình của bạn — sửa thoải mái sau đó.'
          : 'Đăng nhập để chép nguyên lịch trình thành lịch trình của bạn — miễn phí.'}
        footer={(
          <button type="button" onClick={() => { void apply(); }} disabled={applying} className="inline-flex h-12 w-full items-center justify-center gap-1.5 rounded-xl bg-[#052620] text-sm font-extrabold text-white shadow-sm hover:bg-[#0a3a31] disabled:opacity-50 cursor-pointer">
            {applying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Copy className="h-4 w-4" />} Áp dụng{startDate ? ` từ ${formatVnDayShort(startDate)}` : ''}
          </button>
        )}
      >
        <label className="block pt-1">
          <span className="text-sm font-bold text-slate-800">Ngày bạn bắt đầu đi <span className="font-normal text-slate-400">(tùy chọn)</span></span>
          <input
            type="date"
            min={todayKey()}
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="mt-2 block h-12 w-full rounded-xl border border-slate-200 px-3 text-sm focus:border-[#052620] focus:outline-none"
          />
        </label>
        <p className="mt-2 text-xs leading-relaxed text-slate-500">
          {isDateKey(startDate) && timelineDays
            ? `Ngày 1 rơi vào ${formatVnDayShort(startDate)}, kết thúc ${formatVnDayShort(addDaysKey(startDate, Math.max(0, timelineDays - 1)))} — giữ nguyên giờ của từng mục.`
            : 'Ngày 1 sẽ rơi vào ngày này, các ngày sau giữ nguyên khoảng cách. Để trống thì lịch trình chỉ có "Ngày 1, 2…", chọn ngày sau.'}
        </p>
        <div className="mt-4">
          <Stepper
            label="Số người đi"
            hint="Gợi ý homestay đủ chỗ cho cả đoàn"
            value={applyGuests}
            min={1}
            max={50}
            onChange={(value) => setGuests(Math.min(50, Math.max(1, value)))}
          />
        </div>
        {!loggedIn && <p className="mt-3 rounded-xl bg-slate-50 p-3 text-xs text-slate-600">Bạn sẽ đăng nhập trước, lịch trình được lưu vào tài khoản để sửa giờ, thêm điểm và chọn chỗ ở.</p>}
        {applyError && <p role="alert" className="mt-3 text-xs font-semibold text-rose-600">{applyError}</p>}
      </JourneySheet>

      {guideStop && guideIndex != null && (
        <StopGuideSheet
          journeyId={0}
          stop={asGuideStop(guideStop, guideIndex)}
          editable={false}
          memoryOwner={journey.ownerName}
          dayLabel={dayLabelOf(guideStop)}
          position={{ index: guideIndex, total: stops.length }}
          onPrev={guideIndex > 0 ? () => setGuideIndex(guideIndex - 1) : undefined}
          onNext={guideIndex < stops.length - 1 ? () => setGuideIndex(guideIndex + 1) : undefined}
          onClose={() => setGuideIndex(null)}
          onCheckinChange={() => {}}
        />
      )}
    </div>
  );
}
