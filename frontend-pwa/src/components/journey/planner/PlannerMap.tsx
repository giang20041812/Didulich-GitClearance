import { Suspense, lazy, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ChevronRight, Home, Map as MapIcon, Plus, X, ZoomIn } from 'lucide-react';
import { useDialogFocus } from '@/hooks/useDialogFocus';
import type { VietmapMarkerItem } from '@/types/integrations/vietmap';

// Bản đồ (Leaflet) chỉ tải khi khách mở — trang lên lịch trình không kéo theo thư viện bản đồ.
const VietmapView = lazy(() => import('@/components/map/VietmapView'));

interface PlannerMapProps {
  markers: VietmapMarkerItem[];
  center: { lat: number; lng: number };
  isDesktop: boolean;
  /** Thẻ của điểm đang chọn (null = chưa chọn pin nào). */
  card: ReactNode;
  onMarkerClick: (marker: VietmapMarkerItem) => void;
  /** Bấm vùng trống: bỏ chọn pin. */
  onDeselect: () => void;
  /** Số điểm đã thêm / tổng điểm đến trên bản đồ. */
  count: number;
  total: number;
  districtName?: string | null;
  /** Bản đồ đang mở: toàn màn hình trên điện thoại, hộp lớn giữa màn hình trên máy tính. */
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Nút mở gọn (một viên "Bản đồ" trong hàng tiêu đề) thay cho thẻ "Thêm điểm từ bản đồ". */
  compact?: boolean;
}

/** Bản đồ toàn màn hình (điện thoại): chừa chỗ chú thích ở trên và dòng gợi ý ở đáy; lề ngang hẹp để pin giãn ra. */
const FULL_FIT = { topLeft: [18, 64] as [number, number], bottomRight: [18, 76] as [number, number] };

/** Vùng thẻ nổi che trên máy tính (thẻ cột phải) — chọn pin thì kéo bản đồ để pin không nằm dưới thẻ. */
const DESKTOP_PADDING = { topLeft: [70, 70] as [number, number], bottomRight: [400, 50] as [number, number] };
/** Máy tính: chừa nút phóng to (trái trên) và chú thích (phải trên) khi căn khung các pin. */
const DESKTOP_FIT = { topLeft: [64, 60] as [number, number], bottomRight: [56, 44] as [number, number] };

/** Chú thích pin: "+" chưa thêm · pin cam đã thêm · ngôi nhà là chỗ nghỉ. */
export function MapLegend({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 rounded-full bg-white/95 px-3 py-1.5 text-[11px] font-bold text-slate-700 shadow-md ring-1 ring-black/5 backdrop-blur ${className}`}>
      <span className="inline-flex items-center gap-1">
        <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[#0a7d64] text-white ring-2 ring-white"><Plus className="h-2.5 w-2.5" strokeWidth={4} /></span>
        Chưa thêm
      </span>
      <span className="inline-flex items-center gap-1">
        <span className="flex h-4 w-4 items-center justify-center rounded-full bg-orange-500 text-[9px] font-black text-white ring-2 ring-white">1</span>
        Đã thêm
      </span>
      <span className="hidden items-center gap-1 min-[380px]:inline-flex">
        <span className="flex h-4 w-4 items-center justify-center rounded-[5px] bg-[#06604a] text-white ring-2 ring-white"><Home className="h-2.5 w-2.5" strokeWidth={3} /></span>
        Chỗ nghỉ
      </span>
    </span>
  );
}

/** Có nhãn tên bị ẩn vì các điểm sát nhau: gợi ý phóng to. */
function ZoomHint({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full bg-white/95 px-2.5 py-1 text-[11px] font-semibold text-slate-600 shadow-md ring-1 ring-black/5 backdrop-blur ${className}`}>
      <ZoomIn className="h-3.5 w-3.5 text-[#0a7d64]" /> Phóng to để xem đủ tên điểm
    </span>
  );
}

/**
 * Bản đồ chọn điểm của lịch trình — đóng sẵn: trên trang chỉ có nút "Thêm điểm từ bản đồ"; bấm mới mở bản đồ (điện thoại
 * toàn màn hình, thẻ điểm chọn nằm ở đáy; máy tính hộp lớn giữa màn hình, thẻ điểm chọn nổi cột phải).
 */
