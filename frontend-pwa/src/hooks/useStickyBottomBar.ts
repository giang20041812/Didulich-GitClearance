import { useEffect } from 'react';

/**
 * Trang có thanh nút dính đáy màn hình (đặt phòng, xem phòng): đánh dấu <body> để nút "Về đầu trang" nhích lên trên
 * thanh đó trên điện thoại — trước đây hai nút đè nhau, khách dễ bấm nhầm (TEST).
 */
export function useStickyBottomBar(active = true) {
  useEffect(() => {
    if (!active) return undefined;
    document.body.classList.add('has-sticky-bar');
    return () => document.body.classList.remove('has-sticky-bar');
  }, [active]);
}
