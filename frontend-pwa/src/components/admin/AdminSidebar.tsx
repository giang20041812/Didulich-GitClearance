import { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  ChevronsUpDown,
  Home,
  KeyRound,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Search,
  UserRound,
  X,
} from 'lucide-react';
import { VietTrackLogoMark } from '@/components/ui/logo';
import type { AdminCapability } from '@/lib/adminPermissions';
import { useAdminOverlayLock } from '@/hooks/useAdminOverlayLock';
import AdminNotificationBell from './AdminNotificationBell';
import OverlayPortal from './OverlayPortal';
import type { AdminTab, NavGroupConfig, NavItemConfig, NavShortcutKind } from './adminNav';

export const SIDEBAR_WIDTH = 264;
export const SIDEBAR_WIDTH_COLLAPSED = 72;

export interface SidebarUser {
  fullName?: string | null;
  email?: string | null;
  /** Cấp quản trị hiển thị dưới tên, vd: "Cấp 1 · Quản trị cao nhất". */
  levelLabel?: string;
}

interface AdminSidebarProps {
  /** Cấu hình menu (xem adminNav.ts), đã lọc bỏ mục ngoài quyền và nhóm rỗng. */
  groups: NavGroupConfig[];
  active: AdminTab;
  /** Số đếm cạnh mục: null/undefined = chưa có số liệu (ẩn nhãn). */
  counts: Partial<Record<AdminTab, number | null>>;
  can: (capability: AdminCapability) => boolean;
  onSelect: (key: AdminTab) => void;
  onShortcut: (key: AdminTab, kind: NavShortcutKind) => void;
  onOpenNotificationTarget: (target: string) => void;
  onOpenPalette: () => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  user: SidebarUser | null;
  onOpenProfile: () => void;
  onChangePassword: () => void;
  onHome: () => void;
  onLogout: () => void;
  /** Chỉ dùng dưới breakpoint lg: sidebar trượt ra như ngăn kéo. */
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

const initials = (name?: string | null, email?: string | null) => {
  const src = (name || email || 'A').trim();
  const parts = src.split(/\s+/).filter(Boolean);
  const last = parts[parts.length - 1] ?? src;
  return (parts.length > 1 ? `${parts[0]?.charAt(0) ?? ''}${last.charAt(0)}` : src.slice(0, 2)).toUpperCase();
};

/** Thu gọn chỉ áp dụng trên màn hình rộng; trên điện thoại sidebar luôn là ngăn kéo đầy đủ. */
function useIsDesktop(): boolean {
  const query = '(min-width: 1024px)';
  const [desktop, setDesktop] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setDesktop(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return desktop;
}

const focusRing = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus-visible:ring-offset-white';

/** Sidebar quản trị: menu theo nhóm, tìm nhanh (Ctrl K), nút tắt khi rê chuột, chế độ thu gọn 72px và menu tài khoản. */
export default function AdminSidebar({
  groups,
  active,
  counts,
  can,
  onSelect,
  onShortcut,
  onOpenNotificationTarget,
  onOpenPalette,
  collapsed,
  onToggleCollapsed,
  user,
  onOpenProfile,
  onChangePassword,
  onHome,
  onLogout,
  mobileOpen,
  onCloseMobile,
}: AdminSidebarProps) {
  const desktop = useIsDesktop();
  const compact = collapsed && desktop;
  const [tip, setTip] = useState<{ text: string; top: number; left: number } | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const sidebarRef = useRef<HTMLElement>(null);
  const footerRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  useAdminOverlayLock(mobileOpen && !desktop);

  useEffect(() => {
    if (!mobileOpen || desktop) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus({ preventScroll: true });
    return () => {
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, [mobileOpen, desktop]);

  useEffect(() => {
    if (!mobileOpen || desktop) return;
    const onKey = (e: KeyboardEvent) => {
      // Let a command palette or notification above the menu handle Escape first.
      if (e.defaultPrevented || document.querySelector('[data-admin-overlay]')) return;
      if (e.key === 'Tab') {
        const focusable = Array.from(sidebarRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input, select, textarea') ?? []).filter((el) => el.getClientRects().length > 0);
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first && last) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last && first) {
          e.preventDefault();
          first.focus();
        }
      } else if (e.key === 'Escape' && !footerRef.current?.querySelector('[role="menu"]')) {
        e.preventDefault();
        onCloseMobile();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [mobileOpen, desktop, onCloseMobile]);

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (footerRef.current && !footerRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  const showTip = (el: HTMLElement, text: string) => {
    const r = el.getBoundingClientRect();
    setTip({ text, top: r.top + r.height / 2, left: r.right + 10 });
  };
  const hideTip = () => setTip(null);

  const countOf = (item: NavItemConfig) => counts[item.key] ?? 0;

  /** Nhãn tiếng Việt của số đếm để đọc/hiện tooltip khi thu gọn. */
  const countText = (item: NavItemConfig) => {
    if (item.badge === 'soon') return 'Sắp có';
    const n = countOf(item);
    if (!item.badge || n <= 0) return '';
    return item.badge === 'fresh' ? `${n} mới` : `${n}`;
  };

  const shortcutIcon = (kind: NavShortcutKind) => (kind === 'add' ? Plus : kind === 'search' ? Search : ArrowRight);

  const renderBadge = (item: NavItemConfig, hasShortcut: boolean) => {
    const n = countOf(item);
    // Khi nút tắt hiện (rê chuột / focus bàn phím) thì ẩn nhãn đếm để nhường chỗ.
    const hideWhenShortcut = hasShortcut ? 'lg:group-hover:hidden lg:group-has-[:focus-visible]:hidden' : '';
    if (item.badge === 'work' && n > 0) {
      return (
        <span className={`rounded-md bg-nav-badge-bg px-1.5 py-0.5 text-[11px] font-bold tabular-nums leading-none text-nav-badge-text ${hideWhenShortcut}`}>
          {n > 99 ? '99+' : n}
        </span>
      );
    }
    if (item.badge === 'fresh' && n > 0) {
      return (
        <span className={`rounded-md bg-accent/15 px-1.5 py-0.5 text-[11px] font-bold tabular-nums leading-none text-primary-700 ${hideWhenShortcut}`}>
          {n > 99 ? '99+' : n} mới
        </span>
      );
    }
    if (item.badge === 'soon') {
      return <span className="rounded-md border border-border px-1.5 py-0.5 text-[10px] font-semibold leading-none text-muted">Sắp có</span>;
    }
    return null;
  };

  return (
    <>
      <div className="admin-overlay-shell admin-sidebar-shell pointer-events-none z-[10020] lg:contents">
        {mobileOpen && (
          <button type="button" tabIndex={-1} aria-label="Đóng menu" onClick={onCloseMobile} className="pointer-events-auto absolute inset-0 bg-ink-deep/40 backdrop-blur-[2px] lg:hidden" />
        )}
      <aside
        ref={sidebarRef}
        style={{ width: desktop ? (compact ? SIDEBAR_WIDTH_COLLAPSED : SIDEBAR_WIDTH) : 'min(360px, calc(100vw - 24px))' }}
        className={`admin-drawer admin-sidebar pointer-events-auto relative z-[1] flex h-full min-h-0 flex-col border-r border-border bg-white text-ink shadow-xl transition-[width,transform] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] lg:fixed lg:inset-y-0 lg:left-0 lg:z-[40] lg:translate-x-0 lg:shadow-none ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        inert={!desktop && !mobileOpen}
        role={desktop ? undefined : 'dialog'}
        aria-modal={!desktop && mobileOpen ? true : undefined}
        aria-hidden={!desktop && !mobileOpen ? true : undefined}
        aria-label="Thanh bên quản trị"
      >
        {/* Đầu sidebar: logo + chuông thông báo + nút thu gọn */}
        <div className={`shrink-0 border-b border-border ${compact ? 'flex flex-col items-center gap-2 py-3' : 'flex min-h-20 items-center gap-2 px-4 lg:h-16 lg:min-h-0 lg:px-3'}`}>
          <VietTrackLogoMark size={34} className="shrink-0" />
          {!compact && (
            <div className="flex min-w-0 flex-1 flex-col leading-none">
              <span className="font-display text-base font-black leading-tight text-ink-deep lg:truncate lg:text-lg">Đi Du Lịch</span>
              <span className="mt-1 text-[10px] font-bold uppercase leading-normal tracking-wide text-primary lg:whitespace-nowrap lg:text-[9px]">Quản trị hệ thống</span>
            </div>
          )}
          <AdminNotificationBell onOpenTarget={onOpenNotificationTarget} placement={compact ? 'beside' : 'below-left'} />
          <button
            type="button"
            onClick={onToggleCollapsed}
            aria-label={compact ? 'Mở rộng menu' : 'Thu gọn menu'}
            aria-pressed={compact}
            title={compact ? 'Mở rộng menu' : 'Thu gọn menu'}
            className={`hidden h-8 w-8 items-center justify-center rounded-md border border-border bg-white text-muted transition-colors hover:border-primary/40 hover:text-primary lg:flex ${focusRing}`}
          >
            {compact ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </button>
          <button ref={closeRef} type="button" onClick={onCloseMobile} aria-label="Đóng menu" className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-canvas text-muted hover:bg-primary-50 hover:text-ink lg:hidden ${focusRing}`}>
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Ô tìm hoặc làm nhanh (Ctrl K) */}
        <div className="shrink-0 px-3 pt-3">
          <button
            type="button"
            onClick={onOpenPalette}
            aria-label="Tìm hoặc làm nhanh"
            aria-keyshortcuts="Control+K"
            onMouseEnter={compact ? (e) => showTip(e.currentTarget, 'Tìm hoặc làm nhanh · Ctrl K') : undefined}
            onMouseLeave={hideTip}
            onFocus={compact ? (e) => showTip(e.currentTarget, 'Tìm hoặc làm nhanh · Ctrl K') : undefined}
            onBlur={hideTip}
            className={`flex h-11 w-full items-center gap-2 rounded-xl border border-border bg-canvas/60 text-sm text-muted transition-colors hover:border-primary/40 hover:bg-white lg:h-10 lg:rounded-nav lg:text-[13px] ${
              compact ? 'justify-center px-0' : 'px-2.5'
            } ${focusRing}`}
          >
            <Search className="h-5 w-5 shrink-0" aria-hidden />
            {!compact && (
              <>
                <span className="min-w-0 flex-1 truncate text-left">Tìm hoặc làm nhanh…</span>
                <kbd className="hidden shrink-0 rounded-md border border-border bg-white px-1 py-0.5 font-sans text-[10px] font-semibold text-muted lg:inline">Ctrl K</kbd>
              </>
            )}
          </button>
        </div>

        <nav aria-label="Điều hướng quản trị" className="admin-scroll-area min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-3 py-3">
          {groups.map((g, gi) => {
            const total = g.showTotal ? g.items.reduce((sum, it) => sum + (it.badge === 'work' ? Math.max(0, countOf(it)) : 0), 0) : 0;
            return (
              <section key={g.id} aria-label={g.title ?? g.breadcrumb} className={gi === 0 ? '' : compact ? 'mt-3 border-t border-border pt-3' : 'mt-5'}>
                {g.title && !compact && (
                  <div className="mb-1.5 flex items-center justify-between px-3 text-[11px] font-semibold uppercase tracking-wider text-nav-group">
                    <span>{g.title}</span>
                    {total > 0 && <span className="normal-case tracking-normal">{total} việc</span>}
                  </div>
                )}
                <ul className="flex flex-col gap-0.5">
                  {g.items.map((item) => {
                    const Icon = item.icon;
                    const isActive = item.key === active;
                    const soon = item.badge === 'soon';
                    const sc = item.shortcut && (!item.shortcut.capability || can(item.shortcut.capability)) ? item.shortcut : null;
                    const ShortcutIcon = sc ? shortcutIcon(sc.kind) : null;
                    const suffix = countText(item);
                    const tipText = suffix ? `${item.label} · ${suffix}` : item.label;
                    return (
                      <li key={item.key} className="group relative">
                        <button
                          type="button"
                          onClick={() => {
                            onSelect(item.key);
                            onCloseMobile();
                          }}
                          aria-current={isActive ? 'page' : undefined}
                          aria-label={compact ? tipText : undefined}
                          onMouseEnter={compact ? (e) => showTip(e.currentTarget, tipText) : undefined}
                          onMouseLeave={hideTip}
                          onFocus={compact ? (e) => showTip(e.currentTarget, tipText) : undefined}
                          onBlur={hideTip}
                          className={`flex min-h-11 w-full items-center gap-3 rounded-xl py-2 text-left text-[15px] transition-colors duration-150 lg:h-10 lg:min-h-0 lg:rounded-nav lg:py-0 lg:text-sm ${
                            compact ? 'justify-center px-0' : 'px-3'
                          } ${
                            isActive
                              ? 'bg-nav-active-bg font-bold text-nav-active-text'
                              : `font-medium text-ink hover:bg-canvas ${soon ? 'opacity-60 hover:opacity-100' : ''}`
                          } ${focusRing}`}
                        >
                          <span className="relative flex shrink-0">
                            <Icon className={`h-5 w-5 ${isActive ? 'text-nav-active-icon' : 'text-muted'}`} aria-hidden />
                            {compact && (item.badge === 'work' || item.badge === 'fresh') && countOf(item) > 0 && (
                              <span
                                aria-hidden
                                className={`absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full ring-2 ring-white ${item.badge === 'work' ? 'bg-sun' : 'bg-accent'}`}
                              />
                            )}
                          </span>
                          {!compact && (
                            <>
                              <span className="min-w-0 flex-1 leading-snug lg:truncate">{item.label}</span>
                              {renderBadge(item, !!sc)}
                            </>
                          )}
                        </button>
                        {/* Nút tắt: <button> riêng (không lồng trong nút của mục), chỉ hiện khi rê chuột hoặc focus bàn phím */}
                        {!compact && sc && ShortcutIcon && (
                          <button
                            type="button"
                            onClick={() => {
                              onShortcut(item.key, sc.kind);
                              onCloseMobile();
                            }}
                            aria-label={sc.label}
                            title={sc.label}
                            className={`absolute right-1.5 top-1/2 hidden h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-muted opacity-0 transition-all duration-150 hover:bg-white hover:text-nav-active-text focus-visible:opacity-100 group-hover:opacity-100 group-has-[:focus-visible]:opacity-100 lg:flex ${focusRing}`}
                          >
                            <ShortcutIcon className="h-4 w-4" aria-hidden />
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </nav>

        {/* Cuối sidebar: một dòng tài khoản, bấm mở menu */}
        <div ref={footerRef} className="relative shrink-0 border-t border-border bg-canvas/40 p-3">
          {menuOpen && (
            <div
              role="menu"
              aria-label="Tài khoản"
              className={`absolute z-[9998] overflow-hidden rounded-lg border border-border bg-white py-1 shadow-xl ${
                compact ? 'bottom-3 left-full ml-3 w-56' : 'bottom-full left-3 right-3 mb-2'
              }`}
            >
              {[
                { label: 'Hồ sơ cá nhân', icon: UserRound, run: onOpenProfile },
                { label: 'Đổi mật khẩu', icon: KeyRound, run: onChangePassword },
                { label: 'Về trang du khách', icon: Home, run: onHome },
              ].map(({ label, icon: MenuIcon, run }) => (
                <button
                  key={label}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    onCloseMobile();
                    run();
                  }}
                  className={`flex h-11 w-full items-center gap-3 px-3 text-left text-sm font-medium text-ink transition-colors hover:bg-canvas lg:h-10 ${focusRing}`}
                >
                  <MenuIcon className="h-5 w-5 text-muted" aria-hidden /> {label}
                </button>
              ))}
              <div className="my-1 border-t border-border" role="separator" />
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  onLogout();
                }}
                className={`flex h-11 w-full items-center gap-3 px-3 text-left text-sm font-semibold text-danger transition-colors hover:bg-danger/10 lg:h-10 ${focusRing}`}
              >
                <LogOut className="h-5 w-5" aria-hidden /> Đăng xuất
              </button>
            </div>
          )}
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label={compact ? `Tài khoản ${user?.fullName || 'Quản trị viên'}` : undefined}
            onMouseEnter={compact ? (e) => showTip(e.currentTarget, user?.fullName || 'Quản trị viên') : undefined}
            onMouseLeave={hideTip}
            className={`flex min-h-12 w-full items-center gap-3 rounded-nav py-1 text-left transition-colors hover:bg-canvas lg:h-12 lg:py-0 ${compact ? 'justify-center px-0' : 'px-2'} ${focusRing}`}
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-nav-active-bg text-xs font-bold text-nav-active-text" aria-hidden>
              {initials(user?.fullName, user?.email)}
            </span>
            {!compact && (
              <>
                <span className="min-w-0 flex-1 leading-tight">
                  <span className="block truncate text-sm font-bold text-ink-deep">{user?.fullName || 'Quản trị viên'}</span>
                  <span className="block text-[11px] leading-snug text-nav-group lg:truncate">{user?.levelLabel || user?.email || '—'}</span>
                </span>
                <ChevronsUpDown className="h-5 w-5 shrink-0 text-muted" aria-hidden />
              </>
            )}
          </button>
        </div>
      </aside>
      </div>

      {/* Tooltip của chế độ thu gọn: vẽ ra body vì nav có overflow sẽ cắt tooltip nằm ngoài sidebar. */}
      {compact && tip && (
        <OverlayPortal lockScroll={false}>
          <div
            role="tooltip"
            style={{ top: tip.top, left: tip.left }}
            className="pointer-events-none fixed z-[60] -translate-y-1/2 whitespace-nowrap rounded-md bg-ink-deep px-2.5 py-1.5 text-xs font-medium text-white shadow-lg"
          >
            {tip.text}
          </div>
        </OverlayPortal>
      )}
    </>
  );
}
