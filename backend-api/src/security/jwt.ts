import jwt from 'jsonwebtoken';
import { config, ephemeralJwtSecret } from '../config/env.js';
import { logger } from '../lib/logger.js';

/**
 * Tiện ích JWT: HS256 với secret từ biến JWT_SECRET (cùng định dạng token như bản Java nên token đang dùng vẫn hợp lệ).
 *
 * Phiên đăng nhập không tự hết hạn: token mới không mang claim exp; token cũ (exp 8 giờ) vẫn được chấp nhận sau khi quá
 * exp, miễn đúng chữ ký. Phiên Admin/NCC chỉ kết thúc khi bị thu hồi qua phiên bản token ("tv": đăng xuất, đặt lại mật
 * khẩu, khóa, đổi quyền) hoặc phiên thiết bị ("sid") — xem security/auth.ts.
 */

export interface TokenClaims {
  sub: string;
  role: string;
  tv?: number;
  sid?: string;
  iat?: number;
}

let devSecret: string | undefined;

function secret(): string {
  const configured = config().jwtSecret;
  if (configured) return configured;
  // Dev local không đặt JWT_SECRET: dùng secret ngẫu nhiên của lần chạy này (production bị ProductionSecretGuard chặn).
  if (!devSecret) {
    devSecret = ephemeralJwtSecret();
    logger.warn('[JWT] JWT_SECRET chưa đặt — dùng secret ngẫu nhiên cho lần chạy này (chỉ dev local).');
  }
  return devSecret;
}

/** Token trang khách / token cũ: chỉ mang username và role ("ROLE_TRAVELER"). */
export function generateToken(username: string, role: string): string {
  return jwt.sign({ role }, secret(), { algorithm: 'HS256', subject: username });
}

/** Token của tài khoản Admin/NCC: mang thêm phiên bản token ("tv") và mã phiên thiết bị ("sid"). */
export function generateSessionToken(username: string, role: string, tokenVersion: number, sessionId?: string | null): string {
  const claims: Record<string, unknown> = { role, tv: tokenVersion };
  if (sessionId) claims.sid = sessionId;
  return jwt.sign(claims, secret(), { algorithm: 'HS256', subject: username });
}

export type ParsedToken = { valid: true; claims: TokenClaims } | { valid: false };

/** Xác thực và đọc claims trong MỘT lần parse. Không bao giờ ném: sai chữ ký / sai định dạng → invalid. Quá hạn exp vẫn hợp lệ. */
export function parseToken(token: string): ParsedToken {
  try {
    const decoded = jwt.verify(token, secret(), { algorithms: ['HS256'], ignoreExpiration: true });
    if (typeof decoded === 'string' || typeof decoded.sub !== 'string') return { valid: false };
    return { valid: true, claims: decoded as unknown as TokenClaims };
  } catch (err) {
    logger.debug('JWT không hợp lệ', { error: (err as Error).message });
    return { valid: false };
  }
}

export function getUsernameFromToken(token: string): string | undefined {
  const p = parseToken(token);
  return p.valid ? p.claims.sub : undefined;
}
