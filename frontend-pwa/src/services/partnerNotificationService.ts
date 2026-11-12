import { partnerGet } from '@/lib/partnerGet';
import axios from 'axios';
import type { AdminNotificationFeed } from '../types/admin';
import type { ChangeRequestSummary } from '@/types/changeRequest';
import type { PushApi } from '@/lib/adminPush';

const API_BASE = '/api/v1/partner/notifications';

const authHeaders = () => {
  const token = localStorage.getItem('portal_token');
  return { headers: token ? { Authorization: `Bearer ${token}` } : {} };
};

/**
 * Thông báo của tài khoản NCC đang đăng nhập (đơn mới, khách sửa / hủy đơn, Admin xử lý đơn) — cùng dạng với hộp thông
 * báo Admin — và đăng ký thông báo đẩy ra màn hình cho thiết bị NCC.
 */
/** Chuông thông báo NCC: thông báo đơn + yêu cầu chỉnh sửa gần nhất (changes = null khi phần đó lỗi). */
export interface PartnerInbox { feed: AdminNotificationFeed; changes: ChangeRequestSummary[] | null }

export const partnerNotificationService: PushApi & {
  getFeed(): Promise<AdminNotificationFeed>;
  getInbox(): Promise<PartnerInbox>;
  markRead(id: number): Promise<void>;
  markAllRead(): Promise<void>;
  testPush(): Promise<number>;
} = {
  async getFeed() {
    return partnerGet<AdminNotificationFeed>(API_BASE, authHeaders());
  },
  /** Một lượt gọi cho cả chuông (trước đây 2: feed + change-requests); ưu tiên thấp vì làm mới nền mỗi 20 giây. */
  async getInbox() {
    return partnerGet<PartnerInbox>(`${API_BASE}/inbox`, { ...authHeaders(), apiPriority: 'low' });
  },
  async markRead(id) {
    await axios.post(`${API_BASE}/${id}/read`, null, authHeaders());
  },
  async markAllRead() {
    await axios.post(`${API_BASE}/read-all`, null, authHeaders());
  },
  async getPushPublicKey() {
    const res = await axios.get<{ publicKey: string }>(`${API_BASE}/push/public-key`, authHeaders());
    return res.data.publicKey;
  },
  async subscribePush(subscription) {
    await axios.post(`${API_BASE}/push/subscribe`, subscription, authHeaders());
  },
  async unsubscribePush(endpoint) {
    await axios.post(`${API_BASE}/push/unsubscribe`, { endpoint }, authHeaders());
  },
  async testPush() {
    const res = await axios.post<{ delivered: number }>(`${API_BASE}/push/test`, null, authHeaders());
    return res.data.delivered;
  },
};
