import { useEffect, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import BookingStatusWatcher from '@/components/booking/BookingStatusWatcher';
import { getCurrentPortalCustomer } from '@/lib/currentCustomer';

/**
 * Trang của khách hàng:
 * - Admin / nhà cung cấp được xem và điền thông tin như khách, nhưng không được xác nhận đặt phòng.
 * - Luôn có nút quay lại đúng cổng; phiên cổng không chạy điều hướng theo đơn của khách du lịch.
 */
export default function CustomerRoute() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [session, setSession] = useState(getCurrentPortalCustomer);

  useEffect(() => {
    const syncSession = () => setSession(getCurrentPortalCustomer());
    window.addEventListener('auth_change', syncSession);
    window.addEventListener('storage', syncSession);
    return () => {
      window.removeEventListener('auth_change', syncSession);
      window.removeEventListener('storage', syncSession);
    };
  }, []);

  const isPortalPreview = session?.role === 'ADMIN' || session?.role === 'PROVIDER';
  const isProvider = session?.role === 'PROVIDER';

  return (
    <>
      <Outlet />
      {/* Đơn được Admin / NCC xác nhận → màn hình của khách tự chuyển tới chi tiết đơn */}
      {!isPortalPreview && <BookingStatusWatcher />}
      {isPortalPreview && pathname !== '/booking' && (
        <button
          type="button"
          onClick={() => navigate(isProvider ? '/partner' : '/admin')}
          className="fixed bottom-[calc(var(--safe-bottom)+6rem)] left-4 z-[60] flex h-11 items-center gap-2 rounded-full bg-ink-deep/90 px-4 text-sm font-semibold text-white shadow-lg backdrop-blur transition-transform active:scale-95 lg:bottom-6"
          title={`Bạn đang xem thử bằng tài khoản ${isProvider ? 'nhà cung cấp' : 'quản trị viên'}`}
        >
          <ShieldCheck className="h-4 w-4 text-accent" aria-hidden />
          {isProvider ? 'Về cổng nhà cung cấp' : 'Về trang quản trị'}
        </button>
      )}
    </>
  );
}
