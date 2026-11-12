import type { Request, Router } from 'express';
import { z } from 'zod';
import { IllegalArgumentError } from '../lib/errors.js';
import { optionalBody, parseBody, pathId } from '../lib/http.js';
import * as notifications from '../services/adminNotificationService.js';
import * as webPush from '../services/webPushService.js';

/** Khớp PushSubscription.toJSON() của trình duyệt: { endpoint, keys: { p256dh, auth } }. */
const pushSchema = z.object({
  endpoint: z.string().nullish(),
  keys: z.object({ p256dh: z.string().nullish(), auth: z.string().nullish() }).nullish(),
});

/**
 * Hộp thông báo và đăng ký thông báo đẩy của tài khoản cổng (Admin: /api/v1/admin/notifications, NCC:
 * /api/v1/partner/notifications) — hai controller của bản Java dùng chung AdminNotificationService và WebPushService.
 */
export function mountNotificationRoutes(
  router: Router,
  base: string,
  middleware: Array<import('express').RequestHandler>,
  accountId: (req: Request) => number | null,
  testUrl: string,
): void {
  router.get(base, ...middleware, async (req, res) => {
    res.json(await notifications.feed(accountId(req)));
  });

  router.post(`${base}/read-all`, ...middleware, async (req, res) => {
    await notifications.markAllRead(accountId(req));
    res.status(204).end();
  });

  router.post(`${base}/:id/read`, ...middleware, async (req, res) => {
    await notifications.markRead(accountId(req), pathId(req));
    res.status(204).end();
  });

  router.get(`${base}/push/public-key`, ...middleware, async (_req, res) => {
    res.json({ publicKey: await webPush.publicKey() });
  });

  router.post(`${base}/push/subscribe`, ...middleware, async (req, res) => {
    const body = parseBody(pushSchema, optionalBody(req) ?? {});
    if (!body.keys) throw new IllegalArgumentError('Thiếu thông tin đăng ký thông báo đẩy.');
    await webPush.subscribe(accountId(req), body.endpoint ?? '', body.keys.p256dh ?? '', body.keys.auth ?? '', req.header('user-agent'));
    res.status(204).end();
  });

  router.post(`${base}/push/unsubscribe`, ...middleware, async (req, res) => {
    const body = parseBody(pushSchema, optionalBody(req) ?? {});
    await webPush.unsubscribe(accountId(req), body.endpoint);
    res.status(204).end();
  });

  router.post(`${base}/push/test`, ...middleware, async (req, res) => {
    res.json({ delivered: await webPush.sendTest(accountId(req) as number, testUrl) });
  });
}
