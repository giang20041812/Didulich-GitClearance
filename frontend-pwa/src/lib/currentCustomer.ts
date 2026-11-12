import type { GoogleLoginResponse } from '@/types/integrations/google-identity';
import { clearPortalSession } from './authInterceptor';

/**
 * Helper phiên đăng nhập ĐỒNG BỘ (đọc localStorage) — tách khỏi services/authService.ts (dùng axios)
 * để Sidebar / CustomerRoute / TravelerRoute / NotificationBell nằm trong bundle chính không kéo
 * axios theo. Chỉ chứa hàm thuần localStorage, không gọi mạng.
 */

export interface CurrentCustomer {
  id?: number;
  fullName: string;
  email: string;
  phone?: string;
  picture?: string | null;
  role: 'TRAVELER' | 'ADMIN' | 'PROVIDER';
}

export const getCurrentPortalCustomer = (): CurrentCustomer | null => {
  if (typeof window === 'undefined') return null;
  const rawPortal = localStorage.getItem('portal_user');
  const portalToken = localStorage.getItem('portal_token');
  if (rawPortal && portalToken) {
    try {
      const parsed = JSON.parse(rawPortal);
      return {
        id: (parsed.id || parsed.accountId) ? Number(parsed.id || parsed.accountId) : undefined,
        fullName: parsed.fullName || '',
        email: parsed.email || '',
        phone: parsed.phone || '',
        picture: parsed.picture || null,
        role: parsed.role || 'PROVIDER',
      };
    } catch {
      // ignore
    }
  }
  return null;
};

/**
 * Lấy thông tin khách hàng đang đăng nhập hiện tại từ localStorage. Phiên khách không tự hết hạn.
 */
export const getCurrentCustomer = (): CurrentCustomer | null => {
  if (typeof window === 'undefined') return null;

  const rawTraveler = localStorage.getItem('traveler_user');
  const travelerToken = localStorage.getItem('traveler_token');
  if (rawTraveler && travelerToken) {
    try {
      const parsed = JSON.parse(rawTraveler);
      return {
        id: parsed.id ? Number(parsed.id) : undefined,
        fullName: parsed.fullName || '',
        email: parsed.email || '',
        phone: parsed.phone || '',
        picture: parsed.picture || null,
        role: 'TRAVELER',
      };
    } catch {
      // ignore
    }
  }

  return getCurrentPortalCustomer();
};

/** Phiên cổng chỉ được điền thử; vẫn chặn nếu trình duyệt còn lưu thêm phiên khách du lịch. */
export const getBookingRestriction = (): string | null => {
  const customer = getCurrentPortalCustomer() ?? getCurrentCustomer();
  if (customer?.role === 'PROVIDER') {
    return 'Tài khoản nhà cung cấp có thể xem và điền thông tin, nhưng không thể xác nhận đặt phòng.';
  }
  if (customer?.role === 'ADMIN') {
    return 'Tài khoản quản trị viên có thể xem và điền thông tin, nhưng không thể xác nhận đặt phòng.';
  }
  return null;
};

/** Lưu phiên khách du lịch (Sidebar đọc traveler_user để hiển thị). */
export const saveTravelerSession = (res: GoogleLoginResponse) => {
  localStorage.setItem('traveler_token', res.token);
  localStorage.setItem(
    'traveler_user',
    JSON.stringify({
      email: res.email,
      fullName: res.fullName,
      phone: res.phone ?? null,
      picture: res.picture ?? null,
    }),
  );
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('auth_change'));
  }
};

/**
 * Đăng xuất đúng phiên đang hiển thị (cùng thứ tự ưu tiên với getCurrentCustomer): còn phiên khách thì chỉ xóa phiên
 * khách — trước đây xóa và thu hồi luôn phiên NCC/Admin trên máy chủ, làm NCC ở mọi thiết bị phải đăng nhập lại.
 */
export const logoutCurrentSession = () => {
  if (localStorage.getItem('traveler_token')) {
    localStorage.removeItem('traveler_token');
    localStorage.removeItem('traveler_user');
  } else {
    clearPortalSession();
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('auth_change'));
  }
};
