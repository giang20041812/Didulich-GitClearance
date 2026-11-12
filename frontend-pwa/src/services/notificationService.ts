import type { CustomerNotification } from '@/types/notification';
import { apiOrigin } from '@/lib/apiBase';
import { endTravelerSession } from '@/lib/travelerSession';

const READ_NOTIFICATION_IDS_KEY = 'user_read_notification_ids';

function getSessionToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('traveler_token') || localStorage.getItem('portal_token');
}

export function getLocalReadNotificationIds(): Set<number> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(READ_NOTIFICATION_IDS_KEY);
    return raw ? new Set(JSON.parse(raw) as number[]) : new Set();
  } catch {
    return new Set();
  }
}

export function saveLocalReadNotificationId(id: number): void {
  if (typeof window === 'undefined') return;
  try {
    const set = getLocalReadNotificationIds();
    set.add(id);
    localStorage.setItem(READ_NOTIFICATION_IDS_KEY, JSON.stringify(Array.from(set)));
  } catch (err) {
    console.warn('Lỗi lưu id thông báo đã đọc:', err);
  }
}

/**
 * Thông báo của người đang đăng nhập. Backend xác định người nhận từ JWT nên không gửi email / SĐT / accountId
 * trên URL (tránh ghi dữ liệu cá nhân vào log của CDN và máy chủ); chưa đăng nhập thì không gọi.
 */
export async function fetchCustomerNotifications(): Promise<CustomerNotification[]> {
  try {
    const token = getSessionToken();
    if (!token) return [];
    const url = new URL('/api/public/notifications', apiOrigin());

    // Ưu tiên thấp: chuông thông báo hỏi định kỳ, không chen trước nội dung trang (lib/requestQueue).
    const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` }, priority: 'low' });
    if (res.status === 401 || res.status === 403) {
      // Token cũ/bị khóa không được retry liên tục bởi NotificationBell polling.
      if (typeof window !== 'undefined') {
        if (localStorage.getItem('traveler_token') === token) {
          // Phiên khách hết hạn / bị từ chối: TravelerRoute nghe auth_change và chuyển về đăng nhập kèm lý do.
          endTravelerSession(token);
        }
        if (localStorage.getItem('portal_token') === token) {
          localStorage.removeItem('portal_token');
          localStorage.removeItem('portal_user');
        }
        window.dispatchEvent(new Event('auth_change'));
      }
      return [];
    }
    if (!res.ok) {
      return [];
    }
    const list = (await res.json()) as CustomerNotification[];
    const readIds = getLocalReadNotificationIds();

    return list.map((item) => ({
      ...item,
      isRead: item.isRead || readIds.has(item.id),
    }));
  } catch (error) {
    console.warn('Không thể nạp thông báo từ server:', error);
    return [];
  }
}

export async function markNotificationAsRead(id: number): Promise<void> {
  saveLocalReadNotificationId(id);
  window.dispatchEvent(new CustomEvent('notification_change', { detail: { id, isRead: true } }));

  try {
    const url = new URL(`/api/public/notifications/${id}/read`, apiOrigin());
    const token = getSessionToken();
    await fetch(url.toString(), { method: 'PUT', headers: token ? { Authorization: `Bearer ${token}` } : undefined });
  } catch (err) {
    console.warn('Lỗi đồng bộ trạng thái đọc lên server:', err);
  }
}

export async function markAllNotificationsAsRead(params: {
  email?: string;
  phone?: string;
  accountId?: number;
  notificationIds?: number[];
}): Promise<void> {
  if (params.notificationIds && params.notificationIds.length > 0) {
    const set = getLocalReadNotificationIds();
    params.notificationIds.forEach((id) => set.add(id));
    if (typeof window !== 'undefined') {
      localStorage.setItem(READ_NOTIFICATION_IDS_KEY, JSON.stringify(Array.from(set)));
    }
  }

  window.dispatchEvent(new CustomEvent('notification_change', { detail: { allRead: true } }));

  try {
    const url = new URL('/api/public/notifications/mark-all-read', apiOrigin());
    const token = getSessionToken();
    await fetch(url.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({
        email: params.email,
        phone: params.phone,
        accountId: params.accountId,
      }),
    });
  } catch (err) {
    console.warn('Lỗi đánh dấu tất cả thông báo là đã đọc:', err);
  }
}
