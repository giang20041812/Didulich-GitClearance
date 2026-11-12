import { timingSafeEqual } from 'node:crypto';
import { Router } from 'express';
import { config } from '../config/env.js';
import { logger } from '../lib/logger.js';

/**
 * Webhook thanh toán SEPay. Endpoint được permitAll trong accessRules nhưng tự xác thực: SEPay gọi kèm header
 * `Authorization: Apikey <secret>` (cũng chấp nhận Bearer/giá trị trần), so khớp SEPAY_WEBHOOK_SECRET bằng so sánh
 * thời-gian-hằng-để.
 *
 * Chưa có logic đối soát giao dịch: request hợp lệ nhận 501 để SEPay retry và log hiện rõ việc còn thiếu, thay vì 200 giả tạo
 * khiến đơn không bao giờ được xác nhận mà không ai biết.
 */
export const sepayRouter = Router();

function isAuthorized(secret: string, header: string | undefined): boolean {
  if (!header || header.trim() === '') return false;
  let value = header.trim();
  if (/^apikey /i.test(value) || /^bearer /i.test(value)) value = value.slice(7).trim();
  if (value === '') return false;
  const expected = Buffer.from(secret, 'utf8');
  const actual = Buffer.from(value, 'utf8');
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

sepayRouter.post('/api/v1/webhooks/sepay', (req, res) => {
  const secret = (config().sepayWebhookSecret ?? '').trim();
  res.type('text/plain');
  if (secret === '') {
    logger.warn('SEPay webhook bị từ chối: SEPAY_WEBHOOK_SECRET chưa cấu hình.');
    res.status(503).send('Webhook chua duoc cau hinh');
    return;
  }
  if (!isAuthorized(secret, req.header('Authorization'))) {
    logger.warn('SEPay webhook bị từ chối: Authorization không khớp secret.');
    res.status(401).send('Unauthorized');
    return;
  }
  const length = req.body === undefined ? 0 : Buffer.byteLength(JSON.stringify(req.body));
  logger.warn(
    `SEPay webhook hợp lệ (${length} bytes) nhưng xử lý tự động chưa được triển khai — cần triển khai đối soát PaymentTransaction (idempotent) trước khi bật thanh toán thật.`,
  );
  res.status(501).send('Webhook processing not implemented yet');
});
