import { useState } from 'react';
import { AlertTriangle, Check, MapPin, Mountain, Repeat, RotateCcw, Trash2, X } from 'lucide-react';
import PlaceSheet from '@/components/journey/planner/PlaceSheet';
import ImagePlaceholder from '@/components/ui/ImagePlaceholder';
import type { ItemKind, TripAddon, TripItem, TripPlace } from '@/types/trip';
import { findOverlap, normalizeTime } from '@/lib/tripPlanner';
import { mediaUrl } from '@/lib/mediaUrl';
import PlacePicker from './PlacePicker';
import { KIND_META, addonIcon, dayDateLabel } from './tripUi';

const NON_PLACE_KINDS: ItemKind[] = ['MEAL', 'ACTIVITY', 'TRANSPORT', 'STAY', 'FREE'];

const fieldLabel = 'mb-1.5 block text-[11px] font-extrabold uppercase tracking-wider text-slate-500';
const input = 'h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-base text-slate-900 outline-none transition-colors focus:border-[#0a7d64] focus:ring-2 focus:ring-[#0a7d64]/15';

interface TripItemSheetProps {
  item: TripItem;
  days: number;
  startDate: string | null;
  places: TripPlace[];
  addons: TripAddon[];
  onChange: (patch: Partial<TripItem>) => void;
  onDelete: () => void;
  onClose: () => void;
  /** Mọi mục của lịch trình — để báo trùng giờ với mục khác cùng ngày. */
  items?: TripItem[];
  /** Mục gợi ý đã sửa khác bản gốc: "Gợi ý gốc: 19:00–20:30 Đêm văn hóa · Khôi phục". */
  restore?: { label: string; onRestore: () => void } | null;
  /** Nhãn nút xong (mặc định "Xong"). */
  doneLabel?: string;
}

/**
 * Sửa một mục của lịch trình: tên, ngày, giờ bắt đầu / kết thúc, ghi chú, dịch vụ thêm; điểm tham quan đổi được sang
 * điểm khác; mục khác đổi được loại (ăn uống, hoạt động, di chuyển, chỗ ở, nghỉ ngơi). Mọi thay đổi áp ngay vào nháp.
 */
