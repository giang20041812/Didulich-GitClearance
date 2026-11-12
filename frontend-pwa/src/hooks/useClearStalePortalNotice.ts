import { useEffect } from 'react';
import { clearPortalSessionNotice } from '@/lib/authInterceptor';

/**
 * Cổng NCC / Admin: đã vào cổng bằng một phiên thì thông báo "phiên không còn hiệu lực" cũ (nếu còn) không còn đúng.
 * Phiên không tự hết hạn nên không có hẹn giờ đăng xuất; phiên bị thu hồi do interceptor xử lý theo phản hồi 401.
 */
export function useClearStalePortalNotice(): void {
  useEffect(() => {
    if (localStorage.getItem('portal_token')) clearPortalSessionNotice();
  }, []);
}
