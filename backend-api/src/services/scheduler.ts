import { config } from '../config/env.js';
import { logger } from '../lib/logger.js';
import * as stays from './bookingStayService.js';
import * as cron from './cronService.js';

/**
 * Lịch chạy nền trong tiến trình — chỉ bật khi APP_SCHEDULING_MODE=in-process (mặc định: dev, VPS / Docker chạy liên tục).
 *  - Mỗi phút: {@link cron.tick} (dọn dữ liệu theo RETENTION_CRON, nhắc giờ lịch trình, tự trả phòng).
 *  - Ngoài ra tự trả phòng theo chu kỳ riêng (APP_STAY_AUTO_CHECKOUT_DELAY_MS, mặc định 5 phút).
 * Chế độ `external` không bật gì: cron bên ngoài gọi /api/internal/cron/tick (xem routes/internalCron.ts). Các timer được unref nên
 * không giữ tiến trình sống khi tắt máy chủ.
 */

const timers: NodeJS.Timeout[] = [];

export function startSchedulers(): void {
  const cfg = config();
  if (cfg.scheduling.mode !== 'in-process' || timers.length > 0) return;
  const safely = (name: string, job: () => Promise<unknown>) => () => {
    job().catch((err: unknown) => logger.error(`Job nền "${name}" thất bại`, { error: (err as Error).message }));
  };
  timers.push(setInterval(safely('cron-tick', () => cron.tick()), 60_000));
  const initial = setTimeout(() => {
    safely('stay-checkout', () => stays.autoCheckout())();
    timers.push(setInterval(safely('stay-checkout', () => stays.autoCheckout()), Math.max(1000, cfg.stay.autoCheckoutDelayMs)));
  }, Math.max(0, cfg.stay.autoCheckoutInitialDelayMs));
  timers.push(initial);
  for (const t of timers) t.unref();
  logger.info('Đã bật lịch chạy nền trong tiến trình', { mode: cfg.scheduling.mode });
}

export function stopSchedulers(): void {
  for (const t of timers.splice(0)) {
    clearInterval(t);
    clearTimeout(t);
  }
}