export default function TripItemSheet({ item, days, startDate, places, addons, onChange, onDelete, onClose, items, restore = null, doneLabel = 'Xong' }: TripItemSheetProps) {
  const [picking, setPicking] = useState(false);
  const place = item.placeId != null ? places.find((p) => p.id === item.placeId) : undefined;
  const meta = KIND_META[item.kind];
  const dayList = Array.from({ length: Math.max(days, item.dayIndex) }, (_, i) => i + 1);
  const overlap = items && item.startTime ? findOverlap(items, item.dayIndex, item.startTime, item.endTime, item.uid) : null;
  const toggleAddon = (code: string) =>
    onChange({ addons: item.addons.includes(code) ? item.addons.filter((c) => c !== code) : [...item.addons, code] });

  return (
    <PlaceSheet label={`Sửa ${item.title}`} onClose={onClose}>
      <div className="flex items-start gap-3">
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${meta.node}`}>
          <meta.Icon className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-extrabold uppercase tracking-wider text-[#0a7d64]">{meta.label}</p>
          <p className="truncate text-lg font-extrabold leading-snug text-slate-900">{item.title || 'Mục mới'}</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Đóng" className="-mr-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700 cursor-pointer">
          <X className="h-5 w-5" />
        </button>
      </div>

      {restore && (
        <p className="mt-3 flex items-center gap-2 rounded-md bg-[var(--color-canvas)] px-3 py-2 text-xs text-slate-600 ring-1 ring-[#e3e8dc]">
          <span className="min-w-0 flex-1">Gợi ý gốc: <span className="font-bold text-slate-800">{restore.label}</span></span>
          <button type="button" onClick={restore.onRestore} className="inline-flex min-h-9 shrink-0 items-center gap-1 rounded-md px-2 font-extrabold text-[#06604a] hover:bg-[#e3f4ec] cursor-pointer">
            <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Khôi phục
          </button>
        </p>
      )}

      <div className="mt-4 space-y-4">
        {item.kind === 'PLACE' ? (
          <div>
            <span className={fieldLabel}>Điểm tham quan</span>
            {picking ? (
              <PlacePicker
                places={places}
                selectedIds={new Set(item.placeId != null ? [item.placeId] : [])}
                onPick={(next) => {
                  onChange({ placeId: next.id, title: next.name });
                  setPicking(false);
                }}
              />
            ) : (
              <div className="flex items-center gap-3 rounded-lg bg-slate-50 p-2.5 ring-1 ring-slate-200">
                <span className="block h-14 w-14 shrink-0 overflow-hidden rounded-md bg-slate-100">
                  {place?.coverImageUrl ? <img src={mediaUrl(place.coverImageUrl, 160)} alt="" className="h-full w-full object-cover" /> : <ImagePlaceholder Icon={Mountain} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-extrabold text-slate-900">{place?.name ?? item.title}</span>
                  {place?.regionName && <span className="mt-0.5 flex items-center gap-1 text-xs text-slate-500"><MapPin className="h-3 w-3" aria-hidden />{place.regionName}</span>}
                </span>
                <button type="button" onClick={() => setPicking(true)} className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-white px-2.5 py-1.5 text-xs font-bold text-[#06604a] shadow-xs ring-1 ring-teal-200 hover:ring-[#0a7d64] cursor-pointer">
                  <Repeat className="h-3.5 w-3.5" /> Đổi điểm
                </button>
              </div>
            )}
          </div>
        ) : (
          <div>
            <span className={fieldLabel}>Loại</span>
            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Loại mục">
              {NON_PLACE_KINDS.map((kind) => {
                const active = item.kind === kind;
                const KindIcon = KIND_META[kind].Icon;
                return (
                  <button
                    key={kind}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => onChange({ kind })}
                    className={`inline-flex min-h-10 items-center gap-1.5 rounded-md px-3 text-xs font-bold transition-colors cursor-pointer ${
                      active ? 'bg-[var(--color-ink-deep)] text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:ring-slate-300'
                    }`}
                  >
                    <KindIcon className="h-3.5 w-3.5" aria-hidden /> {KIND_META[kind].label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <label className="block">
          <span className={fieldLabel}>Tên mục</span>
          <input value={item.title} maxLength={160} onChange={(e) => onChange({ title: e.target.value })} placeholder={item.kind === 'PLACE' ? place?.name : 'Vd: Ăn trưa tại Tú Lệ'} className={input} />
        </label>

        <div>
          <span className={fieldLabel}>Ngày</span>
          <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5 scrollbar-hide" role="radiogroup" aria-label="Ngày của mục">
            {dayList.map((day) => {
              const active = item.dayIndex === day;
              return (
                <button
                  key={day}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => onChange({ dayIndex: day })}
                  className={`min-w-[78px] shrink-0 rounded-md border px-2 py-1.5 text-center transition-colors cursor-pointer ${
                    active ? 'border-[#0a7d64] bg-[#0a7d64] text-white shadow-sm' : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                  }`}
                >
                  <span className="block text-xs font-extrabold">Ngày {day}</span>
                  {startDate && <span className="block text-[10.5px] font-semibold opacity-80">{dayDateLabel(startDate, day)}</span>}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className={fieldLabel}>Bắt đầu</span>
            <input type="time" value={item.startTime ?? ''} onChange={(e) => onChange({ startTime: normalizeTime(e.target.value), session: e.target.value ? null : item.session })} className={`${input} tabular-nums`} />
          </label>
          <label className="block">
            <span className={fieldLabel}>Kết thúc</span>
            <input type="time" value={item.endTime ?? ''} onChange={(e) => onChange({ endTime: normalizeTime(e.target.value) })} className={`${input} tabular-nums`} />
          </label>
        </div>
        {item.startTime && item.endTime && item.endTime < item.startTime && (
          <p className="-mt-2 text-xs font-semibold text-rose-600">Giờ kết thúc đang sớm hơn giờ bắt đầu — sẽ bỏ giờ kết thúc khi lưu.</p>
        )}
        {overlap && (
          <p className="-mt-2 flex items-center gap-1.5 text-xs font-semibold text-amber-800">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />
            Trùng giờ với “{overlap.title}”{overlap.startTime ? ` (${overlap.startTime}${overlap.endTime ? `–${overlap.endTime}` : ''})` : ''}
          </p>
        )}

        <label className="block">
          <span className={fieldLabel}>Ghi chú</span>
          <textarea
            value={item.note ?? ''}
            maxLength={1000}
            rows={3}
            onChange={(e) => onChange({ note: e.target.value || null })}
            placeholder="Món muốn ăn, điều cần chuẩn bị, liên hệ…"
            className="w-full rounded-md border border-slate-200 bg-white px-3 py-2.5 text-base leading-relaxed text-slate-900 outline-none transition-colors focus:border-[#0a7d64] focus:ring-2 focus:ring-[#0a7d64]/15"
          />
        </label>

        {addons.length > 0 && (
          <div>
            <span className={fieldLabel}>Dịch vụ thêm</span>
            <div className="flex flex-wrap gap-1.5">
              {addons.map((addon) => {
                const on = item.addons.includes(addon.code);
                const Icon = addonIcon(addon.code);
                return (
                  <button
                    key={addon.code}
                    type="button"
                    aria-pressed={on}
                    title={addon.note ?? undefined}
                    onClick={() => toggleAddon(addon.code)}
                    className={`inline-flex min-h-10 items-center gap-1.5 rounded-md px-3 text-xs font-bold transition-colors cursor-pointer ${
                      on ? 'bg-sky-600 text-white shadow-sm' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:ring-sky-300'
                    }`}
                  >
                    {on ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Icon className="h-3.5 w-3.5" aria-hidden />}
                    {addon.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div className="mt-5 flex items-center justify-between gap-3 border-t border-slate-100 pt-4">
        <button type="button" onClick={onDelete} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-2 text-sm font-bold text-rose-600 hover:bg-rose-50 cursor-pointer">
          <Trash2 className="h-4 w-4" /> Bỏ mục này
        </button>
        <button type="button" onClick={onClose} className="inline-flex h-11 items-center gap-1.5 rounded-md bg-[var(--color-ink-deep)] px-5 text-sm font-bold text-white hover:bg-black cursor-pointer">
          {doneLabel}
        </button>
      </div>
    </PlaceSheet>
  );
}
