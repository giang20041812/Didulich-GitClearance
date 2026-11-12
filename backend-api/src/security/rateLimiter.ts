import { HttpError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';

/**
 * Giới hạn số lần gọi theo khóa (thường là IP + tên hành động) trong một cửa sổ thời gian cố định.
 *
 * Bộ đếm nằm trong bộ nhớ của từng instance (container): nhiều container thì mỗi container đếm riêng, khởi động lại thì
 * đếm lại. Đủ chặn dò mã / dò mật khẩu / spam ở mức cơ bản; cần giới hạn chung thì chuyển bộ đếm vào DB.
 */

/** Số khóa tối đa giữ trong bộ nhớ; vượt thì dọn khóa hết hạn, vẫn vượt thì xóa sạch (tránh phình bộ nhớ). */
const MAX_KEYS = 20_000;

interface Window {
  startedAt: number;
  lengthMs: number;
  count: number;
}

const windows = new Map<string, Window>();

const expired = (w: Window, now: number) => now - w.startedAt >= w.lengthMs;

function increment(action: string, key: string, windowMs: number): Window {
  const fullKey = `${action}:${key}`;
  const now = Date.now();
  const w = windows.get(fullKey);
  const updated: Window =
    !w || expired(w, now) ? { startedAt: now, lengthMs: windowMs, count: 1 } : { ...w, count: w.count + 1 };
  windows.set(fullKey, updated);
  if (windows.size > MAX_KEYS) {
    for (const [k, v] of windows) if (expired(v, now)) windows.delete(k);
    if (windows.size > MAX_KEYS) windows.clear();
  }
  return updated;
}

/** Che bớt email/SĐT trong log; IP giữ nguyên. */
export function maskKey(key: string | null | undefined): string {
  if (!key) return '';
  const at = key.indexOf('@');
  if (at > 1) return `${key[0]}***${key.slice(at)}`;
  if (/^\+?\d{8,}$/.test(key)) return `${key.slice(0, 3)}***${key.slice(-2)}`;
  return key;
}

/** Giới hạn theo khóa tùy ý + tên hành động. Vượt giới hạn thì ném 429. */
export function checkKey(action: string, key: string, limit: number, windowMs: number): void {
  const updated = increment(action, key, windowMs);
  if (updated.count > limit) {
    if (updated.count === limit + 1) {
      logger.warn('Rate limit vượt ngưỡng', { action, limit, windowMs, key: maskKey(key) });
    }
    throw new HttpError(429, 'Bạn thao tác quá nhiều lần. Vui lòng thử lại sau ít phút.');
  }
}

/** Giới hạn theo IP client (req.ip) + tên hành động. */
export function check(ip: string | undefined, action: string, limit: number, windowMs: number): void {
  checkKey(action, ip ?? 'unknown', limit, windowMs);
}

/** Khóa này đã có từ `limit` lần được ghi nhận trở lên trong cửa sổ hiện tại chưa. KHÔNG đếm thêm. */
export function isBlocked(action: string, key: string, limit: number): boolean {
  const w = windows.get(`${action}:${key}`);
  return !!w && !expired(w, Date.now()) && w.count >= limit;
}

/** Ghi nhận một lần (thất bại) cho khóa mà không ném lỗi. */
export function recordFailure(action: string, key: string, windowMs: number): void {
  increment(action, key, windowMs);
}

/** Xóa bộ đếm của khóa (vd đăng nhập thành công thì bỏ đếm lần sai trước đó). */
export function reset(action: string, key: string): void {
  windows.delete(`${action}:${key}`);
}

/** Dùng trong test. */
export function clearAll(): void {
  windows.clear();
}
