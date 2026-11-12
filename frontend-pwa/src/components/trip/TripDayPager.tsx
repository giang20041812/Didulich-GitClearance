import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { dayDateLabel } from './tripUi';

/** Cách hiện lịch trình theo trang (mỗi ngày một trang) — TripTimeline nhận qua prop `paged`. */
export interface DayPagerOptions {
  /** Mép trên của thanh tab ngày khi dính (CSS), vd "calc(3.5rem + var(--safe-top))" dưới thanh trên của trang. */
  stickyTop?: string;
  /** Ngày mở sẵn (1-based), vd ngày hôm nay của chuyến đang đi. */
  initialDay?: number;
  /** Đặt object mới để nhảy tới ngày đó (vd vừa thêm một ngày). */
  focus?: { day: number } | null;
  /** Nền thanh tab khi dính — trùng nền của trang để không lộ nội dung cuộn bên dưới. */
  surface?: 'canvas' | 'white';
}

interface TripDayPagerProps extends DayPagerOptions {
  days: number;
  startDate: string | null;
  /** Ngày (1-based) trùng hôm nay — chấm vàng trên tab. */
  todayDay?: number | null;
  renderDay: (day: number) => ReactNode;
}

/** Nút ‹ › hai đầu thanh tab ngày (vùng chạm 44px, mờ khi đã ở ngày đầu / cuối). */
const ARROW = 'flex w-9 shrink-0 items-center justify-center rounded-md bg-white text-[var(--color-ink-deep)] ring-1 ring-[#e3e8dc] transition-colors hover:text-[var(--color-primary)] hover:ring-[var(--color-primary)] disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:ring-[#e3e8dc] cursor-pointer';

/** Khung cuộn gần nhất chứa phần tử (modal có thanh cuộn riêng), không có thì cả trang. */
function scrollParentOf(el: HTMLElement): HTMLElement | null {
  for (let node = el.parentElement; node; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node);
    if ((overflowY === 'auto' || overflowY === 'scroll') && node.scrollHeight > node.clientHeight) return node;
  }
  return null;
}

/**
 * Lịch trình mỗi ngày một trang: thanh "‹ Ngày 1 · Ngày 2 … ›" dính dưới thanh trên khi cuộn (đổi ngày lúc nào cũng
 * được — bấm tab, nút ‹ › hoặc vuốt ngang trên điện thoại); sang trang thì về đầu ngày mới. Khung cao đúng bằng ngày đang
 * xem; các ngày khác vẫn vẽ sẵn (vuốt mượt) nhưng `inert` để bàn phím / trình đọc màn hình chỉ gặp ngày đang xem.
 */
