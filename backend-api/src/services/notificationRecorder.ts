import { newTx, withSavepoint, query } from '../db/pool.js';
import { logger } from '../lib/logger.js';
import { nowLocal } from '../lib/time.js';
import * as notifications from '../repositories/notificationRepo.js';
import * as webPush from './webPushService.js';

/**
 * Công bố thông báo trong ứng dụng. Kênh SMS/email cần bộ gửi riêng khi được cấu hình. Thiếu template (DB chưa chạy
 * migration) thì bỏ qua, không làm hỏng nghiệp vụ chính.
 */

const blankToNull = (s: string | null | undefined): string | null => (s == null || s.trim() === '' ? null : s.trim());

async function template(code: string) {
  const found = await notifications.findActiveTemplate(code);
  if (!found) logger.warn('Bỏ qua thông báo: chưa có notification_template', { code });
  return found;
}

/** Thông báo cho khách của một đơn (nhận diện theo SĐT / email đã nhập lúc đặt). Chạy trong transaction riêng. */
export async function toCustomer(
  templateCode: string,
  phone: string | null | undefined,
  email: string | null | undefined,
  entityType: string | null,
  entityId: number | null,
  payload: Record<string, unknown>,
): Promise<void> {
  if ((phone == null || phone.trim() === '') && (email == null || email.trim() === '')) return;
  await newTx(async () => {
    const t = await template(templateCode);
    if (!t) return;
    const now = nowLocal();
    await notifications.insert({
      templateCode: t.code,
      channel: 'IN_APP',
      status: 'SENT',
      sentAt: now,
      createdAt: now,
      recipientType: 'CUSTOMER',
      recipientPhone: blankToNull(phone),
      recipientEmail: blankToNull(email),
      relatedEntityType: entityType,
      relatedEntityId: entityId,
      payload,
    });
  });
}

async function persistForAccounts(
  accountIds: number[],
  t: { code: string; subject: string | null },
  entityType: string | null,
  entityId: number | null,
  message: string,
  target: string | null,
): Promise<void> {
  const now = nowLocal();
  for (const accountId of accountIds) {
    await notifications.insert({
      templateCode: t.code,
      channel: 'IN_APP',
      status: 'SENT',
      sentAt: now,
      createdAt: now,
      recipientType: 'ACCOUNT',
      recipientAccountId: accountId,
      relatedEntityType: entityType,
      relatedEntityId: entityId,
      payload: { title: t.subject, message, target, isRead: false },
    });
  }
}

/** Trang cổng Admin mở khi bấm thông báo đẩy: mục `target`; với đơn đặt phòng thì mở luôn chi tiết đơn. */
export function adminUrl(target: string | null, entityType: string | null, entityId: number | null): string {
  if (!target || !target.trim()) return '/admin';
  const url = `/admin?tab=${target}`;
  return entityType === 'Booking' && entityId != null ? `${url}&booking=${entityId}` : url;
}

export function partnerUrl(entityType: string | null, entityId: number | null): string {
  return entityType === 'Booking' && entityId != null ? `/partner/bookings/${entityId}` : '/partner';
}

/** Cùng thẻ thì thông báo mới thay thế thông báo cũ trên màn hình (vd: hai lần khách sửa cùng một đơn). */
function tag(portal: string, templateCode: string, entityId: number | null): string {
  return `${portal}-${templateCode}-${entityId ?? Date.now()}`;
}

/**
 * Thông báo trong ứng dụng cho mọi Admin đang hoạt động (mỗi Admin một bản ghi để tự đánh dấu đã đọc). `target` là mục
 * của cổng quản trị cần mở khi bấm thông báo. Lỗi ở đây không được làm hỏng nghiệp vụ chính nên được nuốt và ghi log.
 * Đồng thời đẩy thông báo ra ngoài màn hình (Web Push) tới thiết bị đã bật, sau khi nghiệp vụ commit.
 */
export async function toAdmins(templateCode: string, entityType: string | null, entityId: number | null, message: string, target: string | null): Promise<void> {
  try {
    await withSavepoint(async () => {
      const t = await template(templateCode);
      if (!t) return;
      webPush.sendToActiveAdmins(t.subject, message, adminUrl(target, entityType, entityId), tag('admin', templateCode, entityId));
      const admins = await query<{ id: number }>(`SELECT id FROM account WHERE role = 'ADMIN' AND status = 'ACTIVE'`);
      await persistForAccounts(admins.map((a) => a.id), t, entityType, entityId, message, target);
    });
  } catch (err) {
    logger.warn('Không gửi được thông báo cho Admin', { templateCode, error: (err as Error).message });
  }
}

/**
 * Thông báo trong cổng NCC cho mọi tài khoản đang hoạt động của một nhà cung cấp (mỗi tài khoản một bản ghi) và đẩy ra
 * màn hình các thiết bị NCC đã bật thông báo. Lỗi ở đây không làm hỏng nghiệp vụ chính.
 */
export async function toProvider(
  providerId: number | null,
  templateCode: string,
  entityType: string | null,
  entityId: number | null,
  message: string,
  target: string | null,
): Promise<void> {
  if (providerId == null) return;
  try {
    await withSavepoint(async () => {
      const t = await template(templateCode);
      if (!t) return;
      webPush.sendToProvider(providerId, t.subject, message, partnerUrl(entityType, entityId), tag('partner', templateCode, entityId));
      const accounts = await query<{ id: number }>(
        `SELECT id FROM account WHERE provider_id = $1 AND role = 'PROVIDER' AND status = 'ACTIVE'`,
        [providerId],
      );
      await persistForAccounts(accounts.map((a) => a.id), t, entityType, entityId, message, target);
    });
  } catch (err) {
    logger.warn('Không gửi được thông báo cho NCC', { providerId, templateCode, error: (err as Error).message });
  }
}

