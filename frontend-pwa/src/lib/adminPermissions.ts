import type { AdminLevel } from '@/types/admin';

/**
 * Phân quyền theo cấp quản trị viên. Giao diện chỉ ẩn/hiện chức năng cho gọn; quyền thật do backend kiểm ở
 * SecurityConfig (cấp thấp hơn gọi API vượt quyền sẽ bị 403).
 *
 * Cấp 1 = toàn quyền · Cấp 2 = vận hành · Cấp 3 = giám sát (xem + kiểm duyệt đánh giá).
 */
export type AdminCapability =
  /** Duyệt / từ chối / xử lý: hồ sơ NCC, điểm đến, yêu cầu thay đổi, khóa khách, đình chỉ NCC... */
  | 'operate'
  /** Xem hàng đợi hồ sơ NCC và yêu cầu thay đổi (chứa thông tin liên hệ của NCC). */
  | 'viewQueues'
  /** Xem nhật ký hoạt động toàn hệ thống. */
  | 'viewActivity'
  /** Xóa điểm đến. */
  | 'deletePlaces'
  /** Tạo / đổi cấp / khóa tài khoản quản trị viên. */
  | 'manageAdmins'
  /** Tài chính, hoàn tiền. */
  | 'finance';

/** Cấp thấp nhất (số lớn nhất) vẫn được dùng chức năng. */
const MAX_LEVEL: Record<AdminCapability, AdminLevel> = {
  operate: 2,
  viewQueues: 2,
  viewActivity: 2,
  deletePlaces: 1,
  manageAdmins: 1,
  finance: 1,
};

export const levelCan = (level: AdminLevel, capability: AdminCapability): boolean => level <= MAX_LEVEL[capability];

export const ADMIN_LEVELS: AdminLevel[] = [1, 2, 3];

export const LEVEL_META: Record<AdminLevel, { label: string; role: string; description: string; capabilities: string[] }> = {
  1: {
    label: 'Cấp 1',
    role: 'Quản trị cao nhất',
    description: 'Toàn quyền hệ thống, kể cả quản lý tài khoản quản trị viên.',
    capabilities: ['Mọi chức năng của cấp 2 và 3', 'Tạo, đổi cấp, khóa tài khoản quản trị viên', 'Xóa điểm đến', 'Tài chính và hoàn tiền'],
  },
  2: {
    label: 'Cấp 2',
    role: 'Vận hành',
    description: 'Xử lý công việc hằng ngày, không quản lý quản trị viên hay tài chính.',
    capabilities: ['Duyệt / từ chối hồ sơ NCC, điểm đến, yêu cầu thay đổi', 'Xử lý đơn đặt phòng thay NCC (bắt buộc lý do / chứng từ)', 'Đình chỉ NCC, khóa khách du lịch', 'Xem nhật ký hoạt động'],
  },
  3: {
    label: 'Cấp 3',
    role: 'Giám sát',
    description: 'Ít quyền nhất: chủ yếu xem số liệu và kiểm duyệt đánh giá.',
    capabilities: ['Xem tổng quan, báo cáo, đặt phòng', 'Xem điểm đến, đối tác, khách (chỉ đọc)', 'Kiểm duyệt đánh giá, ghi nhận giám sát đặt phòng'],
  },
};

/** Chuẩn hóa giá trị cấp từ API/localStorage; thiếu hoặc lạ thì coi là cấp thấp nhất (an toàn). */
export function toAdminLevel(value: unknown): AdminLevel {
  return value === 1 || value === 2 || value === 3 ? value : 3;
}
