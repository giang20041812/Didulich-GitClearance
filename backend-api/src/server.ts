// Giờ Việt Nam cho mọi phép tính ngày/giờ của tiến trình (phải đặt trước khi dùng Date).
process.env.TZ = 'Asia/Ho_Chi_Minh';

import { createApp } from './app.js';
import { config, loadEnvFiles } from './config/env.js';
import { closePool, initPool } from './db/pool.js';
import { migrate } from './db/migrate.js';
import { logger } from './lib/logger.js';
import { checkProductionSecrets } from './config/productionSecretGuard.js';
import { warmUpCatalog } from './services/catalogWarmUp.js';
import { warnIfUnconfigured } from './services/mailService.js';
import { startSchedulers, stopSchedulers } from './services/scheduler.js';
import { runSeedAccounts } from './services/seedAccounts.js';

async function main(): Promise<void> {
  loadEnvFiles();
  const cfg = config();
  checkProductionSecrets(cfg);

  const pool = initPool(cfg.db);
  await migrate(pool);
  await runSeedAccounts();
  warnIfUnconfigured();

  const app = createApp();
  const server = app.listen(cfg.port, cfg.host, () => {
    logger.info('Booking API đang chạy', { port: cfg.port, profile: cfg.profile });
    void warmUpCatalog(cfg.port);
  });
  startSchedulers();

  const shutdown = (signal: string) => {
    logger.info('Nhận tín hiệu tắt, chờ request đang chạy', { signal });
    const timeout = Number(process.env.SHUTDOWN_TIMEOUT_SECONDS ?? 20) * 1000;
    const force = setTimeout(() => process.exit(1), timeout);
    force.unref();
    stopSchedulers();
    server.close(() => {
      void closePool().finally(() => process.exit(0));
    });
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  logger.error('Không khởi động được', { error: (err as Error).message });
  process.exit(1);
});
