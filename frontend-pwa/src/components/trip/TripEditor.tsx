import { useMemo, useState, type ReactNode } from 'react';
import { CalendarDays, Check, ChevronLeft, CircleHelp, Loader2, MapPin, Minus, Pencil, Plus, Save, Users, X } from 'lucide-react';
import type { TripCatalog, TripDraft, TripItem, TripPlace, TripTemplate } from '@/types/trip';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { todayKey } from '@/lib/roomAvailability';
import { draftDays, newCustomItem, slotAfter, sortItems, sourceRestore } from '@/lib/tripPlanner';
import PlaceSheet from '@/components/journey/planner/PlaceSheet';
import UndoToast from '@/components/ui/UndoToast';
import TripTimeline from './TripTimeline';
import TripItemSheet from './TripItemSheet';
import TripAddSheet from './TripAddSheet';
import TripMapPanel from './TripMapPanel';
import { rowsFromDraft } from './timelineRows';
import { BUILD_STEPS, tripDatesLabel } from './tripUi';

interface TripEditorProps {
  draft: TripDraft;
  onChange: (draft: TripDraft) => void;
  catalog: TripCatalog | null;
  template: TripTemplate | null;
  mode: 'new' | 'edit';
  loggedIn: boolean;
  saving: boolean;
  error: string;
  onSave: () => void;
  /**
   * Chỉ khi trình sửa nằm giữa một trang khác (phần gợi ý của trang homestay): nút quay lại phần đó. Trang riêng
   * (/lich-trinh/tao, /lich-trinh/:id) thoát bằng nút × của khung — không lặp thêm nút quay lại.
   */
  onBack?: () => void;
  backLabel?: string;
  /** Ngay dưới tên chuyến — trang tạo lịch trình: khung chọn tiêu chí. */
  intro?: ReactNode;
  /**
   * Hiện thay cho lộ trình khi chưa dựng được lịch trình (trang tạo lịch trình: chưa chọn thời gian) — không vẽ ngày nào,
   * không có bản đồ thêm điểm.
   */
  placeholder?: ReactNode;
  /** Nút "Thêm một ngày" dưới lộ trình (tắt khi số ngày theo tag thời gian đã chọn). */
  canAddDay?: boolean;
  /** Thao tác thêm ở hàng tiêu đề "Lộ trình từng ngày" (vd nút ⋯ của trang tạo lịch trình). */
  tools?: ReactNode;
  /** Tên chỗ ở đã đặt (sửa lịch trình đã gắn đơn). */
  stayName?: string | null;
  /** Mép trên của thanh tab ngày khi dính (ngay dưới thanh trên của trang chứa). */
  stickyTop?: string;
  /** Nền của trang chứa (thanh tab ngày dính dùng cùng nền). */
  surface?: 'canvas' | 'white';
}

/** Danh mục rỗng khi chưa tải xong danh mục của tỉnh (sheet thêm mục vẫn thêm được mục không gắn điểm). */
const EMPTY_CATALOG: Pick<TripCatalog, 'places' | 'templates' | 'addons'> = { places: [], templates: [], addons: [] };

/**
 * Trình sửa lịch trình (tạo mới, sửa lịch trình đã lưu, sửa ngay trên trang homestay): đầu trang gọn — lịch trình mới chỉ
 * có tên (ngày đi, chỗ ở chọn sau khi lưu), lịch trình đã lưu thêm tỉnh, ngày đi, số người; lộ trình mỗi ngày một trang
 * (vuốt / ‹ › / tab ngày) — bấm điểm dừng để sửa giờ, ngày, ghi chú, dịch vụ; thêm mục / điểm tham quan (danh sách hoặc
 * bản đồ); đổi nhanh phương án. "Hướng dẫn" chỉ mở khi bấm. Máy tính: lộ trình trái, bản đồ + nút lưu cột phải; điện
 * thoại: nút mở bản đồ trên lộ trình, nút lưu dính đáy.
 */
