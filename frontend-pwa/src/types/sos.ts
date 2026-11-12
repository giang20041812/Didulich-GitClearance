/**
 * Types cho module SOS cứu hộ.
 * Tên field khớp với AdminSosDtos.java ở backend-api.
 */

export type EmergencyContactType = 'POLICE' | 'MEDICAL' | 'FIRE' | 'TOURISM_SUPPORT';

export type SosRequestType = 'MEDICAL' | 'SECURITY' | 'ACCIDENT' | 'LOST' | 'OTHER';

export type SosRequestStatus = 'PENDING' | 'DISPATCHED' | 'RESOLVED' | 'CANCELLED';

export interface EmergencyContactDto {
  id: number;
  regionId: number | null;
  regionName: string | null;
  type: EmergencyContactType;
  name: string;
  phone: string;
  address: string | null;
  isActive: boolean;
}

export interface SosRequestDto {
  id: number;
  requesterName: string;
  requesterPhone: string;
  latitude: number | null;
  longitude: number | null;
  type: SosRequestType;
  description: string | null;
  status: SosRequestStatus;
  assignedContact: EmergencyContactDto | null;
  dispatchNote: string | null;
  createdAt: string; // ISO 8601 datetime string
  resolvedAt: string | null;
}

export interface SosRequestListResponse {
  items: SosRequestDto[];
  total: number;
}

export interface DispatchSosRequest {
  assignedContactId: number;
  note?: string;
}

export interface CreateEmergencyContactRequest {
  regionId?: number;
  type: EmergencyContactType;
  name: string;
  phone: string;
  address?: string;
}

export interface UpdateEmergencyContactRequest {
  regionId?: number;
  type?: EmergencyContactType;
  name?: string;
  phone?: string;
  address?: string;
  isActive?: boolean;
}

/** Public SOS submit (du khách gửi, không cần đăng nhập) */
export interface PublicSosSubmitRequest {
  requesterName: string;
  requesterPhone: string;
  latitude?: number;
  longitude?: number;
  type: SosRequestType;
  description?: string;
}

export interface PublicSosSubmitResponse {
  sosRequestId: number;
  message: string;
  createdAt: string;
}
