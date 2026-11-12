import { NavLink, useLocation } from 'react-router-dom';
import { BarChart3, CalendarCheck, CalendarDays, Home, BedDouble, Bus, Compass, LayoutDashboard, MapPinned, Package } from 'lucide-react';
import { portalServiceType } from '@/lib/partnerServiceType';

/**
 * Thanh điều hướng dưới đáy cho cổng Nhà cung cấp trên điện thoại (ẩn từ lg trở lên —
 * desktop dùng sidebar bên trái). 1 chạm để chuyển 5 mục chính thay vì phải mở menu
 * hamburger mỗi lần — chủ homestay thao tác điện thoại là chính.
 */
export default function PartnerBottomNav() {
  const { pathname } = useLocation();
  const match = pathname.match(/^\/partner\/homestay\/(\d+)/);
  const roomsPath = match ? `/partner/homestay/${match[1]}/rooms` : '/partner/rooms';

  const type = portalServiceType();
  // Lịch phòng đứng đầu (trang mặc định); Đánh giá vẫn vào được qua menu và trang Tổng quan.
  // Nhà xe / trải nghiệm: Tổng quan, dịch vụ, combo, gợi ý quanh đây.
  const items = type !== 'HOMESTAY' ? [
    { to: '/partner/services', label: 'Tổng quan', icon: LayoutDashboard, end: false },
    { to: '/partner/listings', label: type === 'TRANSPORT' ? 'Tuyến xe' : 'Trải nghiệm', icon: type === 'TRANSPORT' ? Bus : Compass, end: false },
    { to: '/partner/combos', label: 'Combo', icon: Package, end: false },
    { to: '/partner/nearby', label: 'Quanh đây', icon: MapPinned, end: false },
  ] : [
    { to: '/partner', label: 'Lịch phòng', icon: CalendarCheck, end: true },
    { to: '/partner/bookings', label: 'Đơn đặt', icon: CalendarDays, end: false },
    { to: roomsPath, label: 'Phòng & giá', icon: BedDouble, end: false },
    { to: '/partner/homestays', label: 'Homestay', icon: Home, end: false },
    { to: '/partner/overview', label: 'Tổng quan', icon: BarChart3, end: false },
  ];

  return (
    <nav aria-label="Điều hướng nhanh cổng đối tác" className="fixed bottom-0 left-0 right-0 z-[9998] border-t border-border bg-white/95 backdrop-blur-md shadow-[0_-2px_10px_rgba(0,0,0,0.05)] pb-safe pl-[var(--safe-left)] pr-[var(--safe-right)] lg:hidden">
      <div className="flex items-center justify-between px-1 py-1.5">
        {items.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex flex-1 flex-col items-center justify-center gap-1 py-1 transition-colors ${
                isActive ? 'font-bold text-primary' : 'font-medium text-muted hover:text-ink'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <Icon className="h-5 w-5 shrink-0" strokeWidth={isActive ? 2.5 : 1.8} />
                <span className="truncate text-xs leading-tight">{label}</span>
                {isActive && <div className="mt-0.5 h-0.5 w-5 rounded-full bg-primary" />}
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
