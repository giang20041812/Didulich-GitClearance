import type { ProviderServiceType } from '@/types/partner';

/**
 * Loại hình của NCC đang đăng nhập cổng đối tác (lưu trong phiên portal_user lúc đăng nhập). Phiên đăng nhập trước khi có
 * loại hình thì coi là Homestay như dữ liệu cũ. Homestay dùng công cụ phòng / lịch / đơn; nhà xe và trải nghiệm dùng
 * "Dịch vụ của tôi".
 */
export function portalServiceType(): ProviderServiceType {
  try {
    const raw = localStorage.getItem('portal_user');
    const type = raw ? (JSON.parse(raw) as { provider?: { serviceType?: ProviderServiceType } }).provider?.serviceType : undefined;
    return type === 'EXPERIENCE' || type === 'TRANSPORT' ? type : 'HOMESTAY';
  } catch {
    return 'HOMESTAY';
  }
}

export const isServicePartner = () => portalServiceType() !== 'HOMESTAY';
