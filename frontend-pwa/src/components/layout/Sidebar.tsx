import { useState, useEffect } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  Calendar,
  BookOpen,
  ShieldCheck,
  HelpCircle,
  X,
  LogIn,
  UserPlus,
  LogOut,
  Download,
  Heart,
  Route,
} from 'lucide-react';
import { LogoMark, LogoWordmark } from '../ui/logo';
import { CUSTOMER_NAV, isCustomerNavActive, type CustomerNavItem } from './customerNav';
import NearbyToggle from '@/components/nearby/NearbyToggle';
import { logoutCurrentSession } from '@/lib/currentCustomer';

export interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
  // Tương thích ngược với các lời gọi cũ nếu có
  isDesktopOpen?: boolean;
  isMobileOpen?: boolean;
  onCloseMobile?: () => void;
  onCloseDesktop?: () => void;
}

/** Nhóm "Của tôi" và "Tiện ích" — nhóm "Khám phá" dùng chung CUSTOMER_NAV với header (cùng thứ tự, cùng tên). */
const personalItems: CustomerNavItem[] = [
  { id: 'journeys', path: '/lich-trinh?tab=cua-toi', label: 'Lịch trình của tôi', Icon: Route },
  { id: 'bookings', path: '/bookings', label: 'Đơn đặt phòng', Icon: Calendar, alsoActiveOn: ['/my-bookings'] },
  { id: 'saved', path: '/homestays?saved=1', label: 'Chỗ nghỉ đã lưu', Icon: Heart },
];
const moreItems: CustomerNavItem[] = [
  { id: 'guide', path: '/cam-nang', label: 'Cẩm nang du khách', Icon: BookOpen, alsoActiveOn: ['/guide'] },
  { id: 'download', path: '/download', label: 'Cài đặt ứng dụng', Icon: Download },
];

