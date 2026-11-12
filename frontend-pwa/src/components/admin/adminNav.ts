import {
  Siren,
  Activity,
  Building2,
  CalendarCheck,
  CalendarDays,
  Compass,
  Eye,
  FilePenLine,
  Inbox,
  LayoutDashboard,
  MapPin,
  MessageSquare,
  MapPinned,
  Package,
  ShieldCheck,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import type { AdminCapability } from '@/lib/adminPermissions';

/** Mã mục của cổng quản trị. Cổng dùng trạng thái (không có URL riêng từng mục) nên `key` cũng là mã điều hướng. */
export type AdminTab =
  | 'dashboard'
  | 'sos'
  | 'applications'
  | 'places'
  | 'changes'
  | 'reviews'
  | 'bookings'
  | 'roomCalendar'
  | 'homestayViews'
  | 'activity'
  | 'finance'
  | 'providers'
  | 'accounts'
  | 'admins'
  | 'explorePlaces'
  | 'combos'
  | 'nearbyOffers';

/** Kiểu nhãn cạnh mục: work = số việc cần xử lý (vàng) · fresh = "N mới" (xanh) · soon = "Sắp có" (mục chưa dùng được). */
export type NavBadgeKind = 'work' | 'fresh' | 'soon';

/** Nút tắt hiện khi rê chuột: next = xử lý mục tiếp theo · add = thêm mới · search = tìm kiếm. */
export type NavShortcutKind = 'next' | 'add' | 'search';

export interface NavItemConfig {
  key: AdminTab;
  label: string;
  /** Mô tả ngắn hiển thị ở thanh trên cùng và bảng lệnh. */
  description: string;
  icon: LucideIcon;
  /** Quyền tối thiểu để thấy mục (không nêu = mọi quản trị viên). Backend vẫn kiểm quyền thật. */
  capability?: AdminCapability;
  /** Có nhãn/số đếm cạnh mục hay không (số liệu do trang cha cấp qua `counts`). */
  badge?: NavBadgeKind;
  shortcut?: { kind: NavShortcutKind; label: string; capability?: AdminCapability };
}

export interface NavGroupConfig {
  id: string;
  /** Tiêu đề nhóm trên sidebar; bỏ trống = mục đứng riêng, không có tiêu đề. */
  title?: string;
  /** Tên nhóm ở breadcrumb (thanh trên cùng). */
  breadcrumb: string;
  /** Hiện tổng số việc cạnh tiêu đề nhóm (tổng các nhãn `work`). */
  showTotal?: boolean;
  items: NavItemConfig[];
}

/**
 * Cấu hình menu sidebar — đổi thứ tự nhóm/mục, nhãn, icon, nút tắt hay quyền chỉ cần sửa mảng này.
 * Thứ tự trong mảng chính là thứ tự hiển thị.
 */
export const NAV_GROUPS: NavGroupConfig[] = [
  {
    id: 'overview',
    breadcrumb: 'Tổng quan',
    items: [
      { key: 'dashboard', label: 'Tổng quan', description: 'Chỉ số vận hành, việc cần xử lý và báo cáo đặt phòng.', icon: LayoutDashboard },
    ],
  },
  {
    id: 'attention',
    title: 'Cần xử lý',
    breadcrumb: 'Cần xử lý',
    showTotal: true,
    items: [
      {
        key: 'sos',
        label: 'SOS khẩn cấp',
        description: 'Yêu cầu hỗ trợ khẩn cấp của du khách: gọi, điều phối đầu mối và đóng hồ sơ.',
        icon: Siren,
        badge: 'work',
      },
      {
        key: 'places',
        label: 'Duyệt điểm đến',
        description: 'Duyệt nội dung và kiểm soát hiển thị của điểm đến / homestay.',
        icon: MapPin,
        badge: 'work',
        shortcut: { kind: 'next', label: 'Xử lý mục tiếp theo' },
      },
      {
        key: 'changes',
        label: 'Yêu cầu thay đổi',
        description: 'Thay đổi thông tin homestay, phòng, giá và yêu cầu chuyển NCC do NCC gửi lên, chờ Admin duyệt.',
        icon: FilePenLine,
        capability: 'viewQueues',
        badge: 'work',
        shortcut: { kind: 'next', label: 'Xử lý mục tiếp theo' },
      },
      {
        key: 'applications',
        label: 'Hồ sơ NCC mới',
        description: 'Thẩm định hồ sơ đăng ký của nhà cung cấp: duyệt để cấp tài khoản hoặc từ chối kèm lý do.',
        icon: Inbox,
        capability: 'viewQueues',
        badge: 'work',
        shortcut: { kind: 'next', label: 'Xử lý mục tiếp theo' },
      },
      {
        key: 'reviews',
        label: 'Đánh giá vi phạm',
        description: 'Kiểm duyệt đánh giá và ảnh / lưu bút check-in của khách: giữ nguyên, ẩn hoặc gỡ.',
        icon: MessageSquare,
        shortcut: { kind: 'next', label: 'Xử lý mục tiếp theo' },
      },
    ],
  },
  {
    id: 'manage',
    title: 'Quản lý',
    breadcrumb: 'Quản lý',
    items: [
      {
        key: 'providers',
        label: 'Đối tác / NCC',
        description: 'Danh sách nhà cung cấp đã được duyệt: trạng thái hoạt động và tài khoản đăng nhập.',
        icon: Building2,
        shortcut: { kind: 'add', label: 'Thêm đối tác', capability: 'operate' },
      },
      {
        key: 'accounts',
        label: 'Tài khoản khách',
        description: 'Khách du lịch trên hệ thống; tạo nhanh tài khoản NCC hoặc khách.',
        icon: Users,
        shortcut: { kind: 'search', label: 'Tìm tài khoản khách' },
      },
      {
        key: 'admins',
        label: 'Quản trị viên',
        description: 'Phân cấp quản trị viên (cấp 1–3), tạo tài khoản, khóa / mở khóa và đặt lại mật khẩu.',
        icon: ShieldCheck,
        capability: 'manageAdmins',
        shortcut: { kind: 'add', label: 'Tạo tài khoản quản trị viên', capability: 'manageAdmins' },
      },
      {
        key: 'explorePlaces',
        label: 'Địa điểm khám phá',
        description: 'Địa điểm quanh homestay (ăn uống, tham quan, check-in...): thêm, sửa, xác minh tọa độ, duyệt địa điểm NCC, ghim theo homestay.',
        icon: Compass,
      },
      {
        key: 'combos',
        label: 'Combo',
        description: 'Gói combo (lịch trình, địa điểm, giờ, giá — không gồm ăn uống): tạo, duyệt combo và bản sửa của NCC, yêu cầu đặt của khách.',
        icon: Package,
      },
      {
        key: 'nearbyOffers',
        label: 'Gợi ý quanh đây',
        description: 'Lời mời NCC hiện cho khách ở gần điểm nổi tiếng: xem và ẩn gợi ý vi phạm.',
        icon: MapPinned,
      },
    ],
  },
  {
    id: 'monitor',
    title: 'Theo dõi',
    breadcrumb: 'Theo dõi',
    items: [
      {
        key: 'bookings',
        label: 'Đặt phòng',
        description: 'Giám sát đơn đặt phòng toàn hệ thống; từ cấp 2 xử lý đơn thay NCC (bắt buộc lý do / chứng từ), cấp 3 chỉ xem.',
        icon: CalendarCheck,
        badge: 'fresh',
      },
      {
        key: 'roomCalendar',
        label: 'Lịch phòng trống',
        description: 'Chọn homestay để xem lịch từng phòng (P.1, P.2...) theo tuần, giống Lịch phòng của NCC (chỉ xem).',
        icon: CalendarDays,
      },
      {
        key: 'homestayViews',
        label: 'Lịch sử truy cập homestay',
        description: 'Danh sách tài khoản đã xem homestay và từng tài khoản đã xem những homestay nào, vào lúc nào.',
        icon: Eye,
        capability: 'viewActivity',
      },
      {
        key: 'activity',
        label: 'Hoạt động',
        description: 'Nhật ký hoạt động: ai đã làm gì, lúc nào, kết quả ra sao. Lọc theo vai trò và trạng thái.',
        icon: Activity,
        capability: 'viewActivity',
      },
      {
        key: 'finance',
        label: 'Tài chính',
        description: 'Đối soát doanh thu và hoàn tiền — đang phát triển.',
        icon: Wallet,
        capability: 'finance',
        badge: 'soon',
      },
    ],
  },
];

export interface NavMeta extends NavItemConfig {
  /** Tên nhóm ở breadcrumb. */
  breadcrumb: string;
}

/** Tra nhanh cấu hình theo mã mục (dùng cho tiêu đề trang, breadcrumb, bảng lệnh). */
export const NAV_META = Object.fromEntries(
  NAV_GROUPS.flatMap((g) => g.items.map((item) => [item.key, { ...item, breadcrumb: g.breadcrumb }] as const)),
) as Record<AdminTab, NavMeta>;
