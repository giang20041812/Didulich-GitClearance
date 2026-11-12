import { partnerGet } from '@/lib/partnerGet';
import type { SubmittedChange, ChangeRequestSummary } from '@/types/changeRequest';

/** Backend trả 202 + SubmittedChange khi thay đổi của NCC được gửi chờ duyệt thay vì ghi trực tiếp. */
export function isSubmittedChange(value: unknown): value is SubmittedChange {
  return typeof value === 'object' && value !== null && 'changeRequestId' in value && 'status' in value;
}

/** priority 'low' khi chỉ để gắn nhãn "đang chờ duyệt" / danh sách phụ: nhường request chính của trang. */
export async function fetchPartnerChangeRequests(status?: string, page = 0, size = 10, priority: 'high' | 'low' = 'high'): Promise<{ content: ChangeRequestSummary[], totalElements: number, totalPages: number }> {
  const token = localStorage.getItem('portal_token');
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  return partnerGet('/api/v1/partner/change-requests', { headers, params: { status, page, size }, apiPriority: priority });
}
