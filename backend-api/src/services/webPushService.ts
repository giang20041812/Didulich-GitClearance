import crypto from 'node:crypto';
import webpush from 'web-push';
import { config } from '../config/env.js';
import { afterCommit, exec, query, scalar } from '../db/pool.js';
import { isUniqueViolation } from '../lib/errors.js';
import { IllegalArgumentError, IllegalStateError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import { nowLocal } from '../lib/time.js';

/**
 * Thông báo đẩy (Web Push) cho cổng Admin, cổng NCC và khách du lịch (nhắc giờ tham quan theo lịch trình) — hiện ra ngoài
 * màn hình của máy tính / điện thoại kể cả khi đã đóng tab. Mỗi thiết bị đăng ký là một dòng của bảng push_subscription
 * gắn với một tài khoản, phân theo phạm vi: PORTAL (cổng Admin / NCC) hoặc TRAVELER (trang khách).
 *
 * Mã hóa nội dung (RFC 8291) và xác thực máy chủ (VAPID, RFC 8292) do thư viện web-push đảm nhiệm. Cặp khóa VAPID lấy từ
 * PUSH_VAPID_PUBLIC_KEY / PUSH_VAPID_PRIVATE_KEY; chưa cấu hình thì tự sinh một lần và lưu ở bảng app_setting để mọi
 * instance dùng chung. Gửi chạy nền sau khi transaction nghiệp vụ commit, lỗi gửi không bao giờ làm hỏng nghiệp vụ chính.
 * Endpoint hết hạn (404/410) được xóa khỏi danh sách đăng ký.
 */

const KEY_PUBLIC = 'vapid.public';
const KEY_PRIVATE = 'vapid.private';

type Audience = 'PORTAL' | 'TRAVELER';

interface Subscription {
  id: number;
  endpoint: string;
  p256dh: string;
  auth: string;
}

interface VapidKeys {
  publicKey: string;
  privateKey: string;
}

let keys: VapidKeys | undefined;

const sha256Hex = (text: string) => crypto.createHash('sha256').update(text, 'utf8').digest('hex');

async function setting(key: string): Promise<string | null> {
  return scalar<string>('SELECT setting_value FROM app_setting WHERE setting_key = $1', [key]);
}

async function vapid(): Promise<VapidKeys> {
  if (keys) return keys;
  const push = config().push;
  if (push.vapidPublicKey.trim() && push.vapidPrivateKey.trim()) {
    keys = { publicKey: push.vapidPublicKey.trim(), privateKey: push.vapidPrivateKey.trim() };
    return keys;
  }
  let pub = await setting(KEY_PUBLIC);
  let priv = await setting(KEY_PRIVATE);
  if (pub == null || priv == null) {
    const generated = webpush.generateVAPIDKeys();
    const now = nowLocal();
    try {
      // Khóa riêng ghi trước: instance khác thấy khóa công khai thì chắc chắn đã có khóa riêng.
      await exec('INSERT INTO app_setting (setting_key, setting_value, updated_at) VALUES ($1, $2, $3)', [KEY_PRIVATE, generated.privateKey, now]);
      await exec('INSERT INTO app_setting (setting_key, setting_value, updated_at) VALUES ($1, $2, $3)', [KEY_PUBLIC, generated.publicKey, now]);
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      // Instance khác vừa sinh khóa: dùng khóa của nó.
    }
    pub = await setting(KEY_PUBLIC);
    priv = await setting(KEY_PRIVATE);
  }
  if (!pub || !priv) throw new IllegalStateError('Không khởi tạo được khóa VAPID cho thông báo đẩy.');
  keys = { publicKey: pub, privateKey: priv };
  return keys;
}

/** Khóa công khai VAPID (base64url, điểm không nén 65 byte) để trình duyệt đăng ký nhận đẩy. */
export async function publicKey(): Promise<string> {
  return (await vapid()).publicKey;
}

// ─── Đăng ký / hủy đăng ký ─────────────────────────────────────────────────────────────────────────────

export async function subscribe(accountId: number | null, endpoint: string, p256dh: string, auth: string, userAgent?: string | null): Promise<void> {
  if (accountId == null) throw new IllegalStateError('Không xác định được tài khoản quản trị.');
  await upsert('PORTAL', accountId, endpoint, p256dh, auth, userAgent);
}

export async function unsubscribe(accountId: number | null, endpoint: string | null | undefined): Promise<void> {
  if (accountId == null || endpoint == null) return;
  await exec(`DELETE FROM push_subscription WHERE scope = 'PORTAL' AND endpoint_hash = $1 AND account_id = $2`, [sha256Hex(endpoint), accountId]);
}

/** Thiết bị của khách du lịch bật nhắc giờ tham quan. */
export async function subscribeTraveler(travelerId: number | null, endpoint: string, p256dh: string, auth: string, userAgent?: string | null): Promise<void> {
  if (travelerId == null) throw new IllegalStateError('Vui lòng đăng nhập lại.');
  await upsert('TRAVELER', travelerId, endpoint, p256dh, auth, userAgent);
}

export async function unsubscribeTraveler(travelerId: number | null, endpoint: string | null | undefined): Promise<void> {
  if (travelerId == null || endpoint == null) return;
  await exec(`DELETE FROM push_subscription WHERE scope = 'TRAVELER' AND endpoint_hash = $1 AND account_id = $2`, [sha256Hex(endpoint), travelerId]);
}

async function upsert(audience: Audience, ownerId: number, endpoint: string, p256dh: string, auth: string, userAgent?: string | null): Promise<void> {
  if (!endpoint || !endpoint.startsWith('https://')) throw new IllegalArgumentError('Endpoint thông báo đẩy không hợp lệ.');
  if (!p256dh || !p256dh.trim() || !auth || !auth.trim()) throw new IllegalArgumentError('Thiếu khóa mã hóa của trình duyệt.');
  const hash = sha256Hex(endpoint);
  const ua = userAgent == null ? null : userAgent.slice(0, 255);
  // Cùng endpoint (trình duyệt đăng ký lại hoặc đổi tài khoản) thì cập nhật bản ghi cũ.
  const updated = await exec(
    'UPDATE push_subscription SET account_id = $1, p256dh = $2, auth = $3, user_agent = $4 WHERE scope = $5 AND endpoint_hash = $6',
    [ownerId, p256dh, auth, ua, audience, hash],
  );
  if (updated === 0) {
    try {
      await exec(
        'INSERT INTO push_subscription (account_id, scope, endpoint_hash, endpoint, p256dh, auth, user_agent, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
        [ownerId, audience, hash, endpoint, p256dh, auth, ua, nowLocal()],
      );
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      await exec('UPDATE push_subscription SET account_id = $1, p256dh = $2, auth = $3 WHERE scope = $4 AND endpoint_hash = $5', [ownerId, p256dh, auth, audience, hash]);
    }
  }
}

// ─── Gửi ──────────────────────────────────────────────────────────────────────────────────────────────

const ADMIN_SUBSCRIPTIONS =
  `SELECT s.id, s.endpoint, s.p256dh, s.auth FROM push_subscription s JOIN account a ON a.id = s.account_id ` +
  `WHERE s.scope = 'PORTAL' AND a.role = 'ADMIN' AND a.status = 'ACTIVE'`;
const PROVIDER_SUBSCRIPTIONS =
  `SELECT s.id, s.endpoint, s.p256dh, s.auth FROM push_subscription s JOIN account a ON a.id = s.account_id ` +
  `WHERE s.scope = 'PORTAL' AND a.role = 'PROVIDER' AND a.status = 'ACTIVE' AND a.provider_id = $1`;
const TRAVELER_SUBSCRIPTIONS =
  `SELECT s.id, s.endpoint, s.p256dh, s.auth FROM push_subscription s JOIN account a ON a.id = s.account_id ` +
  `WHERE s.scope = 'TRAVELER' AND s.account_id = $1 AND a.status = 'ACTIVE'`;

/**
 * Đẩy thông báo tới mọi thiết bị đã đăng ký của các Admin đang hoạt động. url: trang mở khi bấm thông báo
 * (vd "/admin?tab=bookings&booking=12"). Đang trong transaction thì chỉ gửi sau khi commit; chạy nền nên không làm chậm request.
 */
export function sendToActiveAdmins(title: string | null, body: string | null, url: string | null, tag: string | null): void {
  afterCommit(() => deliverAll('PORTAL', ADMIN_SUBSCRIPTIONS, [], title, body, url && url.trim() ? url : '/admin', tag));
}

/** Như sendToActiveAdmins nhưng tới thiết bị của các tài khoản NCC đang hoạt động thuộc một nhà cung cấp. */
export function sendToProvider(providerId: number | null, title: string | null, body: string | null, url: string | null, tag: string | null): void {
  if (providerId == null) return;
  afterCommit(() => deliverAll('PORTAL', PROVIDER_SUBSCRIPTIONS, [providerId], title, body, url && url.trim() ? url : '/partner', tag));
}

/**
 * Gửi NGAY (đồng bộ, chờ dịch vụ push trả lời) tới mọi thiết bị của một khách du lịch — dùng trong cron nhắc giờ: nền
 * tảng serverless có thể tạm dừng container ngay sau khi trả lời request. Trả về số thiết bị đã nhận.
 */
export async function sendToTravelerNow(travelerId: number | null, title: string, body: string, url: string, tag: string): Promise<number> {
  if (travelerId == null) return 0;
  const subs = await query<Subscription>(TRAVELER_SUBSCRIPTIONS, [travelerId]);
  if (subs.length === 0) return 0;
  const payload = buildPayload(title, body, url, tag);
  let ok = 0;
  for (const s of subs) if (await deliver(s, payload)) ok++;
  return ok;
}

/** Gửi thử tới các thiết bị của khách (nút "Gửi thử" sau khi bật nhắc giờ). */
export async function sendTestToTraveler(travelerId: number | null): Promise<number> {
  return sendToTravelerNow(
    travelerId,
    'Đã bật nhắc giờ tham quan',
    'Bạn sẽ nhận thông báo 30 phút trước mỗi buổi tham quan trong lịch trình.',
    '/journeys',
    'journey-push-test',
  );
}

/** Gửi thử tới các thiết bị của một tài khoản cổng (nút "Gửi thử" sau khi bật thông báo); url: trang mở khi bấm. */
export async function sendTest(accountId: number, url: string): Promise<number> {
  const subs = await query<Subscription>(`SELECT id, endpoint, p256dh, auth FROM push_subscription WHERE scope = 'PORTAL' AND account_id = $1`, [accountId]);
  const payload = buildPayload('Thông báo đẩy đã bật', 'Bạn sẽ nhận thông báo ngay khi có đơn đặt phòng mới hoặc khách thay đổi / hủy đơn.', url, 'portal-push-test');
  let ok = 0;
  for (const s of subs) if (await deliver(s, payload)) ok++;
  return ok;
}

async function deliverAll(audience: Audience, sql: string, args: unknown[], title: string | null, body: string | null, url: string, tag: string | null): Promise<void> {
  try {
    const subs = await query<Subscription>(sql, args);
    if (subs.length === 0) return;
    const payload = buildPayload(title, body, url, tag);
    await Promise.allSettled(subs.map((s) => deliver(s, payload)));
  } catch (err) {
    logger.warn('Không gửi được thông báo đẩy', { audience, error: (err as Error).message });
  }
}

function buildPayload(title: string | null, body: string | null, url: string | null, tag: string | null): string {
  return JSON.stringify({
    title: title ?? 'VietTrek',
    body: body ?? '',
    url: url && url.trim() ? url : '/',
    tag: tag ?? `portal-${Date.now()}`,
  });
}

/** Gửi một thông báo; trả về true nếu dịch vụ push nhận. Endpoint 404/410 (đã hủy / hết hạn) bị xóa. */
async function deliver(sub: Subscription, payload: string): Promise<boolean> {
  try {
    const k = await vapid();
    await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload, {
      vapidDetails: { subject: config().push.subject, publicKey: k.publicKey, privateKey: k.privateKey },
      TTL: 86400,
      urgency: 'high',
      timeout: 10000,
    });
    return true;
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode;
    if (status === 404 || status === 410) {
      await exec('DELETE FROM push_subscription WHERE id = $1', [sub.id]).catch(() => undefined);
    } else {
      let host = '?';
      try {
        host = new URL(sub.endpoint).host;
      } catch {
        /* giữ '?' */
      }
      logger.warn('Gửi thông báo đẩy thất bại', { host, status, error: (err as Error).message });
    }
    return false;
  }
}

/** Dùng trong test: bỏ khóa VAPID đã nạp. */
export function resetVapidCache(): void {
  keys = undefined;
}
