import { cloneElement, isValidElement, useCallback, useEffect, useMemo, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface CardPagesProps {
  /** Các thẻ, theo thứ tự. */
  children: ReactNode[];
  /** Số thẻ mỗi trang. */
  perPage: number;
  /** Lưới của một trang (vd "grid grid-cols-4 gap-4" — 8 thẻ thành 2 hàng). */
  pageClassName: string;
  /** Tên vùng cho trình đọc màn hình. */
  label: string;
}

/** Nút ‹ › trơn, hòa vào nền (không viên thuốc, không bóng): chỉ đổi màu khi rê / bấm. */
const ARROW = 'group/arrow flex h-9 w-9 shrink-0 items-center justify-center rounded-md transition-[color,transform,opacity] duration-200 active:scale-90 disabled:cursor-not-allowed disabled:opacity-25 cursor-pointer';
const ARROW_GHOST = `${ARROW} text-slate-500 hover:text-[var(--color-ink-deep)]`;
const ARROW_SOLID = `${ARROW} text-[var(--color-primary)] hover:text-[#0a3a31]`;
/** Bề rộng một ô trên thanh tiến trình (px) — vạch sáng trượt liền theo vị trí cuộn. */
const SEG = 22;
const pad2 = (n: number) => String(n).padStart(2, '0');

/**
 * Thẻ chia trang: mỗi trang tối đa `perPage` thẻ (lưới pageClassName), vuốt ngang / cuộn ngang bằng touchpad hoặc bấm ‹ ›,
 * chấm trang để sang trang sau. Khung giữ nguyên chiều cao (cao bằng trang đầy nhất), không co lại khi sang trang ít hàng hơn — co khung gây giật. Chỉ
 * một trang thì không có thanh điều khiển.
 */
export default function CardPages({ children, perPage, pageClassName, label }: CardPagesProps) {
  const pages = useMemo(() => {
    const result: ReactNode[][] = [];
    for (let i = 0; i < children.length; i += perPage) result.push(children.slice(i, i + perPage));
    // Mọi trang luôn đủ perPage ô: ô thiếu lấp bằng bản sao ẩn của thẻ đầu (cùng cỡ thẻ thật) để chiều cao phần không đổi
    // dù có ít thẻ hay trang cuối lẻ.
    const template = children[0];
    if (isValidElement(template)) {
      for (const cards of result) {
        for (let i = cards.length; i < perPage; i += 1) {
          cards.push(
            <div key={`pad-${i}`} aria-hidden inert className="pointer-events-none invisible select-none">
              {cloneElement(template as ReactElement, { key: undefined })}
            </div>,
          );
        }
      }
    }
    return result;
  }, [children, perPage]);
  const count = pages.length;
  const scrollerRef = useRef<HTMLDivElement>(null);
  const frame = useRef(0);
  const [page, setPage] = useState(0);
  /**
   * Vạch sáng trên thanh tiến trình bám theo vị trí cuộn (số thực, 0 → count-1) khi đang vuốt. Đặt thẳng transform qua ref,
   * không qua state: state đổi mỗi khung hình làm React vẽ lại cả trang thẻ (8–10 thẻ có ảnh) suốt lúc vuốt → giật.
   */
  const barRef = useRef<HTMLSpanElement>(null);

  /** Khoảng cách giữa hai trang liền nhau (bề rộng trang + khe). */
  const stepOf = (el: HTMLDivElement) => {
    const [first, second] = Array.from(el.children) as HTMLElement[];
    return second && first ? second.offsetLeft - first.offsetLeft : el.clientWidth;
  };
  // Đo vị trí tối đa một lần mỗi khung hình: đọc offsetLeft trong từng sự kiện scroll ép trình duyệt tính lại bố cục liên tục.
  const syncPage = useCallback(() => {
    frame.current = 0;
    const el = scrollerRef.current;
    if (!el) return;
    const exact = Math.max(0, Math.min(count - 1, el.scrollLeft / Math.max(1, stepOf(el))));
    if (barRef.current) barRef.current.style.transform = `translate3d(${(exact * SEG).toFixed(1)}px, -50%, 0)`;
    setPage(Math.round(exact));
  }, [count]);
  const onScroll = useCallback(() => {
    if (!frame.current) frame.current = requestAnimationFrame(syncPage);
  }, [syncPage]);
  useEffect(() => {
    syncPage();
    return () => { if (frame.current) cancelAnimationFrame(frame.current); frame.current = 0; };
  }, [syncPage]);

  const goTo = (index: number) => {
    const el = scrollerRef.current;
    if (!el) return;
    const target = Math.max(0, Math.min(count - 1, index));
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollTo({ left: target * stepOf(el), behavior: reduce ? 'auto' : 'smooth' });
  };

  if (count === 0) return null;

  return (
    <div role="region" aria-roledescription="carousel" aria-label={label}>
      {/* Lề 8px quanh khung cuộn: bóng / nhấc thẻ khi rê chuột không bị cắt */}
      <div
        ref={scrollerRef}
        onScroll={onScroll}
        className="card-pages scrollbar-hide -m-2 flex snap-x snap-mandatory scroll-px-2 items-start gap-4 overflow-x-auto overflow-y-hidden overscroll-x-contain p-2"
      >
        {pages.map((cards, index) => (
          <div
            key={index}
            role="group"
            aria-roledescription="slide"
            aria-label={`Trang ${index + 1} / ${count}`}
            className={`w-full shrink-0 snap-start content-start ${pageClassName}`}
          >
            {cards}
          </div>
        ))}
      </div>

      {count > 1 && (
        <div className="mt-6 flex justify-center">
          <div className="inline-flex items-center gap-1">
            <button type="button" onClick={() => goTo(page - 1)} disabled={page === 0} aria-label="Trang trước" className={ARROW_GHOST}>
              <ChevronLeft className="h-[18px] w-[18px] transition-transform duration-300 group-hover/arrow:-translate-x-0.5" strokeWidth={2.5} aria-hidden />
            </button>

            <div className="flex items-center gap-2.5 px-2">
              <span className="relative block h-5 w-[1.4rem] overflow-hidden text-sm font-extrabold tabular-nums text-[var(--color-ink-deep)]" aria-live="polite">
                <span key={page} className="pager-num absolute inset-0 flex items-center justify-center">{pad2(page + 1)}</span>
              </span>
              {/* Thanh tiến trình: mỗi trang một ô bấm được, vạch gradient trượt liền theo vị trí cuộn */}
              <div className="relative flex items-center" style={{ width: SEG * count }}>
                <span aria-hidden className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-slate-900/15" />
                <span
                  ref={barRef}
                  aria-hidden
                  className="absolute left-0 top-1/2 h-0.5 bg-[var(--color-primary)] will-change-transform"
                  style={{ width: SEG, transform: 'translate3d(0, -50%, 0)' }}
                />
                {pages.map((_, index) => (
                  <button
                    key={index}
                    type="button"
                    onClick={() => goTo(index)}
                    aria-label={`Trang ${index + 1}`}
                    aria-current={index === page}
                    className="relative z-10 h-6 cursor-pointer rounded-full"
                    style={{ width: SEG }}
                  />
                ))}
              </div>
              <span className="text-xs font-bold tabular-nums text-slate-400">{pad2(count)}</span>
            </div>

            <button type="button" onClick={() => goTo(page + 1)} disabled={page === count - 1} aria-label="Trang sau" className={ARROW_SOLID}>
              <ChevronRight className="h-[18px] w-[18px] transition-transform duration-300 group-hover/arrow:translate-x-0.5" strokeWidth={2.5} aria-hidden />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
