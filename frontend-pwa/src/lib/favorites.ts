/**
 * Danh sách homestay yêu thích của du khách — lưu tại thiết bị (localStorage),
 * không cần đăng nhập. Thay đổi phát sự kiện "favorites_change" để các trang
 * đang mở cập nhật trạng thái tim ngay lập tức.
 */

export interface FavoriteHomestay {
  id: string;
  slug: string;
  name: string;
  priceRefMin: number | null;
  coverImageUrl?: string;
  regionName?: string;
  savedAt: number;
}

const KEY = 'viettrek_favorites';
const EVENT = 'favorites_change';
const MAX = 60;

function read(): FavoriteHomestay[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function write(list: FavoriteHomestay[]) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(-MAX)));
    window.dispatchEvent(new CustomEvent(EVENT, { detail: { ids: list.map(f => f.id) } }));
  } catch {
    // localStorage đầy (chế độ riêng tư) — bỏ qua, tính năng không chặn luồng chính
  }
}

export function getFavorites(): FavoriteHomestay[] {
  return read();
}

export function getFavoriteIds(): string[] {
  return read().map(f => f.id);
}

export function isFavorite(id: string | number): boolean {
  const key = String(id);
  return read().some(f => f.id === key);
}

/** Thêm/lưu một homestay vào danh sách. Trả về true nếu sau lời gọi nó ĐANG được lưu. */
export function addFavorite(item: Omit<FavoriteHomestay, 'savedAt'>): boolean {
  const list = read();
  if (!list.some(f => f.id === item.id)) {
    list.push({ ...item, savedAt: Date.now() });
    write(list);
  }
  return true;
}

/** Bỏ lưu. Trả về false (không còn được lưu). */
export function removeFavorite(id: string | number): boolean {
  const key = String(id);
  write(read().filter(f => f.id !== key));
  return false;
}

/** Toggle. Trả về trạng thái sau khi toggle. */
export function toggleFavorite(item: Omit<FavoriteHomestay, 'savedAt'>): boolean {
  return isFavorite(item.id) ? removeFavorite(item.id) : addFavorite(item);
}

/** Lắng nghe thay đổi (dùng trong useEffect của trang danh sách/chi tiết). */
export function onFavoritesChange(handler: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(EVENT, handler);
  window.addEventListener('storage', handler);
  return () => {
    window.removeEventListener(EVENT, handler);
    window.removeEventListener('storage', handler);
  };
}
