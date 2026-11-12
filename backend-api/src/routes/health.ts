import { Router } from 'express';
import { scalar } from '../db/pool.js';
import { nowInstant } from '../lib/time.js';

/**
 * NFR-AVL-01: điểm kiểm tra sức khỏe cho giám sát/uptime monitor và load balancer. Trả 200 khi ứng dụng và CSDL phản
 * hồi, 503 khi CSDL không truy cập được. Cũng có ở GỐC tên miền ({@code /} và {@code /health}).
 */
async function healthBody(): Promise<{ up: boolean; body: Record<string, unknown> }> {
  let dbUp: boolean;
  try {
    await scalar('SELECT 1');
    dbUp = true;
  } catch {
    dbUp = false;
  }
  return {
    up: dbUp,
    body: { status: dbUp ? 'UP' : 'DOWN', database: dbUp ? 'UP' : 'DOWN', time: nowInstant() },
  };
}

export const healthRouter = Router();

healthRouter.get(['/', '/health', '/api/public/health'], async (_req, res) => {
  const { up, body } = await healthBody();
  res.status(up ? 200 : 503).json(body);
});

/**
 * Chẩn đoán (không chạm DB): IP mà backend dùng làm khóa giới hạn tần suất và các header IP do Vercel đặt. Chỉ trả lại IP
 * của chính người gọi; không cache.
 */
healthRouter.get('/api/public/health/client-ip', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({
    remoteAddr: req.ip ?? null,
    xRealIp: req.header('x-real-ip') ?? null,
    xVercelForwardedFor: req.header('x-vercel-forwarded-for') ?? null,
  });
});
