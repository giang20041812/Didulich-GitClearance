import { useEffect } from 'react';
import { recordHomestayView } from '@/services/travelerActivityService';

/** Ghi lượt mở trang, khi quay lại tab hoặc đăng nhập trên chính trang homestay đang xem. */
export function useHomestayViewTracking(placeId: number | undefined, ready: boolean) {
  useEffect(() => {
    if (!ready || !placeId) return;
    const record = () => { void recordHomestayView(placeId); };
    const timer = window.setTimeout(record, 250);
    document.addEventListener('visibilitychange', record);
    window.addEventListener('auth_change', record);
    window.addEventListener('storage', record);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', record);
      window.removeEventListener('auth_change', record);
      window.removeEventListener('storage', record);
    };
  }, [placeId, ready]);
}
