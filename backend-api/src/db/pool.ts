import { AsyncLocalStorage } from 'node:async_hooks';
import pg from 'pg';
import type { DbConfig } from '../config/env.js';
import { logger } from '../lib/logger.js';

const { Pool, types } = pg;

// ---- Kiểu dữ liệu: PostgreSQL → JS -------------------------------------------------------------------------------
// bigint / numeric → number (id và số tiền VND nằm trong vùng an toàn của double; Jackson cũng ghi BigDecimal là số).
types.setTypeParser(20, (v) => Number(v));
types.setTypeParser(1700, (v) => Number(v));
// date / time / timestamp (không múi giờ) giữ nguyên dạng chuỗi giờ Việt Nam — xem lib/time.ts.
types.setTypeParser(1082, (v) => v);
types.setTypeParser(1083, (v) => v);
types.setTypeParser(1114, (v) => v.replace(' ', 'T'));
// Mảng bigint[] / numeric[] cũng ra number.
types.setTypeParser(1016 as never, (v) => parseNumberArray(v));
types.setTypeParser(1231 as never, (v) => parseNumberArray(v));

function parseNumberArray(text: string): Array<number | null> {
  const inner = text.replace(/^\{|\}$/g, '');
  if (!inner) return [];
  return inner.split(',').map((x) => (x === 'NULL' ? null : Number(x)));
}

let pool: pg.Pool | undefined;

export function initPool(cfg: DbConfig): pg.Pool {
  if (pool) return pool;
  pool = new Pool({
    host: cfg.host,
    port: cfg.port,
    database: cfg.database,
    user: cfg.user,
    password: cfg.password,
    ssl: cfg.ssl,
    max: cfg.poolMax,
    min: 0,
    connectionTimeoutMillis: cfg.connectionTimeoutMs,
    idleTimeoutMillis: cfg.idleTimeoutMs,
    maxLifetimeSeconds: cfg.maxLifetimeSeconds,
    keepAlive: cfg.keepAlive,
    // Mọi phiên dùng giờ Việt Nam để now() / CURRENT_DATE khớp với dữ liệu nghiệp vụ.
    options: '-c timezone=Asia/Ho_Chi_Minh',
  });
  pool.on('error', (err) => logger.warn('Lỗi connection rảnh trong pool', { error: err.message }));
  return pool;
}

export function getPool(): pg.Pool {
  if (!pool) throw new Error('Pool chưa được khởi tạo (initPool).');
  return pool;
}

export async function closePool(): Promise<void> {
  if (pool) {
    const p = pool;
    pool = undefined;
    await p.end();
  }
}

// ---- Transaction theo ngữ cảnh -----------------------------------------------------------------------------------
interface TxContext {
  client: pg.PoolClient;
  afterCommit: Array<() => void | Promise<void>>;
  /** Câu lệnh gần nhất đang chờ trên connection này: `Promise.all` trong transaction được xếp hàng, không bắn đồng thời (pg@9 bỏ hỗ trợ). */
  tail: Promise<unknown>;
}

const txStorage = new AsyncLocalStorage<TxContext>();

const camelCache = new Map<string, string>();
function camel(key: string): string {
  let c = camelCache.get(key);
  if (c === undefined) {
    c = key.replace(/_([a-z0-9])/g, (_, ch: string) => ch.toUpperCase());
    camelCache.set(key, c);
  }
  return c;
}

/** Đổi tên cột snake_case → camelCase (chỉ mức đầu; nội dung jsonb giữ nguyên). */
function camelizeRow<T>(row: Record<string, unknown>): T {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(row)) out[camel(key)] = row[key];
  return out as T;
}

export type Row = Record<string, any>;

async function run(text: string, params: unknown[] | undefined): Promise<pg.QueryResult> {
  const ctx = txStorage.getStore();
  const started = Date.now();
  try {
    if (!ctx) return await getPool().query(text, params as any[]);
    const result = ctx.tail.then(() => ctx.client.query(text, params as any[]));
    ctx.tail = result.catch(() => undefined);
    return await result;
  } finally {
    const ms = Date.now() - started;
    if (ms > 1000) logger.warn('Truy vấn chậm', { ms, sql: text.slice(0, 160) });
  }
}

