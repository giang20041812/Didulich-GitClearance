import axios from 'axios';
import { PortalLoginRequest, PortalLoginResponse, AuthErrorResponse } from '../types/user';
import type { GoogleLoginResponse } from '../types/integrations/google-identity';
import { saveTravelerSession } from '../lib/currentCustomer';
import { parseFieldErrors } from '../lib/apiError';

const API_BASE_URL = '/api/v1/auth';

/**
 * Container backend đang nguội cần ~15s để khởi động (HAProxy giữ request tới khi Spring sẵn sàng),
 * nên đăng nhập / API cổng phải chờ đủ lâu thay vì báo "kiểm tra mạng" sai.
 * Quên mật khẩu còn gửi email trong cùng request nên chờ lâu hơn.
 */
const AUTH_REQUEST_TIMEOUT_MS = 30000;
const MAIL_REQUEST_TIMEOUT_MS = 45000;

/** Chuẩn hóa mọi lỗi từ server (JSON không có message, HTML, rỗng...) thành AuthErrorResponse có message. */
const toAuthError = (err: unknown): AuthErrorResponse => {
  if (axios.isAxiosError(err)) {
    const status = err.response?.status ?? 0;
    const data: unknown = err.response?.data;
    if (data && typeof data === 'object' && typeof (data as { message?: unknown }).message === 'string' && (data as { message: string }).message) {
      const d = data as Partial<AuthErrorResponse> & { message: string };
      const fieldErrors = parseFieldErrors(data);
      return { status: d.status ?? status, errorCode: d.errorCode ?? 'ERROR', message: d.message, ...(fieldErrors.length ? { fieldErrors } : {}) };
    }
    if (!err.response) {
      return { status: 0, errorCode: 'NETWORK_ERROR', message: 'Không kết nối được máy chủ. Vui lòng kiểm tra mạng hoặc thử lại sau.' };
    }
    return {
      status,
      errorCode: 'SERVER_ERROR',
      message: `Máy chủ trả về lỗi ${status}. Vui lòng thử lại sau hoặc liên hệ quản trị viên.`,
    };
  }
  return { status: 500, errorCode: 'UNKNOWN_ERROR', message: 'Đã xảy ra lỗi không xác định trong quá trình xác thực.' };
};

/**
 * Service xác thực đăng nhập Cổng Quản Trị (UC-08)
 */
export const portalLogin = async (request: PortalLoginRequest): Promise<PortalLoginResponse> => {
  try {
    const response = await axios.post<PortalLoginResponse>(`${API_BASE_URL}/portal/login`, request, {
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: AUTH_REQUEST_TIMEOUT_MS,
    });
    return response.data;
  } catch (err: unknown) {
    throw toAuthError(err);
  }
};

const postTravelerAuth = async (path: string, body: unknown): Promise<GoogleLoginResponse> => {
  try {
    const response = await axios.post<GoogleLoginResponse>(`${API_BASE_URL}${path}`, body, {
      headers: { 'Content-Type': 'application/json' },
      timeout: AUTH_REQUEST_TIMEOUT_MS,
    });
    return response.data;
  } catch (err: unknown) {
    throw toAuthError(err);
  }
};

export interface ForgotPasswordResponse {
  message: string;
  otpTtlMinutes: number;
  resendAfterSeconds: number;
}

/** Gửi OTP đặt lại mật khẩu qua email. Server luôn trả cùng một kết quả dù tài khoản có tồn tại hay không. */
export const requestPasswordReset = async (identifier: string): Promise<ForgotPasswordResponse> => {
  try {
    const res = await axios.post<ForgotPasswordResponse>(`${API_BASE_URL}/forgot-password`, { identifier }, { timeout: MAIL_REQUEST_TIMEOUT_MS });
    return res.data;
  } catch (err: unknown) {
    throw toAuthError(err);
  }
};

/** Đặt lại mật khẩu bằng OTP đã nhận qua email. */
export const resetPasswordWithOtp = async (identifier: string, otp: string, newPassword: string): Promise<void> => {
  try {
    await axios.post(`${API_BASE_URL}/reset-password`, { identifier, otp, newPassword }, { timeout: AUTH_REQUEST_TIMEOUT_MS });
  } catch (err: unknown) {
    throw toAuthError(err);
  }
};

export interface ChangePortalPasswordRequest {
  currentPassword: string;
  newPassword: string;
}

