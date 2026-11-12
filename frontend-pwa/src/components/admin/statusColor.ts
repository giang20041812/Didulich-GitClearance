import type { StatusTone } from './StatusBadge';

/**
 * Màu trạng thái thống nhất trên mọi trang quản trị (dùng cho tab, chấm màu và huy hiệu ở cột "Trạng thái"):
 *  xanh = Thành công / Hoạt động / Đã duyệt / Đã xác nhận · đỏ = Thất bại / Bị khóa / Đã từ chối
 *  vàng = Chờ duyệt / Chờ xử lý / Bị từ chối (truy cập) · xám = Đã hủy / Hoàn thành / Đã xử lý · lam = Mới
 */
export const STATUS_COLOR = {
  green: 'success',
  red: 'danger',
  yellow: 'warning',
  gray: 'neutral',
  blue: 'info',
} as const satisfies Record<string, StatusTone>;
