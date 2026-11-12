import fs from 'node:fs';
import path from 'node:path';
import type pg from 'pg';
import { logger } from '../lib/logger.js';

/**
 * Chạy các file migrations/*.sql (định dạng "liquibase formatted sql" như bản Java, nên file SQL dùng nguyên) theo thứ
 * tự tên file, mỗi changeset trong một transaction. Lịch sử lưu ở bảng schema_migration; nếu DB đã được Liquibase của
 * bản Spring Boot dựng (bảng databasechangelog) thì các changeset đã có ở đó được coi là đã chạy — nâng cấp từ bản
 * Java sang bản Node không cần chuyển dữ liệu.
 *
 * Hỗ trợ: --changeset, --preconditions (onFail HALT/CONTINUE) với --precondition-sql-check, --rollback (bỏ qua).
 */

export interface ChangeSet {
  id: string;
  author: string;
  file: string;
  sql: string;
  preconditions?: { onFail: 'HALT' | 'CONTINUE'; onError: 'HALT' | 'CONTINUE'; checks: Array<{ expected: string; sql: string }> };
}

export const MIGRATIONS_DIR = path.resolve(import.meta.dirname, '../../migrations');

export function parseChangeSets(fileName: string, content: string): ChangeSet[] {
  const lines = content.replace(/^﻿/, '').split(/\r?\n/);
  const result: ChangeSet[] = [];
  let current: ChangeSet | undefined;
  let body: string[] = [];

  const flush = () => {
    if (current) {
      current.sql = body.join('\n').trim();
      result.push(current);
    }
    body = [];
  };

  for (const line of lines) {
    const header = /^--\s*changeset\s+([^:\s]+):(\S+)/i.exec(line);
    if (header) {
      flush();
      current = { author: header[1], id: header[2], file: fileName, sql: '' };
      continue;
    }
    if (!current) continue; // phần trước changeset đầu tiên (--liquibase formatted sql)
    const pre = /^--\s*preconditions\s+(.*)$/i.exec(line);
    if (pre) {
      const onFail = /onFail:(\w+)/i.exec(pre[1])?.[1]?.toUpperCase() === 'CONTINUE' ? 'CONTINUE' : 'HALT';
      const onError = /onError:(\w+)/i.exec(pre[1])?.[1]?.toUpperCase() === 'CONTINUE' ? 'CONTINUE' : 'HALT';
      current.preconditions = { onFail, onError, checks: [] };
      continue;
    }
    const check = /^--\s*precondition-sql-check\s+expectedResult:(\S+)\s+(.*)$/i.exec(line);
    if (check) {
      current.preconditions ??= { onFail: 'HALT', onError: 'HALT', checks: [] };
      current.preconditions.checks.push({ expected: check[1], sql: check[2].trim() });
      continue;
    }
    if (/^--\s*(comment|rollback)\b/i.test(line) || /^--\s*rollback/i.test(line)) continue;
    body.push(line);
  }
  flush();
  return result;
}

export function loadChangeSets(dir: string = MIGRATIONS_DIR): ChangeSet[] {
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  return files.flatMap((f) => parseChangeSets(f, fs.readFileSync(path.join(dir, f), 'utf8')));
}

const keyOf = (cs: { author: string; id: string }) => `${cs.author}:${cs.id}`;

async function appliedKeys(client: pg.PoolClient): Promise<Set<string>> {
  await client.query(`CREATE TABLE IF NOT EXISTS schema_migration (
      id         varchar(255) PRIMARY KEY,
      file       varchar(255) NOT NULL,
      applied_at timestamp(6) NOT NULL DEFAULT (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')
    )`);
  await client.query('ALTER TABLE schema_migration ENABLE ROW LEVEL SECURITY');
  const applied = new Set<string>();
  for (const r of (await client.query('SELECT id FROM schema_migration')).rows) applied.add(String(r.id));
  const legacy = await client.query(`SELECT to_regclass('public.databasechangelog') AS t`);
  if (legacy.rows[0]?.t) {
    for (const r of (await client.query('SELECT author, id FROM databasechangelog')).rows) {
      applied.add(`${r.author}:${r.id}`);
    }
  }
  return applied;
}

export interface MigrateResult {
  applied: string[];
  skipped: string[];
  pending: string[];
}