export default function TripEditor({
  draft, onChange, catalog, template, mode, loggedIn, saving, error, onSave, onBack, backLabel = 'Quay lại', stayName = null,
  stickyTop = 'calc(3.5rem + var(--safe-top))', surface = 'canvas', intro = null, placeholder = null, canAddDay = true, tools = null,
}: TripEditorProps) {
  const isDesktop = useMediaQuery('(min-width: 1024px)');
  const [editingUid, setEditingUid] = useState<string | null>(null);
  const [adding, setAdding] = useState<{ day: number; afterUid: string | null } | null>(null);
  /** Mục vừa bỏ (còn hoàn tác được) + vị trí cũ trong danh sách. */
  const [removed, setRemoved] = useState<{ item: TripItem; index: number } | null>(null);
  const [datesOpen, setDatesOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  /** Trang ngày cần nhảy tới (vừa thêm ngày / điền ngày trống) — object mới mỗi lần để nhảy lại được cùng một ngày. */
  const [focusDay, setFocusDay] = useState<{ day: number } | null>(null);
  const places = useMemo(() => catalog?.places ?? [], [catalog]);
  const addons = useMemo(() => catalog?.addons ?? [], [catalog]);
  const days = draftDays(draft);
  const rows = useMemo(() => rowsFromDraft(draft.items, catalog, template), [draft.items, catalog, template]);
  const sightCount = draft.items.filter((i) => i.kind === 'PLACE').length;
  const summary = draft.items.length > 0
    ? `${draft.items.length} mục · ${sightCount} điểm tham quan · ${days} ngày`
    : `Lịch trình còn trống · ${days} ngày`;
  const editing = editingUid ? draft.items.find((i) => i.uid === editingUid) : undefined;

  const update = (patch: Partial<TripDraft>) => onChange({ ...draft, ...patch });
  const updateItem = (uid: string, patch: Partial<TripItem>) =>
    update({ items: draft.items.map((item) => (item.uid === uid ? { ...item, ...patch } : item)) });
  const removeItem = (uid: string) => {
    const index = draft.items.findIndex((item) => item.uid === uid);
    const item = draft.items[index];
    if (!item) return;
    setRemoved({ item, index });
    update({ items: draft.items.filter((item) => item.uid !== uid) });
    if (editingUid === uid) setEditingUid(null);
  };
  const undoRemove = () => {
    if (!removed) return;
    const items = [...draft.items];
    items.splice(Math.min(removed.index, items.length), 0, removed.item);
    update({ items });
    setRemoved(null);
  };
  const addItem = (item: TripItem) => {
    update({ items: sortItems([...draft.items, item]) });
    setAdding(null);
  };
  // Thêm từ bản đồ: khung trống cuối ngày (ngày kín thì giờ trống, sửa sau).
  const addPlace = (place: TripPlace, day: number) => {
    const slot = slotAfter(draft.items, day, null, 60);
    addItem(newCustomItem({ kind: 'PLACE', dayIndex: day, startTime: slot?.startTime ?? null, endTime: slot?.endTime ?? null, title: place.name, placeId: place.id }));
  };
  const restore = editing ? sourceRestore(editing, template, catalog) : null;
  const swap = (uid: string) => {
    const row = rows.find((r) => r.key === uid);
    if (!row?.alternative) return;
    updateItem(uid, { placeId: row.alternative.id, title: row.alternative.name, kind: 'PLACE' });
  };

  const saveLabel = mode === 'edit' ? 'Lưu thay đổi' : loggedIn ? 'Lưu lịch trình' : 'Đăng nhập để lưu';
  const saveButton = (className: string) => (
    <button
      type="button"
      onClick={onSave}
      disabled={saving || draft.items.length === 0}
      className={`inline-flex items-center justify-center gap-2 rounded-xl bg-[#0a7d64] font-extrabold text-white shadow-[0_10px_24px_-10px_rgba(10,125,100,0.8)] transition-colors hover:bg-[#06604a] disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed ${className}`}
    >
      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} {saveLabel}
    </button>
  );
  // Hướng dẫn chỉ mở trong sheet khi khách bấm — không chiếm chỗ trên trang.
  const guideButton = (
    <button
      type="button"
      onClick={() => setGuideOpen(true)}
      aria-label="Hướng dẫn lên lịch trình"
      className="inline-flex min-h-10 min-w-10 items-center justify-center gap-1.5 rounded-md px-2 text-sm font-bold text-[#59766e] transition-colors hover:bg-white hover:text-[var(--color-ink-deep)] cursor-pointer"
    >
      <CircleHelp className="h-[18px] w-[18px]" aria-hidden /> <span className="hidden sm:inline">Hướng dẫn</span>
    </button>
  );

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-36 pt-4 sm:px-6 lg:pb-16">
      {onBack && (
        <button type="button" onClick={onBack} className="mb-3 inline-flex min-h-10 items-center gap-1 rounded-full pr-2 text-sm font-bold text-slate-600 hover:text-[#0a7d64] cursor-pointer">
          <ChevronLeft className="h-4 w-4" /> {backLabel}
        </button>
      )}

      {/* Đầu trang gọn: tên (sửa được). Lịch trình đã lưu thêm tỉnh, ngày đi, số người; lịch trình mới chọn ngày sau khi
          lưu. Không lặp lại tiêu chí / lịch trình gợi ý gồm gì. */}
      <section className="flex flex-col gap-2.5">
        <label className="flex items-center gap-2">
          <input
            value={draft.title}
            maxLength={160}
            onChange={(e) => update({ title: e.target.value })}
            placeholder="Đặt tên chuyến đi"
            aria-label="Tên lịch trình"
            className="min-w-0 flex-1 rounded-md bg-transparent text-2xl font-extrabold leading-tight tracking-tight text-[var(--color-ink-deep)] outline-none placeholder:text-slate-400 focus:bg-white sm:text-[28px]"
          />
          <Pencil className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
        </label>
        {mode === 'edit' && (
          <div className="flex flex-wrap items-center gap-2 text-sm font-bold text-[var(--color-ink-deep)]">
            {draft.regionName && (
              <span className="inline-flex h-9 items-center gap-1.5 text-slate-600">
                <MapPin className="h-4 w-4 text-[#0a7d64]" /> {draft.regionName}
              </span>
            )}
            <button type="button" onClick={() => setDatesOpen(true)} className="inline-flex h-9 items-center gap-1.5 rounded-md bg-white px-3 ring-1 ring-[#d6dfd0] hover:ring-[#0a7d64] cursor-pointer">
              <CalendarDays className="h-4 w-4 text-[#0a7d64]" /> {tripDatesLabel(draft.startDate, days)}
              <span className="font-semibold text-slate-500">· {days} ngày</span>
            </button>
            <span className="inline-flex h-9 items-center gap-1 rounded-md bg-white pl-3 pr-1 ring-1 ring-[#d6dfd0]">
              <Users className="h-4 w-4 text-[#0a7d64]" /> {draft.guests} người
              <button type="button" aria-label="Bớt một người" disabled={draft.guests <= 1} onClick={() => update({ guests: Math.max(1, draft.guests - 1) })} className="ml-1 flex h-7 w-7 items-center justify-center rounded hover:bg-slate-100 disabled:opacity-40 cursor-pointer">
                <Minus className="h-3.5 w-3.5" />
              </button>
              <button type="button" aria-label="Thêm một người" disabled={draft.guests >= 50} onClick={() => update({ guests: Math.min(50, draft.guests + 1) })} className="flex h-7 w-7 items-center justify-center rounded hover:bg-slate-100 disabled:opacity-40 cursor-pointer">
                <Plus className="h-3.5 w-3.5" />
              </button>
            </span>
          </div>
        )}
      </section>

      {intro && <div className="mt-4">{intro}</div>}

      {placeholder ? (
        // Chưa dựng được lịch trình (chưa chọn thời gian): chỉ khung chờ — không ngày, không bản đồ, không nút lưu.
        <section aria-labelledby="trip-route-title" className="mt-6">
          <div className="mb-2 flex items-center justify-between gap-2 px-1">
            <h2 id="trip-route-title" className="text-lg font-extrabold text-slate-900">Lộ trình từng ngày</h2>
            {guideButton}
          </div>
          {placeholder}
        </section>
      ) : (
        <>
          <div className="mt-6 space-y-6">
            <div className="min-w-0">
              <div className="mb-1 flex items-center justify-between gap-2 px-1">
                <h2 className="text-lg font-extrabold text-slate-900">Lộ trình từng ngày</h2>
                <div className="flex shrink-0 items-center gap-1">
                  {!isDesktop && places.length > 0 && (
                    <TripMapPanel
                      places={places}
                      items={draft.items}
                      days={days}
                      startDate={draft.startDate}
                      regionName={draft.regionName}
                      isDesktop={false}
                      onAddPlace={addPlace}
                      onOpenItem={setEditingUid}
                      onRemoveItem={removeItem}
                      compact
                    />
                  )}
                  {guideButton}
                  {tools}
                </div>
              </div>
              <TripTimeline
                rows={rows}
                days={days}
                startDate={draft.startDate}
                dayTitles={template?.content.dayTitles}
                dayNotes={template?.content.dayNotes}
                addons={addons}
                stayName={stayName}
                stayHint={mode === 'new' ? 'Lưu lịch trình để chọn homestay phù hợp' : 'Chưa chọn chỗ ở'}
                onEdit={setEditingUid}
                onAdd={(day, afterUid) => setAdding({ day, afterUid })}
                onRemove={removeItem}
                onSwap={swap}
                showOrigin={template != null}
                paged={{ stickyTop, surface, focus: focusDay }}
              />
              {canAddDay && (
                <button
                  type="button"
                  onClick={() => { update({ days: days + 1 }); setFocusDay({ day: days + 1 }); }}
                  disabled={days >= 14}
                  className="mt-5 inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-sm font-bold text-slate-700 ring-1 ring-slate-200 hover:text-[#0a7d64] hover:ring-[#0a7d64] disabled:opacity-40 cursor-pointer"
                >
                  <Plus className="h-4 w-4" strokeWidth={3} /> Thêm một ngày
                </button>
              )}
            </div>

            <aside className="hidden gap-6 lg:grid lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start">
              {places.length > 0 && (
                <TripMapPanel
                  places={places}
                  items={draft.items}
                  days={days}
                  startDate={draft.startDate}
                  regionName={draft.regionName}
                  isDesktop
                  onAddPlace={addPlace}
                  onOpenItem={setEditingUid}
                  onRemoveItem={removeItem}
                />
              )}
              <div className="rounded-3xl bg-white p-5 shadow-xs ring-1 ring-slate-200">
                <p className="text-sm font-extrabold text-slate-900">{summary}</p>
                <p className="mt-1 text-xs leading-relaxed text-slate-500">
                  {mode === 'new'
                    ? 'Lưu vào tài khoản (miễn phí), rồi chọn ngày đi và homestay cho ô Chỗ ở — nhận nhắc giờ, check-in từng điểm.'
                    : 'Thay đổi áp dụng cho lịch trình đã lưu, kể cả nhắc giờ.'}
                </p>
                {error && <p role="alert" className="mt-3 rounded-xl bg-rose-50 p-2.5 text-xs font-semibold text-rose-700 ring-1 ring-rose-200">{error}</p>}
                {saveButton('mt-4 h-12 w-full text-base')}
              </div>
            </aside>
          </div>
    
          {/* Điện thoại: nút lưu dính đáy */}
          <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 px-4 pb-[calc(0.75rem+var(--safe-bottom))] pt-3 backdrop-blur lg:hidden">
            {error && <p role="alert" className="mb-2 text-xs font-semibold text-rose-600">{error}</p>}
            <div className="mx-auto flex max-w-xl items-center gap-3">
              <p className="min-w-0 flex-1 text-xs font-semibold leading-snug text-slate-500">
                <span className="block text-sm font-extrabold text-slate-900">{draft.items.length > 0 ? `${draft.items.length} mục · ${days} ngày` : 'Lịch trình còn trống'}</span>
                {draft.items.length > 0 ? `${sightCount} điểm tham quan` : `${days} ngày · thêm mục để lưu`}
              </p>
              {saveButton('h-12 shrink-0 px-5 text-sm')}
            </div>
          </div>
        </>
      )}

      {editing && (
        <TripItemSheet
          item={editing}
          days={days}
          startDate={draft.startDate}
          places={places}
          addons={addons}
          onChange={(patch) => updateItem(editing.uid, patch)}
          onDelete={() => removeItem(editing.uid)}
          onClose={() => setEditingUid(null)}
          items={draft.items}
          restore={restore ? { label: restore.label, onRestore: () => updateItem(editing.uid, restore.restored) } : null}
        />
      )}
      {adding && (
        <TripAddSheet
          key={`${adding.day}-${adding.afterUid ?? 'end'}`}
          day={adding.day}
          afterUid={adding.afterUid}
          items={draft.items}
          catalog={catalog ?? EMPTY_CATALOG}
          onAdd={addItem}
          onClose={() => setAdding(null)}
        />
      )}
      {removed && (
        <UndoToast
          key={removed.item.uid}
          message={<>Đã bỏ “{removed.item.title}”</>}
          onAction={undoRemove}
          onTimeout={() => setRemoved(null)}
          className="bottom-[calc(5.5rem+var(--safe-bottom))] lg:bottom-[calc(1rem+var(--safe-bottom))]"
        />
      )}
      {guideOpen && <TripGuideSheet steps={mode === 'new'} onClose={() => setGuideOpen(false)} />}
      {datesOpen && (
        <TripDatesSheet
          startDate={draft.startDate}
          days={days}
          minDays={Math.max(1, ...draft.items.map((i) => i.dayIndex))}
          onApply={(startDate, nextDays) => { update({ startDate, days: nextDays }); setDatesOpen(false); }}
          onClose={() => setDatesOpen(false)}
        />
      )}
    </div>
  );
}