export default function PlannerMap({ markers, center, isDesktop, card, onMarkerClick, onDeselect, count, total, districtName, open, onOpenChange, compact = false }: PlannerMapProps) {
  /** Số nhãn tên đang bị ẩn (các pin sát nhau) trên bản đồ. */
  const [hiddenLabels, setHiddenLabels] = useState(0);
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogFocus(dialogRef, open);
  // Bản đồ mở: khóa cuộn trang, Esc để đóng.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onOpenChange(false); };
    window.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = previous; };
  }, [open, onOpenChange]);

  // Thẻ ở đáy chiếm chừng nửa bản đồ toàn màn hình: pin đang chọn được kéo lên nửa trên.
  const mobilePadding = useMemo(() => ({
    topLeft: [40, 70] as [number, number],
    // Nhãn tên nằm bên phải pin: chừa rộng mép phải để nhãn không bị cắt.
    bottomRight: [130, Math.round((typeof window === 'undefined' ? 800 : window.innerHeight) * 0.52)] as [number, number],
  }), []);

  const close = () => onOpenChange(false);
  const header = (
    <div className="flex items-center gap-2 border-b border-slate-100 px-2 py-2 sm:px-3">
      <button type="button" onClick={close} aria-label="Đóng bản đồ" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-slate-600 hover:bg-slate-100 cursor-pointer">
        <X className="h-5 w-5" />
      </button>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-extrabold text-slate-900">Chọn điểm tham quan</p>
        <p className="truncate text-xs text-slate-500">{districtName ? `${districtName} · ` : ''}{count > 0 ? `Đã thêm ${count} điểm` : `${isDesktop ? 'Bấm' : 'Chạm'} dấu + để thêm điểm`}</p>
      </div>
      <button type="button" onClick={close} className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-md bg-[#0a7d64] px-4 text-sm font-bold text-white shadow-sm hover:bg-[#06604a] cursor-pointer">
        Xong
        {count > 0 && <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-white px-1 text-[11px] font-black text-[#0a7d64]">{count}</span>}
      </button>
    </div>
  );
  const mapFallback = <div className="h-full w-full animate-pulse bg-slate-100" />;

  const dialog = isDesktop ? (
    <div className="fade-in-overlay fixed inset-0 z-[99999] flex items-center justify-center bg-slate-900/50 p-6 backdrop-blur-[2px]" onClick={close}>
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Bản đồ chọn điểm tham quan"
        onClick={(e) => e.stopPropagation()}
        className="rise-in flex h-[min(780px,calc(100dvh-48px))] w-full max-w-6xl flex-col overflow-hidden rounded-lg bg-white shadow-2xl outline-none"
      >
        {header}
        <div className="relative flex-1">
          <Suspense fallback={mapFallback}>
            <VietmapView
              centerLat={center.lat}
              centerLng={center.lng}
              zoomLevel={12}
              markers={markers}
              onMarkerClick={onMarkerClick}
              onMapClick={onDeselect}
              selectedPadding={DESKTOP_PADDING}
              fitPadding={DESKTOP_FIT}
              zoomSnap={0.25}
              className="h-full w-full"
              mapClassName="min-h-0"
              onLabelsHiddenChange={setHiddenLabels}
            />
          </Suspense>
          <div className="pointer-events-none absolute right-3 top-3 z-[1000] flex max-h-[calc(100%-24px)] w-[360px] flex-col items-end gap-2">
            <MapLegend className="pointer-events-auto" />
            {hiddenLabels > 0 && !card && <ZoomHint />}
            {card ? (
              <div className="rise-in pointer-events-auto w-full overflow-y-auto rounded-lg bg-white p-4 shadow-[0_16px_40px_rgba(10,46,38,0.22)] ring-1 ring-black/5">
                {card}
              </div>
            ) : (
              <p className="rounded-full bg-[var(--color-ink-deep)]/85 px-3 py-1.5 text-xs font-semibold text-white shadow-md backdrop-blur">
                Bấm vào nút <span className="mx-0.5 inline-flex h-4 w-4 translate-y-[3px] items-center justify-center rounded-full bg-[#0a7d64] ring-1 ring-white"><Plus className="h-2.5 w-2.5" strokeWidth={4} /></span> để xem và thêm điểm
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  ) : (
    <div ref={dialogRef} tabIndex={-1} className="fixed inset-0 z-[99999] flex flex-col bg-white pt-[var(--safe-top)] outline-none" role="dialog" aria-modal="true" aria-label="Bản đồ chọn điểm tham quan">
      {header}
      <div className="relative flex-1">
        <Suspense fallback={mapFallback}>
          <VietmapView
            centerLat={center.lat}
            centerLng={center.lng}
            zoomLevel={12}
            markers={markers}
            onMarkerClick={onMarkerClick}
            onMapClick={onDeselect}
            selectedPadding={mobilePadding}
            fitPadding={FULL_FIT}
            zoomSnap={0.25}
            className="h-full w-full"
            mapClassName="min-h-0"
            onLabelsHiddenChange={setHiddenLabels}
          />
        </Suspense>
        <div className="pointer-events-none absolute right-3 top-3 z-[1000] flex flex-col items-end gap-1.5">
          <MapLegend />
          {hiddenLabels > 0 && <ZoomHint />}
        </div>
        {card ? (
          <div className="sheet-in absolute inset-x-2 bottom-[calc(0.5rem+var(--safe-bottom))] z-[1000] max-h-[62%] overflow-y-auto rounded-3xl bg-white p-4 shadow-[0_-8px_40px_rgba(10,46,38,0.25)] ring-1 ring-black/5">
            {card}
          </div>
        ) : (
          <p className="pointer-events-none absolute inset-x-6 bottom-[calc(1rem+var(--safe-bottom))] z-[1000] rounded-full bg-[var(--color-ink-deep)]/85 px-4 py-2.5 text-center text-xs font-semibold text-white shadow-lg backdrop-blur">
            Chạm nút + để xem và thêm điểm vào lịch trình
          </p>
        )}
      </div>
    </div>
  );

  if (compact) {
    return (
      <>
        <button
          type="button"
          onClick={() => onOpenChange(true)}
          aria-haspopup="dialog"
          aria-label={`Thêm điểm từ bản đồ — ${total} điểm đến${count > 0 ? `, đã thêm ${count}` : ''}`}
          className="inline-flex min-h-10 items-center gap-1.5 rounded-md bg-white px-2.5 text-sm font-bold text-[#06604a] ring-1 ring-[#cfe3d8] transition-colors hover:ring-[#0a7d64] cursor-pointer"
        >
          <MapIcon className="h-4 w-4" aria-hidden /> Bản đồ
        </button>
        {open && createPortal(dialog, document.body)}
      </>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => onOpenChange(true)}
        aria-haspopup="dialog"
        className="group flex w-full items-center gap-3 rounded-lg border border-[#d6dfd0] bg-white p-3 text-left shadow-xs transition-colors hover:border-[#0a7d64] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0a7d64] cursor-pointer"
      >
        <span
          aria-hidden
          className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-md bg-[#e3f4ec] text-[#06604a]"
          style={{ backgroundImage: 'repeating-linear-gradient(35deg, transparent 0 9px, rgba(10,125,100,0.10) 9px 10px), repeating-linear-gradient(-55deg, transparent 0 13px, rgba(10,125,100,0.08) 13px 14px)' }}
        >
          <MapIcon className="h-6 w-6" strokeWidth={2.2} />
          <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-[#0a7d64] text-white ring-2 ring-white">
            <Plus className="h-2.5 w-2.5" strokeWidth={4} />
          </span>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-extrabold text-slate-900">Thêm điểm từ bản đồ</span>
          <span className="block truncate text-xs text-slate-500">
            {total} điểm đến{districtName ? ` quanh ${districtName}` : ''} · {count > 0 ? `đã thêm ${count}` : 'chưa thêm điểm nào'}
          </span>
        </span>
        <span className="inline-flex h-9 shrink-0 items-center gap-0.5 rounded-md bg-[var(--color-ink-deep)] pl-3 pr-2 text-xs font-bold text-white transition-colors group-hover:bg-black">
          Mở bản đồ <ChevronRight className="h-3.5 w-3.5" aria-hidden />
        </span>
      </button>
      {open && createPortal(dialog, document.body)}
    </>
  );
}