export default function TripDayPager({
  days, startDate, renderDay, stickyTop = '0px', initialDay = 1, focus = null, surface = 'canvas', todayDay = null,
}: TripDayPagerProps) {
  const count = Math.max(1, days);
  const dayList = Array.from({ length: count }, (_, i) => i + 1);
  const baseId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const tabsRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const slidesRef = useRef<(HTMLDivElement | null)[]>([]);
  const [index, setIndex] = useState(() => Math.min(count, Math.max(1, Math.round(initialDay))) - 1);
  const [height, setHeight] = useState<number | null>(null);
  const current = Math.min(index, count - 1);
  /** Trang đã dừng hẳn (sau khi vuốt xong) — đổi thì đưa khách về đầu ngày mới. */
  const settled = useRef(current);
  const settleTimer = useRef<number | undefined>(undefined);

  /** Khách đã cuộn qua đầu khung: cuộn lên vừa đủ để thanh tab nằm ngay dưới phần dính — xem ngày mới từ đầu. */
  const revealTop = () => {
    const root = rootRef.current;
    const bar = barRef.current;
    if (!root || !bar) return;
    const parent = scrollParentOf(root);
    const sticky = parseFloat(getComputedStyle(bar).top) || 0;
    const delta = root.getBoundingClientRect().top - (parent ? parent.getBoundingClientRect().top : 0) - sticky;
    if (delta < 0) (parent ?? window).scrollBy({ top: delta, behavior: 'smooth' });
  };

  const goTo = (i: number, { smooth = true, reveal = true } = {}) => {
    const target = Math.max(0, Math.min(count - 1, i));
    const el = scrollerRef.current;
    setIndex(target);
    settled.current = target;
    if (el) el.scrollTo({ left: target * el.clientWidth, behavior: smooth ? 'smooth' : 'auto' });
    if (reveal) revealTop();
  };

  const onScroll = () => {
    const el = scrollerRef.current;
    if (!el || el.clientWidth === 0) return;
    const next = Math.round(el.scrollLeft / el.clientWidth);
    if (next !== index) setIndex(next);
    window.clearTimeout(settleTimer.current);
    settleTimer.current = window.setTimeout(() => {
      if (settled.current === next) return;
      settled.current = next;
      revealTop();
    }, 140);
  };
  useEffect(() => () => window.clearTimeout(settleTimer.current), []);

  // Mở sẵn ở ngày initialDay (không hiệu ứng).
  useLayoutEffect(() => {
    const el = scrollerRef.current;
    if (el && current > 0) el.scrollLeft = current * el.clientWidth;
    // Chỉ lúc gắn khung.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Được yêu cầu nhảy tới một ngày (vd vừa thêm ngày); bớt ngày thì lùi về ngày cuối còn lại.
  useEffect(() => {
    if (focus) goTo(focus.day - 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus]);
  useEffect(() => {
    if (index > count - 1) goTo(count - 1, { smooth: false, reveal: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count]);

  // Khung cao đúng bằng ngày đang xem (đo lại khi ngày đó đổi nội dung).
  useLayoutEffect(() => {
    const slide = slidesRef.current[current];
    if (!slide) return undefined;
    const measure = () => setHeight(slide.offsetHeight);
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(slide);
    return () => observer.disconnect();
  }, [current, count]);

  // Nhiều ngày (dải tab cuộn ngang): giữ tab đang xem trong tầm nhìn — chỉ cuộn dải tab, không cuộn trang.
  useEffect(() => {
    const strip = tabsRef.current;
    const tab = strip?.children[current] as HTMLElement | undefined;
    if (!strip || !tab || strip.scrollWidth <= strip.clientWidth) return;
    if (tab.offsetLeft < strip.scrollLeft) strip.scrollTo({ left: tab.offsetLeft - 8, behavior: 'smooth' });
    else if (tab.offsetLeft + tab.offsetWidth > strip.scrollLeft + strip.clientWidth) {
      strip.scrollTo({ left: tab.offsetLeft + tab.offsetWidth - strip.clientWidth + 8, behavior: 'smooth' });
    }
  }, [current]);

  const onTabKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const keys: Record<string, number> = { ArrowLeft: current - 1, ArrowRight: current + 1, Home: 0, End: count - 1 };
    const target = keys[e.key];
    if (target === undefined) return;
    e.preventDefault();
    goTo(target);
    (tabsRef.current?.children[Math.max(0, Math.min(count - 1, target))] as HTMLElement | undefined)?.focus();
  };

  if (count === 1) return <div className="min-w-0">{renderDay(1)}</div>;

  const fits = count <= 4;
  const tabId = (i: number) => `${baseId}-tab-${i}`;
  const panelId = (i: number) => `${baseId}-day-${i}`;
  const dateOf = (day: number) => dayDateLabel(startDate, day);

  return (
    <div ref={rootRef} className="min-w-0">
      <div
        ref={barRef}
        className={`sticky z-20 -mx-1 mb-2 px-1 py-2 backdrop-blur-md ${surface === 'white' ? 'bg-white/95' : 'bg-[var(--color-canvas)]/95'}`}
        style={{ top: stickyTop }}
      >
        <div className="flex items-stretch gap-1.5">
          <button type="button" onClick={() => goTo(current - 1)} disabled={current === 0} aria-label="Ngày trước" className={ARROW}>
            <ChevronLeft className="h-5 w-5" aria-hidden />
          </button>
          <div
            ref={tabsRef}
            role="tablist"
            aria-label="Chọn ngày"
            onKeyDown={onTabKey}
            className={`min-w-0 flex-1 ${fits ? 'grid gap-1.5' : 'scrollbar-hide relative flex gap-1.5 overflow-x-auto'}`}
            style={fits ? { gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))` } : undefined}
          >
            {dayList.map((day, i) => {
              const active = i === current;
              const date = dateOf(day);
              return (
                <button
                  key={day}
                  id={tabId(i)}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  aria-controls={panelId(i)}
                  tabIndex={active ? 0 : -1}
                  onClick={() => goTo(i)}
                  className={`relative flex min-h-11 min-w-0 flex-col items-center justify-center rounded-md px-1.5 py-1 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)] cursor-pointer ${
                    fits ? '' : 'min-w-[84px] shrink-0'
                  } ${active ? 'bg-[var(--color-cham)] text-white shadow-[0_6px_14px_-8px_rgba(29,45,79,0.9)]' : 'bg-white text-[var(--color-ink-deep)] ring-1 ring-[#e3e8dc] hover:ring-[var(--color-primary)]'}`}
                >
                  <span className="text-sm font-extrabold leading-tight">Ngày {day}</span>
                  {date && <span className={`max-w-full truncate text-[11px] font-semibold leading-tight tabular-nums ${active ? 'text-white/75' : 'text-[#59766e]'}`}>{date}</span>}
                  {todayDay === day && <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-amber-400 ring-2 ring-white" title="Hôm nay" />}
                </button>
              );
            })}
          </div>
          <button type="button" onClick={() => goTo(current + 1)} disabled={current >= count - 1} aria-label="Ngày sau" className={ARROW}>
            <ChevronRight className="h-5 w-5" aria-hidden />
          </button>
        </div>
      </div>

      <div
        ref={scrollerRef}
        onScroll={onScroll}
        style={height != null ? { height } : undefined}
        className="scrollbar-hide flex snap-x snap-mandatory items-start overflow-x-auto overflow-y-hidden overscroll-x-contain transition-[height] duration-200"
      >
        {dayList.map((day, i) => {
          const active = i === current;
          return (
            <div
              key={day}
              id={panelId(i)}
              ref={(el) => { slidesRef.current[i] = el; }}
              role="tabpanel"
              aria-labelledby={tabId(i)}
              inert={!active}
              className="w-full shrink-0 snap-start snap-always overflow-hidden px-px pb-3 pt-px"
            >
              {renderDay(day)}
            </div>
          );
        })}
      </div>
    </div>
  );
}
