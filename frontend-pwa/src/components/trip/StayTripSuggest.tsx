import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Check, PenLine, Route, Sparkles } from 'lucide-react';
import type { JourneyView } from '@/types/journey';
import type { TripCatalog, TripDraft, TripFilters } from '@/types/trip';
import { useNearViewport } from '@/hooks/useNearViewport';
import { foldVietnamese } from '@/lib/mapLink';
import { tripPlannerPath } from '@/lib/tripLinks';
import { getCurrentCustomer } from '@/lib/currentCustomer';
import { getApiErrorMessage } from '@/lib/apiError';
import { EMPTY_FILTERS, draftToInput, durationShort, instantiateTemplate, saveTripDraft, suggestTemplate } from '@/lib/tripPlanner';
import { createJourney, linkJourneyBooking } from '@/services/journeyService';
import { fetchTripCatalog, peekTripCatalog } from '@/services/tripService';
import TripEditor from './TripEditor';
import TripCriteria from './TripCriteria';
import TripTimeline from './TripTimeline';
import { rowsFromDraft } from './timelineRows';

const isTraveler = () => getCurrentCustomer()?.role === 'TRAVELER';

/** Lịch trình gợi ý theo tiêu chí khách chọn — trang homestay mang theo đơn ("Lưu kèm lịch trình 2N1Đ vào đơn"). */
export interface StayTripPick {
  /** Mã lịch trình gợi ý (TripTemplate.code). */
  template: string;
  title: string;
  /** Tag thời gian gọn: "2N1Đ". */
  tag: string;
  /** Tiêu chí khách chọn (mở lại trang tạo lịch trình với đúng các tag này). */
  filters: TripFilters;
}

interface StayTripSuggestProps {
  /** Tỉnh của homestay — danh mục lịch trình của tỉnh đó. */
  provinceName: string | null | undefined;
  stay: { id: number; name: string; latitude: number | null; longitude: number | null };
  /** Ngày ở khách đang chọn ở phần đặt phòng (null = chưa chọn) — lịch trình gợi ý xếp từ ngày nhận phòng. */
  checkIn: string | null;
  checkOut: string | null;
  guests: number;
  /** Lịch trình gợi ý theo tiêu chí đổi (null = chưa chọn thời gian) — để mang theo đơn đặt phòng. */
  onPickChange?: (pick: StayTripPick | null) => void;
  /** id của phần (điều hướng mục của trang). */
  id?: string;
  className?: string;
  borderless?: boolean;
  /** Trang cha đã có tiêu đề cho phần này (thẻ "Lịch trình gợi ý" trong khung "Gợi ý cho chuyến đi"). */
  hideHeading?: boolean;
}

const sameProvince = (a: string, b: string) => {
  const x = foldVietnamese(a);
  const y = foldVietnamese(b);
  return x === y || x.includes(y) || y.includes(x);
};

/**
 * "Lịch trình gợi ý quanh đây" trên trang homestay — cùng cách gợi ý như trang tạo lịch trình: chọn tiêu chí lần lượt (thời
 * gian → ăn uống → trải nghiệm), bấm "Gợi ý lịch trình" mới hiện lịch trình gợi ý theo tiêu chí (mỗi ngày một trang, sửa
 * và lưu ngay tại trang, homestay này ở ô Chỗ ở). Bên cạnh là "Lịch trình mẫu" — chỉ là hình minh họa, không bấm / vuốt
 * được. Danh mục chỉ tải khi khách cuộn gần tới.
 */
