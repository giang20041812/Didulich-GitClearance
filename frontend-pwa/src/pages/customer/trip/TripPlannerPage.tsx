import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { AlertCircle, Eraser, RotateCcw, Route } from 'lucide-react';
import TripShell from '@/components/trip/TripShell';
import TripEditor from '@/components/trip/TripEditor';
import TripCriteria from '@/components/trip/TripCriteria';
import JourneyMenu, { type JourneyMenuItem } from '@/components/journey/JourneyMenu';
import ConfirmDialog, { type ConfirmRequest } from '@/components/partner/ConfirmDialog';
import type { JourneyView } from '@/types/journey';
import type { TripCatalog, TripDraft, TripFilters, TripTemplate } from '@/types/trip';
import { fetchTripCatalog, peekTripCatalog } from '@/services/tripService';
import { createJourney, fetchJourney, linkJourneyBooking, updateJourney } from '@/services/journeyService';
import {
  EMPTY_FILTERS, blankDraft, cleanFilters, draftDays, draftFromJourney, draftToInput, durationForStay, durationKey, durationShort,
  filtersFromParams, instantiateTemplate, loadTripDraft, sameAsTemplate, saveTripDraft, stayRange, suggestTemplate, templateFor,
  tripDaysBetween,
} from '@/lib/tripPlanner';
import { isDateKey } from '@/lib/roomAvailability';
import { getCurrentCustomer } from '@/lib/currentCustomer';
import { getApiErrorMessage } from '@/lib/apiError';
import { installAxiosBoot } from '@/lib/axiosBoot';
import { PlannerSkeleton } from '@/components/ui/RouteSkeletons';

// Trang dùng axios (lưu lịch trình): cài cấu hình (hàng đợi / hedge / interceptor) trước request đầu tiên.
installAxiosBoot();

const dateParam = (value: string | null) => (isDateKey(value) ? value : null);
const isTraveler = () => getCurrentCustomer()?.role === 'TRAVELER';

/** Bối cảnh trên đường dẫn mà nháp đang dở phải khớp mới được mở lại. */
interface DraftContext {
  checkIn: string | null;
  checkOut: string | null;
  stay: number | null;
  tripDays: number | null;
}

/**
 * Nháp chưa lưu dùng lại được (tải lại trang, quay lại sau khi rời trang, trang homestay lưu sẵn nháp rồi mở thẳng trang
 * này): chưa lưu, đúng ngày đi, số ngày và homestay của đường dẫn — đổi ngày thì dựng lại.
 */
function draftFits(draft: TripDraft | null, context: DraftContext): draft is TripDraft {
  return !!draft && draft.journeyId == null
    && (draft.startDate ?? null) === context.checkIn
    && (draft.stayPlaceId ?? null) === context.stay
    && (!context.tripDays || stayRange(draft.startDate, draftDays(draft))?.checkOut === context.checkOut);
}

/** /lich-trinh/tao (tạo lịch trình mới) và /lich-trinh/:id (sửa lịch trình đã lưu). */
export default function TripPlannerPage() {
  const { id } = useParams<{ id?: string }>();
  const journeyId = Number(id);
  return id && Number.isFinite(journeyId) ? <EditTrip journeyId={journeyId} /> : <NewTrip />;
}

// ─── Tạo lịch trình mới ─────────────────────────────────────────

/** Khung chờ thay cho lộ trình khi chưa chọn thời gian (số ngày của lịch trình theo tag thời gian). */
function PickTimeFirst() {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-emerald-200/90 bg-white/70 px-6 py-12 text-center shadow-xs">
      <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-[var(--color-primary)] flex items-center justify-center mb-1 border border-emerald-100/60 shadow-2xs">
        <Route className="h-6 w-6" aria-hidden />
      </div>
      <p className="text-base font-black text-slate-900">Chọn thời gian để xem lịch trình gợi ý</p>
      <p className="max-w-sm text-xs sm:text-sm leading-relaxed text-slate-500">Lịch trình theo giờ từng ngày hiện ở đây — thêm, bỏ, đổi giờ thoải mái rồi lưu.</p>
    </div>
  );
}

