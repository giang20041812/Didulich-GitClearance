import { exec, tx } from '../db/pool.js';
import { config } from '../config/env.js';
import { logger } from '../lib/logger.js';
import { plusDaysTime } from '../lib/time.js';
import * as audit from './auditLogService.js';

/**
 * NFR-PRI-02: chính sách lưu giữ dữ liệu theo từng loại (không dùng một thời hạn chung).
 *  - Audit log: RETENTION_AUDIT_LOG_DAYS (mặc định 180 ngày theo NFR-AUD-01).
 *  - Mã OTP đặt lại mật khẩu: xóa sau RETENTION_RESET_TOKEN_DAYS ngày kể từ lúc hết hạn (mặc định 7).
 *  - Thông báo trong ứng dụng: RETENTION_NOTIFICATION_DAYS (mặc định 90 ngày).
 *  - Booking, đánh giá, tài khoản: KHÔNG tự động xóa — phục vụ đối soát và giải quyết tranh chấp.
 */

export interface PurgeResult {
  auditLogs: number;
  passwordResetTokens: number;
  notifications: number;
}

function requirePositive(name: string, value: number): number {
  if (!(value >= 1)) throw new Error(`app.retention.${name} phải >= 1 ngày.`);
  return value;
}

export function purge(now: string): Promise<PurgeResult> {
  const cfg = config().retention;
  const auditLogDays = requirePositive('audit-log-days', cfg.auditLogDays);
  const passwordResetTokenDays = requirePositive('password-reset-token-days', cfg.passwordResetTokenDays);
  const notificationDays = requirePositive('notification-days', cfg.notificationDays);
  return tx(async () => {
    const auditLogs = await exec('DELETE FROM audit_log WHERE created_at < $1', [plusDaysTime(now, -auditLogDays)]);
    const passwordResetTokens = await exec('DELETE FROM password_reset_token WHERE expires_at < $1', [plusDaysTime(now, -passwordResetTokenDays)]);
    const notifications = await exec('DELETE FROM notification WHERE created_at < $1', [plusDaysTime(now, -notificationDays)]);
    logger.info('Dọn dữ liệu theo chính sách lưu giữ', { auditLogs, passwordResetTokens, notifications });
    if (auditLogs + passwordResetTokens + notifications > 0) {
      await audit.recordEvent('SYSTEM', null, 'DATA_RETENTION_PURGE', 'System', null, audit.RESULT_SUCCESS, null, 'Dọn dữ liệu quá hạn lưu giữ', {
        auditLogs,
        passwordResetTokens,
        notifications,
        auditLogDays,
        passwordResetTokenDays,
        notificationDays,
      });
    }
    return { auditLogs, passwordResetTokens, notifications };
  });
}
