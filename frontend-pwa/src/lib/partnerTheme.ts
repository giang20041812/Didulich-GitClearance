import {
  BarChart3, BedDouble, Bus, CalendarCheck, CalendarDays, Compass, Home, LayoutDashboard, MapPinned, Mountain, Package,
  Route, Star, type LucideIcon,
} from 'lucide-react';
import { providerServiceByType } from '@/components/layout/providerServices';
import type { ProviderServiceType } from '@/types/partner';

export interface PartnerNavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
}

export interface PartnerNavGroup {
  title: string;
  items: PartnerNavItem[];
}

export interface PartnerTheme {
  type: ProviderServiceType;
  /** Tên không gian làm việc hiện dưới logo. */
  workspace: string;
  /** Câu mô tả công việc chính của loại hình (đầu trang tổng quan). */
  tagline: string;
  image: string;
  label: string;
  /** Biểu tượng nét đại diện (đầu trang, nhãn nhỏ). */
  Icon: LucideIcon;
  groups: (pathname: string) => PartnerNavGroup[];
}

/**
 * Giao diện cổng đối tác theo loại hình. Màu chủ đạo do data-partner-type trên khung cổng quyết định (globals.css):
 * Homestay xanh lúa, Nhà xe xanh chàm, Trải nghiệm đỏ đất. Menu nhóm theo việc của từng loại.
 */
const THEMES: Record<ProviderServiceType, Omit<PartnerTheme, 'image' | 'label'>> = {
  HOMESTAY: {
    type: 'HOMESTAY',
    workspace: 'Không gian chủ homestay',
    tagline: 'Lịch phòng, đơn đặt và giá phòng của bạn',
    Icon: BedDouble,
    groups: (pathname) => {
      const match = pathname.match(/^\/partner\/homestay\/(\d+)/);
      const roomsPath = match ? `/partner/homestay/${match[1]}/rooms` : '/partner/rooms';
      return [
        {
          title: 'Hằng ngày',
          items: [
            { to: '/partner', label: 'Lịch phòng', icon: CalendarCheck, end: true },
            { to: '/partner/bookings', label: 'Đơn đặt phòng', icon: CalendarDays },
            { to: roomsPath, label: 'Loại phòng & giá', icon: BedDouble },
          ],
        },
        {
          title: 'Cơ sở của tôi',
          items: [
            { to: '/partner/homestays', label: 'Homestay của tôi', icon: Home },
            { to: '/partner/explore-places', label: 'Địa điểm quanh nhà', icon: Compass },
          ],
        },
        {
          title: 'Bán thêm',
          items: [
            { to: '/partner/combos', label: 'Combo', icon: Package },
            { to: '/partner/nearby', label: 'Gợi ý quanh đây', icon: MapPinned },
          ],
        },
        {
          title: 'Kết quả',
          items: [
            { to: '/partner/overview', label: 'Tổng quan', icon: BarChart3 },
            { to: '/partner/reviews', label: 'Đánh giá của khách', icon: Star },
          ],
        },
      ];
    },
  },
  TRANSPORT: {
    type: 'TRANSPORT',
    workspace: 'Không gian nhà xe',
    tagline: 'Tuyến xe, giờ chạy và giá vé của bạn',
    Icon: Bus,
    groups: () => [
      {
        title: 'Điều hành',
        items: [
          { to: '/partner/services', label: 'Bảng điều hành', icon: LayoutDashboard },
          { to: '/partner/listings', label: 'Tuyến xe & dịch vụ', icon: Route },
        ],
      },
      {
        title: 'Bán thêm',
        items: [
          { to: '/partner/combos', label: 'Combo', icon: Package },
          { to: '/partner/nearby', label: 'Gợi ý quanh đây', icon: MapPinned },
        ],
      },
    ],
  },
  EXPERIENCE: {
    type: 'EXPERIENCE',
    workspace: 'Không gian trải nghiệm',
    tagline: 'Các trải nghiệm, lịch hẹn và đoàn khách của bạn',
    Icon: Mountain,
    groups: () => [
      {
        title: 'Trải nghiệm',
        items: [
          { to: '/partner/services', label: 'Tổng quan', icon: LayoutDashboard },
          { to: '/partner/listings', label: 'Trải nghiệm của tôi', icon: Mountain },
        ],
      },
      {
        title: 'Bán thêm',
        items: [
          { to: '/partner/combos', label: 'Combo', icon: Package },
          { to: '/partner/nearby', label: 'Gợi ý quanh đây', icon: MapPinned },
        ],
      },
    ],
  },
};

export function partnerTheme(type: ProviderServiceType): PartnerTheme {
  const option = providerServiceByType(type);
  return { ...THEMES[type], image: option.image, label: option.label };
}
