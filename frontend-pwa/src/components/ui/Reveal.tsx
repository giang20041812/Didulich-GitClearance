import { useEffect, useRef, useState, type ReactNode } from 'react';

interface RevealProps {
  children: ReactNode;
  /** Độ trễ (ms) để tạo hiệu ứng so le giữa các phần tử cùng lúc xuất hiện. */
  delay?: number;
  className?: string;
  /** Nhảy cách bao nhiêu px khi hiện (mặc định 24px — nhẹ, không gây choáng). */
  offset?: number;
  /** Cuộn khuất thì ẩn lại, cuộn tới lại thì hiện lại (mặc định chỉ hiện một lần). */
  repeat?: boolean;
}

/**
 * Hiệu ứng hiện dần khi cuộn tới (fade + nhấc nhẹ) — nhịp chuyển động kiểu sản phẩm cao cấp.
 * Tự tắt khi người dùng bật "giảm chuyển động" (prefers-reduced-motion): nội dung hiện ngay.
 * Mặc định chạy một lần; `repeat` thì ẩn đi khi phần tử ra khỏi khung nhìn và hiện lại khi quay lại.
 */
export default function Reveal({ children, delay = 0, className = '', offset = 24, repeat = false }: RevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof window === 'undefined' || !('IntersectionObserver' in window)
        || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setVisible(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        const entry = entries[entries.length - 1];
        if (!entry) return;
        if (entry.isIntersecting) {
          setVisible(true);
          if (!repeat) io.disconnect();
        } else if (repeat) {
          setVisible(false);
        }
      },
      { threshold: 0.12, rootMargin: '0px 0px -48px 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [repeat]);

  return (
    <div
      ref={ref}
      // will-change chỉ khi còn chờ hiện: giữ mãi thì mỗi khối thành một layer GPU riêng suốt đời trang, cuộn nặng dần.
      className={`${className} transition-[opacity,transform] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] ${
        // Không dùng blur: filter trên cả khối thẻ có ảnh bắt trình duyệt vẽ lại toàn khối mỗi khung hình → cuộn giật.
        // Không đặt will-change lúc chờ: hàng chục khối chờ hiện thành hàng chục lớp GPU cùng lúc; trình duyệt tự nâng lớp
        // trong lúc transition chạy là đủ.
        visible ? 'opacity-100' : 'opacity-0'
      }`}
      style={{
        transitionDelay: visible ? `${delay}ms` : '0ms',
        transform: visible ? undefined : `translate3d(0, ${offset}px, 0) scale(0.98)`,
      }}
    >
      {children}
    </div>
  );
}
