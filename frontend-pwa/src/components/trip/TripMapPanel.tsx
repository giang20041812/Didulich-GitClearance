import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, MapPin, Pencil, Plus, Trash2, X } from 'lucide-react';
import PlannerMap from '@/components/journey/planner/PlannerMap';
import PlaceThumb from './PlaceThumb';
import type { VietmapMarkerItem } from '@/types/integrations/vietmap';
import type { TripItem, TripPlace } from '@/types/trip';
import { SESSION_LABEL, SESSION_TONE } from '@/lib/journey';
import { sortItems } from '@/lib/tripPlanner';
import { dayDateLabel } from './tripUi';

interface TripMapPanelProps {
  places: TripPlace[];
  items: TripItem[];
  days: number;
  startDate: string | null;
  regionName: string | null;
  isDesktop: boolean;
  /** Chỗ ở đã chọn (pin ngôi nhà). */
  home?: { name: string; latitude: number; longitude: number } | null;
  onAddPlace: (place: TripPlace, day: number) => void;
  onOpenItem: (uid: string) => void;
  onRemoveItem: (uid: string) => void;
  /** Nút mở gọn "Bản đồ" (điện thoại: nằm trong hàng tiêu đề lộ trình). */
  compact?: boolean;
}

/**
 * Bản đồ lên lịch trình (chuyển từ trang homestay sang), đóng sẵn sau nút "Thêm điểm từ bản đồ": mọi điểm tham quan của
 * tỉnh — điểm đã có trong lịch trình là pin cam đánh số theo thứ tự đi, điểm chưa có là nút "+" → thẻ điểm → "Thêm vào
 * Ngày N". Thứ tự đi xem ở lộ trình từng ngày (bản đồ không vẽ đường nối).
 */
