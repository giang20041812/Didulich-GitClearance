import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Home, LogOut, Menu, Star, X, User, Lock, ChevronDown, Package, MapPinned, LayoutDashboard } from 'lucide-react';
import { portalServiceType } from '@/lib/partnerServiceType';
import { partnerTheme } from '@/lib/partnerTheme';
import * as Dialog from '@radix-ui/react-dialog';
import { VietTrackLogo, VietTrackLogoMark } from '@/components/ui/logo';
import PartnerNotificationDropdown from './PartnerNotificationDropdown';
import PartnerBottomNav from './PartnerBottomNav';
// Cấu hình axios (xếp hàng, hedge, interceptor phiên) chạy trước request axios đầu tiên của cổng NCC —
// chunk portal mới nạp axiosBoot, khách du lịch không phải tải axios trong bundle chính.
import { installAxiosBoot } from '@/lib/axiosBoot';
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

export default function PartnerLayout() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [session] = useState(readSession);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);

  const allowed = session !== null && session.role === 'PROVIDER' && Boolean(localStorage.getItem('portal_token'));

  // Phiên không tự hết hạn; chỉ dọn thông báo "phiên không còn hiệu lực" cũ khi đã vào cổng.
  useClearStalePortalNotice();

  // Màu theo loại hình áp cho cả trang khi đang ở cổng: hộp thoại / menu mở qua portal (ngoài khung) cũng đổi màu.
  const partnerType = portalServiceType();
  useEffect(() => {
    document.documentElement.dataset.partnerType = partnerType;
    return () => { delete document.documentElement.dataset.partnerType; };
  }, [partnerType]);

  useEffect(() => {
    if (!allowed) navigate('/portal/login', { replace: true });
  }, [allowed, navigate]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!allowed) return null;

  const logout = () => {
    clearPortalSession();
    navigate('/portal/login', { replace: true });
  };

  const providerName = session.provider?.name ?? session.fullName ?? 'Nhà cung cấp';
  const userInitial = providerName.charAt(0).toUpperCase();

  const theme = partnerTheme(portalServiceType());
  const isMatchedPath = (to: string, active: boolean) =>
    active || (to === '/partner/homestays' && (pathname === '/partner/homestay/create' || /^\/partner\/homestay\/\d+\/edit$/.test(pathname)));

  const sidebar = (
    <div className="flex h-full flex-col border-r border-border bg-white text-ink">
      <div className="flex h-16 items-center gap-3 border-b border-border px-5">
        <VietTrackLogoMark size={34} className="shrink-0" />
        <div className="flex min-w-0 flex-1 flex-col leading-none">
          <span className="truncate text-lg font-black text-ink-deep">Đi Du Lịch</span>
          <span className="mt-1 text-[9px] font-bold uppercase tracking-wider text-primary">{theme.workspace}</span>
        </div>
      </div>

      {/* Thẻ loại hình: màu chủ đạo của cổng đổi theo loại (Homestay xanh lúa, Nhà xe xanh chàm, Trải nghiệm đỏ đất). */}
      <div className="mx-3 mt-3 flex items-center gap-3 rounded-lg bg-primary-50 px-3 py-2.5">
        <img src={theme.image} alt="" aria-hidden width={36} height={36} className="h-9 w-9 shrink-0 object-contain" />
        <div className="min-w-0 leading-tight">
          <p className="truncate text-xs font-bold text-primary">{theme.label}</p>
          <p className="truncate text-[11px] text-muted">{theme.tagline}</p>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-3" aria-label="Điều hướng cổng nhà cung cấp">
        {theme.groups(pathname).map((group) => (
          <div key={group.title} className="mb-3">
            <p className="px-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-muted">{group.title}</p>
            <ul className="flex flex-col gap-0.5">
              {group.items.map(({ to, label, icon: Icon, end }) => (
                <li key={to}>
                  <NavLink
                    to={to}
                    end={end}
                    onClick={() => setDrawerOpen(false)}
                    className={({ isActive }) => `group flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-[13px] transition-colors duration-200 ${
                      isMatchedPath(to, isActive) ? 'bg-primary font-bold text-white shadow-[var(--shadow-teal)]' : 'font-semibold text-ink hover:bg-primary-50 hover:text-primary'
                    }`}
                  >
                    {({ isActive }) => (
                      <>
                        <Icon className={`h-4 w-4 shrink-0 transition-colors ${isMatchedPath(to, isActive) ? 'text-white' : 'text-primary'}`} />
                        <span className="flex-1 truncate">{label}</span>
                      </>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-border p-3">
        <div className="flex items-center gap-2.5 rounded-md border border-border bg-white p-2.5 shadow-xs">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary-50 text-xs font-bold text-primary">
            {userInitial}
          </span>
          <div className="min-w-0 flex-1 leading-tight">
            <div className="truncate text-xs font-bold text-ink-deep" title={providerName}>{providerName}</div>
            <div className="truncate text-[11px] text-muted" title={session.email ?? session.phone ?? ''}>{session.email ?? session.phone}</div>
          </div>
        </div>
        <div className="mt-1 grid grid-cols-2 gap-1.5">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-[11px] font-semibold text-muted ring-1 ring-inset ring-border transition-colors hover:bg-primary-50 hover:text-primary"
          >
            <Home className="h-3.5 w-3.5" /> Trang chủ
          </button>
          <button
            type="button"
            onClick={logout}
            className="flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-[11px] font-semibold text-muted ring-1 ring-inset ring-border transition-colors hover:bg-danger/10 hover:text-danger hover:ring-danger/40"
          >
            <LogOut className="h-3.5 w-3.5" /> Đăng xuất
          </button>
        </div>
      </div>
    </div>
  );

  /**
   * Menu trên điện thoại: chỉ những mục KHÔNG có ở thanh dưới (đánh giá, tài khoản, đăng xuất) — trước đây menu bên
   * lặp lại y hệt 5 mục của thanh dưới (TEST: "trùng thanh menu bên và thanh menu dưới").
   */
  const drawerLink = (to: string, label: string, Icon: typeof Star) => (
    <button type="button" onClick={() => { setDrawerOpen(false); navigate(to); }}
      className={`flex w-full items-center gap-3 rounded-md px-3 py-3 text-left text-sm font-semibold transition-colors ${pathname === to.split('?')[0] && !to.includes('?') ? 'bg-primary-50 text-primary' : 'text-ink hover:bg-primary-50 hover:text-primary'}`}>
      <Icon className="h-5 w-5 shrink-0 text-primary" /> {label}
    </button>
  );
  const mobileDrawer = (
    <div className="flex h-full flex-col bg-white text-ink">
      <div className="flex items-center gap-3 border-b border-border px-5 py-4 pr-12">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary-50 text-sm font-bold text-primary">{userInitial}</span>
        <div className="min-w-0 leading-tight">
          <div className="truncate text-sm font-bold text-ink-deep">{providerName}</div>
          <div className="truncate text-xs text-muted">{session.email ?? session.phone}</div>
        </div>
      </div>
      <nav className="flex flex-1 flex-col gap-1 px-3 py-4" aria-label="Mục khác của cổng nhà cung cấp">
        {theme.type === 'HOMESTAY' ? (
          <>
            {drawerLink('/partner/reviews', 'Đánh giá của khách', Star)}
            {drawerLink('/partner/combos', 'Combo', Package)}
            {drawerLink('/partner/nearby', 'Gợi ý quanh đây', MapPinned)}
          </>
        ) : drawerLink('/partner/services', 'Tổng quan', LayoutDashboard)}
        {drawerLink('/partner/profile', 'Thông tin cá nhân', User)}
        {drawerLink('/partner/profile?tab=password', 'Đổi mật khẩu', Lock)}
        {drawerLink('/', 'Về trang chủ du lịch', Home)}
      </nav>
      <div className="border-t border-border p-3 pb-[max(var(--safe-bottom),0.75rem)]">
        <button type="button" onClick={logout}
          className="flex w-full items-center justify-center gap-2 rounded-md px-3 py-3 text-sm font-semibold text-danger ring-1 ring-inset ring-danger/30 hover:bg-danger/10">
          <LogOut className="h-4 w-4" /> Đăng xuất
        </button>
      </div>
    </div>
  );
  /** Luồng Đăng Homestay có thanh nút riêng ở đáy: ẩn thanh điều hướng dưới để không đè nhau. */
  const focusMode = pathname === '/partner/homestay/create';

  return (
    <div data-partner-type={theme.type} className="partner-workspace min-h-screen bg-canvas font-body text-ink">
      <aside className="fixed inset-y-0 left-0 z-[9998] hidden w-64 lg:block">{sidebar}</aside>

      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-border bg-white pb-3 pt-[calc(var(--safe-top)+0.75rem)] pl-[calc(var(--safe-left)+1rem)] pr-[calc(var(--safe-right)+1rem)] lg:hidden">
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          ref={menuButtonRef}
          aria-expanded={drawerOpen}
          aria-label="Mở menu tài khoản"
          className="flex items-center gap-1.5 rounded-md p-1 text-ink hover:bg-hover"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-xs font-bold text-white">{userInitial}</span>
          <Menu className="h-4 w-4 text-muted" />
        </button>
        <div className="flex min-w-0 items-center gap-2">
          <VietTrackLogo size={28} />
          <span className="flex items-center gap-1 rounded-full bg-primary-50 py-0.5 pl-1 pr-2 text-[11px] font-bold text-primary">
            <img src={theme.image} alt="" aria-hidden width={18} height={18} className="h-[18px] w-[18px] object-contain" />
            {theme.label}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to="/"
            aria-label="Về trang chủ du lịch"
            title="Về trang chủ du lịch"
            className="flex h-11 w-11 items-center justify-center rounded-md border border-border text-primary transition-colors hover:bg-primary-50"
          >
            <Home className="h-4 w-4" aria-hidden="true" />
          </Link>
          <PartnerNotificationDropdown />
        </div>
      </header>

      <Dialog.Root open={drawerOpen} onOpenChange={setDrawerOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[9999] bg-ink-deep/60 lg:hidden" />
          <Dialog.Content aria-describedby={undefined} onCloseAutoFocus={(event) => { event.preventDefault(); menuButtonRef.current?.focus(); }} className="fixed inset-y-0 left-0 z-[10000] w-[min(300px,90vw)] overflow-y-auto bg-white pl-[var(--safe-left)] pt-[var(--safe-top)] lg:hidden">
            <Dialog.Title className="sr-only">Tài khoản và mục khác</Dialog.Title>
            <Dialog.Close aria-label="Đóng menu" className="absolute right-2 top-[calc(var(--safe-top)+0.5rem)] rounded-md p-2 text-ink hover:bg-canvas"><X className="h-4 w-4" /></Dialog.Close>
            {mobileDrawer}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <main className="min-w-0 overflow-x-hidden supports-[overflow:clip]:overflow-x-clip lg:pl-64">
        <div className="hidden lg:flex justify-end gap-4 px-8 pt-6 pb-2">
          <Link
            to="/"
            className="flex items-center gap-2 rounded-md border border-border bg-white px-3 py-2 text-xs font-semibold text-primary shadow-xs transition-colors hover:bg-primary-50"
          >
            <Home className="h-4 w-4" aria-hidden="true" />
            Về trang chủ
          </Link>
          <div className="flex items-center gap-4 relative" ref={profileRef}>
            <PartnerNotificationDropdown />
            
            <button
              type="button"
              onClick={() => setProfileOpen((v) => !v)}
              className="flex items-center gap-2 p-1.5 rounded-md border border-border bg-white hover:border-primary transition-all shadow-xs"
            >
              <div className="w-7 h-7 rounded-md bg-primary text-white flex items-center justify-center text-xs font-bold shrink-0 shadow-xs">
                {userInitial}
              </div>
              <ChevronDown className={`w-3.5 h-3.5 text-muted transition-transform duration-200 ${profileOpen ? 'rotate-180' : ''}`} />
            </button>

            {profileOpen && (
              <div className="absolute right-0 top-12 mt-2 w-56 rounded-lg bg-white border border-border shadow-xl py-2 z-[9998] animate-in fade-in-50 zoom-in-95 duration-150">
                <div className="px-4 py-2 border-b border-border">
                  <div className="text-xs font-bold text-ink-deep truncate">{providerName}</div>
                  <div className="text-[11px] text-muted truncate">{session.email ?? session.phone}</div>
                </div>
                <div className="py-1">
                  <button
                    onClick={() => { setProfileOpen(false); navigate('/partner/profile'); }}
                    className="w-full flex items-center gap-2.5 px-4 py-2 text-xs font-medium text-ink hover:bg-canvas hover:text-primary transition-colors text-left"
                  >
                    <User className="w-4 h-4 shrink-0" />
                    <span>Thông tin cá nhân</span>
                  </button>
                  <button
                    onClick={() => { setProfileOpen(false); navigate('/partner/profile?tab=password'); }}
                    className="w-full flex items-center gap-2.5 px-4 py-2 text-xs font-medium text-ink hover:bg-canvas hover:text-primary transition-colors text-left"
                  >
                    <Lock className="w-4 h-4 shrink-0" />
                    <span>Đổi mật khẩu</span>
                  </button>
                </div>
                <div className="pt-1 mt-1 border-t border-border">
                  <button
                    onClick={logout}
                    className="w-full flex items-center gap-2.5 px-4 py-2 text-xs font-semibold text-danger hover:bg-danger/10 transition-colors text-left"
                  >
                    <LogOut className="w-4 h-4 shrink-0" />
                    <span>Đăng xuất</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
        <div className={`mx-auto w-full max-w-[1680px] px-4 py-5 sm:px-6 lg:px-8 lg:pb-8 lg:pt-4 ${focusMode ? 'pb-6' : 'pb-[calc(6rem+var(--safe-bottom))]'}`}>
          <Outlet />
        </div>
      </main>

      {/* Thanh tab dưới đáy trên điện thoại — 1 chạm chuyển mục, desktop dùng sidebar */}
      {!focusMode && <PartnerBottomNav />}
    </div>
  );
}
