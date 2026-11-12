import React, { useState, useEffect, useRef, type ReactNode } from 'react';
import AccountsPanel from '@/components/admin/AccountsPanel';
import PlacesPanel from '@/components/admin/PlacesPanel';
import OverviewPanel from '@/components/admin/OverviewPanel';
import BookingsPanel, { type BookingsPreset } from '@/components/admin/BookingsPanel';
import ReportsPanel from '@/components/admin/ReportsPanel';
import ProvidersPanel from '@/components/admin/ProvidersPanel';
import { PROVIDER_SERVICES } from '@/components/layout/providerServices';
import type { ProviderServiceType } from '@/types/partner';
import ProviderApplicationsPanel from '@/components/admin/ProviderApplicationsPanel';
import ChangeRequestsPanel from '@/components/admin/ChangeRequestsPanel';
import ReviewsPanel from '@/components/admin/ReviewsPanel';
import JourneyCheckinsPanel from '@/components/admin/JourneyCheckinsPanel';
import JourneyFeedPanel from '@/components/admin/JourneyFeedPanel';
import SosPanel from '@/components/admin/SosPanel';
import NoticeDialog, { type Notice } from '@/components/admin/NoticeDialog';
import ActivityPanel from '@/components/admin/ActivityPanel';
import RoomCalendarPanel from '@/components/admin/RoomCalendarPanel';
import HomestayViewsPanel from '@/components/admin/HomestayViewsPanel';
import AdminStaffPanel from '@/components/admin/AdminStaffPanel';
import ExplorePlacesPanel from '@/components/admin/ExplorePlacesPanel';
import CombosPanel from '@/components/admin/CombosPanel';
import NearbyOffersPanel from '@/components/admin/NearbyOffersPanel';
import AdminSidebar, { SIDEBAR_WIDTH, SIDEBAR_WIDTH_COLLAPSED } from '@/components/admin/AdminSidebar';
import AdminCommandPalette, { type QuickAction } from '@/components/admin/AdminCommandPalette';
import AdminNotificationBell from '@/components/admin/AdminNotificationBell';
  import AdminLiveAlerts from '@/components/admin/AdminLiveAlerts';
import AdminBottomNav from '@/components/admin/AdminBottomNav';
import OverlayPortal from '@/components/admin/OverlayPortal';
import { useAdminViewport } from '@/hooks/useAdminViewport';
import { useAdminTabHistory } from '@/hooks/useAdminTabHistory';
import { useAdminEdgeBack } from '@/hooks/useAdminEdgeBack';
import '@/styles/admin-mobile.css';
import { NAV_GROUPS, NAV_META, type AdminTab, type NavShortcutKind } from '@/components/admin/adminNav';
import ForgotPasswordModal from '@/components/auth/ForgotPasswordModal';
import { AdminLevelContext } from '@/hooks/useAdminPermission';
import { ADMIN_LEVELS, LEVEL_META, levelCan, toAdminLevel, type AdminCapability } from '@/lib/adminPermissions';
import { getApiErrorMessage } from '@/lib/apiError';
import { clearPortalSession } from '@/lib/authInterceptor';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { clearStatusParam } from '@/hooks/useUrlStatus';
import { Building2, ChevronLeft, ChevronRight, Construction, Download, Globe, MapPin, Menu, RefreshCw, ShieldCheck, UserPlus, X } from 'lucide-react';
import { adminService } from '@/services/adminService';
import type {
  AdminLevel,
  AdminProviderSummaryDto,
  AdminDashboardSummaryDto,
  BookingStatusSummary,
  ProviderStatus,
} from '@/types/admin';


const SIDEBAR_COLLAPSED_KEY = 'admin_sidebar_collapsed';
const RECENT_TABS_KEY = 'admin_recent_tabs';
const MAX_RECENT_TABS = 5;

/** Các mục đã mở gần đây (mới nhất trước), đọc từ localStorage và bỏ mã không còn hợp lệ. */
function readRecentTabs(): AdminTab[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(RECENT_TABS_KEY) ?? '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((t): t is AdminTab => typeof t === 'string' && Object.prototype.hasOwnProperty.call(NAV_META, t)).slice(0, MAX_RECENT_TABS);
  } catch {
    return [];
  }
}

