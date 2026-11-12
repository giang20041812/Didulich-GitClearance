import { insertRow } from '../db/sql.js';
import { json } from '../db/sql.js';
import { newTx } from '../db/pool.js';
import type { ActorType } from '../domain/enums.js';
import { currentIp } from '../lib/requestContext.js';
import { logger } from '../lib/logger.js';
import { nowLocal } from '../lib/time.js';

/**
 * Ghi audit log cho mọi thao tác Admin quan trọng và sự kiện bảo mật (đăng nhập, từ chối truy cập).
 * Chạy trong transaction riêng (REQUIRES_NEW) để log không bị rollback cùng với transaction chính nếu có lỗi.
 */

export const RESULT_SUCCESS = 'SUCCESS';
export const RESULT_FAILURE = 'FAILURE';
export const RESULT_DENIED = 'DENIED';

type Details = Record<string, unknown> | null | undefined;

async function save(
  actor: ActorType,
  actorId: number | null,
  action: string,
  entityType: string,
  entityId: number | null,
  result: string | null,
  ip: string | null | undefined,
  reason: string | null | undefined,
  before: Details,
  after: Details,
): Promise<void> {
  try {
    await newTx(async () => {
      await insertRow('audit_log', {
        actor,
        actorId,
        action,
        entityType,
        entityId,
        result,
        ip: ip ?? null,
        reason: reason != null && reason.length > 500 ? reason.slice(0, 500) : (reason ?? null),
        beforeData: json(before ?? null),
        afterData: json(after ?? null),
        createdAt: nowLocal(),
      });
    });
  } catch (err) {
    // Không để lỗi audit làm hỏng flow chính
    logger.error('Không thể ghi audit log', { action, entityType, entityId, error: (err as Error).message });
  }
}

/** Ghi một bản ghi audit log của thao tác Admin. */
export async function record(
  actorAccountId: number | null,
  action: string,
  entityType: string,
  entityId: number | null,
  reason: string | null | undefined,
  beforeMap?: Details,
  afterMap?: Details,
): Promise<void> {
  await save('ADMIN', actorAccountId, action, entityType, entityId, RESULT_SUCCESS, currentIp(), reason, beforeMap, afterMap);
}

/**
 * Ghi sự kiện bảo mật/xác thực (NFR-SEC-05): đăng nhập, đăng nhập thất bại, từ chối truy cập, đổi quyền.
 * `details` không được chứa mật khẩu, token hay OTP; định danh người dùng phải được che bằng {@link mask}.
 */
export async function recordEvent(
  actor: ActorType,
  actorId: number | null,
  action: string,
  entityType: string,
  entityId: number | null,
  result: string,
  ip: string | null | undefined,
  reason: string | null | undefined,
  details?: Details,
): Promise<void> {
  await save(actor, actorId, action, entityType, entityId, result, ip, reason, null, details);
}

/** Che định danh (email/SĐT) trước khi ghi log: "nguyenvan@gmail.com" → "n***@gmail.com", "0912345678" → "*******678". */
export function mask(identifier: string | null | undefined): string {
  if (!identifier || !identifier.trim()) return '';
  const value = identifier.trim();
  const at = value.indexOf('@');
  if (at > 0) return `${value[0]}***${value.slice(at)}`;
  if (value.length <= 3) return '***';
  return '*'.repeat(value.length - 3) + value.slice(-3);
}
