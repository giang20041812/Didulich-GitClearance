import type { StatusTone } from './StatusBadge';

/** Nhãn tiếng Việt cho các mã hành động ghi trong audit_log (khớp chuỗi action ở các service backend). */
export const AUDIT_ACTION: Record<string, { label: string; tone: StatusTone }> = {
  CREATE_ADMIN_ACCOUNT: { label: 'Tạo tài khoản quản trị', tone: 'brand' },
  UPDATE_ACCOUNT: { label: 'Cập nhật hồ sơ tài khoản', tone: 'info' },
  UPDATE_ACCOUNT_STATUS: { label: 'Đổi trạng thái tài khoản', tone: 'warning' },
  RESET_PASSWORD: { label: 'Đặt lại mật khẩu', tone: 'warning' },
  CREATE_TRAVELER: { label: 'Tạo tài khoản khách', tone: 'brand' },
  UPDATE_TRAVELER_STATUS: { label: 'Đổi trạng thái khách', tone: 'warning' },
  CREATE_PROVIDER: { label: 'Tạo đối tác NCC', tone: 'brand' },
  UPDATE_PROVIDER: { label: 'Cập nhật đối tác NCC', tone: 'info' },
  UPDATE_PROVIDER_STATUS: { label: 'Đổi trạng thái đối tác', tone: 'warning' },
  UPDATE_PLACE_VERIFICATION: { label: 'Kiểm duyệt điểm đến', tone: 'success' },
  UPDATE_PLACE_VISIBILITY: { label: 'Đổi hiển thị điểm đến', tone: 'info' },
  UPDATE_PLACE_DATA_VERIFIED: { label: 'Xác thực dữ liệu điểm đến', tone: 'success' },
  REFUND_APPROVED: { label: 'Duyệt hoàn tiền', tone: 'success' },
  REFUND_REJECTED: { label: 'Từ chối hoàn tiền', tone: 'danger' },
  AFFILIATE_LINK_CREATED: { label: 'Tạo liên kết affiliate', tone: 'brand' },
  AFFILIATE_LINK_DEACTIVATED: { label: 'Vô hiệu liên kết affiliate', tone: 'neutral' },
  SOS_DISPATCHED: { label: 'Điều phối yêu cầu SOS', tone: 'danger' },
  SOS_RESOLVED: { label: 'Hoàn tất yêu cầu SOS', tone: 'success' },
  SOS_CANCELLED: { label: 'Hủy yêu cầu SOS', tone: 'neutral' },
  EMERGENCY_CONTACT_CREATED: { label: 'Thêm đầu mối khẩn cấp', tone: 'info' },
  EMERGENCY_CONTACT_UPDATED: { label: 'Cập nhật đầu mối khẩn cấp', tone: 'info' },
  EMERGENCY_CONTACT_DELETED: { label: 'Xóa đầu mối khẩn cấp', tone: 'neutral' },
  BOOKING_MONITOR_VERIFICATION: { label: 'Ghi nhận xác minh đơn', tone: 'info' },
  BOOKING_MONITOR_OUTCOME: { label: 'Ghi nhận kết quả giám sát', tone: 'brand' },
  UPDATE_ACCOUNT_ROLE: { label: 'Đổi quyền tài khoản', tone: 'warning' },
  UPDATE_ADMIN_LEVEL: { label: 'Đổi cấp quản trị viên', tone: 'warning' },
  DELETE_PLACE: { label: 'Xóa điểm đến', tone: 'danger' },
  LOGIN_SUCCESS: { label: 'Đăng nhập', tone: 'success' },
  HOMESTAY_VIEW: { label: 'Khách xem homestay', tone: 'info' },
  LOGIN_FAILED: { label: 'Đăng nhập thất bại', tone: 'danger' },
  LOGIN_BLOCKED: { label: 'Đăng nhập bị chặn', tone: 'warning' },
  LOGOUT: { label: 'Đăng xuất', tone: 'neutral' },
  ACCESS_DENIED: { label: 'Bị từ chối truy cập', tone: 'danger' },
  CHANGE_REQUEST_APPROVED: { label: 'Duyệt thay đổi của NCC', tone: 'success' },
  CHANGE_REQUEST_REJECTED: { label: 'Từ chối thay đổi của NCC', tone: 'danger' },
  PROVIDER_APPLICATION_APPROVED: { label: 'Duyệt hồ sơ NCC', tone: 'success' },
  PROVIDER_APPLICATION_REJECTED: { label: 'Từ chối hồ sơ NCC', tone: 'danger' },
  PROVIDER_APPLICATION_REOPENED: { label: 'Xem xét lại hồ sơ NCC', tone: 'info' },
  CHANGE_REQUEST_REOPENED: { label: 'Xem xét lại thay đổi của NCC', tone: 'info' },
  ACCOUNT_DELETED: { label: 'Xóa tài khoản', tone: 'danger' },
  TRAVELER_DELETED: { label: 'Xóa tài khoản khách', tone: 'danger' },
  REVIEW_KEPT: { label: 'Giữ nguyên đánh giá', tone: 'success' },
  REVIEW_HIDDEN: { label: 'Ẩn đánh giá', tone: 'warning' },
  REVIEW_REMOVED: { label: 'Gỡ đánh giá', tone: 'danger' },
  REVIEW_RESTORED: { label: 'Khôi phục đánh giá', tone: 'info' },
  EXPLORE_PLACE_CREATED: { label: 'Thêm địa điểm khám phá', tone: 'success' },
  EXPLORE_PLACE_UPDATED: { label: 'Sửa địa điểm khám phá', tone: 'info' },
  EXPLORE_PLACE_SHOWN: { label: 'Hiển thị địa điểm khám phá', tone: 'success' },
  EXPLORE_PLACE_HIDDEN: { label: 'Ẩn địa điểm khám phá', tone: 'warning' },
  EXPLORE_PLACE_APPROVED: { label: 'Duyệt địa điểm của NCC', tone: 'success' },
  EXPLORE_PLACE_REJECTED: { label: 'Từ chối địa điểm của NCC', tone: 'danger' },
  EXPLORE_PLACE_EDIT_APPROVED: { label: 'Duyệt thay đổi địa điểm', tone: 'success' },
  EXPLORE_PLACE_EDIT_REJECTED: { label: 'Từ chối thay đổi địa điểm', tone: 'danger' },
  EXPLORE_COORD_VERIFIED: { label: 'Xác minh tọa độ địa điểm', tone: 'success' },
  EXPLORE_COORD_UNVERIFIED: { label: 'Bỏ xác minh tọa độ', tone: 'warning' },
  EXPLORE_COORD_VERIFIED_BULK: { label: 'Xác minh tọa độ hàng loạt', tone: 'success' },
  EXPLORE_PIN_ADDED: { label: 'Ghim địa điểm cho homestay', tone: 'info' },
  EXPLORE_PIN_REMOVED: { label: 'Bỏ ghim địa điểm', tone: 'neutral' },
  EXPLORE_PIN_REORDERED: { label: 'Sắp thứ tự ghim', tone: 'info' },
  EXPLORE_RADIUS_UPDATED: { label: 'Đổi bán kính khám phá', tone: 'info' },
};

export const AUDIT_ENTITY: Record<string, string> = {
  Account: 'Tài khoản',
  Traveler: 'Khách',
  Provider: 'Đối tác',
  Place: 'Điểm đến',
  Booking: 'Đơn',
  Refund: 'Hoàn tiền',
  AffiliateLink: 'Affiliate',
  SosRequest: 'SOS',
  EmergencyContact: 'Đầu mối',
  ChangeRequest: 'Yêu cầu thay đổi',
  ProviderApplication: 'Hồ sơ NCC',
  Review: 'Đánh giá',
  ExploreSetting: 'Cấu hình khám phá',
  Endpoint: 'API',
};

export function timeAgo(iso: string, now: number = Date.now()): string {
  const diff = Math.max(0, now - new Date(iso).getTime());
  const m = Math.floor(diff / 60_000);
  if (m < 1) return 'vừa xong';
  if (m < 60) return `${m} phút trước`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} giờ trước`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d} ngày trước`;
  return new Date(iso).toLocaleDateString('vi-VN');
}
