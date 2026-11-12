import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import CardPages from '@/components/ui/CardPages';

type GateState = 'pending' | 'ready' | 'instant';

/** Ảnh cần chờ: đang được vẽ (không nằm trong nhánh display:none) và nằm trong bề ngang khung — tức là trang thẻ đầu tiên. */
function gatedImages(root: HTMLElement): HTMLImageElement[] {
  const box = root.getBoundingClientRect();
  return Array.from(root.querySelectorAll('img')).filter((img) => {
    if (img.getClientRects().length === 0) return false;
    const r = img.getBoundingClientRect();
    return r.right > box.left + 1 && r.left < box.right - 1;
  });
}

const isReady = (img: HTMLImageElement) => img.complete && (img.naturalWidth > 0 || !img.currentSrc);

/** Chờ ảnh tải xong (lỗi cũng tính là xong) rồi giải mã sẵn, để lúc hiện ảnh vẽ ra trọn vẹn trong một khung hình. */
function whenImageReady(img: HTMLImageElement): Promise<void> {
  const decode = () => (img.decode ? img.decode().catch(() => undefined) : Promise.resolve());
  if (isReady(img)) return decode();
  return new Promise<void>((resolve) => {
    const done = () => { void decode().then(() => resolve()); };
    img.addEventListener('load', done, { once: true });
    img.addEventListener('error', () => resolve(), { once: true });
  });
}

/**
 * Cổng ảnh cho cả lưới thẻ: thay vì từng ảnh hiện lẻ tẻ khi tải xong (giật, nhảy từng ô), cả lưới là skeleton cho tới khi
 * mọi ảnh của trang đầu tải + giải mã xong, rồi các thẻ hiện ra cùng lúc (so le nhẹ). Ảnh đã có sẵn trong cache thì hiện
 * ngay, không nháy skeleton. Ảnh được tải sẵn ở nền ngay khi trang dựng xong; chờ tối đa 6 giây (mạng chậm vẫn có nội dung).
 */
function useImageGate(rootRef: React.RefObject<HTMLDivElement | null>, total: number): GateState {
  const [state, setState] = useState<GateState>('pending');

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    if (gatedImages(root).every(isReady)) setState((current) => (current === 'pending' ? 'instant' : current));
  }, [rootRef, total]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || state !== 'pending') return undefined;
    let alive = true;
    const open = () => { if (alive) setState('ready'); };
    const images = gatedImages(root);
    // Tải ngay ở nền (không chờ cuộn tới): ảnh lazy chỉ tải khi gần màn hình nên trước đây ảnh vừa tải vừa hiện đúng lúc
    // đang cuộn, gây giật. Giờ tải + giải mã xong trước, lúc cuộn tới chỉ còn vẽ ra.
    images.forEach((img) => { img.loading = 'eager'; });
    void Promise.all(images.map(whenImageReady)).then(open);
    const timer = window.setTimeout(open, 6000);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [rootRef, state, total]);

  return state;
}

const cellKey = (child: React.ReactNode, index: number) =>
  React.isValidElement(child) && child.key != null ? child.key : index;

interface FramerSwipeCardStackProps {
  children: React.ReactNode[];
  className?: string;
  gridClassName?: string;
  /**
   * Từ md: mỗi trang tối đa N thẻ (lưới gridClassName), vuốt / bấm ‹ › sang trang sau — vd 8 thẻ = 2 hàng × 4 cột. Bỏ trống
   * = một lưới hết mọi thẻ.
   */
  perPage?: number;
  /** Tên vùng thẻ cho trình đọc màn hình. */
  label?: string;
  /** Điện thoại: bề rộng mỗi cột thẻ (mỗi cột xếp 2 thẻ chồng dọc). */
  mobileColumnClassName?: string;
  /** Điện thoại: xếp thẻ thành lưới cuộn dọc (vd "grid grid-cols-2 gap-3") thay vì cuộn ngang. */
  mobileVerticalClassName?: string;
}

/**
 * Máy tính / tablet: lưới thẻ (hoặc từng trang perPage thẻ). Điện thoại: không băng chuyền, không tự cuộn — mặc định mỗi
 * cột 2 thẻ, vuốt ngang để xem các cột tiếp theo; có mobileVerticalClassName thì xếp lưới và cuộn dọc theo trang.
 */
export const FramerSwipeCardStack: React.FC<FramerSwipeCardStackProps> = ({
  children,
  className = '',
  gridClassName = 'md:grid md:grid-cols-2 lg:grid-cols-3 md:gap-6',
  perPage,
  label = 'Danh sách thẻ',
  mobileColumnClassName = 'auto-cols-[44%]',
  mobileVerticalClassName,
}) => {
  const total = children.length;
  const rootRef = useRef<HTMLDivElement>(null);
  const gate = useImageGate(rootRef, total);

  if (total === 0) return null;

  /** Ô bọc từng thẻ: lúc chờ ảnh là khung skeleton (globals.css: .img-gate-cell), --gate-i để so le khi hiện. */
  const cells = children.map((child, index) => (
    <div
      key={cellKey(child, index)}
      className="img-gate-cell"
      style={{ '--gate-i': perPage ? index % perPage : Math.min(index, 8) } as React.CSSProperties}
    >
      {child}
    </div>
  ));

  return (
    <div ref={rootRef} data-img-gate={gate} aria-busy={gate === 'pending'} className={`w-full ${className}`}>
      {perPage ? (
        <div className="hidden md:block">
          <CardPages perPage={perPage} pageClassName={gridClassName} label={label}>{cells}</CardPages>
        </div>
      ) : (
        <div className={`hidden md:grid ${gridClassName}`}>
          {cells}
        </div>
      )}
      <div
        className={mobileVerticalClassName
          ? `md:hidden ${mobileVerticalClassName}`
          : `md:hidden grid grid-flow-col grid-rows-2 ${mobileColumnClassName} gap-3 overflow-x-auto overscroll-x-contain snap-x snap-mandatory scroll-px-4 -mx-4 px-4 pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden`}
        role="region"
        aria-label={label}
      >
        {children.map((child, index) => (
          <div
            key={cellKey(child, index)}
            className="img-gate-cell min-w-0 snap-start"
            style={{ '--gate-i': Math.min(index, 8) } as React.CSSProperties}
          >
            {child}
          </div>
        ))}
      </div>
    </div>
  );
};

export default FramerSwipeCardStack;
