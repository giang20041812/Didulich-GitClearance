import { useEffect, useState, type RefObject } from 'react';

/**
 * true khi phần tử đã (hoặc sắp, trong khoảng rootMargin) cuộn tới màn hình — và giữ true từ đó.
 * Dùng để chỉ tải dữ liệu của phần nằm dưới trang (địa điểm xung quanh, đánh giá) khi khách thật sự cuộn tới.
 */
export function useNearViewport(ref: RefObject<Element | null>, rootMargin = '600px', enabled = true): boolean {
  // Trình duyệt không có IntersectionObserver: tải luôn, không chờ cuộn.
  const [near, setNear] = useState(() => typeof window !== 'undefined' && !('IntersectionObserver' in window));
  useEffect(() => {
    if (near || !enabled) return undefined;
    const el = ref.current;
    if (!el) return undefined;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) setNear(true);
    }, { rootMargin });
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, rootMargin, enabled, near]);
  return near;
}
