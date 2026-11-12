import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

// Đọc env từ backend-api/.env.local hoặc process.env
const envPath = path.resolve('backend-api/.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq > 0) {
      const k = trimmed.slice(0, eq).trim();
      const v = trimmed.slice(eq + 1).trim();
      if (!process.env[k]) process.env[k] = v;
    }
  }
}

const CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME;
const API_KEY = process.env.CLOUDINARY_API_KEY;
const API_SECRET = process.env.CLOUDINARY_API_SECRET;

if (!CLOUD_NAME || !API_KEY || !API_SECRET) {
  console.error('Thiếu cấu hình Cloudinary trong backend-api/.env.local!');
  process.exit(1);
}

// Danh sách các homestay và ảnh từ file gốc (để đảm bảo thứ tự chính xác)
const sqlPath = path.resolve('ops/seed/insert-photos-dimcc.sql');
const sqlContent = fs.readFileSync(sqlPath, 'utf8');

// Định nghĩa đầy đủ danh sách 64 ảnh gốc
const RAW_ITEMS = [
  // homestay-anh-tuc (5 ảnh)
  { slug: 'homestay-anh-tuc', fileId: '1a2RDQLveeRde6v60ox06IMm1-GSX_h5Z', sortOrder: 0 },
  { slug: 'homestay-anh-tuc', fileId: '1ZC6DAxM1SVqYYR4CHGYfGQczwyZ3d8c-', sortOrder: 1 },
  { slug: 'homestay-anh-tuc', fileId: '1d1BJGzpkrv8f8Dw3gzLcBK0ojP3ENjzI', sortOrder: 2 },
  { slug: 'homestay-anh-tuc', fileId: '1kCKZs_ErUc3iPamM4wX6jEJM3PhR6xXS', sortOrder: 3 },
  { slug: 'homestay-anh-tuc', fileId: '1Eos-PisGrm9wHd2x9bZyL2m3mwqw_Rx2', sortOrder: 4 },

  // new-highland-hotel (3 ảnh)
  { slug: 'new-highland-hotel', fileId: '1rXdFz7id7_LjuE82HsZgs1d6WP1yBZ7e', sortOrder: 0 },
  { slug: 'new-highland-hotel', fileId: '1hCPH6NJ-CVShxScvI2GfgJJE9A0uWwpD', sortOrder: 1 },
  { slug: 'new-highland-hotel', fileId: '1WbxLIeVJXwUwJeaf1GuKBfSmzbkaAup9', sortOrder: 2 },

  // hoa-son-tra-hotel (1 ảnh)
  { slug: 'hoa-son-tra-hotel', fileId: '1W06k1RNvz4WMsQeaVqzgo7NE2DdRO0yy', sortOrder: 0 },

  // nha-nghi-duy-vu (1 ảnh)
  { slug: 'nha-nghi-duy-vu', fileId: '19z2eXqhiJLVybIAvFSkwmzNEeeK2YjvV', sortOrder: 0 },

  // homestay-hoa-thao (5 ảnh)
  { slug: 'homestay-hoa-thao', fileId: '1ZOAXyVpSMUP8PWvRyCHyIPysMw5QGpbj', sortOrder: 0 },
  { slug: 'homestay-hoa-thao', fileId: '1RG52lcn_qsd89qF6YIw2kPI3HFUd8xQH', sortOrder: 1 },
  { slug: 'homestay-hoa-thao', fileId: '1GEbayd0E2YRKBCDSc-5Crurzwxo6DWNr', sortOrder: 2 },
  { slug: 'homestay-hoa-thao', fileId: '1-McYaeXy9cR8qmmyFCFMFft7eNj1ORB0', sortOrder: 3 },
  { slug: 'homestay-hoa-thao', fileId: '1fF4Buif01tARjK2fH-a7DfY-m-lNhHt8', sortOrder: 4 },

  // homestay-cuong-tu (5 ảnh)
  { slug: 'homestay-cuong-tu', fileId: '1jC_uyQ531C-H98BwSDwB2vEtr4cYqo8n', sortOrder: 0 },
  { slug: 'homestay-cuong-tu', fileId: '1JKArE_9VZd_34rCXS7r4YBs-W3T2OdHJ', sortOrder: 1 },
  { slug: 'homestay-cuong-tu', fileId: '1Fw032VIDv3-Z25ve2FUAhcLfncrECcxx', sortOrder: 2 },
  { slug: 'homestay-cuong-tu', fileId: '1nXLtV6tOK_nPeSAOZ3lM0jfgFTDA7qgw', sortOrder: 3 },
  { slug: 'homestay-cuong-tu', fileId: '1tqmvGW9r0j1H_IvhIG8Ho1WM1ADm790_', sortOrder: 4 },

  // homestay-bao-lan (4 ảnh)
  { slug: 'homestay-bao-lan', fileId: '15rf-cPK4nku-1pdwHgf225WuQVHZzOiG', sortOrder: 0 },
  { slug: 'homestay-bao-lan', fileId: '1qrdtH_rZXgRPvG-WTpvlN3jUPOkHjGAZ', sortOrder: 1 },
  { slug: 'homestay-bao-lan', fileId: '1311JCRLcm3f-YP2HWIkrA93qKP_3mjEU', sortOrder: 2 },
  { slug: 'homestay-bao-lan', fileId: '1_FakTmA84bqJ_W9t6AW-7MZlOvS9G51g', sortOrder: 3 },

  // win-homestay (4 ảnh drone)
  { slug: 'win-homestay', fileId: '1zYMr9S6xMzsPV4uy7JQUc3V6oYXKMFuQ', sortOrder: 0 },
  { slug: 'win-homestay', fileId: '1quFOSUoNHU-w7UhZHSZa6fIZSy6kZwi7', sortOrder: 1 },
  { slug: 'win-homestay', fileId: '1WJpu0gnM0cBstD1EGaUtbxsW-ivdXkky', sortOrder: 2 },
  { slug: 'win-homestay', fileId: '1WG9mGAtpaRCAi0QFXLdbrOTCHzvEJ7zP', sortOrder: 3 },

  // pu-nhu-house (5 ảnh)
  { slug: 'pu-nhu-house', fileId: '19OzuU8-8fPqW04JABT1LR_WSkC8p8wT2', sortOrder: 0 },
  { slug: 'pu-nhu-house', fileId: '1kfMoXspypBHum7p8bSuithI8J0vOUXu-', sortOrder: 1 },
  { slug: 'pu-nhu-house', fileId: '1Xn691lCbK3DIK4HS7L8pDsHroVlHbkg-', sortOrder: 2 },
  { slug: 'pu-nhu-house', fileId: '1d8-h3f-bJPj_xcCFlCmtWXkOTTiQCSBF', sortOrder: 3 },
  { slug: 'pu-nhu-house', fileId: '1qdrliMepxRuDIwvGBx81NFTyLVEL0TRv', sortOrder: 4 },

  // co-gai-thai-homestay (5 ảnh)
  { slug: 'co-gai-thai-homestay', fileId: '1JUlARR5v0FC-FSdUWzoGHemy_2Luoyqh', sortOrder: 0 },
  { slug: 'co-gai-thai-homestay', fileId: '1S9_k2IKKLvyfAS40cH8AnlZcXj07rsFa', sortOrder: 1 },
  { slug: 'co-gai-thai-homestay', fileId: '1pW2SfloFWwYYQp1wfy-XVHGIAczrlMB6', sortOrder: 2 },
  { slug: 'co-gai-thai-homestay', fileId: '1gNYsuAzbGqyWIn91L0KgSZMeabHHsFEm', sortOrder: 3 },
  { slug: 'co-gai-thai-homestay', fileId: '1lsf-Y3Gu1dJOrrKT5si7UPHYW0KseTEB', sortOrder: 4 },

  // moc-homestay (4 ảnh)
  { slug: 'moc-homestay', fileId: '1iVtsux0LQe7DXm6g15zsIUjZl0ZgoY1i', sortOrder: 0 },
  { slug: 'moc-homestay', fileId: '1acgQo4urm1shzGGA-BHaJoVW2GU5Q-Ik', sortOrder: 1 },
  { slug: 'moc-homestay', fileId: '1FPeKd-pnRkhmmjbYwyEvRUMeOzaZR_JF', sortOrder: 2 },
  { slug: 'moc-homestay', fileId: '1tAY6wLR0uyM9cKWdD5yp_lxGiYtJbSrQ', sortOrder: 3 },

  // bungalow-xuan-giang (5 ảnh)
  { slug: 'bungalow-xuan-giang', fileId: '1rVMvRLExU1gNYmKOINNjEDKKhdlQTkU3', sortOrder: 0 },
  { slug: 'bungalow-xuan-giang', fileId: '1Xo30KBXTyDQ8D6fe6qjWIygh7D1sMUFg', sortOrder: 1 },
  { slug: 'bungalow-xuan-giang', fileId: '1z9WwGO3rFjYB_kuYNRGLvckv5z-AcuB9', sortOrder: 2 },
  { slug: 'bungalow-xuan-giang', fileId: '1tb0mlwR_KdxmCuqcbU3hksEZ0-FQkHAL', sortOrder: 3 },
  { slug: 'bungalow-xuan-giang', fileId: '1OPGfcmHra1jfE5B65TAmBpGt1M-VIFlu', sortOrder: 4 },

  // hotel-thuat-hoa (2 ảnh)
  { slug: 'hotel-thuat-hoa', fileId: '11VqzSrYKxtdwIMV7Nif4jJcD6r0yH4SS', sortOrder: 0 },
  { slug: 'hotel-thuat-hoa', fileId: '1dZWzySZoyuB7kVsnh_JiMSY9rzHp2cU6', sortOrder: 1 },

  // chelly-hotel (5 ảnh drone)
  { slug: 'chelly-hotel', fileId: '1g7N5v5840ejum3gVWD7Nf1-MEHRIQS86', sortOrder: 0 },
  { slug: 'chelly-hotel', fileId: '1hGD7vBdDcIuvZ6aZwJHNIpF67QRKq86V', sortOrder: 1 },
  { slug: 'chelly-hotel', fileId: '1j1TYfo-MXfJK1eR-UhrHxpknuDYsPpaj', sortOrder: 2 },
  { slug: 'chelly-hotel', fileId: '1PxZ70yvQxIp_UIfTzFVbHamQCN6E8ZPM', sortOrder: 3 },
  { slug: 'chelly-hotel', fileId: '1indQGDvPBqf9qDEeacsu6GeM22IQWUur', sortOrder: 4 },

  // hanh-phuc-creek-homestay (5 ảnh)
  { slug: 'hanh-phuc-creek-homestay', fileId: '1GAy6l3NGnltZ7-CSfaS1eNdCCHv_Zucm', sortOrder: 0 },
  { slug: 'hanh-phuc-creek-homestay', fileId: '11d0A71kmG_mOerclPcjXdwuxFaaII9iL', sortOrder: 1 },
  { slug: 'hanh-phuc-creek-homestay', fileId: '1kSLi5qfLt7wqb5-Sq2DiuO2qOxdc9c5q', sortOrder: 2 },
  { slug: 'hanh-phuc-creek-homestay', fileId: '1KddIAymEOWgTLY5QPavq20Yg0LhJwZKV', sortOrder: 3 },
  { slug: 'hanh-phuc-creek-homestay', fileId: '1WAI5P1EMuHYDzdWkI4s8T88m7ODUCiKI', sortOrder: 4 },

  // hotel-nhat-phuong (5 ảnh drone)
  { slug: 'hotel-nhat-phuong', fileId: '1CtQdMs8KLYcYe77wxoBlcxN8uYydgc6c', sortOrder: 0 },
  { slug: 'hotel-nhat-phuong', fileId: '16rZ6wDOBB0w-Md6IbV7rRucwI2sOzBai', sortOrder: 1 },
  { slug: 'hotel-nhat-phuong', fileId: '1YTJZLHT6qh4RPmBeZeE5JuJXJHBeMsQE', sortOrder: 2 },
  { slug: 'hotel-nhat-phuong', fileId: '1PaR0rrTQspD44r4Yf8iiugAO7ez9y7rP', sortOrder: 3 },
  { slug: 'hotel-nhat-phuong', fileId: '1tOEDUpt7cTPe-DFj5__5gYutvcloOCb4', sortOrder: 4 },
];

