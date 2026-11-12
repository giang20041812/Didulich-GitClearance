/**
 * sosService.ts — API calls cho module SOS cứu hộ.
 * Admin endpoints: yêu cầu Bearer token.
 * Public endpoint: không cần auth.
 */

import type {
  SosRequestDto,
  SosRequestListResponse,
  DispatchSosRequest,
  EmergencyContactDto,
  CreateEmergencyContactRequest,
  UpdateEmergencyContactRequest,
  PublicSosSubmitRequest,
  PublicSosSubmitResponse,
} from '../types/sos';
import { apiOrigin } from '@/lib/apiBase';

const API_BASE = '/api/v1/admin';
const PUBLIC_BASE = '/api/public';

function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem('auth_token');
  return token
    ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
    : { 'Content-Type': 'application/json' };
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let message = `Lỗi HTTP ${response.status}`;
    try {
      const body = await response.json() as { message?: string; error?: string };
      message = body.message ?? body.error ?? message;
    } catch {
      // ignore parse error
    }
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}

// ─────────────────────────────────────────────
// SOS Requests (Admin)
// ─────────────────────────────────────────────

/**
 * Lấy danh sách SOS requests.
 * @param status lọc theo trạng thái (tuỳ chọn)
 */
export async function getSosRequests(status?: string): Promise<SosRequestListResponse> {
  const url = new URL(`${API_BASE}/sos-requests`, apiOrigin());
  if (status) url.searchParams.set('status', status);
  const response = await fetch(url.toString(), { headers: getAuthHeaders() });
  return handleResponse<SosRequestListResponse>(response);
}

/**
 * Lấy chi tiết 1 SOS request.
 */
export async function getSosRequest(id: number): Promise<SosRequestDto> {
  const response = await fetch(`${API_BASE}/sos-requests/${id}`, {
    headers: getAuthHeaders(),
  });
  return handleResponse<SosRequestDto>(response);
}

/**
 * Điều phối SOS request: gán contact và chuyển sang DISPATCHED.
 */
export async function dispatchSosRequest(id: number, request: DispatchSosRequest): Promise<SosRequestDto> {
  const response = await fetch(`${API_BASE}/sos-requests/${id}/dispatch`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(request),
  });
  return handleResponse<SosRequestDto>(response);
}

/**
 * Đánh dấu SOS request đã giải quyết (RESOLVED).
 */
export async function resolveSosRequest(id: number): Promise<SosRequestDto> {
  const response = await fetch(`${API_BASE}/sos-requests/${id}/resolve`, {
    method: 'POST',
    headers: getAuthHeaders(),
  });
  return handleResponse<SosRequestDto>(response);
}

/**
 * Huỷ SOS request (CANCELLED).
 */
export async function cancelSosRequest(id: number): Promise<SosRequestDto> {
  const response = await fetch(`${API_BASE}/sos-requests/${id}/cancel`, {
    method: 'POST',
    headers: getAuthHeaders(),
  });
  return handleResponse<SosRequestDto>(response);
}

// ─────────────────────────────────────────────
// Emergency Contacts (Admin)
// ─────────────────────────────────────────────

export async function getEmergencyContacts(activeOnly = false): Promise<EmergencyContactDto[]> {
  const url = new URL(`${API_BASE}/emergency-contacts`, apiOrigin());
  url.searchParams.set('activeOnly', String(activeOnly));
  const response = await fetch(url.toString(), { headers: getAuthHeaders() });
  return handleResponse<EmergencyContactDto[]>(response);
}

export async function createEmergencyContact(
  request: CreateEmergencyContactRequest
): Promise<EmergencyContactDto> {
  const response = await fetch(`${API_BASE}/emergency-contacts`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(request),
  });
  return handleResponse<EmergencyContactDto>(response);
}

export async function updateEmergencyContact(
  id: number,
  request: UpdateEmergencyContactRequest
): Promise<EmergencyContactDto> {
  const response = await fetch(`${API_BASE}/emergency-contacts/${id}`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify(request),
  });
  return handleResponse<EmergencyContactDto>(response);
}

export async function deleteEmergencyContact(id: number): Promise<void> {
  const response = await fetch(`${API_BASE}/emergency-contacts/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });
  if (!response.ok) {
    throw new Error(`Xoá đầu mối liên hệ thất bại: HTTP ${response.status}`);
  }
}

// ─────────────────────────────────────────────
// Public SOS (du khách gửi, không cần auth)
// ─────────────────────────────────────────────

/**
 * Du khách gửi yêu cầu SOS khẩn cấp.
 * Endpoint public — không cần đăng nhập.
 */
export async function submitPublicSos(request: PublicSosSubmitRequest): Promise<PublicSosSubmitResponse> {
  const response = await fetch(`${PUBLIC_BASE}/sos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  return handleResponse<PublicSosSubmitResponse>(response);
}
