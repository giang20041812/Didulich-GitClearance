/** Thẻ gọn (CompactPlaceCard) của trang chủ và các trang danh sách: lưới và định dạng giá. */

/**
 * Lưới thẻ danh sách: trang có cột bộ lọc bên trái / trang toàn chiều ngang.
 * Bố cục 3 cột (grid-cols-3) trên máy tính/laptop (lg), 2 cột trên tablet (sm/md), 1 cột trên mobile.
 * `_COLS` là phần cột/khoảng cách (không kèm `grid`) cho FramerSwipeCardStack.
 */
export const COMPACT_GRID_WITH_SIDEBAR_COLS = 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-4';
export const COMPACT_GRID_WITH_SIDEBAR = `grid ${COMPACT_GRID_WITH_SIDEBAR_COLS}`;
export const COMPACT_GRID_FULL = 'grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4 lg:grid-cols-4';

/** Định dạng giá VNĐ; 0 / thiếu trả về fallback. */
export function formatVnd(value: number | null | undefined, fallback: string | null = null): string | null {
  return value != null && value > 0 ? `${value.toLocaleString('vi-VN')}đ` : fallback;
}