/** Mẹo thao tác trên lộ trình (hiện trong "Hướng dẫn", sau ba bước lên lịch trình). */
const ROUTE_TIPS = [
  'Bấm một mục (nút tròn hoặc thẻ) để sửa giờ, ghi chú, dịch vụ thêm.',
  'Dấu + trên đường để chèn mục vào giữa hai mục — chỉ cần chọn giờ và việc cần làm.',
  'Dấu × ở góc mục để bỏ — có nút Hoàn tác ngay sau đó.',
  'Vuốt ngang (điện thoại) hoặc bấm ‹ › để sang ngày khác.',
] as const;

/**
 * "Hướng dẫn": ba bước lên lịch trình (lịch trình mới) + mẹo thao tác — chỉ mở khi khách bấm, không chiếm chỗ trên trang.
 * Sửa lịch trình đã lưu: chỉ mẹo thao tác.
 */
function TripGuideSheet({ steps, onClose }: { steps: boolean; onClose: () => void }) {
  return (
    <PlaceSheet label="Hướng dẫn lên lịch trình" onClose={onClose}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-lg font-extrabold text-slate-900">{steps ? 'Cách lên lịch trình' : 'Cách sửa lịch trình'}</p>
        <button type="button" onClick={onClose} aria-label="Đóng" className="-mr-1 -mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700 cursor-pointer">
          <X className="h-4 w-4" />
        </button>
      </div>
      {steps && (
        <ol className="mt-3 space-y-2.5">
          {BUILD_STEPS.map((step, i) => (
            <li key={step.title} className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--color-cham)] text-xs font-black text-white" aria-hidden>{i + 1}</span>
              <span className="min-w-0 text-sm leading-snug">
                <strong className="block font-extrabold text-slate-900">{step.title}</strong>
                <span className="text-slate-600">{step.text}</span>
              </span>
            </li>
          ))}
        </ol>
      )}
      <p className={`${steps ? 'mt-5' : 'mt-3'} text-[11px] font-extrabold uppercase tracking-wider text-slate-500`}>Trên lộ trình</p>
      <ul className="mt-2 space-y-1.5">
        {ROUTE_TIPS.map((tip) => (
          <li key={tip} className="flex gap-2 text-sm leading-snug text-slate-700">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#0a7d64]" aria-hidden /> {tip}
          </li>
        ))}
      </ul>
      <button type="button" onClick={onClose} className="mt-5 flex h-11 w-full items-center justify-center rounded-xl bg-[var(--color-ink-deep)] text-sm font-bold text-white hover:bg-black cursor-pointer">
        Đã hiểu
      </button>
    </PlaceSheet>
  );
}

