import { apiOrigin } from '@/lib/apiBase';
import type { ComboCard, ComboDetail, ComboRequestInput } from '@/types/combo';
import type { NearbySuggestions } from '@/types/nearby';
import type { FieldError } from '@/types/user';

/**
 * API phía khách cho combo, "Gợi ý quanh đây" và bổ sung số điện thoại — dùng fetch (trang khách không tải axios).
 * Lỗi ném {@link ApiError} có message tiếng Việt từ máy chủ và lỗi từng ô (fieldErrors) nếu có.
 */
export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly fieldErrors: FieldError[] = []) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit & { auth?: boolean }): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (init?.body) headers['Content-Type'] = 'application/json';
  const token = localStorage.getItem('traveler_token');
  if (init?.auth !== false && token) headers.Authorization = `Bearer ${token}`;
  let res: Response;
  try {
    res = await fetch(new URL(path, apiOrigin()).toString(), { ...init, headers: { ...headers, ...(init?.headers as Record<string, string> | undefined) } });
  } catch {
    throw new ApiError('Không kết nối được máy chủ. Vui lòng kiểm tra mạng.', 0);
  }
  const body: unknown = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) {
    const data = (body ?? {}) as { message?: unknown; fieldErrors?: unknown };
    const fieldErrors = Array.isArray(data.fieldErrors)
      ? data.fieldErrors.filter((f): f is FieldError => !!f && typeof f === 'object' && typeof (f as FieldError).field === 'string')
      : [];
    throw new ApiError(typeof data.message === 'string' && data.message ? data.message : 'Có lỗi xảy ra, vui lòng thử lại.', res.status, fieldErrors);
  }
  return body as T;
}

export const publicComboApi = {
  list: () => request<ComboCard[]>('/api/public/combos', { auth: false }),
  detail: (slug: string) => request<ComboDetail>(`/api/public/combos/${encodeURIComponent(slug)}`, { auth: false }),
  /** Gửi kèm phiên khách (nếu có) để yêu cầu gắn với tài khoản. */
  request: (slug: string, input: ComboRequestInput) =>
    request<{ id: number; message: string }>(`/api/public/combos/${encodeURIComponent(slug)}/requests`, { method: 'POST', body: JSON.stringify(input) }),
};

export const fetchNearbySuggestions = () => request<NearbySuggestions>('/api/public/nearby-suggestions', { auth: false });

export interface TravelerProfile {
  email: string | null;
  fullName: string | null;
  picture: string | null;
  phone: string | null;
  phoneRequired: boolean;
}

export const travelerAccountApi = {
  me: () => request<TravelerProfile>('/api/v1/traveler/account/me'),
  addPhone: (phone: string) =>
    request<{ token: string; email: string; fullName: string; picture: string | null; phone: string }>(
      '/api/v1/traveler/account/phone', { method: 'PUT', body: JSON.stringify({ phone }) }),
};
