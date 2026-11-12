import { SESSION_ENDED_MESSAGE } from './authInterceptor';

/**
 * Phiên đăng nhập của khách du lịch (JWT không hạn trong localStorage.traveler_token — giữ tới khi khách tự đăng
 * xuất). Máy chủ vẫn có thể từ chối token (sai chữ ký, đổi secret...): 401 ở /my-bookings — khi đó trang phải biết
 * phiên đã hết để chuyển về đăng nhập thay vì hiện danh sách rỗng.
 */
const TRAVELER_TOKEN_KEY = 'traveler_token';
const TRAVELER_USER_KEY = 'traveler_user';
/** Phiên vừa bị kết thúc vì hết hạn trong khoảng này thì trang đăng nhập hiện lý do. */
const RECENT_EXPIRY_MS = 60 * 1000;

let expiredAt: number | null = null;

/** Phiên khách bị máy chủ từ chối: trang nên chuyển về /login kèm returnUrl. */
export class TravelerSessionExpiredError extends Error {
  constructor(message: string = SESSION_ENDED_MESSAGE) {
    super(message);
    this.name = 'TravelerSessionExpiredError';
  }
}

/**
 * Kết thúc phiên khách vì bị máy chủ từ chối. Chỉ xóa khi token đang lưu vẫn là {@code expectedToken}
 * (không xóa nhầm phiên vừa đăng nhập lại). Sự kiện auth_change phát sau vòng render hiện tại, vì hàm này
 * có thể được gọi trong lúc render (getCurrentCustomer).
 */
export const endTravelerSession = (expectedToken: string): boolean => {
  try {
    if (localStorage.getItem(TRAVELER_TOKEN_KEY) !== expectedToken) return false;
    localStorage.removeItem(TRAVELER_TOKEN_KEY);
    localStorage.removeItem(TRAVELER_USER_KEY);
  } catch {
    return false;
  }
  expiredAt = Date.now();
  window.setTimeout(() => window.dispatchEvent(new Event('auth_change')), 0);
  return true;
};

/** Thông báo cho trang đăng nhập nếu phiên khách vừa bị từ chối (không tiêu thụ — an toàn khi render lại). */
export const recentTravelerSessionNotice = (): string | undefined =>
  expiredAt !== null && Date.now() - expiredAt <= RECENT_EXPIRY_MS ? SESSION_ENDED_MESSAGE : undefined;
