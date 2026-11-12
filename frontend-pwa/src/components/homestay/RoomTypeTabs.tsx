import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { RoomTypeDto } from '@/types/homestay';

export interface RoomTypeTab {
  room: RoomTypeDto;
  /** Số phòng còn đặt được cho khoảng ngày đang chọn; null khi khách chưa chọn đủ ngày nhận và trả. */
  available: number | null;
}

interface RoomTypeTabsProps {
  tabs: RoomTypeTab[];
  selectedId: number;
  onSelect: (roomId: number) => void;
  /** id của vùng nội dung loại phòng (aria-controls). */
  panelId: string;
  /** Số phòng khách đã chọn theo loại phòng (một đơn gộp nhiều loại) — hiện "×N" trên thanh. */
  counts?: Record<number, number>;
}

function TabMeta({ tab }: { tab: RoomTypeTab }) {
  const { room, available } = tab;
  if (room.basePrice == null) return <span className="text-slate-400">Chưa mở đặt trực tuyến</span>;
  if (available == null) return <span>Tối đa {room.maxOccupancy} khách</span>;
  if (available <= 0) return <span className="text-rose-600">Hết phòng ngày đã chọn</span>;
  return <span className={available === 1 ? 'text-amber-700' : 'text-emerald-700'}>Còn {available} phòng</span>;
}

/**
 * Thanh chọn loại phòng nằm ngang, lướt được như thanh điều hướng (thay cho dropdown). Không hiện giá — giá nằm trong
 * phần chi tiết của loại phòng đang chọn. Mũi tên trái / phải, Home / End để chuyển loại phòng bằng bàn phím.
 */
export default function RoomTypeTabs({ tabs, selectedId, onSelect, panelId, counts }: RoomTypeTabsProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: false, end: false });

  // Bóng mờ + nút cuộn ở mép chỉ hiện khi còn loại phòng bị khuất về phía đó.
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return undefined;
    const update = () => setEdges({
      start: el.scrollLeft > 4,
      end: el.scrollLeft + el.clientWidth < el.scrollWidth - 4,
    });
    update();
    el.addEventListener('scroll', update, { passive: true });
    const observer = 'ResizeObserver' in window ? new ResizeObserver(update) : null;
    observer?.observe(el);
    return () => {
      el.removeEventListener('scroll', update);
      observer?.disconnect();
    };
  }, [tabs.length]);

  // Loại phòng được chọn từ nơi khác (gợi ý "còn trống", đường dẫn) luôn lộ ra trên thanh — chỉ cuộn ngang trong thanh,
  // không kéo cả trang.
  useEffect(() => {
    const scroller = scrollerRef.current;
    const tab = scroller?.querySelector<HTMLElement>(`[data-room-id="${selectedId}"]`);
    if (!scroller || !tab) return;
    // Thanh cuộn là offsetParent (relative) nên offsetLeft tính từ đầu nội dung của thanh.
    const left = tab.offsetLeft;
    const right = left + tab.offsetWidth;
    if (left < scroller.scrollLeft + 12) scroller.scrollTo({ left: Math.max(0, left - 24), behavior: 'smooth' });
    else if (right > scroller.scrollLeft + scroller.clientWidth - 12) {
      scroller.scrollTo({ left: right - scroller.clientWidth + 24, behavior: 'smooth' });
    }
  }, [selectedId]);

  const scrollBy = (direction: 1 | -1) => {
    const el = scrollerRef.current;
    if (el) el.scrollBy({ left: direction * Math.max(160, el.clientWidth * 0.7), behavior: 'smooth' });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let next = index;
    if (event.key === 'ArrowRight') next = Math.min(tabs.length - 1, index + 1);
    else if (event.key === 'ArrowLeft') next = Math.max(0, index - 1);
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = tabs.length - 1;
    else return;
    event.preventDefault();
    const target = tabs[next];
    if (!target) return;
    onSelect(target.room.id);
    scrollerRef.current?.querySelector<HTMLButtonElement>(`[data-room-id="${target.room.id}"]`)?.focus({ preventScroll: true });
  };

  const edgeButton = 'absolute top-1/2 z-10 hidden h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm transition-colors hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] md:flex cursor-pointer';

  return (
    <div className="relative">
      <div
        ref={scrollerRef}
        role="tablist"
        aria-label="Loại phòng"
        className="relative flex snap-x snap-proximity gap-1 overflow-x-auto border-b border-slate-200 scrollbar-hide"
      >
        {tabs.map((tab, index) => {
          const active = tab.room.id === selectedId;
          const chosen = counts?.[tab.room.id] ?? 0;
          return (
            <button
              key={tab.room.id}
              type="button"
              role="tab"
              id={`room-tab-${tab.room.id}`}
              data-room-id={tab.room.id}
              aria-selected={active}
              aria-controls={panelId}
              tabIndex={active ? 0 : -1}
              onClick={() => onSelect(tab.room.id)}
              onKeyDown={(event) => onKeyDown(event, index)}
              className={`group relative shrink-0 snap-start rounded-t-md px-3.5 pb-3 pt-2.5 text-left transition-colors cursor-pointer md:px-4 ${
                active ? 'bg-[var(--color-primary-50)]/70' : 'hover:bg-slate-50'
              }`}
            >
              <span className="flex items-center gap-1.5">
                <span
                  className={`block max-w-[13rem] truncate text-sm font-extrabold md:max-w-[16rem] md:text-[15px] ${
                    active ? 'text-[var(--color-ink-deep)]' : 'text-slate-600 group-hover:text-slate-900'
                  }`}
                >
                  {tab.room.name}
                </span>
                {chosen > 0 && (
                  <span className="shrink-0 rounded-full bg-[var(--color-coral)] px-1.5 py-px text-[10px] font-black leading-4 text-white" aria-label={`Đã chọn ${chosen} phòng`}>
                    ×{chosen}
                  </span>
                )}
              </span>
              <span className="mt-0.5 block whitespace-nowrap text-[11px] font-semibold text-[var(--color-muted)]">
                <TabMeta tab={tab} />
              </span>
              <span
                aria-hidden
                className={`absolute inset-x-2 bottom-0 h-[3px] rounded-full transition-colors ${
                  active ? 'bg-[var(--color-primary)]' : 'bg-transparent group-hover:bg-slate-200'
                }`}
              />
            </button>
          );
        })}
      </div>

      {edges.start && (
        <>
          <span aria-hidden className="pointer-events-none absolute inset-y-0 left-0 w-10 bg-gradient-to-r from-white to-transparent" />
          <button type="button" aria-label="Loại phòng trước" onClick={() => scrollBy(-1)} className={`${edgeButton} left-0`}>
            <ChevronLeft className="h-4 w-4" />
          </button>
        </>
      )}
      {edges.end && (
        <>
          <span aria-hidden className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-white to-transparent" />
          <button type="button" aria-label="Loại phòng tiếp theo" onClick={() => scrollBy(1)} className={`${edgeButton} right-0`}>
            <ChevronRight className="h-4 w-4" />
          </button>
        </>
      )}
    </div>
  );
}