export default function Sidebar({ 
  isOpen, 
  onClose,
  isDesktopOpen, 
  isMobileOpen, 
  onCloseMobile, 
  onCloseDesktop 
}: SidebarProps) {
  const location = useLocation();
  const navigate = useNavigate();

  // Xác định trạng thái mở/đóng và hàm đóng hợp nhất
  const activeOpen = isOpen !== undefined 
    ? isOpen 
    : Boolean(isDesktopOpen || isMobileOpen);

  const handleClose = () => {
    if (onClose) onClose();
    if (onCloseMobile) onCloseMobile();
    if (onCloseDesktop) onCloseDesktop();
  };

  const [, setAuthTick] = useState(0);

  useEffect(() => {
    const handleAuthChange = () => setAuthTick((t) => t + 1);
    window.addEventListener('auth_change', handleAuthChange);
    window.addEventListener('storage', handleAuthChange);
    return () => {
      window.removeEventListener('auth_change', handleAuthChange);
      window.removeEventListener('storage', handleAuthChange);
    };
  }, []);

  const rawUser = typeof window !== 'undefined' ? localStorage.getItem('portal_user') : null;
  const rawTraveler = typeof window !== 'undefined' ? localStorage.getItem('traveler_user') : null;
  const currentUser = rawUser
    ? JSON.parse(rawUser)
    : rawTraveler
      ? { ...JSON.parse(rawTraveler), role: 'TRAVELER' }
      : null;

  const handleLogout = () => {
    logoutCurrentSession();
    navigate('/login');
  };

  const isSavedView = location.pathname === '/homestays' && new URLSearchParams(location.search).get('saved') === '1';
  // "Lịch trình của tôi": tab Của tôi của trang Lịch trình + trang một lịch trình đã lưu — khi đó mục "Lịch trình" chung tắt.
  const isMineView = (location.pathname === '/lich-trinh' && new URLSearchParams(location.search).get('tab') === 'cua-toi')
    || location.pathname.startsWith('/journeys/');
  const isPathActive = (item: CustomerNavItem) => {
    if (item.id === 'saved') return isSavedView;
    if (item.id === 'homestays' && isSavedView) return false;
    if (item.id === 'journeys') return isMineView;
    if (item.id === 'trips' && isMineView) return false;
    return isCustomerNavActive(item, location.pathname);
  };
  const groups = [
    { title: 'Khám phá', items: CUSTOMER_NAV },
    { title: 'Của tôi', items: personalItems },
    { title: 'Tiện ích', items: moreItems },
  ];

  return (
    <>
      {/* 1. Lớp phủ Backdrop mờ phía sau - Layer z-[9998] */}
      {activeOpen && (
        <div 
          className="fixed inset-0 bg-black/45 backdrop-blur-xs z-[9998] transition-opacity duration-300"
          onClick={handleClose}
          aria-hidden="true"
        />
      )}

      {/* 2. Sidebar dạng Drawer với background trong suốt (frosted glass) - Layer cao nhất z-[9999] */}
      <aside
        className={`fixed inset-y-0 left-0 z-[9999] w-[310px] sm:w-[330px] bg-white/95 backdrop-blur-2xl border-r border-slate-200/80 shadow-2xl transform transition-transform duration-300 ease-in-out flex flex-col pt-[var(--safe-top)] pb-[var(--safe-bottom)] pl-[var(--safe-left)] ${
          activeOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        aria-label="Menu điều hướng"
      >
        {/* Header trên cùng của Sidebar: Logo bên trái và DẤU X BÊN PHẢI TRÊN CÙNG ĐỂ TẮT */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-white/60 backdrop-blur-md">
          <div 
            className="flex items-center gap-3 cursor-pointer group"
            onClick={() => { 
              navigate('/'); 
              handleClose(); 
            }}
          >
            <LogoMark size={38} className="transition-transform group-hover:scale-105" />
            <LogoWordmark size={22} />
          </div>

          {/* Dấu X là 1 phần của sidebar (nằm ở góc phải trên cùng) để người dùng tắt */}
          <button 
            type="button"
            onClick={handleClose}
            aria-label="Đóng sidebar"
            title="Đóng sidebar"
            className="p-2 text-slate-400 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-all active:scale-95 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Danh sách các danh mục điều hướng */}
        <nav className="flex-1 overflow-y-auto py-4 px-3 flex flex-col gap-5" aria-label="Danh mục">
          {groups.map((group) => (
            <div key={group.title} className="flex flex-col gap-1">
              <div className="px-3.5 pb-1 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                {group.title}
              </div>
              {group.items.map((item) => {
                const active = isPathActive(item);
                return (
                  <NavLink
                    key={item.id}
                    to={item.path}
                    onClick={handleClose}
                    aria-current={active ? 'page' : undefined}
                    className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs sm:text-[13px] font-bold transition-all duration-200 ${
                      active
                        ? 'bg-[#0a7d64] text-white shadow-xs'
                        : 'text-slate-700 hover:bg-emerald-50/60 hover:text-[#0a7d64]'
                    }`}
                  >
                    <item.Icon className={`w-4.5 h-4.5 shrink-0 ${active ? 'text-white' : 'text-[#0a7d64]'}`} />
                    <span>{item.label}</span>
                    {item.badge && (
                      <span className="ml-auto rounded-full bg-amber-400 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-slate-900 shadow-2xs">
                        {item.badge}
                      </span>
                    )}
                  </NavLink>
                );
              })}
            </div>
          ))}

          <div className="flex flex-col gap-1">
            <div className="px-3.5 pb-1 text-[11px] font-bold uppercase tracking-wider text-slate-400">Khi đi du lịch</div>
            <NearbyToggle />
          </div>
        </nav>

        {/* Phần chân trang bên dưới Sidebar: Hỗ trợ & Khối Đăng nhập / Đăng ký */}
        <div className="p-3.5 border-t border-slate-100 bg-slate-50/70 backdrop-blur-md">
          <div className="flex flex-col gap-1">
            <button 
              type="button"
              onClick={handleClose}
              className="flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-white rounded-xl transition-colors text-left cursor-pointer"
            >
              <HelpCircle className="w-4 h-4 text-slate-400 shrink-0" />
              <span>Trung tâm hỗ trợ</span>
            </button>
            <button 
              type="button"
              onClick={handleClose}
              className="flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-white rounded-xl transition-colors text-left cursor-pointer"
            >
              <ShieldCheck className="w-4 h-4 text-slate-400 shrink-0" />
              <span>Chính sách & Bảo mật</span>
            </button>

            {/* Khu vực Auth: Profile / Nút Đăng nhập, Đăng ký */}
            <div className="mt-2 pt-2 border-t border-slate-200/60 flex flex-col gap-1.5">
              {currentUser ? (
                <div className="p-3 rounded-2xl bg-white border border-slate-200/80 shadow-xs flex flex-col gap-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-8 h-8 rounded-full bg-emerald-50 text-[var(--color-primary)] border border-emerald-200/60 flex items-center justify-center text-xs font-bold shrink-0">
                        {currentUser.role === 'ADMIN' ? 'AD' : currentUser.role === 'TRAVELER' ? (currentUser.fullName || 'K').charAt(0).toUpperCase() : 'NCC'}
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="text-xs font-bold text-slate-900 truncate" title={currentUser.fullName || currentUser.email}>
                          {currentUser.fullName || currentUser.email}
                        </span>
                        <span className="text-[10px] text-slate-500 font-medium">
                          {currentUser.role === 'ADMIN' ? 'Quản trị viên' : currentUser.role === 'TRAVELER' ? 'Khách du lịch' : 'Đối tác'}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleLogout}
                      className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors cursor-pointer"
                      title="Đăng xuất"
                    >
                      <LogOut className="w-4 h-4" />
                    </button>
                  </div>
                  {currentUser.role !== 'TRAVELER' ? (
                    <button
                      type="button"
                      onClick={() => {
                        navigate(currentUser.role === 'ADMIN' ? '/admin' : '/partner');
                        handleClose();
                      }}
                      className="w-full flex items-center justify-center gap-1.5 py-2 px-3 cta cta-primary text-white text-xs font-bold rounded-xl transition-all shadow-xs active:scale-95 cursor-pointer"
                    >
                      <span>Vào Cổng {currentUser.role === 'ADMIN' ? 'Quản trị' : 'Đối tác'}</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        navigate('/profile');
                        handleClose();
                      }}
                      className="w-full flex items-center justify-center gap-1.5 py-2 px-3 cta cta-primary text-white text-xs font-bold rounded-xl transition-all shadow-xs active:scale-95 cursor-pointer"
                    >
                      <span>Thông tin cá nhân</span>
                    </button>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <button 
                    type="button"
                    onClick={() => { 
                      navigate('/login'); 
                      handleClose(); 
                    }}
                    className="flex items-center justify-center gap-1.5 h-9 cta cta-primary text-white text-xs font-bold rounded-xl transition-all shadow-xs active:scale-95 cursor-pointer"
                  >
                    <LogIn className="w-3.5 h-3.5" />
                    <span>Đăng nhập</span>
                  </button>
                  <button 
                    type="button"
                    onClick={() => {
                      navigate('/register');
                      handleClose();
                    }}
                    className="flex items-center justify-center gap-1.5 h-9 bg-white border border-slate-200 text-slate-800 text-xs font-bold rounded-xl hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] transition-all shadow-xs active:scale-95 cursor-pointer"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    <span>Đăng ký</span>
                  </button>
                </div>
              )}

              {/* Nút dành cho Đối tác */}
              <div className="mt-1 pt-1.5 border-t border-slate-200/50">
                <button 
                  type="button"
                  onClick={() => { 
                    navigate('/partner'); 
                    handleClose(); 
                  }}
                  className="w-full flex items-center justify-center gap-2 h-9 bg-white border border-slate-200 text-slate-700 text-xs font-bold rounded-xl hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] hover:bg-emerald-50/30 transition-all shadow-2xs active:scale-95 cursor-pointer"
                >
                  <span>Kênh Đối tác</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
