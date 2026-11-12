import { useMemo, useState } from 'react';
import { Check, Mountain, Search, X } from 'lucide-react';
import PlaceSheet from '@/components/journey/planner/PlaceSheet';
import ImagePlaceholder from '@/components/ui/ImagePlaceholder';
import type { ItemKind, TripCatalog, TripItem, TripPlace } from '@/types/trip';
import { defaultTitleFor, findOverlap, kindForTime, newCustomItem, normalizeTime, slotAfter, sortItems, suggestPlaces, timeToMinutes } from '@/lib/tripPlanner';
import { mediaUrl } from '@/lib/mediaUrl';
import { ADDABLE_KINDS, KIND_META, chipClass } from './tripUi';

/** Số điểm gợi ý hiện sẵn khi chưa tìm. */
const SUGGESTED_PLACES = 5;

const fieldLabel = 'mb-1.5 block text-[11px] font-extrabold uppercase tracking-wider text-slate-500';
const input = 'h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-base text-slate-900 outline-none transition-colors focus:border-[#0a7d64] focus:ring-2 focus:ring-[#0a7d64]/15';

interface TripAddSheetProps {
  day: number;
  /** Mục đứng trước chỗ chèn (null = cuối ngày). */
  afterUid: string | null;
  items: TripItem[];
  catalog: Pick<TripCatalog, 'places' | 'templates' | 'addons'>;
  onAdd: (item: TripItem) => void;
  onClose: () => void;
}

/**
 * Thêm một mục vào ngày — một màn gọn: giờ bắt đầu / kết thúc (chọn sẵn khung trống ngay sau mục đứng trước), loại, rồi
 * điểm tham quan hoặc tên mục, bấm "Thêm". Loại và điểm chọn sẵn theo giờ; ghi chú, dịch vụ thêm sửa sau khi bấm vào mục.
 */