/**
 * Trang tạo lịch trình: phía trên chỉ là tiêu chí, chọn lần lượt — thời gian (2N1Đ, 3N2Đ) rồi ăn uống, trải nghiệm; chọn
 * thời gian là lịch trình gợi ý theo tiêu chí hiện ngay bên dưới (mỗi ngày một trang), sửa tiếp rồi lưu. Không hỏi ngày đi,
 * số người — ngày đi chọn sau khi lưu (ô "Chỗ ở" của lịch trình). Bối cảnh đi kèm trên đường dẫn: tỉnh, ngày đi – về, số
 * người (SearchHub, đơn đặt phòng — có ngày thì chọn sẵn thời gian), homestay đang xem (?stay=), đơn cần gắn (?forBooking=),
 * tiêu chí (?d=, ?an=, ?mt=), lịch trình gợi ý mở sẵn (?tpl=). Lên mới không cần đăng nhập — bấm lưu mới đăng nhập
 * (?resume=1 quay lại tự lưu).
 */
function NewTrip() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const resume = params.get('resume') === '1';
  const checkIn = dateParam(params.get('checkIn'));
  const checkOut = dateParam(params.get('checkOut'));
  const guests = Math.min(50, Math.max(1, Number(params.get('guests')) || 2));
  const hasGuests = params.has('guests');
  const stay = Number(params.get('stay')) || null;
  const forBooking = params.get('forBooking');
  const tplParam = params.get('tpl');
  const tplCode = tplParam && tplParam !== 'blank' ? tplParam : null;
  // Số ngày của chuyến theo ngày đi / về có sẵn (null = chưa có ngày).
  const tripDays = tripDaysBetween(checkIn, checkOut);

  const [draft, setDraft] = useState<TripDraft | null>(() => (resume ? loadTripDraft() : null));
  const province = params.get('province') ?? draft?.province ?? null;
  const [catalog, setCatalog] = useState<TripCatalog | null>(() => peekTripCatalog(province) ?? null);
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);

  const loadCatalog = useCallback(() => {
    setLoadError('');
    fetchTripCatalog(province).then(setCatalog).catch((err: unknown) => setLoadError(err instanceof Error ? err.message : 'Không tải được dữ liệu của tỉnh.'));
  }, [province]);
  useEffect(() => { loadCatalog(); }, [loadCatalog]);

  // Dựng lịch trình khi danh mục đã có: nháp đang dở đúng bối cảnh → lịch trình gợi ý trên đường dẫn (?tpl=) hoặc theo tiêu
  // chí (?d= …; chưa có thời gian thì theo ngày đi / về) → lịch trình trống chờ chọn thời gian. Số người, đơn cần gắn trên
  // đường dẫn vá thẳng vào nháp.
  const [urlFilters] = useState(() => filtersFromParams(params));
  useEffect(() => {
    if (draft || !catalog) return;
    const context: DraftContext = { checkIn, checkOut, stay, tripDays };
    const saved = loadTripDraft();
    if (draftFits(saved, context) && (tplCode == null || saved.templateCode === tplCode)) {
      setDraft({ ...saved, guests: hasGuests ? guests : saved.guests, forBooking: forBooking ?? saved.forBooking });
      return;
    }
    const options = { startDate: checkIn, guests, province, stayPlaceId: stay, forBooking, tripDays };
    const wanted: TripFilters = {
      ...EMPTY_FILTERS,
      ...urlFilters,
      duration: urlFilters?.duration ?? durationForStay(catalog.templates, checkIn, checkOut),
    };
    const template = (tplCode ? catalog.templates.find((t) => t.code === tplCode) : undefined)
      ?? suggestTemplate(catalog.templates, cleanFilters(catalog.templates, catalog.tags, wanted));
    setDraft(template
      ? instantiateTemplate(template, catalog, {
        ...options,
        // Lịch trình mở sẵn thì thời gian theo chính lịch trình đó.
        filters: cleanFilters(catalog.templates, catalog.tags, { ...wanted, duration: durationKey(template) }),
      })
      : blankDraft(catalog, { ...options, filters: null, days: tripDays ?? 2 }));
  }, [draft, catalog, checkIn, checkOut, stay, tripDays, tplCode, guests, hasGuests, forBooking, province, urlFilters]);

  /** Sửa nháp: giữ trên máy (tải lại / đăng nhập giữa chừng không mất) và ghi ngày, tiêu chí, lịch trình gợi ý lên đường dẫn. */
  const changeDraft = (next: TripDraft) => {
    setDraft(next);
    saveTripDraft(next);
    const range = stayRange(next.startDate, draftDays(next));
    const nextParams = new URLSearchParams(params);
    if (range) {
      nextParams.set('checkIn', range.checkIn);
      nextParams.set('checkOut', range.checkOut);
    } else {
      nextParams.delete('checkIn');
      nextParams.delete('checkOut');
    }
    const setOrDelete = (key: string, value: string | null | undefined) => (value ? nextParams.set(key, value) : nextParams.delete(key));
    setOrDelete('tpl', next.templateCode);
    setOrDelete('d', next.filters?.duration);
    setOrDelete('an', next.filters?.dining);
    setOrDelete('mt', next.filters?.goals.join(','));
    nextParams.delete('p');
    nextParams.delete('resume');
    if (nextParams.toString() !== params.toString()) setParams(nextParams, { replace: true });
  };

  const templates = catalog?.templates ?? [];
  const tags = catalog?.tags ?? [];
  const filters = draft?.filters ?? EMPTY_FILTERS;
  const current = templateFor(templates, draft ?? {});
  const suggestion = suggestTemplate(templates, filters);

  /** Tên khách tự đặt (khác tên mặc định của lịch trình trống / lịch trình gợi ý đang dùng) — đổi lịch trình vẫn giữ. */
  const customTitle = (from: TripDraft): string | null => {
    if (!catalog) return null;
    const blankTitle = blankDraft(catalog, { startDate: null, guests: 1, province: null, filters: null, days: 1 }).title;
    const title = from.title.trim();
    return title && title !== blankTitle && title !== current?.title ? from.title : null;
  };

  /** Điền cả lịch trình theo lịch trình gợi ý (giữ ngày đi, số người, homestay, đơn, tên tự đặt). */
  const fillFrom = (template: TripTemplate, nextFilters: TripFilters) => {
    if (!catalog || !draft) return;
    const built = instantiateTemplate(template, catalog, {
      startDate: draft.startDate,
      guests: draft.guests,
      province: draft.province,
      filters: nextFilters,
      stayPlaceId: draft.stayPlaceId,
      forBooking: draft.forBooking,
      tripDays,
    });
    changeDraft({ ...built, title: customTitle(draft) ?? built.title });
  };

  /**
   * Đổi tiêu chí: lịch trình gợi ý theo tiêu chí mới thay vào — khách đã thêm / sửa mục thì hỏi trước; vẫn là lịch trình
   * gợi ý đang dùng thì chỉ ghi lại tiêu chí.
   */
  const changeCriteria = (next: TripFilters) => {
    if (!catalog || !draft) return;
    const template = suggestTemplate(templates, next);
    if (!template || (template.code === draft.templateCode && draft.items.length > 0)) {
      changeDraft({ ...draft, filters: next });
      return;
    }
    if (sameAsTemplate(draft.items, current, catalog)) {
      fillFrom(template, next);
      return;
    }
    setConfirm({
      title: `Đổi sang lịch trình ${durationShort(template)}?`,
      body: 'Các mục bạn đã thêm, sửa sẽ được thay bằng lịch trình gợi ý theo tiêu chí mới.',
      confirmLabel: 'Đổi lịch trình',
      onConfirm: () => fillFrom(template, next),
    });
  };

  /** Bỏ mọi chỉnh sửa, quay về lịch trình gợi ý theo tiêu chí đang chọn (lịch trình đang trống thì điền luôn). */
  const restoreSuggestion = () => {
    if (!suggestion || !draft) return;
    if (draft.items.length === 0) {
      fillFrom(suggestion, filters);
      return;
    }
    setConfirm({
      title: 'Dùng lại lịch trình gợi ý?',
      body: 'Các mục hiện có sẽ được thay bằng lịch trình gợi ý theo tiêu chí đang chọn.',
      confirmLabel: 'Dùng lại',
      onConfirm: () => fillFrom(suggestion, filters),
    });
  };

  /** Xóa hết các mục để tự lên từ đầu (giữ tiêu chí, số ngày, ngày đi, tên tự đặt). */
  const clearItems = () => {
    if (!catalog || !draft) return;
    setConfirm({
      title: 'Xóa hết các mục?',
      body: 'Lịch trình còn trống để bạn tự lên từ đầu — tiêu chí, số ngày giữ nguyên.',
      confirmLabel: 'Xóa hết',
      tone: 'danger',
      onConfirm: () => {
        const blank = blankDraft(catalog, {
          startDate: draft.startDate, guests: draft.guests, province: draft.province, filters: draft.filters,
          stayPlaceId: draft.stayPlaceId, forBooking: draft.forBooking, days: draftDays(draft),
        });
        changeDraft({ ...blank, title: customTitle(draft) ?? blank.title });
      },
    });
  };

  const save = async (target: TripDraft | null = draft) => {
    if (!target) return;
    saveTripDraft(target);
    if (!isTraveler()) {
      navigate('/login', { state: { returnUrl: '/lich-trinh/tao?resume=1', message: 'Đăng nhập để lưu lịch trình vào tài khoản — miễn phí.' } });
      return;
    }
    setSaving(true);
    setError('');
    try {
      let view: JourneyView = await createJourney(draftToInput(target));
      if (target.forBooking) {
        try {
          view = await linkJourneyBooking(view.id, target.forBooking);
        } catch {
          // Lịch trình đã lưu; gắn lại được ở tab "Lịch trình" của đơn.
        }
      }
      saveTripDraft(null);
      navigate(target.forBooking && view.bookingCode
        ? `/bookings/${encodeURIComponent(view.bookingCode)}?tab=journey`
        : `/journeys/${view.id}?new=1`, { replace: true });
    } catch (err) {
      setError(getApiErrorMessage(err, 'Chưa lưu được lịch trình. Vui lòng thử lại.'));
    } finally {
      setSaving(false);
    }
  };

  // Quay về sau khi đăng nhập để lưu: tự lưu nháp một lần.
  const autoSaved = useRef(false);
  useEffect(() => {
    if (!resume || !draft || autoSaved.current || !isTraveler()) return;
    autoSaved.current = true;
    void save(draft);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resume, draft]);

  const close = () => {
    if (((window.history.state as { idx?: number } | null)?.idx ?? 0) > 0) {
      navigate(-1);
      return;
    }
    const booking = draft?.forBooking ?? forBooking;
    const home = draft?.stayPlaceId ?? stay;
    if (booking) navigate(`/bookings/${encodeURIComponent(booking)}?tab=journey`);
    else if (home) navigate(`/homestays/${home}`);
    else navigate('/lich-trinh');
  };

  // Tỉnh có lịch trình gợi ý: số ngày theo tag thời gian — chưa chọn thời gian (lịch trình còn trống) thì chờ chọn.
  const hasCriteria = templates.length > 0;
  const waitingForTime = !!draft && hasCriteria && !filters.duration && draft.items.length === 0;
  // ⋯: quay về lịch trình gợi ý khi đã sửa / xóa hết; xóa hết mục để tự lên từ đầu.
  const canRestore = !!draft && !!catalog && !!suggestion && !sameAsTemplate(draft.items, suggestion, catalog);
  const canClear = !!draft && draft.items.length > 0;
  const menuItems: JourneyMenuItem[] = [
    ...(canRestore ? [{ label: 'Dùng lại lịch trình gợi ý', Icon: RotateCcw, onSelect: restoreSuggestion }] : []),
    ...(canClear ? [{ label: 'Xóa hết mục', Icon: Eraser, tone: 'danger' as const, divider: canRestore, onSelect: clearItems }] : []),
  ];

  return (
    <TripShell title="Tạo lịch trình" onClose={close}>
      {loadError && !catalog ? (
        <div className="mx-auto mt-10 max-w-md rounded-2xl border border-rose-200/80 bg-white p-6 sm:p-8 text-center shadow-xs">
          <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-500 flex items-center justify-center mx-auto mb-3 shadow-2xs">
            <AlertCircle className="h-6 w-6" aria-hidden="true" />
          </div>
          <p className="text-sm font-bold text-slate-800">{loadError}</p>
          <button type="button" onClick={loadCatalog} className="mt-4 inline-flex h-11 items-center rounded-xl cta cta-primary px-5 text-sm font-bold text-white shadow-xs transition-all active:scale-95 cursor-pointer">Thử lại</button>
        </div>
      ) : !draft || !catalog ? (
        <PlannerSkeleton />
      ) : (
        <TripEditor
          draft={draft}
          onChange={changeDraft}
          catalog={catalog}
          template={current}
          mode="new"
          loggedIn={isTraveler()}
          saving={saving || (resume && isTraveler() && !error)}
          error={error}
          onSave={() => { void save(draft); }}
          intro={hasCriteria ? <TripCriteria templates={templates} tags={tags} filters={filters} onChange={changeCriteria} /> : null}
          placeholder={waitingForTime ? <PickTimeFirst /> : null}
          canAddDay={!hasCriteria || !filters.duration}
          tools={menuItems.length > 0 ? <JourneyMenu items={menuItems} label="Thao tác khác với lịch trình" /> : null}
        />
      )}
      <ConfirmDialog request={confirm} onClose={() => setConfirm(null)} />
    </TripShell>
  );
}

