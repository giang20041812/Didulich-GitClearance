import { useCallback, useSyncExternalStore } from 'react';

/** true khi media query đang khớp; tự cập nhật khi đổi kích thước màn hình / xoay máy. */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback((onChange: () => void) => {
    const mq = window.matchMedia(query);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [query]);
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches, () => false);
}