export default function TripAddSheet({ day, afterUid, items, catalog, onAdd, onClose }: TripAddSheetProps) {
  const dayItems = useMemo(() => sortItems(items.filter((i) => i.dayIndex === day)), [items, day]);
  const prev = afterUid ? dayItems.find((i) => i.uid === afterUid) : dayItems[dayItems.length - 1];
  const initialSlot = useMemo(() => slotAfter(items, day, prev?.uid ?? null, 60), [items, day, prev?.uid]);

  const [start, setStart] = useState(initialSlot?.startTime ?? '');
  const [end, setEnd] = useState(initialSlot?.endTime ?? '');
  const hasStay = dayItems.some((i) => i.kind === 'STAY');
  const kindDisabled = (kind: ItemKind) => (kind === 'STAY' && hasStay) || (kind === 'PLACE' && catalog.places.length === 0);
  const [kindChoice, setKindChoice] = useState<ItemKind | null>(null);
  const suggested = kindForTime(start || null, prev?.kind ?? null).kind;
  const kind: ItemKind = kindChoice ?? (kindDisabled(suggested) ? 'MEAL' : suggested);

  const [query, setQuery] = useState('');
  const [placeChoice, setPlaceChoice] = useState<number | null>(null);
  const [title, setTitle] = useState<string | null>(null);

  const ranked = useMemo(() => suggestPlaces(catalog, items, day, start || null), [catalog, items, day, start]);
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q
      ? ranked.filter((p) => p.name.toLowerCase().includes(q) || (p.regionName ?? '').toLowerCase().includes(q)).slice(0, 20)
      : ranked.slice(0, SUGGESTED_PLACES);
  }, [ranked, query]);
  const place: TripPlace | undefined = kind === 'PLACE'
    ? catalog.places.find((p) => p.id === placeChoice) ?? (placeChoice == null ? ranked[0] : undefined)
    : undefined;
  // Điểm đang chọn luôn nằm trong danh sách (kể cả khi đang tìm điểm khác).
  const placeList = place && !matches.some((p) => p.id === place.id) && !query.trim() ? [place, ...matches.slice(0, SUGGESTED_PLACES - 1)] : matches;
  const finalTitle = (title ?? (kind === 'PLACE' ? place?.name ?? '' : defaultTitleFor(kind, start || null))).trim();

  const endBeforeStart = !!start && !!end && timeToMinutes(end) <= timeToMinutes(start);
  const overlap = start && !endBeforeStart ? findOverlap(items, day, start, end || null) : null;
  const timeError = !start
    ? null
    : endBeforeStart
      ? 'Giờ kết thúc phải sau giờ bắt đầu.'
      : overlap
        ? `Trùng giờ “${overlap.title}”${overlap.startTime ? ` (${overlap.startTime}${overlap.endTime ? `–${overlap.endTime}` : ''})` : ''} — chọn giờ khác.`
        : null;
  const canAdd = !!start && !timeError && finalTitle.length > 0 && (kind !== 'PLACE' || !!place);

  const submit = () => {
    if (!canAdd) return;
    onAdd(newCustomItem({
      kind,
      dayIndex: day,
      startTime: normalizeTime(start),
      endTime: normalizeTime(end),
      title: finalTitle,
      placeId: kind === 'PLACE' ? place?.id ?? null : null,
    }));
  };

  return (
    <PlaceSheet label={`Thêm vào ngày ${day}`} onClose={onClose}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[11px] font-extrabold uppercase tracking-wider text-[#0a7d64]">Ngày {day}{prev ? ` · sau ${prev.title}` : ''}</p>
          <p className="text-lg font-extrabold text-slate-900">Thêm hoạt động</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Đóng" className="-mr-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700 cursor-pointer">
          <X className="h-5 w-5" />
        </button>
      </div>

      <form
        className="mt-4 space-y-4"
        onSubmit={(e) => { e.preventDefault(); submit(); }}
      >
        <div>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className={fieldLabel}>Bắt đầu</span>
              <input type="time" required value={start} onChange={(e) => setStart(normalizeTime(e.target.value) ?? '')} className={`${input} tabular-nums`} />
            </label>
            <label className="block">
              <span className={fieldLabel}>Kết thúc</span>
              <input type="time" value={end} onChange={(e) => setEnd(normalizeTime(e.target.value) ?? '')} className={`${input} tabular-nums`} />
            </label>
          </div>
          {timeError && <p role="alert" className="mt-1.5 text-xs font-semibold text-rose-600">{timeError}</p>}
        </div>

        <div>
          <span className={fieldLabel} id={`add-kind-${day}`}>Loại</span>
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-labelledby={`add-kind-${day}`}>
            {ADDABLE_KINDS.map((option) => {
              const meta = KIND_META[option];
              const active = kind === option;
              const disabled = kindDisabled(option);
              return (
                <button
                  key={option}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  disabled={disabled}
                  title={option === 'STAY' && hasStay ? 'Ngày này đã có mục chỗ ở' : undefined}
                  onClick={() => { setKindChoice(option); setTitle(null); }}
                  className={chipClass(active, disabled, 'sm')}
                >
                  <meta.Icon className="h-3.5 w-3.5" aria-hidden /> {meta.label}
                </button>
              );
            })}
          </div>
        </div>

        {kind === 'PLACE' ? (
          <div>
            <label className="relative block">
              <span className="sr-only">Tìm điểm tham quan</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Tìm điểm tham quan" className={`${input} pl-9`} />
            </label>
            <div className="mt-2 space-y-1.5" role="radiogroup" aria-label="Điểm tham quan">
              {placeList.length === 0 && <p className="py-3 text-center text-sm text-slate-500">Không tìm thấy điểm nào.</p>}
              {placeList.map((option) => {
                const active = place?.id === option.id;
                const inTrip = items.some((i) => i.placeId === option.id);
                return (
                  <button
                    key={option.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => { setPlaceChoice(option.id); setTitle(null); }}
                    className={`flex w-full items-center gap-3 rounded-md p-1.5 pr-3 text-left transition-colors cursor-pointer ${active ? 'border-[1.5px] border-[#0a7d64] bg-[#e3f4ec]' : 'border border-slate-200 bg-white hover:border-slate-300'}`}
                  >
                    <span className="block h-10 w-10 shrink-0 overflow-hidden rounded bg-slate-100">
                      {option.coverImageUrl ? <img src={mediaUrl(option.coverImageUrl, 120)} alt="" loading="lazy" className="h-full w-full object-cover" /> : <ImagePlaceholder Icon={Mountain} />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-extrabold text-slate-900">{option.name}</span>
                      {inTrip && <span className="block truncate text-xs text-slate-500">Đã có trong chuyến</span>}
                    </span>
                    {active && <Check className="h-4 w-4 shrink-0 text-[#0a7d64]" aria-hidden />}
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <label className="block">
            <span className={fieldLabel}>Tên</span>
            <input value={title ?? finalTitle} maxLength={160} onChange={(e) => setTitle(e.target.value)} placeholder="Vd: Ăn trưa tại Tú Lệ" className={input} />
          </label>
        )}

        <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-4">
          <button type="button" onClick={onClose} className="inline-flex h-11 items-center rounded-md px-4 text-sm font-bold text-slate-600 hover:bg-slate-100 cursor-pointer">
            Hủy
          </button>
          <button
            type="submit"
            disabled={!canAdd}
            className="inline-flex h-11 items-center rounded-md bg-[var(--color-ink-deep)] px-6 text-sm font-bold text-white transition-colors hover:bg-black disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
          >
            Thêm
          </button>
        </div>
      </form>
    </PlaceSheet>
  );
}
