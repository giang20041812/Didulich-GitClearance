export type AccountRole = 'ADMIN' | 'PROVIDER';

export type AccountStatus = 'ACTIVE' | 'INACTIVE';

export type ProviderStatus = 'ACTIVE' | 'SUSPENDED' | 'TERMINATED';

export interface ProviderSummaryDto {
  id: number;
  name: string;
  status: ProviderStatus;
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
  address?: string;
  /** Loại hình (Homestay / Trải nghiệm / Nhà xe); phiên cũ chưa có thì coi là Homestay. */
  serviceType?: import('./partner').ProviderServiceType;
}

export interface PortalLoginRequest {
  identifier: string;
  password: string;
}

export interface PortalLoginResponse {
  token: string;
  tokenType: string;
  accountId: number;
  email?: string;
  phone?: string;
  fullName?: string;
  role: AccountRole;
  status: AccountStatus;
  provider?: ProviderSummaryDto;
  redirectUrl: string;
  message: string;
}

/** Lỗi gắn với một ô nhập — khớp FieldErrorDto (backend). `field` là tên thuộc tính trong request (vd "email", "contactPhone"). */
export interface FieldError {
  field: string;
  message: string;
}

export interface AuthErrorResponse {
  status: number;
  errorCode: string;
  message: string;
  /** Các trường bị lỗi (vd trùng email / số điện thoại khi đăng ký); không có khi lỗi không gắn với trường cụ thể. */
  fieldErrors?: FieldError[];
  timestamp?: string;
}