/** Có changeset nào chưa chạy không (không khóa, không ghi). */
export async function isUpToDate(pool: pg.Pool, changeSets: ChangeSet[] = loadChangeSets()): Promise<boolean> {
  const client = await pool.connect();
  try {
    const exists = await client.query(`SELECT to_regclass('public.schema_migration') AS t`);
    const legacy = await client.query(`SELECT to_regclass('public.databasechangelog') AS t`);
    if (!exists.rows[0]?.t && !legacy.rows[0]?.t) return false;
    const applied = new Set<string>();
    if (exists.rows[0]?.t) for (const r of (await client.query('SELECT id FROM schema_migration')).rows) applied.add(String(r.id));
    if (legacy.rows[0]?.t) {
      for (const r of (await client.query('SELECT author, id FROM databasechangelog')).rows) applied.add(`${r.author}:${r.id}`);
    }
    return changeSets.every((cs) => applied.has(keyOf(cs)));
  } finally {
    client.release();
  }
}

async function preconditionsHold(client: pg.PoolClient, cs: ChangeSet): Promise<boolean> {
  const pre = cs.preconditions;
  if (!pre) return true;
  for (const check of pre.checks) {
    let actual: string;
    try {
      const res = await client.query(check.sql);
      actual = res.rows.length ? String(Object.values(res.rows[0])[0]) : '';
    } catch (err) {
      if (pre.onError === 'CONTINUE') return false;
      throw new Error(`Precondition lỗi ở changeset ${keyOf(cs)}: ${(err as Error).message}`);
    }
    if (actual !== check.expected) {
      if (pre.onFail === 'CONTINUE') return false;
      throw new Error(
        `Precondition của changeset ${keyOf(cs)} không thỏa (kỳ vọng ${check.expected}, thực tế ${actual}). ` +
          'Schema v2 chỉ được dựng trên DB trống — xem docs/db-v2.md.',
      );
    }
  }
  return true;
}

/** Áp dụng mọi changeset chưa chạy. Nhiều tiến trình khởi động cùng lúc được tuần tự hóa bằng advisory lock. */
export async function migrate(pool: pg.Pool, changeSets: ChangeSet[] = loadChangeSets()): Promise<MigrateResult> {
  const result: MigrateResult = { applied: [], skipped: [], pending: [] };
  if (await isUpToDate(pool, changeSets)) {
    logger.info('[Migrate] Schema đã cập nhật, bỏ qua.');
    return result;
  }

  const client = await pool.connect();
  try {
    // Lọc trước một lần: chỉ duyệt changeset chưa áp dụng. Nếu không, mỗi lần khởi động phải đi qua toàn bộ changeset
    // (mỗi cái nhiều lượt truy vấn) — khi có changeset đang chờ điều kiện thì khởi động quá chậm và bị Vercel hết giờ.
    const alreadyApplied = await appliedKeys(client);
    const todo = changeSets.filter((cs) => !alreadyApplied.has(keyOf(cs)));
    for (const cs of todo) {
      await client.query('BEGIN');
      try {
        // Khóa theo giao dịch (an toàn với transaction pooler): chờ tiến trình khác chạy xong rồi kiểm tra lại.
        await client.query('SELECT pg_advisory_xact_lock(727274211)');
        const applied = await appliedKeys(client);
        if (applied.has(keyOf(cs))) {
          await client.query('COMMIT');
          continue;
        }
        if (!(await preconditionsHold(client, cs))) {
          await client.query('COMMIT');
          result.skipped.push(keyOf(cs));
          logger.warn('[Migrate] Changeset chờ điều kiện (onFail CONTINUE), bỏ qua lần này', { changeSet: keyOf(cs) });
          continue;
        }
        if (cs.sql) await client.query(cs.sql);
        await client.query('INSERT INTO schema_migration (id, file) VALUES ($1, $2)', [keyOf(cs), cs.file]);
        await client.query('COMMIT');
        result.applied.push(keyOf(cs));
        logger.info('[Migrate] Đã áp dụng', { changeSet: keyOf(cs) });
      } catch (err) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw new Error(`Migration ${keyOf(cs)} (${cs.file}) thất bại: ${(err as Error).message}`);
      }
    }
  } finally {
    client.release();
  }
  return result;
}
