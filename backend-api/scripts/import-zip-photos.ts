import fs from 'node:fs';
import path from 'node:path';
import { config, loadEnvFiles } from '../src/config/env.js';
import { closePool, exec, initPool, one, scalar, tx } from '../src/db/pool.js';
import { insertRow } from '../src/db/sql.js';
import { nowLocal } from '../src/lib/time.js';
import { bumpCatalogVersion } from '../src/services/catalogCache.js';

/**
 * Nhập ảnh homestay từ các file zip (đã giải nén, chọn lọc, nén lại bằng ops/import/dimcc-homestay/build_zip_photos.py):
 * tải ảnh lên Supabase Storage → media_asset → place_media (kèm chú thích, thứ tự) → room_type_media (gắn ảnh vào hạng phòng).
 *
 *   npm run import:zip-photos                                       # CHẠY THỬ: chỉ đọc DB, không tải, không ghi
 *   npm run import:zip-photos -- --apply --confirm-host=<host DB>   # ghi thật
 *
 * Ảnh mới được xếp SAU các ảnh đã có (sort_order 100 trở đi). Ảnh bìa chỉ đổi khi dataset chỉ định (cover) hoặc địa điểm chưa có ảnh bìa.
 * Chạy lại nhiều lần an toàn: ảnh đã tải được nhớ theo sha256, bản ghi đã có chỉ được cập nhật nhãn / thứ tự.
 */

const REPO = path.resolve(import.meta.dirname, '../..');
const DATASET = path.join(REPO, 'ops/import/dimcc-homestay/zip-photos.json');
const STATE_DIR = path.join(REPO, 'ops/import/dimcc-homestay/.import-state');
const STATE_FILE = path.join(STATE_DIR, 'uploads.zip-photos.json');
const SORT_BASE = 100;

interface Item { n: number; file: string; sha: string; caption: string; room: string | null; order: number; size: number }
interface PlaceSpec { cover: number | null; items: Item[] }

const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const confirmHost = argv.find((a) => a.startsWith('--confirm-host='))?.split('=')[1];
const CONCURRENCY = Number(argv.find((a) => a.startsWith('--concurrency='))?.split('=')[1] ?? 3);
const log = (...a: unknown[]) => console.log(...a);

const state: Record<string, { objectPath: string; url: string; bytes: number }> = fs.existsSync(STATE_FILE)
  ? JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'))
  : {};
const saveState = () => {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 1));
};

async function upload(slug: string, it: Item): Promise<void> {
  if (state[it.sha]) return;
  const sb = config().supabase;
  if (!sb.url || !sb.serviceKey) throw new Error('Thiếu SUPABASE_URL / SUPABASE_SERVICE_KEY.');
  const base = sb.url.replace(/\/+$/, '');
  const objectPath = `import-zip-photos/${slug}/${it.sha.slice(0, 16)}.jpg`;
  const buf = fs.readFileSync(path.join(REPO, it.file));
  let lastErr: unknown;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await fetch(`${base}/storage/v1/object/${sb.storageBucket}/${objectPath}`, {
        method: 'POST',
        headers: { apikey: sb.serviceKey, Authorization: `Bearer ${sb.serviceKey}`, 'Content-Type': 'image/jpeg', 'x-upsert': 'true' },
        body: new Blob([buf]),
        signal: AbortSignal.timeout(180_000),
      });
      if (res.ok) {
        state[it.sha] = { objectPath, url: `${base}/storage/v1/object/public/${sb.storageBucket}/${objectPath}`, bytes: buf.length };
        saveState();
        return;
      }
      lastErr = new Error(`Supabase ${res.status}: ${(await res.text()).slice(0, 150)}`);
      if (res.status < 500 && res.status !== 429) break;
    } catch (err) {
      lastErr = err;
    }
    await new Promise((r) => setTimeout(r, 1500 * attempt));
  }
  throw new Error(`Không tải được ${it.file}: ${(lastErr as Error).message}`);
}

async function mediaIdFor(it: Item, altText: string): Promise<number> {
  const existing = await one<{ id: number }>('SELECT id FROM media_asset WHERE checksum_sha256 = $1', [it.sha]);
  if (existing) return existing.id;
  const up = state[it.sha];
  const row = await insertRow<{ id: number }>('media_asset', {
    storageKey: up.objectPath,
    publicUrl: up.url,
    mimeType: 'image/jpeg',
    sizeBytes: up.bytes,
    checksumSha256: it.sha,
    altText: altText.slice(0, 500),
    licenseNote: 'Ảnh từ thư mục Drive của đội dữ liệu (đã nén); chưa xác minh nguồn / bản quyền — nên thay bằng ảnh chính chủ trước khi công khai.',
    createdAt: nowLocal(),
  });
  return row.id;
}

