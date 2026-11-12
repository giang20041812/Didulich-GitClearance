import type { InternalAxiosRequestConfig } from 'axios';
import { API_ORIGIN } from './apiBase';
import { invalidatePartnerCache } from './partnerCache';

export const PORTAL_SUSPENDED_PATH = '/portal/suspended';
export const PORTAL_LOGIN_PATH = '/portal/login';
export const ADMIN_LOGIN_PATH = '/admin/login';

const LOGIN_PATHS = new Set([PORTAL_LOGIN_PATH, ADMIN_LOGIN_PATH, '/login']);
const SESSION_NOTICE_KEY = 'portal_session_notice';
/** Khóa của cơ chế hẹn giờ hết hạn cũ (đã bỏ) — chỉ còn để dọn khi đăng xuất. */
const LEGACY_SESSION_SEEN_KEY = 'portal_session_seen';
/** Thông báo cũ hơn khoảng này không hiện nữa (vd mở lại trang đăng nhập hôm sau). */
const SESSION_NOTICE_TTL_MS = 30 * 60 * 1000;

/**
 * Phiên đăng nhập không tự hết hạn (backend không đặt hạn token, không giới hạn thời gian không hoạt động).
 * Phiên chỉ kết thúc khi máy chủ thu hồi (đổi mật khẩu, bị khóa, đổi quyền...) hoặc người dùng tự đăng xuất.
 */
export const SESSION_ENDED_MESSAGE = 'Phiên đăng nhập không còn hiệu lực. Vui lòng đăng nhập lại.';

/**
 * Báo backend thu hồi phiên (NFR-SEC-03). Dùng fetch thay vì axios để không đi qua interceptor
 * bên dưới; lỗi mạng bị bỏ qua vì phiên phía client vẫn được xóa.
 * Phải ghép API_ORIGIN: khi frontend khác domain với API (deploy Vercel riêng),
 * đường dẫn tương đối sẽ trỏ vào domain frontend và thu hồi phía máy chủ không xảy ra.
 */
export const revokePortalToken = () => {
  const token = localStorage.getItem('portal_token');
  if (!token) return;
  void fetch(`${API_ORIGIN}/api/v1/auth/portal/logout`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    keepalive: true,
  }).catch(() => undefined);
};

/**
 * Xóa phiên đăng nhập cổng NCC/Admin. Mặc định thu hồi phiên trên backend;
 * truyền revoke=false khi backend đã tự từ chối phiên (hết hạn/đã bị thu hồi).
 */
export const clearPortalSession = ({ revoke = true }: { revoke?: boolean } = {}) => {
  const hadSession = localStorage.getItem('portal_token') !== null;
  if (revoke) revokePortalToken();
  localStorage.removeItem('portal_token');
  localStorage.removeItem('portal_user');
  localStorage.removeItem(LEGACY_SESSION_SEEN_KEY);
  invalidatePartnerCache();
  // Đăng xuất chủ động không được hiện lại thông báo "hết hạn" cũ (endPortalSession ghi thông báo sau bước này).
  // Phiên đã bị xóa trước đó (vd AdminGuard dọn lại sau interceptor) thì giữ thông báo vừa ghi.
  if (hadSession) clearPortalSessionNotice();
};

/** Thông báo vì sao phiên cổng kết thúc, để trang đăng nhập hiển thị (null nếu không có / đã cũ). */
export const readPortalSessionNotice = (): string | null => {
  try {
    const raw = sessionStorage.getItem(SESSION_NOTICE_KEY);
    if (!raw) return null;
    const notice = JSON.parse(raw) as { message?: unknown; at?: unknown };
    if (typeof notice.message !== 'string' || typeof notice.at !== 'number') return null;
    return Date.now() - notice.at <= SESSION_NOTICE_TTL_MS ? notice.message : null;
  } catch {
    return null;
  }
};

export const clearPortalSessionNotice = () => {
  try {
    sessionStorage.removeItem(SESSION_NOTICE_KEY);
  } catch {
    // bỏ qua: chỉ là thông báo
  }
};

const portalLoginPath = (): string => {
  try {
    const role = (JSON.parse(localStorage.getItem('portal_user') ?? 'null') as { role?: unknown } | null)?.role;
    if (role === 'ADMIN') return ADMIN_LOGIN_PATH;
    if (role === 'PROVIDER') return PORTAL_LOGIN_PATH;
  } catch {
    // dữ liệu phiên hỏng: đoán theo trang đang mở
  }
  return window.location.pathname.startsWith('/admin') ? ADMIN_LOGIN_PATH : PORTAL_LOGIN_PATH;
};

const isPortalPage = (pathname: string) =>
  pathname === '/admin' || pathname.startsWith('/admin/') || pathname === '/partner' || pathname.startsWith('/partner/');

let sessionEndRedirecting = false;

/**
 * Phiên cổng NCC/Admin không còn dùng được (bị thu hồi, tài khoản bị khóa): xóa phiên và,
 * nếu đang ở cổng, chuyển về đúng trang đăng nhập kèm thông báo. Gọi nhiều lần (nhiều request lỗi cùng lúc)
 * chỉ chuyển trang một lần; phiên đã bị xóa trước khi chuyển nên trang đăng nhập không đẩy ngược lại cổng.
 */
export const endPortalSession = (message: string = SESSION_ENDED_MESSAGE) => {
  if (sessionEndRedirecting) return;
  const loginPath = portalLoginPath();
  clearPortalSession({ revoke: false });
  try {
    sessionStorage.setItem(SESSION_NOTICE_KEY, JSON.stringify({ message, at: Date.now() }));
  } catch {
    // bỏ qua: trang đăng nhập chỉ thiếu dòng thông báo
  }
  window.dispatchEvent(new Event('auth_change'));
  const { pathname } = window.location;
  if (LOGIN_PATHS.has(pathname) || !isPortalPage(pathname)) return;
  sessionEndRedirecting = true;
  window.location.replace(loginPath);
};

/** Token Bearer mà request đã gửi (null nếu không có). */
export const bearerTokenOf = (config?: InternalAxiosRequestConfig): string | null => {
  const value: unknown = config?.headers?.get?.('Authorization') ?? config?.headers?.Authorization;
  if (typeof value !== 'string' || !value.startsWith('Bearer ')) return null;
  const token = value.slice(7).trim();
  return token || null;
};

export const serverMessage = (data: { message?: unknown } | undefined): string | undefined =>
  typeof data?.message === 'string' && data.message ? data.message : undefined;

/**
 * NCC đang đăng nhập mà bị đình chỉ / chấm dứt: backend trả 403 PROVIDER_SUSPENDED
 * ở mọi API → xóa phiên và chuyển sang màn hình thông báo.
 * Request mang token cổng hiện tại mà bị từ chối:
 *  - 401 (SESSION_REVOKED...) → phiên đã bị thu hồi;
 *  - 403 ACCOUNT_INACTIVE → tài khoản bị vô hiệu hóa.
 * Hai trường hợp này xóa phiên và chuyển về trang đăng nhập của đúng cổng kèm thông báo.
 * 403 thiếu quyền thật giữ nguyên để trang tự báo lỗi.
 *
 * Interceptor axios này đã dời sang lib/axiosBoot.ts (chỉ nạp ở cổng NCC / Admin) để axios
 * không nằm trong bundle tải đầu của khách du lịch; logic dùng các helper phía trên.
 */
