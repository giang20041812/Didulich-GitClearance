import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, Check, EyeOff, Globe2, Home, Link2Off, Loader2, MapPin, Pencil, Plus, ReceiptText, Trash2, Users } from 'lucide-react';
import ConfirmDialog, { type ConfirmRequest } from '@/components/partner/ConfirmDialog';
import TodayPanel from '@/components/journey/TodayPanel';
import StopGuideSheet from '@/components/journey/StopGuideSheet';
import ReminderControl from '@/components/journey/ReminderControl';
import ShareControl from '@/components/journey/ShareControl';
import JourneyMenu, { type JourneyMenuItem } from '@/components/journey/JourneyMenu';
import JourneyMemories from '@/components/journey/JourneyMemories';
import TripTimeline from '@/components/trip/TripTimeline';
import TripItemSheet from '@/components/trip/TripItemSheet';
import TripAddSheet from '@/components/trip/TripAddSheet';
import UndoToast from '@/components/ui/UndoToast';
import StaySlot from '@/components/trip/StaySlot';
import { rowsFromJourney } from '@/components/trip/timelineRows';
import { nextOpenStop, phaseChip, useNow } from '@/components/journey/journeyUi';
import { isSightStop, type CheckinView, type JourneyView as Journey } from '@/types/journey';
import type { TripCatalog, TripItem } from '@/types/trip';
import { dayNumberOf, journeyEditPath, journeyRange, journeyTitle, sortStops, vnTodayKey } from '@/lib/journey';
import { draftFromJourney, sortItems, sourceRestore, stopInputOf, templateFor } from '@/lib/tripPlanner';
import { formatVnDayShort } from '@/lib/roomAvailability';
import { getApiErrorMessage } from '@/lib/apiError';
import { journeyInputOf, updateJourney } from '@/services/journeyService';
import { fetchTripCatalog, peekTripCatalog } from '@/services/tripService';

interface JourneyViewProps {
  journey: Journey;
  onChange: (journey: Journey) => void;
  /** Mở sẵn cẩm nang của điểm này (link trong thông báo nhắc giờ: ?stop=). */
  focusStopId?: number | null;
  /** 'page' = trang /journeys/:id · 'booking' = tab "Lịch trình" của đơn. */
  context: 'page' | 'booking';
  /** Tab của đơn: bỏ gắn lịch trình khỏi đơn. */
  onUnlink?: () => Promise<void>;
  /** Trang lịch trình: xóa lịch trình. */
  onDelete?: () => Promise<void>;
  /** Vừa lưu lịch trình (?new=1): ô "Chỗ ở" nổi bật — bước tiếp theo là đặt homestay. */
  highlightStay?: boolean;
}

/** Vòng tiến độ check-in (máy tính / máy tính bảng — điện thoại dùng thanh ngang). */
function ProgressRing({ done, total, className = '' }: { done: number; total: number; className?: string }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  const ratio = total > 0 ? done / total : 0;
  return (
    <div className={`shrink-0 flex-col items-center ${className}`} role="img" aria-label={`Đã check-in ${done}/${total} điểm`}>
      <div className="relative h-16 w-16">
        <svg viewBox="0 0 64 64" className="h-16 w-16 -rotate-90" aria-hidden>
          <circle cx="32" cy="32" r={r} fill="none" stroke="#e2f3ed" strokeWidth="6" />
          <circle cx="32" cy="32" r={r} fill="none" stroke="#0a7d64" strokeWidth="6" strokeLinecap="round" strokeDasharray={`${c * ratio} ${c}`} className="transition-[stroke-dasharray] duration-500" />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-sm font-extrabold text-slate-900">{done}/{total}</span>
      </div>
      <span className="mt-1 text-[11px] font-bold text-slate-500">{done === total ? 'Trọn vẹn!' : 'đã check-in'}</span>
    </div>
  );
}

/**
 * Lịch trình đã lưu — dùng chung cho trang /journeys/:id và tab "Lịch trình" của đơn. Bố cục: đầu trang gọn (giai đoạn
 * chuyến, tên, ngày, tỉnh, số khách, tag gói, tiến độ check-in, Sửa · Chia sẻ · ⋯), ô "Chỗ ở" (trang lịch trình: gợi ý
 * homestay khi chưa đặt), "Hôm nay" khi đang trong chuyến, rồi lộ trình từng ngày dạng con đường qua mọi điểm dừng (di
 * chuyển, ăn uống, tham quan, hoạt động…) — bấm một điểm tham quan mở cẩm nang (video, đường đi, Chỉ đường, check-in).
 * Máy tính: lịch trình bên trái, "Hôm nay" và công cụ bên phải. "Sửa lịch trình" mở trang /lich-trinh/:id.
 */
