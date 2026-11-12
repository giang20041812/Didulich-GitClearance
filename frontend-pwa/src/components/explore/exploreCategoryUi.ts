import { Bus, Camera, Compass, Mountain, Utensils, type LucideIcon } from 'lucide-react';
import type { ExploreCategory } from '@/types/explore';

/**
 * Tên và biểu tượng danh mục "Xung quanh homestay" hiển thị cho khách. Backend vẫn trả nhãn gốc (Ăn uống, Tham quan…)
 * mà trang quản trị / NCC đang dùng; phía khách gọi theo cách khách tìm ("nhà hàng", "điểm check-in"). Biểu tượng trùng
 * mục điều hướng cùng nghĩa (Nhà hàng, Văn hóa, Di chuyển).
 */
export const EXPLORE_CATEGORY_UI: Record<ExploreCategory, { label: string; Icon: LucideIcon }> = {
  FOOD: { label: 'Nhà hàng & quán ăn', Icon: Utensils },
  SIGHTSEEING: { label: 'Điểm tham quan', Icon: Mountain },
  CHECKIN: { label: 'Điểm check-in', Icon: Camera },
  EXPERIENCE: { label: 'Trải nghiệm', Icon: Compass },
  LOCAL_SERVICE: { label: 'Thuê xe & dịch vụ', Icon: Bus },
};
