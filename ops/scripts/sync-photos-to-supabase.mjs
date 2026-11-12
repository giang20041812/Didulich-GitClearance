// Chuyển 64 ảnh homestay ĐiMCC sang Supabase Storage (không dùng Cloudinary nữa) và sinh SQL gắn ảnh vào place.
// Nguồn ảnh: các URL Cloudinary đã có trong ops/seed/insert-photos-dimcc.sql (không cần tải lại từ Drive).
// Chạy từ thư mục gốc repo:  node ops/scripts/sync-photos-to-supabase.mjs
// Cần trong backend-api/.env.local: SUPABASE_URL, SUPABASE_SERVICE_KEY, (tuỳ chọn) SUPABASE_STORAGE_BUCKET
import fs from 'node:fs';
import path from 'node:path';

const envPath = path.resolve('backend-api/.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq > 0) {
      const k = t.slice(0, eq).trim();
      if (!process.env[k]) process.env[k] = t.slice(eq + 1).trim();
    }
  }
}

const BASE = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const KEY = process.env.SUPABASE_SERVICE_KEY;
const BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'viettrek-media';
if (!BASE || !KEY) {
  console.error('Thiếu SUPABASE_URL / SUPABASE_SERVICE_KEY trong backend-api/.env.local');
  process.exit(1);
}

// Đọc danh sách (slug, ảnh nguồn, thứ tự) từ SQL Cloudinary hiện có
const srcSql = path.resolve('ops/seed/insert-photos-dimcc.sql');
const text = fs.readFileSync(srcSql, 'utf8');
const re = /\('([^']+)',\s*'cloudinary:[^']*\/([0-9a-f]{16})',\s*'(https:\/\/res\.cloudinary\.com[^']+)',\s*(\d+)\)/g;
const seen = new Set();
const items = [];
for (const m of text.matchAll(re)) {
  const [, slug, sha16, src, order] = m;
  const k = `${slug}/${sha16}`;
  if (seen.has(k)) continue; // mỗi ảnh xuất hiện 2 lần trong file (2 bước INSERT)
  seen.add(k);
  items.push({ slug, sha16, src, sortOrder: Number(order) });
}
console.log(`Bucket: ${BUCKET} | ${items.length} ảnh`);

const results = [];
for (const [i, it] of items.entries()) {
  const objectPath = `homestays/${it.slug}/${it.sha16}.jpg`;
  process.stdout.write(`[${i + 1}/${items.length}] ${objectPath} ... `);
  try {
    const dl = await fetch(it.src);
    if (!dl.ok) throw new Error(`tải nguồn HTTP ${dl.status}`);
    const buf = Buffer.from(await dl.arrayBuffer());
    const up = await fetch(`${BASE}/storage/v1/object/${BUCKET}/${objectPath}`, {
      method: 'POST',
      headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'image/jpeg', 'x-upsert': 'true' },
      body: buf,
    });
    if (!up.ok) throw new Error(`upload HTTP ${up.status} ${(await up.text()).slice(0, 150)}`);
    results.push({ ...it, storageKey: objectPath, publicUrl: `${BASE}/storage/v1/object/public/${BUCKET}/${objectPath}` });
    console.log('xong ✓');
  } catch (e) {
    console.log(`LỖI: ${e.message} ✗`);
  }
}

const values = results.map((r) => `  ('${r.slug}', '${r.storageKey}', '${r.publicUrl}', ${r.sortOrder})`).join(',\n');
const slugs = [...new Set(results.map((r) => `'${r.slug}'`))].join(',');
const out = `-- Ảnh homestay ĐiMCC trên Supabase Storage (bucket ${BUCKET}) — ${results.length} ảnh
BEGIN;

INSERT INTO media_asset (storage_key, public_url, mime_type, created_at)
SELECT v.storage_key, v.public_url, 'image/jpeg', now() AT TIME ZONE 'Asia/Ho_Chi_Minh'
FROM (VALUES
${values}
) AS v(slug, storage_key, public_url, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM media_asset m WHERE m.storage_key = v.storage_key);

INSERT INTO place_media (place_id, media_id, role, sort_order)
SELECT p.id, m.id,
  CASE WHEN v.sort_order = 0 AND NOT EXISTS (SELECT 1 FROM place_media pm2 WHERE pm2.place_id = p.id AND pm2.role = 'COVER') THEN 'COVER' ELSE 'GALLERY' END,
  v.sort_order
FROM (VALUES
${values}
) AS v(slug, storage_key, public_url, sort_order)
JOIN place p ON p.slug = v.slug
JOIN media_asset m ON m.storage_key = v.storage_key
WHERE NOT EXISTS (SELECT 1 FROM place_media pm WHERE pm.place_id = p.id AND pm.media_id = m.id);

COMMIT;

SELECT p.slug, p.name, COUNT(pm.media_id) AS so_anh, SUM(CASE WHEN pm.role = 'COVER' THEN 1 ELSE 0 END) AS cover
FROM place p LEFT JOIN place_media pm ON pm.place_id = p.id
WHERE p.slug IN (${slugs})
GROUP BY p.slug, p.name ORDER BY p.name;
`;
const outPath = path.resolve('ops/seed/insert-photos-dimcc-supabase.sql');
fs.writeFileSync(outPath, out);
console.log(`\n${results.length}/${items.length} ảnh đã lên Supabase. SQL: ${outPath}`);