console.log(`══════════════════════════════════════════════════════════`);
console.log(` BỔ SUNG ẢNH CÒN LẠI LÊN CLOUDINARY`);
console.log(` Cloud: ${CLOUD_NAME} | Tổng số ảnh: ${RAW_ITEMS.length}`);
console.log(`══════════════════════════════════════════════════════════\n`);

const cacheFile = path.resolve('ops/seed/.uploaded-cloudinary-cache.json');
let cache = {};
if (fs.existsSync(cacheFile)) {
  try {
    cache = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
  } catch {}
}

async function downloadDrive(fileId) {
  const url = `https://drive.google.com/uc?id=${fileId}&export=download`;
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`Download HTTP ${res.status}`);
  let buf = Buffer.from(await res.arrayBuffer());

  // Nếu file > 10MB (Cloudinary limit), nén về 2560px JPEG bằng Python Pillow
  if (buf.length > 10 * 1024 * 1024) {
    process.stdout.write(`(Ảnh lớn ${(buf.length / (1024 * 1024)).toFixed(1)}MB, đang tối ưu...) `);
    const pyScript = `
import sys, io
from PIL import Image

data = sys.stdin.buffer.read()
img = Image.open(io.BytesIO(data))
max_edge = 2560
if max(img.size) > max_edge:
    scale = max_edge / max(img.size)
    new_size = (int(img.size[0] * scale), int(img.size[1] * scale))
    img = img.resize(new_size, Image.Resampling.LANCZOS)
out = io.BytesIO()
img.convert('RGB').save(out, format='JPEG', quality=85)
sys.stdout.buffer.write(out.getvalue())
`;
    buf = execFileSync('python', ['-c', pyScript], { input: buf, maxBuffer: 30 * 1024 * 1024 });
  }

  return buf;
}

