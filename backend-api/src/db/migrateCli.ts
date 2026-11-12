import { config, loadEnvFiles } from '../config/env.js';
import { closePool, initPool } from './pool.js';
import { migrate } from './migrate.js';

/** `npm run migrate` — áp dụng migration lên DB cấu hình bởi DB_URL / DB_USERNAME / DB_PASSWORD rồi thoát. */
loadEnvFiles();
const pool = initPool(config().db);
try {
  const result = await migrate(pool);
  console.log(JSON.stringify(result, null, 2));
} finally {
  await closePool();
}