export const changePortalPassword = async (request: ChangePortalPasswordRequest): Promise<void> => {
  try {
    await axios.patch('/api/v1/partner/account/password', request, {
      headers: { Authorization: `Bearer ${localStorage.getItem('portal_token') ?? ''}` },
      timeout: AUTH_REQUEST_TIMEOUT_MS,
    });
  } catch (err: unknown) {
    throw toAuthError(err);
  }
};

export const changeTravelerPassword = async (request: ChangePortalPasswordRequest): Promise<void> => {
  try {
    await axios.patch('/api/v1/traveler/account/password', request, {
      headers: { Authorization: `Bearer ${localStorage.getItem('traveler_token') ?? ''}` },
      timeout: AUTH_REQUEST_TIMEOUT_MS,
    });
  } catch (err: unknown) {
    throw toAuthError(err);
  }
};

/** Khách sửa họ tên / số điện thoại; lưu lại phiên mới để tên trên menu, form đặt phòng cập nhật ngay. */
export const updateTravelerProfile = async (request: { fullName: string; phone: string }): Promise<void> => {
  try {
    const res = await axios.patch<GoogleLoginResponse>('/api/v1/traveler/account/profile', request, {
      headers: { Authorization: `Bearer ${localStorage.getItem('traveler_token') ?? ''}` },
      timeout: AUTH_REQUEST_TIMEOUT_MS,
    });
    saveTravelerSession(res.data);
  } catch (err: unknown) {
    throw toAuthError(err);
  }
};

/** Thông tin từ tài khoản Google điền sẵn form "Hãy tạo tài khoản của bạn" (AuthController GOOGLE_SIGNUP_REQUIRED). */
export interface GoogleSignupProfile {
  email: string;
  firstName: string;
  lastName: string;
  picture?: string | null;
}

/** Đã có tài khoản → phiên đăng nhập; email Google lần đầu → khách điền form tạo tài khoản rồi gọi googleRegister. */
export type GoogleSignInResult =
  | { kind: 'session'; session: GoogleLoginResponse }
  | { kind: 'signup'; idToken: string; profile: GoogleSignupProfile };

const signupProfileOf = (err: unknown): GoogleSignupProfile | null => {
  if (!axios.isAxiosError(err)) return null;
  const data = err.response?.data as { errorCode?: unknown; googleProfile?: GoogleSignupProfile } | undefined;
  return data?.errorCode === 'GOOGLE_SIGNUP_REQUIRED' && data.googleProfile ? data.googleProfile : null;
};

/** Đăng nhập khách du lịch bằng Google: backend xác minh ID token rồi cấp JWT hệ thống. */
export const googleSignIn = async (idToken: string): Promise<GoogleSignInResult> => {
  try {
    const response = await axios.post<GoogleLoginResponse>(`${API_BASE_URL}/google/login`, { idToken }, {
      headers: { 'Content-Type': 'application/json' },
      timeout: AUTH_REQUEST_TIMEOUT_MS,
    });
    return { kind: 'session', session: response.data };
  } catch (err: unknown) {
    const profile = signupProfileOf(err);
    if (profile) return { kind: 'signup', idToken, profile };
    throw toAuthError(err);
  }
};

/** Bước 2 của lần đầu đăng nhập Google: tạo tài khoản từ form (cùng ID token Google, còn hiệu lực ~1 giờ). */
export const googleRegister = (request: { idToken: string; firstName: string; lastName: string; phone?: string }) =>
  postTravelerAuth('/google/register', request);

export const travelerLogin = (identifier: string, password: string) =>
  postTravelerAuth('/traveler/login', { identifier, password });

export interface TravelerRegisterRequest {
  fullName: string;
  email: string;
  phone?: string;
  password: string;
  confirmPassword?: string;
}

export const travelerRegister = (request: TravelerRegisterRequest) => postTravelerAuth('/traveler/register', request);


// Helper phiên đồng bộ (localStorage) đã tách sang lib/currentCustomer.ts để các layout trong bundle
// chính không kéo axios theo; giữ re-export để nơi đang import từ authService không phải sửa.
export type { CurrentCustomer } from '@/lib/currentCustomer';
export {

  getCurrentPortalCustomer,
  getCurrentCustomer,
  getBookingRestriction,
  saveTravelerSession,
  logoutCurrentSession,
} from '@/lib/currentCustomer';
