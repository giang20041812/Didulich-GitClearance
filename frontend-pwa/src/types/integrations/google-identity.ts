// TODO: verify against docs — chưa xác minh với API thật
// Nguồn tham chiếu: Google Identity Services (https://developers.google.com/identity/gsi/web/reference/js-reference)

export interface GoogleCredentialResponse {
  credential: string;
  select_by?: string;
  clientId?: string;
}

export interface GoogleIdConfiguration {
  client_id: string;
  callback: (response: GoogleCredentialResponse) => void;
  auto_select?: boolean;
  cancel_on_tap_outside?: boolean;
}

export interface GoogleButtonConfiguration {
  type?: 'standard' | 'icon';
  theme?: 'outline' | 'filled_blue' | 'filled_black';
  size?: 'large' | 'medium' | 'small';
  text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin';
  shape?: 'rectangular' | 'pill' | 'circle' | 'square';
  logo_alignment?: 'left' | 'center';
  width?: number;
  locale?: string;
}

export interface GoogleNotificationPrompt {
  isNotDisplayed: () => boolean;
  isSkippedMoment: () => boolean;
  getNotDisplayedReason: () => string;
  getSkippedReason: () => string;
}

export interface GoogleAccountsId {
  initialize: (config: GoogleIdConfiguration) => void;
  renderButton: (parent: HTMLElement, options: GoogleButtonConfiguration) => void;
  prompt: (momentListener?: (notification: GoogleNotificationPrompt) => void) => void;
  cancel: () => void;
}

declare global {
  interface Window {
    google?: { accounts: { id: GoogleAccountsId } };
  }
}

/** Response của POST /api/v1/auth/google/login (AuthController.AuthResponse) */
export interface GoogleLoginResponse {
  token: string;
  email: string;
  fullName: string;
  picture?: string | null;
  phone?: string | null;
}
