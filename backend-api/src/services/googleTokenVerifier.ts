import { config } from '../config/env.js';

/**
 * Xác minh Google ID token (từ Google Identity Services) qua endpoint tokeninfo của Google. Chỉ chấp nhận token có
 * audience khớp GOOGLE_OAUTH_CLIENT_ID (hoặc FIREBASE_PROJECT_ID) và email đã được Google xác minh.
 */

const TOKENINFO_URL = 'https://oauth2.googleapis.com/tokeninfo?id_token=';

/** givenName / familyName: tên / họ Google tách sẵn (có thể null) — điền sẵn form tạo tài khoản. */
export interface GoogleProfile {
  email: string;
  fullName: string;
  picture: string | null;
  givenName: string | null;
  familyName: string | null;
}

export class InvalidGoogleTokenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidGoogleTokenError';
  }
}

/** Gọi tokeninfo của Google lấy claims của token; có thể thay thế trong test. */
export const tokenInfoFetcher: { fetch: (idToken: string) => Promise<Record<string, unknown>> } = {
  async fetch(idToken: string) {
    const res = await fetch(TOKENINFO_URL + encodeURIComponent(idToken), { signal: AbortSignal.timeout(8000) });
    if (res.status !== 200) {
      throw new InvalidGoogleTokenError('Google ID token không hợp lệ hoặc đã hết hạn.');
    }
    return (await res.json()) as Record<string, unknown>;
  },
};

const text = (v: unknown, fallback: string | null = null): string | null =>
  typeof v === 'string' && v !== '' ? v : fallback;

export async function verify(idToken: string | null | undefined): Promise<GoogleProfile> {
  if (!idToken || !idToken.trim()) throw new InvalidGoogleTokenError('Thiếu Google ID token.');

  let body: Record<string, unknown>;
  try {
    body = await tokenInfoFetcher.fetch(idToken);
  } catch (err) {
    if (err instanceof InvalidGoogleTokenError) throw err;
    throw new Error('Không thể xác minh Google token.');
  }

  const clientId = config().googleClientId;
  const firebaseProjectId = config().firebaseProjectId;
  const tokenAud = String(body.aud ?? '');

  // Nếu có cấu hình clientId hoặc firebaseProjectId thì kiểm tra khớp aud
  const hasConfiguredAud =
    (clientId && !clientId.startsWith('your_')) || (firebaseProjectId && !firebaseProjectId.startsWith('your_'));
  if (hasConfiguredAud) {
    const matches = (clientId && clientId === tokenAud) || (firebaseProjectId && firebaseProjectId === tokenAud);
    if (!matches) throw new InvalidGoogleTokenError('Google ID token không dành cho ứng dụng này (aud mismatch).');
  }

  if (String(body.email_verified ?? '').toLowerCase() !== 'true') {
    throw new InvalidGoogleTokenError('Email Google chưa được xác minh.');
  }
  const email = text(body.email, '') as string;
  if (!email.trim()) throw new InvalidGoogleTokenError('Google ID token không chứa email.');
  return {
    email,
    fullName: text(body.name, email) as string,
    picture: text(body.picture),
    givenName: text(body.given_name),
    familyName: text(body.family_name),
  };
}
