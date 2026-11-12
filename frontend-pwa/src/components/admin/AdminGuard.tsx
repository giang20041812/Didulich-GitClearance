import { useEffect, useState, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import { RefreshCw } from 'lucide-react';
// Cấu hình axios (xếp hàng, hedge, interceptor phiên) chạy trước request axios đầu tiên của cổng —
// file này chỉ nằm trong chunk cổng Admin nên axios không rơi vào bundle tải đầu của khách du lịch.
import { installAxiosBoot } from '@/lib/axiosBoot';
import { adminService } from '@/services/adminService';
import { clearPortalSession } from '@/lib/authInterceptor';
import { useClearStalePortalNotice } from '@/hooks/useClearStalePortalNotice';
import type { PortalLoginResponse } from '@/types/user';

installAxiosBoot();

const readSession = (): PortalLoginResponse | null => {
  try {
    const raw = localStorage.getItem('portal_user');
    return raw ? (JSON.parse(raw) as PortalLoginResponse) : null;
  } catch {
    return null;
  }
};

type Check = 'checking' | 'ok' | 'denied';

/**
 * Chặn cổng Quản trị khi chưa đăng nhập bằng tài khoản Admin. Có hai lớp kiểm tra:
 *  1. Phiên lưu ở trình duyệt phải có token và vai trò ADMIN (NCC không vào được /admin).
 *  2. Token được hỏi lại máy chủ trước khi hiện giao diện, nên token giả/hết hạn/đã bị thu hồi cũng bị đá ra trang đăng nhập.
 * Chỉ khi máy chủ từ chối (401/403) mới coi là không hợp lệ; lỗi mạng thì để trang tự báo lỗi tải dữ liệu.
 */
export default function AdminGuard({ children }: { children: ReactNode }) {
  const location = useLocation();
  const [session] = useState(readSession);
  const hasToken = Boolean(localStorage.getItem('portal_token'));
  const localOk = session !== null && session.role === 'ADMIN' && hasToken;
  const [check, setCheck] = useState<Check>('checking');

  // Phiên không tự hết hạn; chỉ dọn thông báo "phiên không còn hiệu lực" cũ khi đã vào cổng.
  useClearStalePortalNotice();

  useEffect(() => {
    if (!localOk) return;
    let alive = true;
    adminService
      .getMe()
      .then(() => {
        if (alive) setCheck('ok');
      })
      .catch((err: unknown) => {
        if (!alive) return;
        const status = axios.isAxiosError(err) ? err.response?.status : undefined;
        if (status === 401 || status === 403) {
          clearPortalSession({ revoke: false });
          setCheck('denied');
        } else {
          setCheck('ok');
        }
      });
    return () => {
      alive = false;
    };
  }, [localOk]);

  if (session?.role === 'PROVIDER' && hasToken) return <Navigate to="/partner" replace />;
  if (!localOk || check === 'denied') return <Navigate to="/admin/login" replace state={{ from: location.pathname }} />;
  if (check === 'checking') {
    return (
      <div role="status" aria-live="polite" className="flex min-h-screen items-center justify-center bg-canvas text-sm text-muted">
        <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> Đang xác thực phiên quản trị...
      </div>
    );
  }
  return <>{children}</>;
}
