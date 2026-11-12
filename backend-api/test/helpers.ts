process.env.TZ = 'Asia/Ho_Chi_Minh';

import type { Express } from 'express';
import pg from 'pg';
import { createApp } from '../src/app.js';
import { config, resetConfig } from '../src/config/env.js';
import { closePool, exec, initPool, query } from '../src/db/pool.js';
import { migrate } from '../src/db/migrate.js';
import { nowLocal } from '../src/lib/time.js';
import { normalize } from '../src/lib/vietnamese.js';
import { generateSessionToken, generateToken } from '../src/security/jwt.js';
import * as passwords from '../src/security/passwordEncoder.js';
import * as rateLimiter from '../src/security/rateLimiter.js';
import { resetCatalogState } from '../src/services/catalogCache.js';

/**
 * Môi trường test tích hợp: dùng một PostgreSQL thật (mặc định cổng 54329 — xem README, TEST_DB_ADMIN_URL để đổi). Mỗi file test
 * tạo database riêng theo tên file, chạy migration một lần, và dọn dữ liệu nghiệp vụ giữa các test (giữ dữ liệu tham chiếu
 * do migration nạp).
 */

export const TEST_JWT_SECRET = 'test-secret-test-secret-test-secret-0123456789';

const ADMIN_URL = process.env.TEST_DB_ADMIN_URL ?? 'postgres://postgres@127.0.0.1:54329/postgres';

/** Bảng chứa dữ liệu tham chiếu do migration nạp — KHÔNG xóa giữa các test. */
const KEEP_TABLES = new Set([
  'schema_migration',
  'region',
  'amenity',
  'tag',
  'notification_template',
  'payment_gateway',
  'trip_addon',
  'app_setting',
]);

export async function setupDatabase(dbName: string): Promise<Express> {
  const admin = new pg.Client({ connectionString: ADMIN_URL });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
  await admin.query(`CREATE DATABASE ${dbName}`);
  await admin.end();

  process.env.DB_URL = ADMIN_URL.replace(/\/[^/]*$/, `/${dbName}`);
  process.env.JWT_SECRET = TEST_JWT_SECRET;
  process.env.APP_PROFILE = 'dev';
  process.env.CORS_ALLOWED_ORIGINS = 'http://localhost:5173';
  process.env.PASSWORD_RESET_MIN_RESPONSE_MS = '0';
  process.env.LOG_LEVEL = 'error';
  resetConfig();

  const pool = initPool(config().db);
  const client = await pool.connect();
  await client.query('CREATE EXTENSION IF NOT EXISTS unaccent').catch(() => undefined);
  client.release();
  await migrate(pool);
  resetCatalogState();
  return createApp();
}

export async function teardownDatabase(): Promise<void> {
  await closePool();
}

/** Xóa dữ liệu nghiệp vụ (mọi bảng trừ dữ liệu tham chiếu) và đặt lại bộ đếm tốc độ. */
export async function resetData(): Promise<void> {
  const tables = await query<{ tablename: string }>(`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`);
  const names = tables.map((t) => t.tablename).filter((t) => !KEEP_TABLES.has(t));
  if (names.length > 0) await exec(`TRUNCATE ${names.map((n) => `"${n}"`).join(', ')} RESTART IDENTITY CASCADE`);
  await exec(`DELETE FROM app_setting WHERE setting_key NOT IN ('explore.radius_km')`);
  rateLimiter.clearAll();
  resetCatalogState();
}

export interface TestAccount {
  id: number;
  email: string;
  password: string;
  token: string;
}

let counter = 0;

/** Tạo tài khoản Admin (cấp 1..3) và token phiên cổng hợp lệ. */
export async function createAdmin(level = 1, email = `admin${++counter}@test.vn`): Promise<TestAccount> {
  const password = 'Passw0rd!x';
  const rows = await query<{ id: number }>(
    `INSERT INTO account (email, password_hash, role, admin_level, status, full_name, token_version, created_at)
     VALUES ($1, $2, 'ADMIN', $3, 'ACTIVE', 'Admin Test', 0, $4) RETURNING id`,
    [email, await passwords.encode(password), level, nowLocal()],
  );
  const id = rows[0].id;
  const sid = `s${id}`.padEnd(32, '0');
  await exec('INSERT INTO account_session (account_id, session_key, token_version, created_at) VALUES ($1,$2,0,$3)', [id, sid, nowLocal()]);
  return { id, email, password, token: generateSessionToken(email, 'ROLE_ADMIN', 0, sid) };
}