async function uploadCloudinary(buffer, slug, sha16) {
  const publicId = `viettrek/homestays/${slug}/${sha16}`;
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = crypto.createHash('sha1').update(`public_id=${publicId}&timestamp=${timestamp}${API_SECRET}`).digest('hex');

  const form = new FormData();
  form.append('file', new Blob([buffer], { type: 'image/jpeg' }), `${sha16}.jpg`);
  form.append('public_id', publicId);
  form.append('timestamp', String(timestamp));
  form.append('api_key', API_KEY);
  form.append('signature', signature);

  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, {
    method: 'POST',
    body: form,
  });
  const data = await res.json();
  if (!res.ok || !data.secure_url) {
    throw new Error(data.error?.message || `Cloudinary HTTP ${res.status}`);
  }
  return { publicId: data.public_id, url: data.secure_url };
}

async function processItem(item, idx, total) {
  const cacheKey = item.fileId;
  if (cache[cacheKey]) {
    process.stdout.write(`[${idx}/${total}] ${item.slug} (#${item.sortOrder}) -> Đã có trong cache ✓\n`);
    return { ...item, ...cache[cacheKey] };
  }

  process.stdout.write(`[${idx}/${total}] Đang xử lý ${item.slug} (#${item.sortOrder})... `);
  try {
    const buf = await downloadDrive(item.fileId);
    const sha16 = crypto.createHash('sha256').update(buf).digest('hex').slice(0, 16);
    const result = await uploadCloudinary(buf, item.slug, sha16);

    cache[cacheKey] = {
      storageKey: `cloudinary:${result.publicId}`,
      publicUrl: result.url,
      sha16,
    };
    fs.writeFileSync(cacheFile, JSON.stringify(cache, null, 2));

    process.stdout.write(`Xong ✓\n`);
    return { ...item, ...cache[cacheKey] };
  } catch (err) {
    process.stdout.write(`LỖI: ${err.message} ✗\n`);
    return null;
  }
}