/** Chạy câu SQL, trả về các dòng đã đổi tên cột sang camelCase. Trong {@link tx} thì dùng chung connection của transaction. */
export async function query<T = Row>(text: string, params?: unknown[]): Promise<T[]> {
  const res = await run(text, params);
  return res.rows.map((r) => camelizeRow<T>(r));
}

/** Dòng đầu tiên hoặc null. */
export async function one<T = Row>(text: string, params?: unknown[]): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows.length > 0 ? rows[0] : null;
}

/** Giá trị của cột đầu tiên ở dòng đầu tiên (vd count). */
export async function scalar<T = number>(text: string, params?: unknown[]): Promise<T | null> {
  const res = await run(text, params);
  if (res.rows.length === 0) return null;
  const row = res.rows[0];
  const key = Object.keys(row)[0];
  return row[key] as T;
}

/** Số dòng bị ảnh hưởng (INSERT/UPDATE/DELETE). */
export async function exec(text: string, params?: unknown[]): Promise<number> {
  const res = await run(text, params);
  return res.rowCount ?? 0;
}

/**
 * Chạy `fn` trong một transaction (tương đương @Transactional, propagation REQUIRED): gọi lồng nhau thì dùng chung
 * transaction ngoài cùng. Mọi `query/one/exec` gọi bên trong (kể cả qua các hàm repository) tự dùng connection này.
 */
export async function tx<T>(fn: () => Promise<T>): Promise<T> {
  if (txStorage.getStore()) return fn();
  const client = await getPool().connect();
  const ctx: TxContext = { client, afterCommit: [], tail: Promise.resolve() };
  let committed = false;
  try {
    await client.query('BEGIN');
    const result = await txStorage.run(ctx, fn);
    await client.query('COMMIT');
    committed = true;
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackErr) {
      logger.warn('ROLLBACK thất bại', { error: (rollbackErr as Error).message });
    }
    throw err;
  } finally {
    client.release();
    if (committed) {
      for (const hook of ctx.afterCommit) {
        try {
          await hook();
        } catch (hookErr) {
          logger.warn('Hook sau commit thất bại', { error: (hookErr as Error).message });
        }
      }
    }
  }
}

/** Đang ở trong transaction không. */
export function inTransaction(): boolean {
  return txStorage.getStore() !== undefined;
}

/**
 * Chạy `fn` sau khi transaction hiện tại COMMIT thành công (tương đương TransactionSynchronization.afterCommit).
 * Ngoài transaction thì chạy ngay. Lỗi trong `fn` chỉ ghi log, không ảnh hưởng kết quả đã commit.
 */
export function afterCommit(fn: () => void | Promise<void>): void {
  const ctx = txStorage.getStore();
  if (ctx) {
    ctx.afterCommit.push(fn);
    return;
  }
  void Promise.resolve()
    .then(fn)
    .catch((err: Error) => logger.warn('Tác vụ sau commit thất bại', { error: err.message }));
}

/** Chạy `fn` trong transaction MỚI, độc lập với transaction hiện tại (tương đương REQUIRES_NEW): dùng connection riêng. */
export async function newTx<T>(fn: () => Promise<T>): Promise<T> {
  return txStorage.exit(() => tx(fn));
}

let savepointSeq = 0;

/**
 * Chạy `fn` trong một savepoint của transaction hiện tại: lỗi thì chỉ hoàn tác phần của `fn` (rồi ném lại), transaction
 * ngoài vẫn dùng tiếp được. Dùng cho thao tác "cố gắng hết sức" mà lỗi không được làm hỏng nghiệp vụ chính. Ngoài
 * transaction thì chạy `fn` trong một transaction riêng.
 */
export async function withSavepoint<T>(fn: () => Promise<T>): Promise<T> {
  const ctx = txStorage.getStore();
  if (!ctx) return tx(fn);
  const name = `sp_${++savepointSeq}`;
  await ctx.client.query(`SAVEPOINT ${name}`);
  try {
    const result = await fn();
    await ctx.client.query(`RELEASE SAVEPOINT ${name}`);
    return result;
  } catch (err) {
    await ctx.client.query(`ROLLBACK TO SAVEPOINT ${name}`).catch(() => undefined);
    throw err;
  }
}

/** Chạy `fn` ngoài mọi transaction (mỗi câu SQL dùng connection tự động trả về pool). */
export async function noTx<T>(fn: () => Promise<T>): Promise<T> {
  return txStorage.exit(fn);
}
