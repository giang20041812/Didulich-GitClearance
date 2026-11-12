import { useSyncExternalStore } from 'react';

/**
 * Thanh tìm kiếm thu gọn nằm TRONG header (kiểu Airbnb): khi khối tìm kiếm của SearchHub trên trang cuộn khuất dưới
 * header, SearchHub đưa ô tìm kiếm nhỏ vào ô trống giữa header (portal) thay vì dựng thêm một thanh dính thứ hai.
 * Header đăng ký ô trống (slot) và đọc cờ "compact" để ẩn menu giữa / hàng menu điện thoại khi ô tìm kiếm chiếm chỗ.
 */
let slot: HTMLElement | null = null;
let compact = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};

/** Header gắn/gỡ ô chứa thanh tìm kiếm thu gọn (dùng làm callback ref). */
export function setHeaderSearchSlot(el: HTMLElement | null) {
  if (slot === el) return;
  slot = el;
  emit();
}

/** SearchHub báo khối tìm kiếm trên trang đã khuất dưới header (true) hay đang hiện (false). */
export function setHeaderSearchCompact(value: boolean) {
  if (compact === value) return;
  compact = value;
  emit();
}

/** Ô chứa thanh tìm kiếm thu gọn trong header, null khi header chưa gắn. */
export function useHeaderSearchSlot(): HTMLElement | null {
  return useSyncExternalStore(subscribe, () => slot, () => null);
}

/** true khi header đang hiển thị thanh tìm kiếm thu gọn thay cho menu giữa. */
export function useHeaderSearchCompact(): boolean {
  return useSyncExternalStore(subscribe, () => compact, () => false);
}
