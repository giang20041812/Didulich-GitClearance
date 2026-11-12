import { logger } from '../lib/logger.js';
import type { AppConfig } from './env.js';

/**
 * Chặn khởi động trên production khi secret chưa đạt chuẩn.
 *
 * JWT là lớp chặn xác thực duy nhất của API: nếu chạy với secret mặc định hoặc secret quá ngắn, kẻ tấn công có thể tự ký
 * token ROLE_ADMIN. Guard chỉ ép buộc trên các profile production (prod, supabase); khi dev chỉ cảnh báo.
 */

/** Giá trị mặc định cũ đã lộ trong git history — tuyệt đối không được dùng lại. */
export const LEGACY_DEFAULT_JWT_SECRET = 'dulichso-secret-key-must-be-at-least-256-bits-long-for-hs256-algorithm';
export const MIN_JWT_SECRET_LENGTH = 32;

export function checkProductionSecrets(cfg: AppConfig): void {
  const production = cfg.production;
  const secret = cfg.jwtSecret ?? '';

  if (secret.trim() === '') {
    if (production) {
      throw new Error(
        `JWT_SECRET chưa được đặt. Trên production bắt buộc đặt biến môi trường JWT_SECRET (chuỗi ngẫu nhiên tối thiểu ${MIN_JWT_SECRET_LENGTH} ký tự, vd: openssl rand -base64 48).`,
      );
    }
    logger.warn('[SecretGuard] JWT_SECRET chưa đặt — dùng để dev local, KHÔNG chạy production như vậy.');
    return;
  }
  if (secret === LEGACY_DEFAULT_JWT_SECRET) {
    if (production) {
      throw new Error('JWT_SECRET đang là giá trị mặc định cũ đã lộ trên git. Bắt buộc thay bằng secret ngẫu nhiên mới.');
    }
    logger.warn('[SecretGuard] JWT_SECRET trùng giá trị mặc định cũ (đã lộ) — chỉ chấp nhận khi dev local.');
    return;
  }
  if (secret.length < MIN_JWT_SECRET_LENGTH) {
    if (production) throw new Error(`JWT_SECRET quá ngắn (tối thiểu ${MIN_JWT_SECRET_LENGTH} ký tự).`);
    logger.warn(`[SecretGuard] JWT_SECRET ngắn hơn ${MIN_JWT_SECRET_LENGTH} ký tự — chỉ chấp nhận khi dev local.`);
  }

  if (production && cfg.media.activeProvider.toUpperCase() === 'CLOUDINARY' && !cfg.cloudinary.apiSecret) {
    logger.warn(
      '[SecretGuard] Đang dùng media provider CLOUDINARY nhưng CLOUDINARY_API_SECRET chưa đặt — tải ảnh lên sẽ lỗi. ' +
        'Đặt CLOUDINARY_CLOUD_NAME / CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET.',
    );
  }
}