async function main() {
  loadEnvFiles();
  const db = config().db;
  const data = JSON.parse(fs.readFileSync(DATASET, 'utf8')) as Record<string, PlaceSpec>;
  log('='.repeat(100));
  log(`Ảnh từ file zip → ${db.host}:${db.port}/${db.database} | chế độ: ${APPLY ? 'GHI THẬT' : 'CHẠY THỬ (không ghi)'}`);
  log('='.repeat(100));
  if (APPLY && confirmHost !== db.host) throw new Error(`Để ghi thật vào "${db.host}", thêm --confirm-host=${db.host}`);
  initPool(db);

  const plan: Array<{ slug: string; placeId: number; name: string; spec: PlaceSpec; existing: number; hasCover: boolean }> = [];
  const missing: string[] = [];
  for (const [slug, spec] of Object.entries(data)) {
    const place = await one<{ id: number; name: string }>('SELECT id, name FROM place WHERE slug = $1 AND is_deleted = FALSE', [slug]);
    if (!place) {
      missing.push(slug);
      continue;
    }
    const existing = (await scalar<number>('SELECT count(*) FROM place_media WHERE place_id = $1', [place.id])) ?? 0;
    const hasCover = (await scalar<boolean>(`SELECT count(*) > 0 FROM place_media WHERE place_id = $1 AND role = 'COVER'`, [place.id])) === true;
    plan.push({ slug, placeId: place.id, name: place.name, spec, existing: Number(existing), hasCover });
  }
  const totalImgs = plan.reduce((s, p) => s + p.spec.items.length, 0);
  const toUpload = plan.flatMap((p) => p.spec.items.map((it) => ({ slug: p.slug, it }))).filter((j) => !state[j.it.sha]);
  log(`\n${plan.length} homestay, ${totalImgs} ảnh (${toUpload.length} ảnh chưa tải lên Storage, ${(toUpload.reduce((s, j) => s + j.it.size, 0) / 1048576).toFixed(0)} MB)`);
  for (const p of plan) {
    const rooms = new Set(p.spec.items.filter((i) => i.room).map((i) => i.room));
    log(`  ${p.name.padEnd(30)} đã có ${String(p.existing).padStart(2)} ảnh | thêm ${String(p.spec.items.length).padStart(2)} | gắn hạng phòng: ${rooms.size ? [...rooms].join(', ') : '—'}`);
  }
  if (missing.length) log(`\nCảnh báo: chưa có địa điểm cho: ${missing.join(', ')}`);
  if (!APPLY) {
    log('\n[CHẠY THỬ] Chưa ghi gì. Chạy lại với --apply --confirm-host=' + db.host);
    return;
  }

  // 1) Tải ảnh
  log(`\nTải ${toUpload.length} ảnh lên Storage...`);
  const queue = [...toUpload];
  let done = 0;
  await Promise.all(
    Array.from({ length: Math.max(1, CONCURRENCY) }, async () => {
      for (let job = queue.shift(); job; job = queue.shift()) {
        await upload(job.slug, job.it);
        if (++done % 20 === 0) log(`  ${done}/${toUpload.length}`);
      }
    }),
  );

  // 2) Ghi DB (mỗi homestay một transaction)
  let attached = 0;
  let roomLinks = 0;
  for (const p of plan) {
    await tx(async () => {
      let coverMedia: number | null = null;
      for (const it of p.spec.items) {
        const mediaId = await mediaIdFor(it, p.name);
        const sort = SORT_BASE + it.order;
        const has = await scalar<boolean>('SELECT count(*) > 0 FROM place_media WHERE place_id = $1 AND media_id = $2', [p.placeId, mediaId]);
        if (has) await exec('UPDATE place_media SET caption = $3, sort_order = $4 WHERE place_id = $1 AND media_id = $2', [p.placeId, mediaId, it.caption, sort]);
        else {
          await exec(`INSERT INTO place_media (place_id, media_id, role, caption, sort_order) VALUES ($1, $2, 'GALLERY', $3, $4)`, [p.placeId, mediaId, it.caption, sort]);
          attached++;
        }
        if (p.spec.cover === it.n) coverMedia = mediaId;
        else if (!p.hasCover && coverMedia === null && p.spec.cover === null && it.order === 0) coverMedia = mediaId;

        if (it.room) {
          const rt = await one<{ id: number }>('SELECT id FROM room_type WHERE place_id = $1 AND name = $2', [p.placeId, it.room]);
          if (rt) {
            const roomHasCover = (await scalar<boolean>(`SELECT count(*) > 0 FROM room_type_media WHERE room_type_id = $1 AND role = 'COVER'`, [rt.id])) === true;
            await exec(
              `INSERT INTO room_type_media (room_type_id, media_id, role, caption, sort_order) VALUES ($1, $2, $3, $4, $5)
               ON CONFLICT (room_type_id, media_id) DO UPDATE SET caption = EXCLUDED.caption, sort_order = EXCLUDED.sort_order`,
              [rt.id, mediaId, roomHasCover ? 'GALLERY' : 'COVER', it.caption, it.order],
            );
            roomLinks++;
          }
        }
      }
      if (coverMedia !== null) {
        await exec(`UPDATE place_media SET role = 'GALLERY' WHERE place_id = $1 AND role = 'COVER' AND media_id <> $2`, [p.placeId, coverMedia]);
        await exec(`UPDATE place_media SET role = 'COVER' WHERE place_id = $1 AND media_id = $2`, [p.placeId, coverMedia]);
      }
    });
    log(`  [ghi] ${p.name}: +${p.spec.items.length} ảnh`);
  }
  await bumpCatalogVersion();
  log(`\nXong: thêm ${attached} liên kết ảnh mới vào địa điểm, ${roomLinks} liên kết ảnh – hạng phòng.`);
}

main()
  .catch((err) => {
    console.error('LỖI:', (err as Error).message);
    process.exitCode = 1;
  })
  .finally(() => closePool());
