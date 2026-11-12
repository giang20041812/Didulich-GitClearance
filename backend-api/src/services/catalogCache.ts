import { exec, scalar } from '../db/pool.js';
import { isUniqueViolation } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import { nowLocal } from '../lib/time.js';
import crypto from 'node:crypto';

/**
 * "Phiên bản" của dữ liệu danh mục công khai (chỗ nghỉ, phòng, ảnh, đánh giá...) dùng chung cho MỌI instance: lưu ở bảng
 * app_setting, đổi giá trị mỗi khi Admin / NCC / khách ghi dữ liệu làm thay đổi danh mục. Cache gắn phiên bản vào từng
 * mục — phiên bản đổi là mục cũ bị bỏ, kể cả ở instance khác.
 *
 * Mỗi instance chỉ hỏi lại DB tối đa một lần mỗi REFRESH_MS. DB lỗi thì giữ phiên bản đang biết — cache vẫn tự hết hạn theo TTL.
 */

const KEY = 'catalog_version';
const REFRESH_MS = 5000;

let currentVersion = 'unknown';
let checkedAt = 0;
let refreshing: Promise<string> | null = null;

export async function catalogVersion(): Promise<string> {
  if (checkedAt !== 0 && Date.now() - checkedAt < REFRESH_MS) return currentVersion;
  if (refreshing) return refreshing;
  refreshing = (async () => {
    try {
      const value = await scalar<string>('SELECT setting_value FROM app_setting WHERE setting_key = $1', [KEY]);
      currentVersion = value ?? 'none';
    } catch (err) {
      logger.debug('[CatalogVersion] Không đọc được phiên bản danh mục, giữ giá trị cũ', { error: (err as Error).message });
    }
    checkedAt = Date.now();
    return currentVersion;
  })().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

/** Đánh dấu danh mục vừa đổi — gọi SAU khi transaction ghi dữ liệu đã commit. */
export async function bumpCatalogVersion(): Promise<void> {
  const next = `${Date.now().toString(36)}-${crypto.randomBytes(6).toString('hex')}`;
  const now = nowLocal();
  try {
    const updated = await exec('UPDATE app_setting SET setting_value = $1, updated_at = $2 WHERE setting_key = $3', [next, now, KEY]);
    if (updated === 0) {
      try {
        await exec('INSERT INTO app_setting (setting_key, setting_value, updated_at) VALUES ($1, $2, $3)', [KEY, next, now]);
      } catch (err) {
        if (!isUniqueViolation(err)) throw err;
        // Instance khác vừa tạo dòng này cùng lúc.
        await exec('UPDATE app_setting SET setting_value = $1, updated_at = $2 WHERE setting_key = $3', [next, now, KEY]);
      }
    }
  } catch (err) {
    logger.warn('[CatalogVersion] Không ghi được phiên bản danh mục (instance khác có thể trả dữ liệu cũ tới khi hết TTL)', {
      error: (err as Error).message,
    });
  }
  currentVersion = next;
  checkedAt = Date.now();
}

// ---- Cache --------------------------------------------------------------------------------------------------------

/** Danh mục (trang chủ, danh sách, chi tiết, đánh giá): phiên bản lo việc làm mới, TTL chỉ là chặn trên. */
export const CATALOG_TTL_MS = 10 * 60 * 1000;
/** Dữ liệu tham chiếu ít đổi: khu vực, danh mục tiện ích, lễ hội, điểm lân cận. */
export const REFERENCE_TTL_MS = 30 * 60 * 1000;

const MAX_ENTRIES = 512;

interface Entry {
  version: string;
  expiresAt: number;
  value: Promise<unknown>;
  done: boolean;
}

const entries = new Map<string, Entry>();

/**
 * Cache trong bộ nhớ cho API danh mục công khai, đứng sau CDN: request tới backend thì trả từ bộ nhớ thay vì 5–10 câu SQL.
 * Single-flight: nhiều request cùng khóa lúc cache trống chỉ chạy truy vấn một lần. Giá trị cache dùng chung giữa các
 * request, không được sửa sau khi trả về. Gọi từ route — KHÔNG gọi bên trong transaction.
 */
export async function cached<T>(key: string, ttlMs: number, loader: () => Promise<T>): Promise<T> {
  const version = await catalogVersion();
  const now = Date.now();
  const existing = entries.get(key);
  if (existing && existing.version === version && existing.expiresAt > now) {
    return existing.value as Promise<T>;
  }

  const mine: Entry = { version, expiresAt: now + ttlMs, value: undefined as unknown as Promise<unknown>, done: false };
  mine.value = (async () => loader())().then(
    (v) => {
      mine.done = true;
      return v;
    },
    (err) => {
      // Lỗi (404, DB...) không được giữ lại: request sau thử lại từ đầu.
      if (entries.get(key) === mine) entries.delete(key);
      throw err;
    },
  );
  entries.set(key, mine);
  const result = (await mine.value) as T;
  if (entries.size > MAX_ENTRIES) evict();
  return result;
}

/** Bỏ toàn bộ cache của instance này. */
export function invalidateAllCaches(): void {
  entries.clear();
}

function evict(): void {
  const now = Date.now();
  for (const [k, e] of entries) if (e.done && e.expiresAt <= now) entries.delete(k);
  if (entries.size > MAX_ENTRIES) for (const [k, e] of entries) if (e.done) entries.delete(k);
}

/** Dùng trong test. */
export function resetCatalogState(): void {
  entries.clear();
  currentVersion = 'unknown';
  checkedAt = 0;
}
