/**
 * Cache dữ liệu công khai trong bộ nhớ của tab (trang chủ, chi tiết chỗ nghỉ, lân cận, khu vực...).
 *
 * - Quay lại trang vừa xem (trang chủ → chi tiết → quay lại) hiện ngay, không màn hình chờ, không gọi lại API.
 * - Nhiều nơi cùng cần một dữ liệu (StrictMode gọi effect 2 lần, trang đặt phòng nạp lại chi tiết homestay...) thì chỉ
 *   một request được gửi.
 * - Lỗi không được giữ lại: lần sau thử lại từ đầu.
 *
 * Chỉ dùng cho dữ liệu như nhau với mọi người; tồn phòng theo ngày / dữ liệu của khách không đi qua đây.
 * Ngoại lệ: lib/partnerCache.ts giữ vài dữ liệu ít đổi của cổng NCC (tên Homestay, danh mục tiện ích) với khóa theo
 * tài khoản, xóa khi đăng xuất và sau mỗi lần NCC sửa Homestay.
 */

interface Entry {
  hasValue: boolean;
  value?: unknown;
  /** Date.now() lúc có giá trị. */
  at: number;
  promise?: Promise<unknown>;
}

const MAX_ENTRIES = 200;
const store = new Map<string, Entry>();

/** Giá trị đang có (kể cả đã cũ hơn maxAgeMs nếu không truyền) — để vẽ ngay khi mở lại trang. */
export function peekCache<T>(key: string, maxAgeMs = Number.POSITIVE_INFINITY): T | undefined {
  const entry = store.get(key);
  if (!entry?.hasValue || Date.now() - entry.at > maxAgeMs) return undefined;
  return entry.value as T;
}

/** Trả giá trị còn mới (dưới ttlMs) nếu có; không thì chạy loader (gộp với lần nạp đang chạy cùng khóa). */
export function cachedFetch<T>(key: string, ttlMs: number, loader: () => Promise<T>): Promise<T> {
  const entry = store.get(key);
  if (entry?.hasValue && Date.now() - entry.at < ttlMs) return Promise.resolve(entry.value as T);
  if (entry?.promise) return entry.promise as Promise<T>;

  const promise: Promise<T> = loader().then(
    (value) => {
      store.delete(key); // đưa xuống cuối Map: mục ít dùng nhất bị bỏ trước
      store.set(key, { hasValue: true, value, at: Date.now() });
      trim();
      return value;
    },
    (error: unknown) => {
      const current = store.get(key);
      if (current?.promise === promise) {
        if (current.hasValue) store.set(key, { hasValue: true, value: current.value, at: current.at });
        else store.delete(key);
      }
      throw error;
    },
  );
  store.set(key, { hasValue: entry?.hasValue ?? false, value: entry?.value, at: entry?.at ?? 0, promise });
  return promise;
}

/** Ghi sẵn giá trị vừa nhận từ một API khác (vd danh sách Homestay đi kèm lịch phòng) để nơi khác dùng ngay. */
export function primeCache<T>(key: string, value: T): void {
  if (store.get(key)?.promise) return; // đang có lượt nạp: để lượt đó ghi
  store.delete(key);
  store.set(key, { hasValue: true, value, at: Date.now() });
  trim();
}

/** Xóa các mục có khóa bắt đầu bằng prefix (vd sau khi chính khách vừa thay đổi dữ liệu). */
export function invalidateCache(prefix: string): void {
  for (const key of [...store.keys()]) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}

function trim() {
  while (store.size > MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    if (oldest === undefined) return;
    store.delete(oldest);
  }
}
