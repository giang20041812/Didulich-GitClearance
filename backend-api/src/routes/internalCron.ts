import { createHash, timingSafeEqual } from 'node:crypto';
import { Router } from 'express';
import { config } from '../config/env.js';
import { errorStyle } from '../lib/errorHandler.js';
import * as cron from '../services/cronService.js';

/**
 * Job định kỳ chạy theo request cho môi trường serverless / cron bên ngoài: GET /api/internal/cron/tick mỗi phút, kèm
 * `Authorization: Bearer <CRON_SECRET>`. Mỗi lượt đồng bộ trong request: dọn dữ liệu quá hạn lưu giữ khi rơi vào khung giờ của
 * RETENTION_CRON (giờ Việt Nam), nhắc giờ tham quan theo lịch trình và tự trả phòng cho đơn hết giờ trả phòng. CRON_SECRET chưa đặt
 * thì endpoint trả 404 (tắt); secret sai trả 401. So sánh secret theo thời gian hằng.
 */
export const cronRouter = Router();

const sha256 = (value: string): Buffer => createHash('sha256').update(value, 'utf8').digest();

/** "Bearer <secret>" khớp secret; so sánh băm SHA-256 nên thời gian hằng kể cả khi độ dài khác nhau. */
export function secretMatches(authorization: string | undefined, secret: string): boolean {
  if (!authorization || !secret || !authorization.startsWith('Bearer ')) return false;
  return timingSafeEqual(sha256(authorization.slice('Bearer '.length).trim()), sha256(secret));
}

cronRouter.get('/api/internal/cron/tick', errorStyle('default'), async (req, res) => {
  const secret = config().cronSecret;
  if (secret === '') {
    res.status(404).json({ status: 404, errorCode: 'NOT_FOUND', message: 'Không tìm thấy tài nguyên.' });
    return;
  }
  if (!secretMatches(req.header('authorization'), secret)) {
    res.status(401).json({ status: 401, errorCode: 'UNAUTHORIZED', message: 'Thiếu hoặc sai CRON_SECRET.' });
    return;
  }
  const result = await cron.tick();
  res.status(result.failed ? 500 : 200).json(result.body);
});
