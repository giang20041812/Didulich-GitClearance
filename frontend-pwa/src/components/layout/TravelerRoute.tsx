import { useEffect, useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { getCurrentCustomer } from '@/lib/currentCustomer';
import { recentTravelerSessionNotice } from '@/lib/travelerSession';

/**
 * Bảo vệ các màn hình chỉ dành cho khách du lịch và giữ lại URL trước đăng nhập.
 * Theo dõi auth_change / storage: phiên bị xóa ở nơi khác (hết hạn, 401, đăng xuất ở tab khác) thì chuyển
 * về đăng nhập ngay, không để trang tiếp tục hiển thị với phiên đã chết.
 */
export default function TravelerRoute() {
  const location = useLocation();
  const [, setAuthVersion] = useState(0);

  useEffect(() => {
    const refresh = () => setAuthVersion((v) => v + 1);
    window.addEventListener('auth_change', refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener('auth_change', refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);

  const customer = getCurrentCustomer();

  if (!customer) {
    return (
      <Navigate
        to="/login"
        replace
        state={{
          returnUrl: `${location.pathname}${location.search}${location.hash}`,
          message: recentTravelerSessionNotice(),
        }}
      />
    );
  }

  if (customer.role === 'ADMIN') return <Navigate to="/admin" replace />;
  if (customer.role === 'PROVIDER') return <Navigate to="/partner" replace />;
  return <Outlet />;
}
