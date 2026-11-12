import { cachedFetch, invalidateCache, peekCache, primeCache } from './dataCache';

/**
 * Cache trong tab cho dữ liệu ít đổi của cổng NCC: danh sách tên Homestay (bộ chọn ở Lịch phòng, Loại phòng, Đánh giá,
 * Tổng quan) và danh mục tiện ích. Chuyển trang trong cổng không gọi lại API — mỗi lượt gọi tới backend ~0,25 giây và
 * có thể rơi vào container nguội ~16 giây.
 *
 * Khóa gắn với tài khoản đang đăng nhập (đổi tài khoản trên cùng máy không thấy dữ liệu của người trước); xóa hết khi
 * đăng xuất (clearPortalSession) và sau mỗi lần NCC tạo / sửa / đổi trạng thái Homestay (invalidatePartnerCache).
 * KHÔNG dùng cho tồn phòng, đơn đặt phòng, thông báo.
 */
const PREFIX = 'partner:';
export const PARTNER_TTL_MS = 5 * 60_000;

function accountKey(): string {
  try {
    const raw = localStorage.getItem('portal_user');
    const user = raw ? (JSON.parse(raw) as { accountId?: number }) : null;
    if (user?.accountId != null) return String(user.accountId);
    return (localStorage.getItem('portal_token') ?? '').slice(-16);
  } catch {
    return '';
  }
}

const keyOf = (name: string) => `${PREFIX}${accountKey()}:${name}`;

export function partnerCached<T>(name: string, loader: () => Promise<T>, ttlMs = PARTNER_TTL_MS): Promise<T> {
  return cachedFetch(keyOf(name), ttlMs, loader);
}

export function peekPartner<T>(name: string, maxAgeMs = PARTNER_TTL_MS): T | undefined {
  return peekCache<T>(keyOf(name), maxAgeMs);
}

/**
 * Bản đã lưu để hiện ngay khi mở lại một trang của cổng (dù đã cũ tới 30 phút) — trang vẫn gọi API làm mới ngay sau đó
 * (stale-while-revalidate): chuyển qua lại giữa các trang không còn màn hình chờ.
 */
export const SWR_MAX_AGE_MS = 30 * 60_000;
export function peekPartnerStale<T>(name: string): T | undefined {
  return peekPartner<T>(name, SWR_MAX_AGE_MS);
}

export function primePartner<T>(name: string, value: T): void {
  primeCache(keyOf(name), value);
}

/** Sau khi NCC đổi Homestay / loại phòng, hoặc khi đăng xuất. */
export function invalidatePartnerCache(): void {
  invalidateCache(PREFIX);
}