/** Đổi ngày đi / số ngày của lịch trình (bỏ trống ngày = chưa chắc, chọn sau). */
function TripDatesSheet({ startDate, days, minDays, onApply, onClose }: {
  startDate: string | null; days: number; minDays: number; onApply: (startDate: string | null, days: number) => void; onClose: () => void;
}) {
  const [value, setValue] = useState(startDate ?? '');
  const [count, setCount] = useState(days);
  const [min] = useState(todayKey);
  return (
    <PlaceSheet label="Ngày đi" onClose={onClose}>
      <p className="text-lg font-extrabold text-slate-900">Ngày đi & số ngày</p>
      <p className="mt-0.5 text-xs text-slate-500">Mỗi mục giữ "Ngày N" của nó — đổi ngày đi thì cả lịch trình dời theo.</p>
      <label className="mt-4 block">
        <span className="mb-1.5 block text-[11px] font-extrabold uppercase tracking-wider text-slate-500">Ngày khởi hành</span>
        <input type="date" value={value} min={min} onChange={(e) => setValue(normalizeDateInput(e.target.value))} className="h-11 w-full rounded-xl border border-slate-200 px-3 text-base text-slate-900 outline-none focus:border-[#0a7d64]" />
      </label>
      <div className="mt-4 flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2">
        <span className="text-sm font-bold text-slate-800">Số ngày</span>
        <span className="flex items-center gap-2">
          <button type="button" aria-label="Bớt một ngày" disabled={count <= minDays} onClick={() => setCount((c) => Math.max(minDays, c - 1))} className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 disabled:opacity-30 cursor-pointer"><Minus className="h-4 w-4" /></button>
          <span className="w-6 text-center text-base font-black tabular-nums">{count}</span>
          <button type="button" aria-label="Thêm một ngày" disabled={count >= 14} onClick={() => setCount((c) => Math.min(14, c + 1))} className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 disabled:opacity-30 cursor-pointer"><Plus className="h-4 w-4" /></button>
        </span>
      </div>
      <div className="mt-5 flex items-center justify-between gap-3">
        <button type="button" onClick={() => onApply(null, count)} className="rounded-lg px-2 py-2 text-sm font-bold text-slate-500 hover:bg-slate-100 cursor-pointer">Chưa chắc ngày</button>
        <button type="button" onClick={() => onApply(value || null, count)} className="inline-flex h-11 items-center gap-1.5 rounded-xl bg-[var(--color-ink-deep)] px-5 text-sm font-bold text-white hover:bg-black cursor-pointer">
          <Check className="h-4 w-4" /> Áp dụng
        </button>
      </div>
    </PlaceSheet>
  );
}

const normalizeDateInput = (value: string) => (/^\d{4}-\d{2}-\d{2}$/.test(value) ? value : '');