/** Tải file CSV (thêm BOM để Excel đọc đúng tiếng Việt). */
function downloadCsv(filename: string, rows: (string | number)[][]) {
  const escape = (cell: string | number) => `"${String(cell).replace(/"/g, '""')}"`;
  const csv = '﻿' + rows.map((r) => r.map(escape).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Khung thẻ dùng chung cho các hàng đợi được đưa lên menu riêng (giống thẻ của các bảng danh sách khác). */
function PanelCard({ children }: { children: ReactNode }) {
  return <section className="rounded-lg border border-border bg-white shadow-sm">{children}</section>;
}

const inputCls =
  'h-9 w-full rounded-md border border-border bg-white px-3 text-xs text-ink transition-colors placeholder:text-muted/70 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20';
const labelCls = 'mb-1 block text-xs font-semibold text-ink-deep';

/** Khung modal dùng chung cho các biểu mẫu của trang quản trị. */
function Modal({ title, subtitle, onClose, size = 'md', children }: { title: string; subtitle?: string; onClose: () => void; size?: 'sm' | 'md' | 'lg'; children: ReactNode }) {
  const width = size === 'sm' ? 'max-w-sm' : size === 'lg' ? 'max-w-lg' : 'max-w-md';
  return (
    <OverlayPortal>
    <div className="admin-overlay-shell admin-form-shell fade-in-overlay fixed z-[99999] flex items-center justify-center bg-ink-deep/60 backdrop-blur-[2px]" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()} className={`admin-dialog-panel rise-in w-full ${width} rounded-xl border border-border bg-white shadow-xl`}>
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-border bg-white px-5 py-4">
          <div>
            <h3 className="font-display text-sm font-bold text-ink-deep">{title}</h3>
            {subtitle && <p className="mt-0.5 text-[11px] text-muted">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="Đóng" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-hover hover:text-ink sm:h-8 sm:w-8">
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
    </OverlayPortal>
  );
}

function ModalActions({
  onCancel,
  submitLabel,
  submitTone = 'primary',
  cancelLabel = 'Hủy',
}: {
  onCancel: () => void;
  submitLabel: string;
  submitTone?: 'primary' | 'warning' | 'danger';
  cancelLabel?: string;
}) {
  const tone =
    submitTone === 'danger'
      ? 'bg-danger text-white hover:opacity-90'
      : submitTone === 'warning'
      ? 'bg-sun text-ink-deep hover:opacity-90'
      : 'bg-primary text-white hover:bg-primary-600';
  return (
    <div className="flex justify-end gap-2 pt-2">
      <button type="button" onClick={onCancel} className="h-9 rounded-md px-4 text-xs font-semibold text-muted transition-colors hover:bg-hover hover:text-ink">
        {cancelLabel}
      </button>
      <button type="submit" className={`h-9 rounded-md px-4 text-xs font-semibold shadow-xs transition-all ${tone}`}>
        {submitLabel}
      </button>
    </div>
  );
}

export default function AdminDashboardPage() {
  const navigate = useNavigate();
  const rawUser = typeof window !== 'undefined' ? localStorage.getItem('portal_user') : null;
  const currentUser = rawUser ? JSON.parse(rawUser) : null;
  const isAdmin = currentUser !== null && currentUser.role === 'ADMIN';

  // Cấp quản trị: lấy nhanh từ phiên đăng nhập rồi xác nhận lại từ máy chủ (phiên cũ có thể chưa lưu cấp).
  const [level, setLevel] = useState<AdminLevel>(toAdminLevel(currentUser?.adminLevel));
  useEffect(() => {
    let alive = true;
    adminService
      .getMe()
      .then((me) => {
        if (alive) setLevel(toAdminLevel(me.adminLevel));
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);
  const can = (capability: AdminCapability) => levelCan(level, capability);
  const tabAllowed = (tab: AdminTab) => {
    const need = NAV_META[tab].capability;
    return !need || can(need);
  };

  const { requestedTab, setActiveTab, canGoBack, goBack, historyState } = useAdminTabHistory(isAdmin);
  const [, setSearchParams] = useSearchParams();
  // Mục đang mở không còn được phép (vd: bị hạ cấp) thì quay về Tổng quan.
  const activeTab: AdminTab = tabAllowed(requestedTab) ? requestedTab : 'dashboard';
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<Notice | null>(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const backSwipeProgress = useAdminEdgeBack({ enabled: canGoBack, onBack: goBack });

  useEffect(() => {
    const allowed = currentUser !== null && currentUser.role === 'ADMIN' && Boolean(localStorage.getItem('portal_token'));
    if (!allowed) navigate('/portal/login', { replace: true });
  }, [currentUser, navigate]);

  useAdminViewport(isAdmin);

  // Sidebar: ghi nhớ thu gọn/mở rộng cho lần mở sau (localStorage có thể bị chặn nên luôn bọc try/catch).
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1';
    } catch {
      return false;
    }
  });
  const toggleSidebar = () =>
    setSidebarCollapsed((c) => {
      try {
        localStorage.setItem(SIDEBAR_COLLAPSED_KEY, c ? '0' : '1');
      } catch {
        /* không lưu được thì vẫn dùng bình thường trong phiên này */
      }
      return !c;
    });
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [recentTabs, setRecentTabs] = useState<AdminTab[]>(readRecentTabs);
  const [showProfile, setShowProfile] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);

  // 1. Dashboard State
  const [dashboardData, setDashboardData] = useState<AdminDashboardSummaryDto | null>(null);
  const [dashboardError, setDashboardError] = useState(false);
  // Số đếm cho badge menu (Đặt phòng chờ xử lý).
  const [bookingSummary, setBookingSummary] = useState<BookingStatusSummary | null>(null);
  // Số đếm cho các hàng đợi "Cần xử lý": hồ sơ NCC mới, yêu cầu thay đổi của NCC.
  const [pendingApplications, setPendingApplications] = useState<number | null>(null);
  const [pendingChanges, setPendingChanges] = useState<number | null>(null);
  const [pendingSos, setPendingSos] = useState<number | null>(null);
  // Đổi giá trị để tải lại các màn tự quản dữ liệu (nút "Làm mới" trên thanh trên cùng).
  const [panelKey, setPanelKey] = useState(0);

  // 2. Accounts State
  const [accountsRefreshKey, setAccountsRefreshKey] = useState(0);
  const [bookingsPreset, setBookingsPreset] = useState<{ key: number; preset?: BookingsPreset }>({ key: 0 });
  const [showCreateAdminModal, setShowCreateAdminModal] = useState(false);
  const [newAdminForm, setNewAdminForm] = useState<{ email: string; phone: string; fullName: string; password: string; adminLevel: AdminLevel }>({
    email: '',
    phone: '',
    fullName: '',
    password: '',
    adminLevel: 3,
  });
  const [resetPassModal, setResetPassModal] = useState<{ id: number; email: string } | null>(null);
  const [newPasswordVal, setNewPasswordVal] = useState('');
  // Lý do đặt lại mật khẩu — bắt buộc, ghi vào nhật ký hoạt động.
  const [resetReason, setResetReason] = useState('');
  const closeResetPass = () => {
    setResetPassModal(null);
    setNewPasswordVal('');
    setResetReason('');
  };

  // 3. Providers State
  const [providers, setProviders] = useState<AdminProviderSummaryDto[]>([]);
  const [providersError, setProvidersError] = useState(false);
  const [showCreateProviderModal, setShowCreateProviderModal] = useState(false);
  const [providerStatusTarget, setProviderStatusTarget] = useState<{ id: number; name: string; status: ProviderStatus } | null>(null);
  const [providerStatusReason, setProviderStatusReason] = useState('');
  const [providerStatusError, setProviderStatusError] = useState('');
  const [providerStatusFinal, setProviderStatusFinal] = useState(false);
  const [newProviderForm, setNewProviderForm] = useState({
    name: '',
    contactName: '',
    contactPhone: '',
    contactEmail: '',
    address: '',
    note: '',
    accountEmail: '',
    accountPhone: '',
    accountPassword: '',
    accountFullName: '',
    serviceType: 'HOMESTAY' as ProviderServiceType,
  });


  const handleLogout = () => {
    clearPortalSession();
    navigate('/admin/login');
  };

  const showNotification = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
  };

  // ─────────────────────────────────────────────
  // Data Loaders
  // ─────────────────────────────────────────────
  const loadDashboard = async () => {
    try {
      setLoading(true);
      setDashboardError(false);
      setDashboardData(await adminService.getDashboardSummary());
    } catch {
      setDashboardError(true);
    } finally {
      setLoading(false);
    }
  };

  const loadProviders = async () => {
    try {
      setLoading(true);
      setProvidersError(false);
      setProviders(await adminService.getProviders());
    } catch {
      setProvidersError(true);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Số đếm cho badge sidebar — tải ngầm (ưu tiên thấp, sau dữ liệu chính của mục đang mở), lỗi thì chỉ ẩn badge.
   * Một lượt gọi nav-counts thay cho 4 lượt; máy chủ tự bỏ hàng đợi hồ sơ NCC / yêu cầu thay đổi với cấp 3.
   */
  const loadNavCounts = async (withDashboard: boolean) => {
    try {
      const counts = await adminService.getNavCounts();
      setBookingSummary(counts.bookings);
      if (can('viewQueues') && counts.pendingApplications !== null) setPendingApplications(counts.pendingApplications);
      if (can('viewQueues') && counts.pendingChanges !== null) setPendingChanges(counts.pendingChanges);
      setPendingSos(counts.pendingSos);
    } catch {
      /* chỉ là huy hiệu */
    }
    // Số liệu Tổng quan cho thẻ "cần xử lý" khi đang ở mục khác: phần phụ, tải sau huy hiệu.
    if (withDashboard) {
      try {
        setDashboardData(await adminService.getDashboardSummary());
      } catch {
        /* thẻ tổng quan giữ số cũ */
      }
    }
  };

  /** "Làm mới": đưa mục đang mở về trạng thái ban đầu (bỏ tab trạng thái trên URL, bộ lọc, tìm kiếm) rồi tải lại dữ liệu. */
  const refreshActiveTab = () => {
    setSearchParams(clearStatusParam, { replace: true, state: historyState });
    if (activeTab === 'bookings') setBookingsPreset((p) => ({ key: p.key + 1 }));
    if (activeTab === 'dashboard') loadDashboard();
    else if (activeTab === 'providers') {
      loadProviders();
      setPanelKey((k) => k + 1);
    } else if (activeTab !== 'finance') {
      setAccountsRefreshKey((k) => k + 1);
      setPanelKey((k) => k + 1);
    }
    void loadNavCounts(activeTab !== 'dashboard');
  };

  useEffect(() => {
    if (!isAdmin) return;
    if (activeTab === 'dashboard') loadDashboard();
    else if (activeTab === 'providers') loadProviders();
    void loadNavCounts(activeTab !== 'dashboard');
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chỉ tải lại khi đổi mục hoặc đổi cấp
  }, [activeTab, level]);

  // ─────────────────────────────────────────────
  // Action Handlers
  // ─────────────────────────────────────────────
  const handleCreateAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await adminService.createAdminAccount(newAdminForm);
      showNotification('success', `Đã tạo tài khoản quản trị viên ${LEVEL_META[newAdminForm.adminLevel].label} (${LEVEL_META[newAdminForm.adminLevel].role}) thành công.`);
      setShowCreateAdminModal(false);
      setNewAdminForm({ email: '', phone: '', fullName: '', password: '', adminLevel: 3 });
      setAccountsRefreshKey((k) => k + 1);
    } catch (err: unknown) {
      const msg = getApiErrorMessage(err, 'Lỗi khi tạo tài khoản Admin.');
      showNotification('error', msg);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetPassModal) return;
    try {
      await adminService.resetPassword(resetPassModal.id, {
        newPassword: newPasswordVal,
        reason: resetReason.trim(),
      });
      showNotification('success', `Đã đặt lại mật khẩu cho ${resetPassModal.email}`);
      closeResetPass();
    } catch (err: unknown) {
      const msg = getApiErrorMessage(err, 'Lỗi khi đặt lại mật khẩu.');
      showNotification('error', msg);
    }
  };

  const handleCreateProvider = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await adminService.createProviderWithAccount(newProviderForm);
      showNotification('success', 'Đã tạo mới Đối tác NCC và tài khoản đăng nhập đầu tiên thành công!');
      setShowCreateProviderModal(false);
      setNewProviderForm({
        name: '',
        contactName: '',
        contactPhone: '',
        contactEmail: '',
        address: '',
        note: '',
        accountEmail: '',
        accountPhone: '',
        accountPassword: '',
        accountFullName: '',
        serviceType: 'HOMESTAY',
      });
      loadProviders();
    } catch (err: unknown) {
      const msg = getApiErrorMessage(err, 'Lỗi khi tạo Đối tác NCC.');
      showNotification('error', msg);
    }
  };

  const openProviderStatusDialog = (id: number, name: string, status: ProviderStatus) => {
    setProviderStatusTarget({ id, name, status });
    setProviderStatusReason('');
    setProviderStatusError('');
    setProviderStatusFinal(false);
  };

  const handleUpdateProviderStatus = async () => {
    if (!providerStatusTarget) return;
    const { id, status } = providerStatusTarget;
    const reason = providerStatusReason.trim();
    if (status !== 'ACTIVE' && !reason) {
      setProviderStatusError('Vui lòng nhập lý do.');
      return;
    }
    // Đình chỉ / chấm dứt cần thêm một bước xác nhận lần cuối trước khi ghi nhận.
    if (status !== 'ACTIVE' && !providerStatusFinal) {
      setProviderStatusError('');
      setProviderStatusFinal(true);
      return;
    }
    try {
      await adminService.updateProviderStatus(id, {
        status,
        reason: reason || 'Admin mở lại tài khoản đối tác',
      });
      showNotification('success', `Đã đổi trạng thái đối tác sang ${status}`);
      setProviderStatusTarget(null);
      loadProviders();
    } catch (err: unknown) {
      setProviderStatusError(getApiErrorMessage(err, 'Lỗi cập nhật trạng thái đối tác.'));
    }
  };


  // ─────────────────────────────────────────────
  // Sidebar
  // ─────────────────────────────────────────────
  // Đơn cần Admin / NCC thao tác: chờ xác nhận + đã xác nhận nhưng chưa ghi nhận thanh toán.
  const pendingBookings = bookingSummary ? bookingSummary.PENDING + bookingSummary.CONFIRMED : 0;
  /** Số đếm cạnh mục menu — logic đếm giữ nguyên như trước. */
  const navCounts: Partial<Record<AdminTab, number | null>> = {
    applications: pendingApplications,
    changes: pendingChanges,
    places: dashboardData ? dashboardData.unverifiedPlaces : null,
    bookings: pendingBookings,
    sos: pendingSos,
  };
  // Cấu hình menu (adminNav.ts) đã lọc bỏ mục ngoài quyền và nhóm rỗng.
  const navGroups = NAV_GROUPS.map((g) => ({ ...g, items: g.items.filter((i) => tabAllowed(i.key)) })).filter((g) => g.items.length > 0);
  const meta = NAV_META[activeTab];

  // Ghi nhớ các mục vừa mở để hiện ở phần "Mở gần đây" của bảng lệnh.
  useEffect(() => {
    setRecentTabs((prev) => {
      const next = [activeTab, ...prev.filter((t) => t !== activeTab)].slice(0, MAX_RECENT_TABS);
      try {
        localStorage.setItem(RECENT_TABS_KEY, JSON.stringify(next));
      } catch {
        /* bỏ qua: chỉ là tiện ích */
      }
      return next;
    });
  }, [activeTab]);

  /** Mở mục từ thông báo (chỉ khi cấp hiện tại được phép vào mục đó); thông báo đơn đặt phòng mở luôn chi tiết đơn. */
  const openFromNotification = (target: string, bookingId?: number | null) => {
    if (Object.prototype.hasOwnProperty.call(NAV_META, target) && tabAllowed(target as AdminTab)) {
      if (target === 'bookings' && bookingId) setBookingsPreset((p) => ({ key: p.key + 1, preset: { openBookingId: bookingId } }));
      setActiveTab(target as AdminTab);
      setMobileNavOpen(false);
    }
  };

  // Bấm thông báo đẩy ngoài màn hình: mở /admin?tab=... (cửa sổ mới) hoặc service worker báo cho cửa sổ đang mở.
  const openTargetRef = useRef(openFromNotification);
  openTargetRef.current = openFromNotification;
  useEffect(() => {
    const bookingOf = (params: URLSearchParams) => Number(params.get('booking')) || null;
    const params = new URLSearchParams(window.location.search);
    const tab = params.get('tab');
    if (tab === 'bookings' && bookingOf(params)) openTargetRef.current(tab, bookingOf(params));
    const onSwMessage = (e: MessageEvent) => {
      if (e.data?.type !== 'admin-push-open' || typeof e.data.url !== 'string') return;
      const target = new URL(e.data.url, window.location.origin).searchParams;
      const targetTab = target.get('tab');
      if (targetTab) openTargetRef.current(targetTab, bookingOf(target));
    };
    navigator.serviceWorker?.addEventListener('message', onSwMessage);
    return () => navigator.serviceWorker?.removeEventListener('message', onSwMessage);
  }, []);

  /** Đưa con trỏ vào ô tìm kiếm đầu tiên của màn vừa mở (chờ màn vẽ xong). */
  const focusMainSearch = () => {
    window.setTimeout(() => document.querySelector<HTMLInputElement>('main input[type="text"]')?.focus(), 150);
  };

  /** Nút tắt khi rê chuột trên mục menu. "Xử lý mục tiếp theo" mở hàng đợi tương ứng (mặc định hiện việc chờ trước). */
  const handleShortcut = (key: AdminTab, kind: NavShortcutKind) => {
    if (kind === 'add') {
      if (key === 'providers') setShowCreateProviderModal(true);
      else if (key === 'admins') setShowCreateAdminModal(true);
      return;
    }
    setActiveTab(key);
    if (kind === 'search') focusMainSearch();
  };

  const exportQueueCsv = () => {
    const queueItems = NAV_GROUPS.find((g) => g.id === 'attention')?.items.filter((i) => tabAllowed(i.key)) ?? [];
    const stamp = new Date();
    downloadCsv(`viec-can-xu-ly-${stamp.toISOString().slice(0, 10)}.csv`, [
      ['Mục', 'Số việc chờ xử lý', 'Thời điểm xuất'],
      ...queueItems.map((i) => [i.label, navCounts[i.key] ?? 0, stamp.toLocaleString('vi-VN')]),
    ]);
    showNotification('success', 'Đã xuất file CSV danh sách việc cần xử lý.');
  };

  // Thao tác nhanh của bảng lệnh, đã lọc theo quyền của cấp hiện tại.
  const quickActions: QuickAction[] = [
    ...(tabAllowed('places') && can('operate')
      ? [{ id: 'next-place', label: 'Duyệt điểm đến tiếp theo', hint: 'Mở hàng đợi', icon: MapPin, run: () => setActiveTab('places') }]
      : []),
    ...(can('operate')
      ? [{ id: 'add-provider', label: 'Thêm đối tác', hint: 'Tạo NCC + tài khoản', icon: Building2, run: () => setShowCreateProviderModal(true) }]
      : []),
    ...(can('manageAdmins')
      ? [{ id: 'add-admin', label: 'Tạo quản trị viên', hint: 'Chọn cấp 1–3', icon: UserPlus, run: () => setShowCreateAdminModal(true) }]
      : []),
    { id: 'export-csv', label: 'Xuất CSV', hint: 'Việc cần xử lý', icon: Download, run: exportQueueCsv },
  ];

  // Phím tắt Ctrl K (hoặc ⌘ K) bật / tắt bảng lệnh.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const levelLabel = `${LEVEL_META[level].label} · ${LEVEL_META[level].role}`;

  // Guard đặt sau toàn bộ hook để thứ tự hook không đổi giữa các lần render (rules-of-hooks).
  if (!isAdmin) return null;

  return (
    <AdminLevelContext.Provider value={level}>
    <div className="admin-ui min-h-dvh bg-canvas font-sans text-ink">
      {backSwipeProgress > 0 && (
        <div
          aria-hidden="true"
          className="admin-edge-back-hint pointer-events-none fixed left-2 top-1/2 z-50 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-primary/20 bg-white text-primary shadow-lg lg:hidden"
          style={{ opacity: backSwipeProgress, marginLeft: `${backSwipeProgress * 20}px` }}
        >
          <ChevronLeft className="h-6 w-6" />
        </div>
      )}
      <AdminSidebar
        groups={navGroups}
        active={activeTab}
        counts={navCounts}
        can={can}
        onSelect={setActiveTab}
        onShortcut={handleShortcut}
        onOpenNotificationTarget={openFromNotification}
        onOpenPalette={() => setPaletteOpen(true)}
        collapsed={sidebarCollapsed}
        onToggleCollapsed={toggleSidebar}
        user={currentUser ? { fullName: currentUser.fullName, email: currentUser.email, levelLabel } : { levelLabel }}
        onOpenProfile={() => setShowProfile(true)}
        onChangePassword={() => setShowChangePassword(true)}
        onHome={() => navigate('/')}
        onLogout={handleLogout}
        mobileOpen={mobileNavOpen}
        onCloseMobile={() => setMobileNavOpen(false)}
      />

      {/* Nội dung chừa chỗ cho sidebar (264px, hoặc 72px khi thu gọn) trên màn hình rộng. */}
      <div
        className="transition-[padding] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] lg:pl-[var(--admin-sidebar-w)]"
        style={{ '--admin-sidebar-w': `${sidebarCollapsed ? SIDEBAR_WIDTH_COLLAPSED : SIDEBAR_WIDTH}px` } as React.CSSProperties}
      >
        {/* Safe-area (tai thỏ iPhone) đặt ở header để hàng nút giữ đủ h-14, không tràn qua viền dưới. */}
        <header className="admin-page-header sticky top-0 z-20 border-b border-border bg-white/85 backdrop-blur">
          <div className="flex h-14 items-center gap-1 px-2 sm:h-16 sm:gap-3 sm:px-6 lg:px-8">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              aria-label="Mở menu"
              className="flex h-10 w-10 items-center justify-center rounded-md text-muted transition-colors hover:bg-hover hover:text-ink lg:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="min-w-0 flex-1">
              <nav aria-label="Breadcrumb" className="hidden items-center gap-1 text-[11px] text-muted sm:flex">
                <span>Quản trị</span>
                <ChevronRight className="h-3 w-3" />
                <span>{meta.breadcrumb}</span>
              </nav>
              <h1 className="truncate font-display text-lg font-bold tracking-tight text-ink-deep">{meta.label}</h1>
            </div>
            <p className="hidden max-w-sm text-right text-xs text-muted xl:block">{meta.description}</p>
            <button
              type="button"
              onClick={() => navigate('/')}
              title="Mở trang web như khách (chế độ xem thử, không đặt được phòng)"
              className="flex h-8 items-center gap-1.5 rounded-md border border-border bg-white px-2.5 text-xs font-semibold text-muted transition-colors hover:border-primary/40 hover:text-primary max-sm:h-10 max-sm:w-10 max-sm:justify-center max-sm:border-transparent max-sm:bg-transparent max-sm:px-0 max-sm:active:bg-hover"
            >
              <Globe className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
              <span className="hidden sm:inline">Trang web</span>
            </button>
            <AdminNotificationBell onOpenTarget={openFromNotification} placement="below-right" />
            <button
              type="button"
              onClick={refreshActiveTab}
              aria-label="Làm mới dữ liệu"
              className="flex h-8 items-center gap-1.5 rounded-md border border-border bg-white px-2.5 text-xs font-semibold text-muted transition-colors hover:border-primary/40 hover:text-primary max-sm:h-10 max-sm:w-10 max-sm:justify-center max-sm:border-transparent max-sm:bg-transparent max-sm:px-0 max-sm:active:bg-hover"
              title="Làm mới dữ liệu"
            >
              <RefreshCw className={`h-4 w-4 sm:h-3.5 sm:w-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Làm mới</span>
            </button>
          </div>
        </header>

        <main
          key={activeTab}
          className="admin-main fade-in-overlay mx-auto flex min-w-0 max-w-[1600px] flex-col gap-4 px-3 pt-4 sm:px-6 sm:pt-5 lg:px-8"
        >
          {/* Tab 1: Dashboard Tổng quan */}
          {activeTab === 'dashboard' && (
            <OverviewPanel
              data={dashboardData}
              bookingSummary={bookingSummary}
              pendingApplications={pendingApplications}
              pendingChanges={pendingChanges}
              canOpen={tabAllowed}
              loading={loading}
              error={dashboardError}
              onRetry={loadDashboard}
              onNavigate={setActiveTab}
              reports={
                <ReportsPanel
                  notify={showNotification}
                  summary={dashboardData}
                  onDrill={(preset) => {
                    setBookingsPreset((p) => ({ key: p.key + 1, preset }));
                    setActiveTab('bookings');
                  }}
                />
              }
            />
          )}

          {/* Tab: SOS khẩn cấp của du khách */}
          {activeTab === 'sos' && (
            <SosPanel key={panelKey} notify={showNotification} />
          )}

          {/* Tab 2: Quản lý Tài khoản */}
          {activeTab === 'accounts' && (
            <AccountsPanel
              key={panelKey}
              currentAccountId={currentUser?.accountId}
              refreshKey={accountsRefreshKey}
              onCreateAdmin={() => setShowCreateAdminModal(true)}
              onCreateProvider={() => setShowCreateProviderModal(true)}
              onResetPassword={setResetPassModal}
              notify={showNotification}
            />
          )}

          {/* Tab 3: Quản lý Đối tác / NCC */}
          {activeTab === 'providers' && (
            <ProvidersPanel
              key={panelKey}
              providers={providers}
              loading={loading}
              error={providersError}
              onReload={loadProviders}
              onCreate={() => setShowCreateProviderModal(true)}
              onChangeStatus={openProviderStatusDialog}
              notify={showNotification}
              pendingApplications={pendingApplications}
              onOpenApplications={() => setActiveTab('applications')}
            />
          )}

          {/* Hàng đợi: hồ sơ đăng ký NCC mới (duyệt → tạo đối tác + tài khoản) */}
          {activeTab === 'applications' && (
            <PanelCard>
              <ProviderApplicationsPanel
                key={panelKey}
                notify={showNotification}
                onChanged={(approved) => {
                  void loadNavCounts(false);
                  if (approved) void loadProviders();
                }}
              />
            </PanelCard>
          )}

          {/* Hàng đợi: duyệt điểm đến / homestay */}
          {activeTab === 'places' && <PlacesPanel key={panelKey} notify={showNotification} />}

          {/* Hàng đợi: thay đổi homestay / phòng / giá do NCC gửi */}
          {activeTab === 'changes' && (
            <PanelCard>
              <ChangeRequestsPanel key={panelKey} notify={showNotification} onChanged={() => void loadNavCounts(true)} />
            </PanelCard>
          )}

          {/* Hàng đợi: đánh giá bị báo vi phạm */}
          {activeTab === 'reviews' && (
            <div className="flex flex-col gap-4">
              <PanelCard>
                <ReviewsPanel key={panelKey} notify={showNotification} />
              </PanelCard>
              {/* Ảnh + lưu bút check-in địa điểm (lịch trình) — cùng việc kiểm duyệt nội dung khách đăng */}
              <PanelCard>
                <JourneyCheckinsPanel key={`checkins-${panelKey}`} notify={showNotification} />
              </PanelCard>
              {/* Bài khách đăng lên trang "Trải nghiệm" — ẩn bài không phù hợp */}
              <PanelCard>
                <JourneyFeedPanel key={`feed-${panelKey}`} notify={showNotification} />
              </PanelCard>
            </div>
          )}

          {/* Tab: Đặt phòng */}
          {activeTab === 'bookings' && (
            <BookingsPanel key={bookingsPreset.key} preset={bookingsPreset.preset} />
          )}

          {/* Hoạt động hệ thống (nhật ký): lọc theo tìm kiếm, trạng thái, vai trò */}
          {activeTab === 'activity' && <ActivityPanel key={panelKey} />}

          {/* Lịch trống của tất cả phòng homestay (chỉ xem) */}
          {activeTab === 'roomCalendar' && <RoomCalendarPanel key={panelKey} />}

          {/* Lịch sử khách xem homestay (chỉ xem) */}
          {activeTab === 'homestayViews' && <HomestayViewsPanel key={panelKey} />}

          {/* Quản trị viên theo cấp (chỉ cấp 1) */}
          {activeTab === 'admins' && (
            <AdminStaffPanel
              key={panelKey}
              currentAccountId={currentUser?.accountId}
              refreshKey={accountsRefreshKey}
              onCreate={() => setShowCreateAdminModal(true)}
              onResetPassword={setResetPassModal}
              notify={showNotification}
            />
          )}

          {/* EP02: địa điểm khám phá quanh homestay (cấp 3 chỉ xem) */}
          {activeTab === 'explorePlaces' && <ExplorePlacesPanel key={panelKey} notify={showNotification} />}
          {activeTab === 'combos' && <CombosPanel key={panelKey} notify={showNotification} />}
          {activeTab === 'nearbyOffers' && <NearbyOffersPanel key={panelKey} notify={showNotification} />}

          {/* Tab 5: Tài chính — đang phát triển, chưa bật xử lý dòng tiền thật */}
          {activeTab === 'finance' && (
            <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border bg-white p-12 text-center shadow-sm">
              <span className="flex h-12 w-12 items-center justify-center rounded-md bg-canvas text-muted">
                <Construction className="h-6 w-6" />
              </span>
              <h3 className="font-display text-sm font-bold text-ink-deep">Tính năng đang phát triển</h3>
              <p className="max-w-md text-xs text-muted">
                Đối soát doanh thu, xử lý hoàn tiền và dòng tiền theo nhà cung cấp đang được hoàn thiện. Màn hình
                này sẽ được kích hoạt khi sẵn sàng.
              </p>
            </div>
          )}
        </main>
      </div>

      {/* Điện thoại: thanh điều hướng đáy trong tầm ngón cái */}
      <AdminBottomNav
        active={activeTab}
        counts={navCounts}
        allowed={tabAllowed}
        onSelect={(tab) => {
          setActiveTab(tab);
          window.scrollTo({ top: 0 });
        }}
        onOpenMenu={() => setMobileNavOpen(true)}
      />

      {/* Việc mới phát sinh (đơn mới / đơn thành công / yêu cầu / SOS): toast + thông báo hệ thống */}
      <AdminLiveAlerts onOpenTarget={openFromNotification} onNewActivity={() => void loadNavCounts(activeTab === 'dashboard')} />

      {/* Thông báo kết quả đặt giữa màn hình */}
      {message && <NoticeDialog notice={message} onClose={() => setMessage(null)} />}

      {/* Bảng lệnh Ctrl K: thao tác nhanh, đi tới trang, mở gần đây */}
      {paletteOpen && (
        <AdminCommandPalette
          open
          onClose={() => setPaletteOpen(false)}
          actions={quickActions}
          pages={navGroups.flatMap((g) => g.items)}
          recent={recentTabs.filter((t) => tabAllowed(t) && t !== activeTab)}
          onGo={setActiveTab}
        />
      )}

      {/* Menu tài khoản: Hồ sơ cá nhân */}
      {showProfile && (
        <Modal title="Hồ sơ cá nhân" subtitle="Thông tin tài khoản quản trị đang đăng nhập." size="sm" onClose={() => setShowProfile(false)}>
          <div className="space-y-3 p-5 text-xs">
            <dl className="grid grid-cols-[6.5rem_1fr] gap-x-3 gap-y-2">
              <dt className="text-muted">Họ và tên</dt>
              <dd className="font-semibold text-ink-deep">{currentUser?.fullName || '—'}</dd>
              <dt className="text-muted">Email</dt>
              <dd className="break-all text-ink">{currentUser?.email || '—'}</dd>
              <dt className="text-muted">Số điện thoại</dt>
              <dd className="text-ink">{currentUser?.phone || '—'}</dd>
              <dt className="text-muted">Cấp quản trị</dt>
              <dd className="font-semibold text-nav-active-text">{levelLabel}</dd>
            </dl>
            <div className="rounded-md border border-border bg-canvas/60 p-3">
              <div className="mb-1.5 flex items-center gap-1.5 font-semibold text-ink-deep">
                <ShieldCheck className="h-4 w-4 text-primary" aria-hidden /> Quyền của bạn
              </div>
              <ul className="flex flex-col gap-1 text-ink">
                {LEVEL_META[level].capabilities.map((c) => (
                  <li key={c} className="flex gap-1.5">
                    <span aria-hidden className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-primary/60" />
                    {c}
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex justify-end pt-1">
              <button type="button" onClick={() => setShowProfile(false)} className="h-9 rounded-md bg-primary px-4 text-xs font-semibold text-white transition-colors hover:bg-primary-600">
                Đóng
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Menu tài khoản: Đổi mật khẩu (dùng luồng OTP qua email có sẵn) */}
      {showChangePassword && (
        <OverlayPortal>
        <div className="admin-password-modal">
        <ForgotPasswordModal
          initialIdentifier={currentUser?.email ?? ''}
          onClose={() => setShowChangePassword(false)}
          onDone={() => {
            setShowChangePassword(false);
            showNotification('success', 'Đã đổi mật khẩu. Lần đăng nhập sau hãy dùng mật khẩu mới.');
          }}
        />
        </div>
        </OverlayPortal>
      )}

      {/* Modal 1: Tạo Admin mới */}
      {showCreateAdminModal && (
        <Modal title="Tạo tài khoản Quản trị viên" subtitle="Chọn cấp để giới hạn chức năng của tài khoản (cấp 1 cao nhất, cấp 3 ít quyền nhất)." onClose={() => setShowCreateAdminModal(false)}>
          <form onSubmit={handleCreateAdmin} className="space-y-3 p-5">
            <div>
              <label className={labelCls} htmlFor="adm-name">Họ và tên *</label>
              <input id="adm-name" type="text" required value={newAdminForm.fullName} onChange={(e) => setNewAdminForm({ ...newAdminForm, fullName: e.target.value })} className={inputCls} placeholder="Lê Quản Trị" />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className={labelCls} htmlFor="adm-email">Email *</label>
                <input id="adm-email" type="email" required value={newAdminForm.email} onChange={(e) => setNewAdminForm({ ...newAdminForm, email: e.target.value })} className={inputCls} placeholder="admin.le@dulichso.vn" />
              </div>
              <div>
                <label className={labelCls} htmlFor="adm-phone">Số điện thoại *</label>
                <input id="adm-phone" type="tel" required value={newAdminForm.phone} onChange={(e) => setNewAdminForm({ ...newAdminForm, phone: e.target.value })} className={inputCls} placeholder="0981122334" />
              </div>
            </div>
            <div>
              <label className={labelCls} htmlFor="adm-pass">Mật khẩu khởi tạo *</label>
              <input id="adm-pass" type="password" required value={newAdminForm.password} onChange={(e) => setNewAdminForm({ ...newAdminForm, password: e.target.value })} className={inputCls} placeholder="Tối thiểu 6 ký tự" />
            </div>
            <fieldset>
              <legend className={labelCls}>Cấp quản trị *</legend>
              <div className="grid gap-2">
                {ADMIN_LEVELS.map((l) => (
                  <label
                    key={l}
                    className={`flex cursor-pointer items-start gap-2.5 rounded-md border p-2.5 transition-colors ${
                      newAdminForm.adminLevel === l ? 'border-primary bg-primary-50/60' : 'border-border hover:border-primary/40'
                    }`}
                  >
                    <input
                      type="radio"
                      name="adm-level"
                      checked={newAdminForm.adminLevel === l}
                      onChange={() => setNewAdminForm({ ...newAdminForm, adminLevel: l })}
                      className="mt-0.5 accent-[var(--color-primary)]"
                    />
                    <span className="min-w-0">
                      <span className="block text-xs font-semibold text-ink-deep">
                        {LEVEL_META[l].label} · {LEVEL_META[l].role}
                      </span>
                      <span className="block text-[11px] leading-snug text-muted">{LEVEL_META[l].description}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            <ModalActions onCancel={() => setShowCreateAdminModal(false)} submitLabel="Tạo tài khoản" />
          </form>
        </Modal>
      )}

      {/* Modal 2: Đổi trạng thái NCC */}
      {providerStatusTarget && (
        <Modal
          title={providerStatusTarget.status === 'ACTIVE' ? 'Mở lại đối tác' : providerStatusTarget.status === 'SUSPENDED' ? 'Đình chỉ đối tác' : 'Chấm dứt đối tác'}
          onClose={() => setProviderStatusTarget(null)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handleUpdateProviderStatus();
            }}
            className="space-y-3 p-5"
          >
            <p className="text-xs leading-relaxed text-muted">
              <strong className="text-ink-deep">{providerStatusTarget.name}</strong>
              {providerStatusTarget.status === 'ACTIVE'
                ? ' sẽ đăng nhập và thao tác lại bình thường.'
                : ' sẽ thấy màn hình thông báo bị đình chỉ và không thể thao tác gì cho đến khi được mở lại.'}
            </p>
            <div>
              <label className={labelCls} htmlFor="provider-status-reason">
                Lý do {providerStatusTarget.status !== 'ACTIVE' && <span className="text-danger">*</span>}
              </label>
              <textarea
                id="provider-status-reason"
                rows={3}
                value={providerStatusReason}
                onChange={(e) => {
                  setProviderStatusReason(e.target.value);
                  setProviderStatusFinal(false);
                }}
                readOnly={providerStatusFinal}
                className="w-full rounded-md border border-border px-3 py-2 text-xs text-ink focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
            {providerStatusFinal && (
              <p role="alert" className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-xs leading-relaxed text-danger">
                <strong>Xác nhận lần cuối:</strong> bạn sắp {providerStatusTarget.status === 'SUSPENDED' ? 'đình chỉ' : 'chấm dứt'}{' '}
                <strong>{providerStatusTarget.name}</strong>. Nhà cung cấp sẽ không thể thao tác cho đến khi được mở lại. Bấm "Quay lại" nếu muốn sửa lý do.
              </p>
            )}
            {providerStatusError && <p className="text-xs text-danger">{providerStatusError}</p>}
            <ModalActions
              onCancel={() => (providerStatusFinal ? setProviderStatusFinal(false) : setProviderStatusTarget(null))}
              cancelLabel={providerStatusFinal ? 'Quay lại' : 'Hủy'}
              submitLabel={providerStatusFinal ? 'Xác nhận lần cuối' : 'Xác nhận'}
              submitTone={providerStatusTarget.status === 'ACTIVE' ? 'primary' : providerStatusTarget.status === 'SUSPENDED' ? 'warning' : 'danger'}
            />
          </form>
        </Modal>
      )}

      {/* Modal 3: Tạo NCC mới + tài khoản 1 bước */}
      {showCreateProviderModal && (
        <Modal title="Tạo đối tác NCC & tài khoản đăng nhập" subtitle="Đối tác được kích hoạt ngay ở trạng thái Đang hoạt động." size="lg" onClose={() => setShowCreateProviderModal(false)}>
          <form onSubmit={handleCreateProvider} className="max-h-[75vh] space-y-3 overflow-y-auto p-5">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-primary">1. Hồ sơ đối tác / cơ sở</div>
            <fieldset>
              <legend className={labelCls}>Loại hình *</legend>
              <div className="grid grid-cols-3 gap-2">
                {PROVIDER_SERVICES.map((option) => {
                  const checked = newProviderForm.serviceType === option.type;
                  return (
                    <label
                      key={option.type}
                      className={`flex cursor-pointer items-center gap-2 rounded-md border px-2.5 py-2 text-xs font-semibold transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary/30 ${
                        checked ? 'border-primary bg-primary-50 text-primary' : 'border-border bg-white text-ink hover:border-primary/40'
                      }`}
                    >
                      <input
                        type="radio"
                        name="p-service-type"
                        className="sr-only"
                        checked={checked}
                        onChange={() => setNewProviderForm({ ...newProviderForm, serviceType: option.type })}
                      />
                      <img src={option.image} alt="" aria-hidden width={22} height={22} className="h-[22px] w-[22px] shrink-0 object-contain" />
                      {option.label}
                    </label>
                  );
                })}
              </div>
            </fieldset>
            <div>
              <label className={labelCls} htmlFor="p-name">Tên cơ sở / nhà xe *</label>
              <input id="p-name" type="text" required value={newProviderForm.name} onChange={(e) => setNewProviderForm({ ...newProviderForm, name: e.target.value })} className={inputCls} placeholder="La Pán Tẩn Eco Homestay" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls} htmlFor="p-contact">Người đại diện</label>
                <input id="p-contact" type="text" value={newProviderForm.contactName} onChange={(e) => setNewProviderForm({ ...newProviderForm, contactName: e.target.value })} className={inputCls} placeholder="Lò Thị Mai" />
              </div>
              <div>
                <label className={labelCls} htmlFor="p-phone">SĐT cơ sở</label>
                <input id="p-phone" type="tel" value={newProviderForm.contactPhone} onChange={(e) => setNewProviderForm({ ...newProviderForm, contactPhone: e.target.value })} className={inputCls} placeholder="0987654321" />
              </div>
            </div>
            <div>
              <label className={labelCls} htmlFor="p-address">Địa chỉ chi tiết</label>
              <input id="p-address" type="text" value={newProviderForm.address} onChange={(e) => setNewProviderForm({ ...newProviderForm, address: e.target.value })} className={inputCls} placeholder="Bản Háng Tày, Xã La Pán Tẩn, Mù Cang Chải" />
            </div>

            <div className="border-t border-border pt-3 text-[11px] font-semibold uppercase tracking-wide text-primary">2. Tài khoản đăng nhập đầu tiên</div>
            <div>
              <label className={labelCls} htmlFor="p-acc-name">Họ tên chủ tài khoản *</label>
              <input id="p-acc-name" type="text" required value={newProviderForm.accountFullName} onChange={(e) => setNewProviderForm({ ...newProviderForm, accountFullName: e.target.value })} className={inputCls} placeholder="Lò Thị Mai" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls} htmlFor="p-acc-email">Email đăng nhập *</label>
                <input id="p-acc-email" type="email" required value={newProviderForm.accountEmail} onChange={(e) => setNewProviderForm({ ...newProviderForm, accountEmail: e.target.value })} className={inputCls} placeholder="mai@lapantan.vn" />
              </div>
              <div>
                <label className={labelCls} htmlFor="p-acc-pass">Mật khẩu *</label>
                <input id="p-acc-pass" type="password" required value={newProviderForm.accountPassword} onChange={(e) => setNewProviderForm({ ...newProviderForm, accountPassword: e.target.value })} className={inputCls} placeholder="Tối thiểu 6 ký tự" />
              </div>
            </div>
            <ModalActions onCancel={() => setShowCreateProviderModal(false)} submitLabel="Tạo đối tác & tài khoản" />
          </form>
        </Modal>
      )}

      {/* Modal 4: Reset Mật khẩu */}
      {resetPassModal && (
        <Modal title="Đặt lại mật khẩu" size="sm" onClose={closeResetPass}>
          <form onSubmit={handleResetPassword} className="space-y-3 p-5">
            <p className="text-xs text-muted">
              Tài khoản: <strong className="text-ink-deep">{resetPassModal.email || `#${resetPassModal.id}`}</strong>
            </p>
            <div>
              <label className={labelCls} htmlFor="reset-pass">Mật khẩu mới *</label>
              <input id="reset-pass" type="password" required value={newPasswordVal} onChange={(e) => setNewPasswordVal(e.target.value)} className={inputCls} placeholder="Tối thiểu 6 ký tự" />
            </div>
            <div>
              <label className={labelCls} htmlFor="reset-pass-reason">Lý do *</label>
              <textarea id="reset-pass-reason" required rows={2} maxLength={500} value={resetReason} onChange={(e) => setResetReason(e.target.value)} className="w-full rounded-md border border-border px-3 py-2 text-xs text-ink placeholder:text-muted/70 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20" placeholder="VD: Người dùng gọi tổng đài báo quên mật khẩu" />
              <p className="mt-1 text-[11px] text-muted">Ghi vào nhật ký hoạt động. Hãy gửi mật khẩu mới cho người dùng qua kênh an toàn.</p>
            </div>
            <ModalActions onCancel={closeResetPass} submitLabel="Lưu mật khẩu mới" />
          </form>
        </Modal>
      )}
    </div>
    </AdminLevelContext.Provider>
  );
}