/** Tạo nhà cung cấp + tài khoản NCC. */
export async function createProvider(name = `NCC ${++counter}`, serviceType = 'HOMESTAY'): Promise<TestAccount & { providerId: number }> {
  const now = nowLocal();
  const prov = await query<{ id: number }>(
    `INSERT INTO provider (name, status, service_type, created_at, updated_at) VALUES ($1,'ACTIVE',$2,$3,$3) RETURNING id`,
    [name, serviceType, now],
  );
  const email = `ncc${++counter}@test.vn`;
  const password = 'Passw0rd!x';
  const acc = await query<{ id: number }>(
    `INSERT INTO account (email, password_hash, role, status, provider_id, full_name, token_version, created_at)
     VALUES ($1,$2,'PROVIDER','ACTIVE',$3,'NCC Test',0,$4) RETURNING id`,
    [email, await passwords.encode(password), prov[0].id, now],
  );
  const id = acc[0].id;
  const sid = `p${id}`.padEnd(32, '0');
  await exec('INSERT INTO account_session (account_id, session_key, token_version, created_at) VALUES ($1,$2,0,$3)', [id, sid, now]);
  return { id, email, password, providerId: prov[0].id, token: generateSessionToken(email, 'ROLE_PROVIDER', 0, sid) };
}

/** Tạo khách du lịch và token trang khách. */
export async function createTraveler(email = `khach${++counter}@test.vn`, phone: string | null = null): Promise<TestAccount> {
  const password = 'Passw0rd!x';
  const rows = await query<{ id: number }>(
    `INSERT INTO account (email, phone, password_hash, role, status, full_name, token_version, created_at)
     VALUES ($1,$2,$3,'TRAVELER','ACTIVE','Khach Test',0,$4) RETURNING id`,
    [email, phone, await passwords.encode(password), nowLocal()],
  );
  return { id: rows[0].id, email, password, token: generateToken(email, 'ROLE_TRAVELER') };
}

export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

// ---- Dữ liệu danh mục -------------------------------------------------------------------------------------------

export async function regionId(code: string): Promise<number> {
  const rows = await query<{ id: number }>('SELECT id FROM region WHERE code = $1', [code]);
  if (rows.length === 0) throw new Error(`Không có region ${code}`);
  return rows[0].id;
}

export async function anyRegionId(level = 2): Promise<number> {
  const rows = await query<{ id: number }>('SELECT id FROM region WHERE level = $1 ORDER BY id LIMIT 1', [level]);
  return rows[0].id;
}

export interface PlaceSeed {
  name: string;
  kind?: string;
  providerId?: number | null;
  regionId?: number | null;
  slug?: string;
  visibility?: string;
  latitude?: number | null;
  longitude?: number | null;
  address?: string | null;
  priceRefMin?: number | null;
  coverUrl?: string | null;
  coordVerified?: boolean;
}

export async function createPlace(seed: PlaceSeed): Promise<number> {
  const now = nowLocal();
  const slug = seed.slug ?? `${seed.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${++counter}`;
  const rows = await query<{ id: number }>(
    `INSERT INTO place (slug, kind, name, name_norm, provider_id, region_id, address, latitude, longitude, price_ref_min,
                        visibility, operation_status, is_deleted, rating_count, source_type, verification, coord_verified,
                        approval_status, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'OPERATING',FALSE,0,'PUBLIC_TRUSTED','UNVERIFIED',$12,'APPROVED',$13,$13) RETURNING id`,
    [
      slug,
      seed.kind ?? 'HOMESTAY',
      seed.name,
      normalize(seed.name),
      seed.providerId ?? null,
      seed.regionId ?? null,
      seed.address ?? null,
      seed.latitude ?? null,
      seed.longitude ?? null,
      seed.priceRefMin ?? null,
      seed.visibility ?? 'PUBLISHED',
      seed.coordVerified ?? false,
      now,
    ],
  );
  const id = rows[0].id;
  if (seed.coverUrl) {
    const media = await query<{ id: number }>(
      `INSERT INTO media_asset (storage_key, public_url, mime_type, created_at) VALUES ($1,$2,'image/jpeg',$3) RETURNING id`,
      [`k${counter}-${id}`, seed.coverUrl, now],
    );
    await exec(`INSERT INTO place_media (place_id, media_id, role, sort_order) VALUES ($1,$2,'COVER',0)`, [id, media[0].id]);
  }
  return id;
}

export async function createRoomType(placeId: number, name = 'Phòng đôi', basePrice: number | null = 500000, totalRooms = 2, maxOccupancy = 2): Promise<number> {
  const now = nowLocal();
  const rows = await query<{ id: number }>(
    `INSERT INTO room_type (place_id, name, max_occupancy, total_room_count, base_price, weekend_price, status, private_bathroom, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,'ACTIVE','YES',$7,$7) RETURNING id`,
    [placeId, name, maxOccupancy, totalRooms, basePrice, basePrice, now],
  );
  return rows[0].id;
}