export default function StayTripSuggest({
  provinceName, stay, checkIn, checkOut, guests, onPickChange, id = 'trip', className = '', borderless = false, hideHeading = false,
}: StayTripSuggestProps) {
  const navigate = useNavigate();
  const sectionRef = useRef<HTMLElement>(null);
  const near = useNearViewport(sectionRef, '600px');

  const [catalog, setCatalog] = useState<TripCatalog | null>(() => peekTripCatalog(provinceName) ?? null);
  const [loadError, setLoadError] = useState(false);
  /** Bấm "Thử lại" thì tải lại danh mục. */
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!near) return undefined;
    let alive = true;
    fetchTripCatalog(provinceName)
      .then((data) => {
        if (!alive) return;
        setCatalog(data);
        setLoadError(false);
      })
      .catch(() => { if (alive) setLoadError(true); });
    return () => { alive = false; };
  }, [near, provinceName, attempt]);
  const retry = () => {
    setLoadError(false);
    setAttempt((n) => n + 1);
  };

  const [filters, setFilters] = useState<TripFilters>(EMPTY_FILTERS);

  // Lịch trình gợi ý hiện (và sửa, lưu) ngay tại trang homestay — không điều hướng sang /lich-trinh.
  const [editing, setEditing] = useState(false);
  const [editDraft, setEditDraft] = useState<TripDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [savedView, setSavedView] = useState<JourneyView | null>(null);

  // Danh mục rơi về tỉnh mặc định (tỉnh của homestay chưa có lịch trình gợi ý) thì không gợi ý lịch trình của tỉnh khác.
  const regionMatches = !catalog?.region || !provinceName || sameProvince(catalog.region.name, provinceName);
  const templates = useMemo(() => (catalog && regionMatches ? catalog.templates : []), [catalog, regionMatches]);
  const tags = useMemo(() => catalog?.tags ?? [], [catalog]);
  const suggestion = useMemo(() => suggestTemplate(templates, filters), [templates, filters]);
  const province = provinceName ?? catalog?.region?.name ?? null;

  // Lịch trình mẫu: luôn ngày 1 của lịch trình gợi ý đầu tiên — hình minh họa cố định, không đổi theo tiêu chí.
  const sample = templates[0] ?? null;
  const sampleDraft = useMemo(() => (catalog && sample ? instantiateTemplate(sample, catalog, {
    startDate: null, guests, province, filters: null, stayPlaceId: stay.id,
  }) : null), [catalog, sample, guests, province, stay.id]);
  const sampleRows = useMemo(() => (catalog && sampleDraft ? rowsFromDraft(sampleDraft.items, catalog, sample) : []), [catalog, sampleDraft, sample]);

  // Báo trang homestay lịch trình gợi ý theo tiêu chí (ô "Lưu kèm lịch trình … vào đơn"); rời phần này thì báo không còn.
  const pickRef = useRef(onPickChange);
  useEffect(() => { pickRef.current = onPickChange; }, [onPickChange]);
  const pick = useMemo<StayTripPick | null>(
    () => (suggestion ? { template: suggestion.code, title: suggestion.title, tag: durationShort(suggestion), filters } : null),
    [suggestion, filters],
  );
  useEffect(() => { pickRef.current?.(pick); }, [pick]);
  useEffect(() => () => pickRef.current?.(null), []);

  /** Tự tạo: trang tạo lịch trình (homestay này ở ô Chỗ ở). */
  const blankPath = tripPlannerPath({ province, checkIn, checkOut, guests, stay: stay.id });

  /**
   * "Gợi ý lịch trình": dựng lịch trình gợi ý theo tiêu chí, hiện ngay tại trang để xem, sửa, lưu. Quay lại đổi tiêu chí mà
   * vẫn ra đúng lịch trình đang sửa thì mở lại bản đang sửa (không mất chỉnh sửa).
   */
  const openSuggestion = () => {
    if (!catalog || !suggestion) return;
    setEditDraft(editDraft && editDraft.templateCode === suggestion.code
      ? { ...editDraft, filters }
      : instantiateTemplate(suggestion, catalog, { startDate: checkIn, guests, province, filters, stayPlaceId: stay.id }));
    setSaveError('');
    setSavedView(null);
    setEditing(true);
  };

  /** Lưu lịch trình đang sửa: đã đăng nhập thì tạo lịch trình (gắn vào đơn nếu nháp có forBooking) và hiện xác nhận
   * tại chỗ; chưa đăng nhập thì giữ nháp và đưa sang đăng nhập (không có cách lưu nháp tại chỗ cho khách ẩn danh). */
  const saveEditor = async () => {
    if (!editDraft) return;
    if (!isTraveler()) {
      saveTripDraft(editDraft);
      navigate('/login', { state: { returnUrl: window.location.pathname, message: 'Đăng nhập để lưu lịch trình vào tài khoản — miễn phí.' } });
      return;
    }
    setSaving(true);
    setSaveError('');
    try {
      let view = await createJourney(draftToInput(editDraft));
      if (editDraft.forBooking) {
        try {
          view = await linkJourneyBooking(view.id, editDraft.forBooking);
        } catch {
          // Lịch trình đã lưu; gắn lại được ở tab "Lịch trình" của đơn.
        }
      }
      setSavedView(view);
      setEditing(false);
      setEditDraft(null);
    } catch (err) {
      setSaveError(getApiErrorMessage(err, 'Chưa lưu được lịch trình. Vui lòng thử lại.'));
    } finally {
      setSaving(false);
    }
  };

  let body: ReactNode;
  if (!catalog) {
    body = loadError ? (
      <p className="flex flex-wrap items-center gap-x-2 text-sm text-[var(--color-muted)]">
        Chưa tải được lịch trình gợi ý.
        <button type="button" onClick={retry} className="min-h-11 font-extrabold text-[#06604a] hover:underline cursor-pointer">Thử lại</button>
      </p>
    ) : (
      <div aria-hidden className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="h-[120px] animate-pulse rounded-lg bg-[var(--color-canvas)]" />
        <div className="h-[220px] animate-pulse rounded-lg bg-[var(--color-canvas)]" />
      </div>
    );
  } else if (templates.length === 0) {
    body = (
      <p className="text-sm leading-relaxed text-[var(--color-muted)]">
        Chưa có lịch trình gợi ý sẵn quanh {provinceName || 'đây'} — bạn vẫn tự lên lịch trình theo giờ được, homestay này đứng đầu gợi ý chỗ ở.{' '}
        <Link to={blankPath} className="font-extrabold text-[#06604a] hover:underline">Tự tạo lịch trình</Link>
      </p>
    );
  } else {
    body = (
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:items-start">
        <div className="flex min-w-0 flex-col gap-3">
          <TripCriteria templates={templates} tags={tags} filters={filters} onChange={setFilters} className="bg-[var(--color-canvas)] ring-0" />
          <div className="flex flex-col gap-1">
            <button
              type="button"
              onClick={openSuggestion}
              disabled={!suggestion}
              aria-describedby={suggestion ? undefined : `${id}-need-time`}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-md cta cta-primary text-[15px] font-extrabold text-white transition-colors disabled:cursor-not-allowed disabled:bg-[#cfdac8] disabled:text-white cursor-pointer"
            >
              <Sparkles className="h-4 w-4" aria-hidden /> Gợi ý lịch trình
            </button>
            {!suggestion && <p id={`${id}-need-time`} className="text-center text-xs text-[var(--color-muted)]">Chọn thời gian để nhận gợi ý</p>}
            <Link to={blankPath} className="flex min-h-11 items-center justify-center gap-1.5 text-[13px] font-extrabold text-[#06604a] hover:text-[var(--color-ink-deep)] hover:underline">
              <PenLine className="h-3.5 w-3.5" aria-hidden /> Hoặc tự tạo lịch trình của bạn
            </Link>
          </div>
        </div>
        {sampleDraft && sampleRows.length > 0 && (
          <SamplePicture>
            <TripTimeline
              rows={sampleRows}
              days={sampleDraft.days}
              startDate={null}
              dayTitles={sample?.content.dayTitles}
              dayNotes={sample?.content.dayNotes}
              addons={catalog.addons}
              stayName={stay.name}
              onlyDay={1}
            />
          </SamplePicture>
        )}
      </div>
    );
  }

  return (
    <section
      ref={sectionRef}
      id={id}
      aria-labelledby={hideHeading ? undefined : `${id}-title`}
      aria-label={hideHeading ? 'Lịch trình gợi ý quanh đây' : undefined}
      className={`scroll-mt-36 rounded-2xl ${borderless ? '' : 'border border-[#e3e8dc]'} bg-white p-4 md:p-5 ${className}`}
    >
      {!hideHeading && (
        <div className="mb-3.5 flex items-start gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[#fdf3d7] text-[#8a5a00]">
            <Route className="h-[18px] w-[18px]" aria-hidden />
          </span>
          <span className="flex min-w-0 flex-col gap-0.5">
            <h2 id={`${id}-title`} className="text-[17px] font-extrabold leading-snug text-[var(--color-ink-deep)] md:text-xl">Lịch trình gợi ý quanh đây</h2>
            <span className="text-[13px] text-[var(--color-muted)]">Chọn tiêu chí — lịch trình bắt đầu từ homestay này</span>
          </span>
        </div>
      )}
      {savedView && !editing && (
        <p className="mb-3.5 flex flex-wrap items-center gap-1.5 rounded-md bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-800 ring-1 ring-emerald-200">
          <Check className="h-4 w-4 shrink-0" aria-hidden /> Đã lưu lịch trình.
          <Link
            to={savedView.bookingCode ? `/bookings/${encodeURIComponent(savedView.bookingCode)}?tab=journey` : `/journeys/${savedView.id}`}
            className="underline hover:text-emerald-900"
          >
            Xem lịch trình
          </Link>
        </p>
      )}
      {editing && editDraft ? (
        <TripEditor
          draft={editDraft}
          onChange={setEditDraft}
          catalog={catalog}
          template={suggestion}
          mode="new"
          loggedIn={isTraveler()}
          saving={saving}
          error={saveError}
          onSave={() => { void saveEditor(); }}
          onBack={() => setEditing(false)}
          backLabel="Đổi tiêu chí"
          stayName={stay.name}
          canAddDay={false}
          stickyTop="var(--app-header-offset, 64px)"
          surface="white"
        />
      ) : body}
    </section>
  );
}

/**
 * "Lịch trình mẫu": chỉ là hình minh họa một ngày của lịch trình theo giờ — không bấm, không vuốt, không đọc lên (trình đọc
 * màn hình bỏ qua); phần dưới mờ dần.
 */
function SamplePicture({ children }: { children: ReactNode }) {
  return (
    <figure aria-hidden inert className="pointer-events-none relative m-0 max-h-[280px] select-none overflow-hidden rounded-lg border border-[#e3e8dc] bg-[var(--color-canvas)] sm:max-h-[420px]">
      {children}
      <span className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[var(--color-canvas)] to-transparent" />
      {/* Nhãn nằm trên phần mờ dần ở đáy — không che nội dung của hình */}
      <figcaption className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-white px-2.5 py-0.5 text-[11px] font-extrabold text-[#59766e] shadow-xs ring-1 ring-[#e3e8dc]">
        Lịch trình mẫu
      </figcaption>
    </figure>
  );
}