// ─── Sửa lịch trình đã lưu ──────────────────────────────────────

function EditTrip({ journeyId }: { journeyId: number }) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const fromBooking = params.get('from') === 'booking';
  const [journey, setJourney] = useState<JourneyView | null>(null);
  const [catalog, setCatalog] = useState<TripCatalog | null>(null);
  const [draft, setDraft] = useState<TripDraft | null>(null);
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    fetchJourney(journeyId)
      .then(async (loaded) => {
        if (!alive) return;
        setJourney(loaded);
        let lookups: TripCatalog | null = null;
        try {
          lookups = await fetchTripCatalog(loaded.regionName ?? null);
        } catch {
          lookups = null;
        }
        if (!alive) return;
        setCatalog(lookups);
        setDraft(draftFromJourney(loaded, lookups));
      })
      .catch((err: unknown) => {
        if (!alive) return;
        setLoadError(axios.isAxiosError(err) && err.response?.status === 404 ? 'Không tìm thấy lịch trình.' : getApiErrorMessage(err, 'Không tải được lịch trình.'));
      });
    return () => { alive = false; };
  }, [journeyId]);

  // Mở từ tab "Lịch trình" của đơn: lưu / thoát quay về tab đó.
  const viewPath = fromBooking && journey?.bookingCode
    ? `/bookings/${encodeURIComponent(journey.bookingCode)}?tab=journey`
    : `/journeys/${journeyId}`;

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    setError('');
    try {
      await updateJourney(journeyId, draftToInput(draft));
      navigate(viewPath, { replace: true });
    } catch (err) {
      setError(getApiErrorMessage(err, 'Chưa lưu được thay đổi. Vui lòng thử lại.'));
    } finally {
      setSaving(false);
    }
  };

  // Gói gốc tra trên toàn bộ danh mục (theo id lịch trình gợi ý, rồi mã gói) — kể cả gói dài hơn số ngày hiện tại.
  const template = journey ? templateFor(catalog?.templates, journey) : null;

  return (
    <TripShell
      title="Sửa lịch trình"
      onClose={() => {
        if (((window.history.state as { idx?: number } | null)?.idx ?? 0) > 0) {
          navigate(-1);
        } else {
          navigate(viewPath);
        }
      }}
    >
      {loadError ? (
        <div className="mx-auto mt-10 max-w-md rounded-2xl border border-rose-200/80 bg-white p-6 sm:p-8 text-center shadow-xs">
          <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-500 flex items-center justify-center mx-auto mb-3 shadow-2xs">
            <AlertCircle className="h-6 w-6" aria-hidden="true" />
          </div>
          <p className="text-sm font-bold text-slate-800">{loadError}</p>
          <Link to="/lich-trinh?tab=cua-toi" className="mt-4 inline-flex h-11 items-center rounded-xl cta cta-primary px-5 text-sm font-bold text-white shadow-xs transition-all active:scale-95 cursor-pointer">Về lịch trình của tôi</Link>
        </div>
      ) : !draft ? (
        <PlannerSkeleton label="Đang tải lịch trình" />
      ) : (
        <TripEditor
          draft={draft}
          onChange={setDraft}
          catalog={catalog}
          template={template}
          mode="edit"
          loggedIn
          saving={saving}
          error={error}
          onSave={() => { void save(); }}
          stayName={journey?.basePlace?.name ?? null}
        />
      )}
    </TripShell>
  );
}