export default function TripMapPanel({ places, items, days, startDate, regionName, isDesktop, home, onAddPlace, onOpenItem, onRemoveItem, compact = false }: TripMapPanelProps) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [open, setOpen] = useState(false);

  const sights = useMemo(() => sortItems(items.filter((i) => i.kind === 'PLACE' && i.placeId != null)), [items]);
  const orderOf = useMemo(() => {
    const map = new Map<number, number>();
    sights.forEach((item, index) => { if (item.placeId != null && !map.has(item.placeId)) map.set(item.placeId, index + 1); });
    return map;
  }, [sights]);
  const mapped = places.filter((p) => p.latitude != null && p.longitude != null);

  const markers = useMemo<VietmapMarkerItem[]>(() => {
    const list: VietmapMarkerItem[] = home
      ? [{ id: 'home', name: home.name, latitude: home.latitude, longitude: home.longitude, isMain: true, kind: 'HOMESTAY', noPopup: true, badgeTone: 'home' }]
      : [];
    for (const place of mapped) {
      const order = orderOf.get(place.id);
      list.push({
        id: `place-${place.id}`,
        name: place.name,
        latitude: place.latitude as number,
        longitude: place.longitude as number,
        kind: 'ATTRACTION',
        noPopup: true,
        badge: order ? String(order) : undefined,
        badgeTone: order ? 'added' : 'add',
        selected: selectedId === place.id,
      });
    }
    return list;
  }, [home, mapped, orderOf, selectedId]);

  const center = useMemo(() => {
    if (mapped.length === 0) return { lat: 21.85, lng: 104.08 };
    const lat = mapped.reduce((sum, p) => sum + Number(p.latitude), 0) / mapped.length;
    const lng = mapped.reduce((sum, p) => sum + Number(p.longitude), 0) / mapped.length;
    return { lat, lng };
  }, [mapped]);

  const onMarkerClick = useCallback((marker: VietmapMarkerItem) => {
    const id = String(marker.id);
    if (id.startsWith('place-')) setSelectedId(Number(id.slice(6)));
  }, []);
  const deselect = useCallback(() => setSelectedId(null), []);
  const changeOpen = useCallback((next: boolean) => { setOpen(next); if (!next) setSelectedId(null); }, []);

  useEffect(() => {
    if (selectedId == null || !isDesktop) return undefined;
    // Bắt ở pha capture: Esc bỏ chọn pin trước, chưa đóng hộp bản đồ.
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setSelectedId(null); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [selectedId, isDesktop]);

  const selected = selectedId != null ? places.find((p) => p.id === selectedId) : undefined;
  const selectedItem = selected ? sights.find((i) => i.placeId === selected.id) : undefined;
  const dayList = Array.from({ length: Math.max(1, days) }, (_, i) => i + 1);

  const card = selected ? (
    <div className="text-left">
      <div className="flex gap-3">
        <span className="relative shrink-0">
          <PlaceThumb dest={selected} className="h-16 w-16 rounded-xl ring-1 ring-black/5" />
          {selectedItem && (
            <span className="absolute -left-1.5 -top-1.5 flex h-6 min-w-6 items-center justify-center rounded-full border-2 border-white bg-orange-500 px-1 text-[11px] font-black text-white shadow">
              {orderOf.get(selected.id)}
            </span>
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className={`text-[11px] font-extrabold uppercase tracking-wider ${selectedItem ? 'text-orange-600' : 'text-[#0a7d64]'}`}>
            {selectedItem ? 'Đã có trong lịch trình' : 'Điểm tham quan'}
          </p>
          <p className="line-clamp-2 text-[15px] font-extrabold leading-snug text-slate-900">{selected.name}</p>
          {selected.regionName && (
            <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-slate-500"><MapPin className="h-3 w-3 shrink-0" /> {selected.regionName}</p>
          )}
        </div>
        <button type="button" onClick={deselect} aria-label="Đóng" className="-mr-1 -mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700 cursor-pointer">
          <X className="h-4 w-4" />
        </button>
      </div>
      {selectedItem ? (
        <div className="mt-3.5">
          <div className="flex items-center gap-2.5 rounded-xl border border-orange-200 bg-orange-50/70 p-2.5 text-[13px] text-orange-950">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-orange-500 text-white"><Check className="h-4 w-4" strokeWidth={3} /></span>
            <span className="min-w-0 flex-1">
              <strong className="block">Ngày {selectedItem.dayIndex}{startDate ? ` · ${dayDateLabel(startDate, selectedItem.dayIndex)}` : ''}</strong>
              <span className="block text-xs text-orange-900/80">{selectedItem.startTime ?? (selectedItem.session ? SESSION_LABEL[selectedItem.session] : '')} · {selectedItem.title}</span>
            </span>
          </div>
          <div className="mt-3 flex items-center justify-between gap-2">
            <button type="button" onClick={() => { onRemoveItem(selectedItem.uid); }} className="inline-flex items-center gap-1.5 rounded-lg px-1 py-1 text-xs font-bold text-rose-600 hover:bg-rose-50 cursor-pointer">
              <Trash2 className="h-3.5 w-3.5" /> Bỏ khỏi lịch trình
            </button>
            <button type="button" onClick={() => { changeOpen(false); onOpenItem(selectedItem.uid); }} className="inline-flex items-center gap-1 rounded-lg bg-[var(--color-ink-deep)] px-3.5 py-2 text-xs font-bold text-white hover:bg-black cursor-pointer">
              <Pencil className="h-3.5 w-3.5" /> Sửa giờ, ngày
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-3">
          {selected.description && <p className="line-clamp-2 text-[13px] leading-relaxed text-slate-600">{selected.description}</p>}
          {selected.suitableSessions.length > 0 && (
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-semibold text-slate-500">Nên đi:</span>
              {selected.suitableSessions.map((s) => (
                <span key={s} className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-bold ${SESSION_TONE[s].chip}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${SESSION_TONE[s].dot}`} /> {SESSION_LABEL[s]}
                </span>
              ))}
            </div>
          )}
          <p className="mb-1.5 mt-3.5 text-[11px] font-extrabold uppercase tracking-wider text-slate-500">Thêm vào</p>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
            {dayList.map((day) => (
              <button
                key={day}
                type="button"
                onClick={() => onAddPlace(selected, day)}
                className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl bg-[#0a7d64] px-2 text-sm font-bold text-white shadow-[0_6px_16px_rgba(10,125,100,0.25)] hover:bg-[#06604a] cursor-pointer"
              >
                <Plus className="h-4 w-4" strokeWidth={3} /> Ngày {day}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  ) : null;

  if (mapped.length === 0) return null;

  return (
    <PlannerMap
      markers={markers}
      center={center}
      isDesktop={isDesktop}
      card={card}
      onMarkerClick={onMarkerClick}
      onDeselect={deselect}
      count={orderOf.size}
      total={mapped.length}
      districtName={regionName}
      open={open}
      onOpenChange={changeOpen}
      compact={compact}
    />
  );
}
