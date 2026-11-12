import { useEffect, useRef } from 'react';

/**
 * Gọi `callback` mỗi `intervalMs` mili giây nhưng chỉ khi tab đang hiển thị: tab ẩn thì dừng hẳn
 * (không tốn request / thời gian chạy container backend), mở lại tab thì gọi ngay một lần rồi chạy tiếp.
 * Lần tải đầu tiên do component tự gọi.
 */
export function useVisibleInterval(callback: () => void, intervalMs: number): void {
  const savedCallback = useRef(callback);

  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  useEffect(() => {
    let timer: number | undefined;
    const start = () => {
      if (timer === undefined) timer = window.setInterval(() => savedCallback.current(), intervalMs);
    };
    const stop = () => {
      window.clearInterval(timer);
      timer = undefined;
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        savedCallback.current();
        start();
      } else {
        stop();
      }
    };

    if (document.visibilityState === 'visible') start();
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [intervalMs]);
}
