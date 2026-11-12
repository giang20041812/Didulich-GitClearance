import { Bike, Bus, Camera, ConciergeBell, Home, Landmark, MapPinned, Mountain, UtensilsCrossed, type LucideIcon } from 'lucide-react';
import type { CategoryKind, PlaceVerificationStatus, PlaceVisibility } from '@/types/admin';
import type { StatusTone } from './StatusBadge';

/** Nhãn tiếng Việt + icon + màu cho loại hình điểm đến — dùng chung cho bộ lọc, bảng và ngăn xem nhanh. */
export type KindMeta = { label: string; icon: LucideIcon; tone: string };

export const KIND_META: Record<CategoryKind, KindMeta> = {
  HOMESTAY: { label: 'Homestay', icon: Home, tone: 'bg-primary-50 text-primary' },
  RESTAURANT: { label: 'Nhà hàng', icon: UtensilsCrossed, tone: 'bg-coral-light text-coral-hover' },
  ATTRACTION: { label: 'Điểm tham quan', icon: Mountain, tone: 'bg-accent/10 text-primary-700' },
  PHOTO: { label: 'Chụp ảnh & trang phục', icon: Camera, tone: 'bg-secondary/10 text-secondary-700' },
  RENTAL: { label: 'Cho thuê xe & lều', icon: Bike, tone: 'bg-sun/15 text-amber-700' },
  TRANSPORT: { label: 'Vận chuyển', icon: Bus, tone: 'bg-muted/10 text-ink' },
  SERVICE: { label: 'Dịch vụ', icon: ConciergeBell, tone: 'bg-secondary/10 text-secondary-700' },
  CULTURE: { label: 'Văn hóa', icon: Landmark, tone: 'bg-sun/15 text-amber-700' },
};

/** Tra an toàn: backend thêm loại mới thì vẫn hiển thị được, không làm hỏng cả bảng. */
export function kindMeta(kind: string | null | undefined): KindMeta {
  return (kind && (KIND_META as Record<string, KindMeta | undefined>)[kind]) || { label: kind || 'Khác', icon: MapPinned, tone: 'bg-canvas text-muted' };
}

export const VERIFICATION_LABEL: Record<PlaceVerificationStatus, string> = {
  UNVERIFIED: 'Chờ duyệt',
  VERIFIED: 'Đã duyệt',
  NEEDS_UPDATE: 'Cần bổ sung',
  ARCHIVED: 'Lưu trữ',
};

export const VERIFICATION_TONE: Record<PlaceVerificationStatus, StatusTone> = {
  UNVERIFIED: 'warning',
  VERIFIED: 'success',
  NEEDS_UPDATE: 'info',
  ARCHIVED: 'neutral',
};

/** Cờ "dữ liệu đã xác thực" (place.dataVerified): bật = chính thống, tắt = dữ liệu mới nhập chưa kiểm chứng. */
export const DATA_VERIFIED_LABEL = { true: 'Đã xác thực', false: 'Chưa xác thực' } as const;
export const DATA_VERIFIED_TONE: Record<'true' | 'false', StatusTone> = { true: 'success', false: 'warning' };

export const VISIBILITY_LABEL: Record<PlaceVisibility, string> = {
  PUBLISHED: 'Công khai',
  UNPUBLISHED: 'Đã ẩn',
  DRAFT: 'Bản nháp',
};

export const VISIBILITY_TONE: Record<PlaceVisibility, StatusTone> = {
  PUBLISHED: 'success',
  UNPUBLISHED: 'neutral',
  DRAFT: 'warning',
};