export default function JourneyView({ journey, onChange, focusStopId, context, onUnlink, onDelete, highlightStay = false }: JourneyViewProps) {
  const [guideId, setGuideId] = useState<number | null>(() => (focusStopId && journey.stops.some((s) => s.id === focusStopId && isSightStop(s)) ? focusStopId : null));
  /** Cẩm nang mở từ nút "Check-in" của "Hôm nay": cuộn thẳng tới mục chụp ảnh. */
  const [guideCheckin, setGuideCheckin] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [titleDraft, setTitleDraft] = useState(journey.title ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const province = journey.regionName ?? null;
  // Danh mục của tỉnh: tên dịch vụ thêm, ảnh món, tiêu đề từng ngày của gói (công khai, giữ trong tab 10 phút).
  const [catalog, setCatalog] = useState<TripCatalog | null>(() => (province ? peekTripCatalog(province) ?? null : null));
  /** Mục đang sửa tại chỗ (bản nháp — lưu khi đóng sheet) + mục đang thêm (ngày, sau mục nào). */
  const [editItem, setEditItem] = useState<{ draft: TripItem; original: TripItem } | null>(null);
  const [adding, setAdding] = useState<{ day: number; afterUid: string | null } | null>(null);
  /** Mục vừa bỏ, chờ hết "Hoàn tác" mới ghi lên máy chủ. */
  const [removing, setRemoving] = useState<TripItem[]>([]);
  const now = useNow(60_000);

  useEffect(() => {
    if (!province) return undefined;
    let alive = true;
    fetchTripCatalog(province).then((data) => { if (alive) setCatalog(data); }).catch(() => undefined);
    return () => { alive = false; };
  }, [province]);

  const today = vnTodayKey(now);
  const chip = phaseChip(journey, today);
  const { phase } = chip;
  const { first, last } = journeyRange(journey);
  const sights = useMemo(() => journey.stops.filter(isSightStop), [journey.stops]);
  const ordered = useMemo(() => sortStops(sights), [sights]);
  const checkedIn = sights.filter((s) => s.checkin).length;
  const editPath = journeyEditPath(journey, context === 'booking' ? 'booking' : undefined);
  const dayCount = first && last ? (dayNumberOf(first, last) ?? 0) : 0;
  const next = phase === 'today' ? nextOpenStop(sights, now) : null;
  const published = !!journey.publishedAt;
  const hiddenOnFeed = published && !!journey.feedHidden;
  const progress = sights.length > 0 ? Math.round((checkedIn / sights.length) * 100) : 0;
  const template = templateFor(catalog?.templates, journey);
  const base = useMemo(() => draftFromJourney(journey), [journey]);
  const removingKeys = useMemo(() => new Set(removing.map((i) => i.uid)), [removing]);
  const allRows = useMemo(() => rowsFromJourney(journey, catalog, template, next?.stop.id ?? null), [journey, catalog, template, next?.stop.id]);
  const rows = useMemo(() => allRows.filter((r) => !removingKeys.has(r.key)), [allRows, removingKeys]);
  const showOrigin = allRows.some((r) => r.origin === 'SUGGESTED');
  const days = Math.max(1, dayCount, ...rows.map((r) => r.dayIndex));
  // Trang ngày mở sẵn: ngày của điểm được mở từ đường dẫn, không thì hôm nay (đang đi), không thì ngày 1.
  const openDay = allRows.find((r) => focusStopId != null && r.key === String(focusStopId))?.dayIndex
    ?? (phase === 'today' ? dayNumberOf(first, today) : null)
    ?? 1;
  const otherItems = journey.stops.length - sights.length;

  const openGuide = (stopId: number | null, checkin = false) => {
    setGuideId(stopId);
    setGuideCheckin(checkin);
  };
  const guideIndex = guideId != null ? ordered.findIndex((s) => s.id === guideId) : -1;
  const guide = guideIndex >= 0 ? ordered[guideIndex] : undefined;
  const dayLabelOf = (visitDate: string | null) => {
    if (!visitDate) return 'Chưa xếp ngày';
    const number = dayNumberOf(first, visitDate);
    return `${number ? `Ngày ${number} · ` : ''}${visitDate === today ? 'Hôm nay' : formatVnDayShort(visitDate)}`;
  };

  const setCheckin = (stopId: number, checkin: CheckinView | null) =>
    onChange({ ...journey, stops: journey.stops.map((s) => (s.id === stopId ? { ...s, checkin } : s)) });

  const rename = async () => {
    setBusy(true);
    setError('');
    try {
      onChange(await updateJourney(journey.id, journeyInputOf(journey, { title: titleDraft.trim() || null })));
      setRenaming(false);
    } catch (err) {
      setError(getApiErrorMessage(err, 'Chưa đổi được tên lịch trình.'));
    } finally {
      setBusy(false);
    }
  };

  /** Ghi lại toàn bộ mục (format 2) sau khi sửa / thêm / bỏ một mục tại chỗ. */
  const saveItems = async (items: TripItem[], fallback: string) => {
    setBusy(true);
    setError('');
    try {
      const stops = sortItems(items).map((item) => stopInputOf(item, base.startDate));
      onChange(await updateJourney(journey.id, journeyInputOf(journey, { stops })));
    } catch (err) {
      setError(getApiErrorMessage(err, fallback));
    } finally {
      setBusy(false);
    }
  };
  const openEdit = (key: string) => {
    const item = base.items.find((i) => i.uid === key);
    if (item) setEditItem({ draft: item, original: item });
  };
  const closeEdit = () => {
    if (!editItem) return;
    const { draft, original } = editItem;
    setEditItem(null);
    if (JSON.stringify(draft) !== JSON.stringify(original)) {
      void saveItems(base.items.map((i) => (i.uid === draft.uid ? draft : i)), 'Chưa lưu được thay đổi của mục.');
    }
  };
  const startRemove = (key: string) => {
    const item = base.items.find((i) => i.uid === key);
    if (item) setRemoving((list) => [...list.filter((i) => i.uid !== key), item]);
  };
  const commitRemove = () => {
    const keys = new Set(removing.map((i) => i.uid));
    setRemoving([]);
    if (keys.size > 0) void saveItems(base.items.filter((i) => !keys.has(i.uid)), 'Chưa bỏ được mục khỏi lịch trình.');
  };
  const addItem = (item: TripItem) => {
    setAdding(null);
    void saveItems([...base.items.filter((i) => !removingKeys.has(i.uid)), item], 'Chưa thêm được mục vào lịch trình.');
  };
  const restore = editItem ? sourceRestore(editItem.draft, template, catalog) : null;

  const run = (action: () => Promise<void>, fallback: string) => {
    setBusy(true);
    setError('');
    void action().catch((err: unknown) => setError(getApiErrorMessage(err, fallback))).finally(() => setBusy(false));
  };

  const menuItems: JourneyMenuItem[] = [
    { label: 'Đổi tên lịch trình', Icon: Pencil, onSelect: () => { setTitleDraft(journey.title ?? ''); setRenaming(true); } },
  ];
  if (context === 'booking' && onUnlink) {
    menuItems.push({
      label: 'Bỏ gắn khỏi đơn',
      Icon: Link2Off,
      tone: 'danger',
      divider: true,
      onSelect: () => setConfirm({
        title: 'Bỏ gắn lịch trình khỏi đơn?',
        body: 'Lịch trình vẫn còn trong "Lịch trình của tôi" — chỉ không hiện ở đơn này nữa.',
        confirmLabel: 'Bỏ gắn',
        onConfirm: () => run(onUnlink, 'Chưa bỏ gắn được lịch trình.'),
      }),
    });
  }
  if (context === 'page' && onDelete) {
    menuItems.push({
      label: 'Xóa lịch trình',
      Icon: Trash2,
      tone: 'danger',
      divider: true,
      onSelect: () => setConfirm({
        title: 'Xóa lịch trình này?',
        body: 'Các mục và link chia sẻ sẽ bị xóa. Ảnh check-in vẫn còn trong "Địa điểm đã đi".',
        confirmLabel: 'Xóa lịch trình',
        tone: 'danger',
        onConfirm: () => run(onDelete, 'Chưa xóa được lịch trình.'),
      }),
    });
  }

  const showTools = (phase === 'today' || phase === 'upcoming') && journey.stops.length > 0;
  // Trang lịch trình: tên là tiêu đề trang; trong tab của đơn: tiêu đề mục.
  const TitleTag = context === 'page' ? 'h1' : 'h2';
  const showMemories = phase === 'past' && checkedIn > 0;
  // Cột phải trống (chuyến đã đi, chưa check-in…): lịch trình chiếm cả bề ngang.
  const hasAside = phase === 'today' || showTools || showMemories;
  // Trang lịch trình: ô "Chỗ ở" (đơn đã gắn hoặc gợi ý homestay). Tab của đơn: chính đơn là chỗ ở.
  const showStay = context === 'page' && phase !== 'past';
  const empty = journey.stops.length === 0;

  return (
    <div className="space-y-4 lg:space-y-6">
      {/* Đầu lịch trình: giai đoạn, tên, ngày, tỉnh, số khách, tiến độ check-in, thao tác */}
      <header className="rounded-3xl border border-slate-200 bg-white p-4 shadow-xs sm:p-5">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-extrabold ${chip.className}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${chip.dot}`} aria-hidden /> {chip.label}
              </span>
              {context === 'page' && journey.bookingCode && (
                <Link
                  to={`/bookings/${encodeURIComponent(journey.bookingCode)}?tab=journey`}
                  className="inline-flex items-center gap-1 rounded-full bg-[#edfbf7] px-2.5 py-1 text-[11px] font-extrabold text-[#0a7d64] ring-1 ring-teal-200 hover:ring-[#0a7d64]"
                >
                  <ReceiptText className="h-3 w-3" /> Đơn #{journey.bookingCode}
                </Link>
              )}
              {published && !hiddenOnFeed && journey.shareToken && (
                <Link
                  to={`/j/${journey.shareToken}`}
                  title="Xem trang công khai như du khách khác thấy"
                  className="inline-flex items-center gap-1 rounded-full bg-[#edfbf7] px-2.5 py-1 text-[11px] font-extrabold text-[#06604a] ring-1 ring-teal-200 hover:ring-[#0a7d64]"
                >
                  <Globe2 className="h-3 w-3" /> Công khai
                </Link>
              )}
              {hiddenOnFeed && (
                <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-extrabold text-slate-600">
                  <EyeOff className="h-3 w-3" /> Bị ẩn khỏi Khám phá
                </span>
              )}
            </div>

            {renaming ? (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <input
                  value={titleDraft}
                  onChange={(e) => setTitleDraft(e.target.value.slice(0, 160))}
                  onKeyDown={(e) => { if (e.key === 'Enter') void rename(); if (e.key === 'Escape') setRenaming(false); }}
                  placeholder={journeyTitle({ title: null, basePlace: journey.basePlace, regionName: province })}
                  aria-label="Tên lịch trình"
                  autoFocus
                  className="h-10 min-w-0 flex-1 rounded-xl border border-slate-200 px-3 text-base font-bold focus:border-[#0a7d64] focus:outline-none"
                />
                <button type="button" onClick={() => { void rename(); }} disabled={busy} className="inline-flex h-10 items-center gap-1 rounded-xl bg-[#0a7d64] px-3 text-sm font-bold text-white disabled:opacity-50 cursor-pointer">
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Lưu
                </button>
                <button type="button" onClick={() => setRenaming(false)} className="h-10 px-2 text-sm font-semibold text-slate-500 cursor-pointer">Hủy</button>
              </div>
            ) : (
              <TitleTag className="mt-2 text-xl font-extrabold leading-tight text-slate-900 sm:text-2xl">{journeyTitle(journey)}</TitleTag>
            )}

            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-600">
              <span className="inline-flex items-center gap-1.5">
                <CalendarDays className="h-4 w-4 shrink-0 text-[#0a7d64]" />
                {first && last ? `${formatVnDayShort(first)} → ${formatVnDayShort(last)} · ${dayCount} ngày` : `${days} ngày · chưa chọn ngày đi`}
              </span>
              {province && (
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="h-4 w-4 shrink-0 text-[#0a7d64]" /> {province}
                </span>
              )}
              {journey.guestCount ? (
                <span className="inline-flex items-center gap-1.5">
                  <Users className="h-4 w-4 shrink-0 text-[#0a7d64]" /> {journey.guestCount} khách
                </span>
              ) : null}
              {journey.basePlace && !showStay && (
                <Link to={`/homestays/${journey.basePlace.id}`} className="inline-flex min-w-0 items-center gap-1.5 font-semibold text-slate-700 hover:text-[#0a7d64]">
                  <Home className="h-4 w-4 shrink-0 text-[#0a7d64]" /> <span className="truncate">{journey.basePlace.name}</span>
                </Link>
              )}
            </div>
          </div>
          {sights.length > 0 && <ProgressRing done={checkedIn} total={sights.length} className="hidden sm:flex" />}
        </div>

        {hiddenOnFeed && (
          <p className="mt-3 flex items-start gap-1.5 rounded-xl bg-amber-50 p-2.5 text-xs leading-relaxed text-amber-900 ring-1 ring-amber-200">
            <EyeOff className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>Quản trị viên đã ẩn lịch trình của bạn khỏi mục Khám phá{journey.feedHiddenReason ? `: ${journey.feedHiddenReason}` : '.'}</span>
          </p>
        )}

        {sights.length > 0 && (
          <div className="mt-4 sm:hidden">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
              <span>Đã check-in <strong className="text-slate-800">{checkedIn}/{sights.length}</strong> điểm</span>
              {checkedIn === sights.length && <span className="font-bold text-emerald-700">Trọn vẹn hành trình!</span>}
            </div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label="Tiến độ check-in">
              <div className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-[#0a7d64] transition-[width] duration-500" style={{ width: `${Math.max(progress, checkedIn > 0 ? 4 : 0)}%` }} />
            </div>
          </div>
        )}

        <div className="mt-4 flex gap-2">
          <Link to={editPath} className="inline-flex h-10 flex-[1.4] items-center justify-center gap-1.5 whitespace-nowrap rounded-xl bg-[#0a7d64] px-3 text-sm font-bold text-white shadow-sm transition-colors hover:bg-[#06604a] sm:flex-none sm:px-4">
            <Pencil className="h-4 w-4" /> Sửa lịch trình
          </Link>
          <ShareControl journey={journey} onChange={onChange} className="flex-1 sm:flex-none" />
          <JourneyMenu items={menuItems} label="Thao tác khác với lịch trình" />
        </div>
        {error && <p role="alert" className="mt-2 text-xs font-semibold text-rose-600">{error}</p>}
      </header>

      {showStay && <StaySlot journey={journey} onChange={onChange} highlight={highlightStay} />}

      {/* Điện thoại: Hôm nay → lịch trình → công cụ / kỷ niệm. Máy tính: lịch trình trái, cột phải dính khi cuộn. */}
      <div className={`flex flex-col gap-4 lg:grid lg:items-start lg:gap-6 ${hasAside ? 'lg:grid-cols-[minmax(0,1fr)_340px]' : 'lg:grid-cols-1'}`}>
        <section aria-label="Lịch trình" className="order-2 min-w-0 lg:col-start-1 lg:row-start-1">
          <div className="mb-3 px-1">
            <h2 className="text-lg font-extrabold text-slate-900">Lộ trình</h2>
            <p className="text-xs text-slate-500">
              {empty
                ? 'Chưa có mục nào — thêm điểm tham quan, bữa ăn, hoạt động ở trang sửa lịch trình.'
                : `${sights.length} điểm tham quan${otherItems > 0 ? ` · ${otherItems} mục khác` : ''} · ${days} ngày — chạm một mục để xem, sửa.`}
            </p>
          </div>

          {empty ? (
            <div className="rounded-3xl border-2 border-dashed border-slate-200 bg-white/70 px-4 py-8 text-center">
              <p className="text-sm font-bold text-slate-700">Lịch trình chưa có mục nào</p>
              <Link to={editPath} className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-[#0a7d64] px-4 py-2 text-xs font-bold text-white shadow-sm">
                <Plus className="h-3.5 w-3.5" strokeWidth={3} /> Thêm vào lịch trình
              </Link>
            </div>
          ) : (
            <TripTimeline
              rows={rows}
              days={days}
              startDate={first}
              dayTitles={template?.content.dayTitles}
              dayNotes={template?.content.dayNotes}
              addons={catalog?.addons ?? []}
              stayName={journey.basePlace?.name ?? null}
              stayHint={showStay ? 'Chưa đặt — xem gợi ý ở ô “Chỗ ở”' : 'Chưa chọn chỗ ở'}
              today={phase === 'today' ? today : null}
              onOpenPlace={(key) => openGuide(Number(key))}
              onCheckin={(key) => openGuide(Number(key), true)}
              onEdit={busy ? undefined : openEdit}
              onAdd={busy ? undefined : (day, afterUid) => setAdding({ day, afterUid })}
              onRemove={busy ? undefined : startRemove}
              showOrigin={showOrigin}
              paged={{
                initialDay: openDay,
                stickyTop: context === 'page' ? 'var(--app-header-offset, 72px)' : 'calc(var(--app-header-offset, 72px) + 53px)',
              }}
            />
          )}
        </section>
        {/* Cột phải (máy tính) — đặt sau lịch trình trong DOM để bàn phím / trình đọc màn hình gặp lịch trình trước */}
        {hasAside && (
          <div className={`contents lg:sticky lg:col-start-2 lg:row-start-1 lg:flex lg:flex-col lg:gap-4 ${context === 'page' ? 'lg:top-[calc(var(--app-header-offset,72px)+16px)]' : 'lg:top-[calc(var(--app-header-offset,72px)+72px)]'}`}>
            {phase === 'today' && (
              <div className="order-1">
                <TodayPanel
                  stops={sights}
                  firstDay={first}
                  lastDay={last}
                  onOpenGuide={(stop) => openGuide(stop.id)}
                  onCheckin={(stop) => openGuide(stop.id, true)}
                />
              </div>
            )}
            {showTools && (
              <div className="order-3">
                <ReminderControl journey={journey} />
              </div>
            )}
            {showMemories && (
              <div className="order-3">
                <JourneyMemories stops={ordered} onOpen={(id) => openGuide(id)} />
              </div>
            )}
          </div>
        )}
      </div>

      {guide && (
        <StopGuideSheet
          journeyId={journey.id}
          stop={guide}
          onClose={() => openGuide(null)}
          onCheckinChange={(checkin) => setCheckin(guide.id, checkin)}
          dayLabel={dayLabelOf(guide.visitDate)}
          position={{ index: guideIndex, total: ordered.length }}
          onPrev={guideIndex > 0 ? () => openGuide(ordered[guideIndex - 1]?.id ?? null) : undefined}
          onNext={guideIndex < ordered.length - 1 ? () => openGuide(ordered[guideIndex + 1]?.id ?? null) : undefined}
          isNext={next?.stop.id === guide.id}
          focusCheckin={guideCheckin}
        />
      )}
      {editItem && (
        <TripItemSheet
          item={editItem.draft}
          days={days}
          startDate={base.startDate}
          places={catalog?.places ?? []}
          addons={catalog?.addons ?? []}
          items={base.items}
          onChange={(patch) => setEditItem((current) => (current ? { ...current, draft: { ...current.draft, ...patch } } : current))}
          onDelete={() => { const key = editItem.draft.uid; setEditItem(null); startRemove(key); }}
          onClose={closeEdit}
          restore={restore ? { label: restore.label, onRestore: () => setEditItem((current) => (current ? { ...current, draft: restore.restored } : current)) } : null}
          doneLabel="Lưu"
        />
      )}
      {adding && (
        <TripAddSheet
          key={`${adding.day}-${adding.afterUid ?? 'end'}`}
          day={adding.day}
          afterUid={adding.afterUid}
          items={base.items.filter((i) => !removingKeys.has(i.uid))}
          catalog={{ places: catalog?.places ?? [], templates: catalog?.templates ?? [], addons: catalog?.addons ?? [] }}
          onAdd={addItem}
          onClose={() => setAdding(null)}
        />
      )}
      {removing.length > 0 && (
        <UndoToast
          key={removing[removing.length - 1]?.uid}
          message={<>Đã bỏ “{removing[removing.length - 1]?.title}”</>}
          onAction={() => setRemoving((list) => list.slice(0, -1))}
          onTimeout={commitRemove}
        />
      )}
      <ConfirmDialog request={confirm} onClose={() => setConfirm(null)} />
    </div>
  );
}