async function main() {
  const results = [];
  let idx = 1;
  const total = RAW_ITEMS.length;

  for (const item of RAW_ITEMS) {
    const res = await processItem(item, idx++, total);
    if (res) results.push(res);
  }

  console.log(`\n══════════════════════════════════════════════════════════`);
  console.log(` Kết quả: ${results.length}/${total} ảnh đã có trên Cloudinary.`);
  console.log(` Đang cập nhật insert-photos-dimcc.sql...`);

  const valuesSql = results.map(r => 
    `  ('${r.slug}', '${r.storageKey}', '${r.publicUrl}', ${r.sortOrder})`
  ).join(',\n');

  const outSql = `-- ══════════════════════════════════════════════════════════════════════════════
-- Insert ảnh CHUẨN CLOUDINARY vào media_asset + place_media
-- Cloudinary Account: ${CLOUD_NAME}
-- Tổng số ảnh: ${results.length} ảnh cho 16 homestay ĐiMCC
-- ══════════════════════════════════════════════════════════════════════════════

BEGIN;

-- Bước 1: Insert media_asset với storage_key và public_url chuẩn Cloudinary
INSERT INTO media_asset (storage_key, public_url, mime_type, created_at)
SELECT
  v.storage_key,
  v.public_url,
  'image/jpeg',
  now() AT TIME ZONE 'Asia/Ho_Chi_Minh'
FROM (VALUES
${valuesSql}
) AS v(slug, storage_key, public_url, sort_order)
ON CONFLICT (storage_key) DO NOTHING;

-- Bước 2: Insert place_media (gắn ảnh vào place)
INSERT INTO place_media (place_id, media_id, role, sort_order)
SELECT
  p.id,
  m.id,
  CASE WHEN v.sort_order = 0 THEN 'COVER' ELSE 'GALLERY' END,
  v.sort_order
FROM (VALUES
${valuesSql}
) AS v(slug, storage_key, public_url, sort_order)
JOIN place p ON p.slug = v.slug
JOIN media_asset m ON m.storage_key = v.storage_key
WHERE NOT EXISTS (
  SELECT 1 FROM place_media pm WHERE pm.place_id = p.id AND pm.media_id = m.id
);

COMMIT;

-- Kiểm tra kết quả
SELECT
  p.slug,
  p.name,
  COUNT(pm.id) AS so_anh,
  SUM(CASE WHEN pm.role = 'COVER' THEN 1 ELSE 0 END) AS cover
FROM place p
LEFT JOIN place_media pm ON pm.place_id = p.id
WHERE p.slug IN (
  'homestay-anh-tuc','new-highland-hotel','hoa-son-tra-hotel','nha-nghi-duy-vu',
  'homestay-hoa-thao','homestay-cuong-tu','homestay-bao-lan','win-homestay',
  'pu-nhu-house','co-gai-thai-homestay','moc-homestay','bungalow-xuan-giang',
  'hotel-thuat-hoa','chelly-hotel','hanh-phuc-creek-homestay','hotel-nhat-phuong'
)
GROUP BY p.slug, p.name
ORDER BY p.name;
`;

  const finalSqlPath = path.resolve('ops/seed/insert-photos-dimcc.sql');
  fs.writeFileSync(finalSqlPath, outSql);
  console.log(` Đã cập nhật thành công: ${finalSqlPath}`);
  console.log(`══════════════════════════════════════════════════════════`);
}

main().catch(console.error);
