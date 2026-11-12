/**
 * Upload ảnh homestay ĐiMCC từ Google Drive lên Cloudinary (phương thức chuẩn của hệ thống)
 * Chạy: node ops/scripts/upload-homestay-photos.mjs
 *
 * Env vars:
 *   CLOUDINARY_CLOUD_NAME=kttdfqzj
 *   CLOUDINARY_API_KEY=...
 *   CLOUDINARY_API_SECRET=...
 *   SUPABASE_URL=https://xxx.supabase.co
 *   SUPABASE_SERVICE_KEY=eyJhbGci...
 *   GOOGLE_API_KEY=AIza...   (nếu folder Drive private)
 */

import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';
import { createHash } from 'crypto';
import FormData from 'form-data';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME;
const API_KEY = process.env.CLOUDINARY_API_KEY;
const API_SECRET = process.env.CLOUDINARY_API_SECRET;
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) { console.error('Thiếu SUPABASE_URL / SUPABASE_SERVICE_KEY'); process.exit(1); }
if (!CLOUD_NAME || !API_KEY || !API_SECRET) { console.error('Thiếu CLOUDINARY_CLOUD_NAME / CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET'); process.exit(1); }

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const HOMESTAYS = [
  { slug: 'homestay-anh-tuc',          folderId: '1wX_I7Y_qTxOM7-GFq1mO1V_qGzeXmfr1' },
  { slug: 'new-highland-hotel',         folderId: '1-TxuG3T8mfPhX6kV_jiFZizyPBfdB_nj' },
  { slug: 'homestay-mua-vang',          folderId: '1vaFotiTR1ZQBRExz2iTu-EWhWXNs_ZI6' },
  { slug: 'trai-ban-homestay',          folderId: '1Jz3vd4QklBnOB8A_LA1jZMTqU9YyPOt0' },
  { slug: 'hoa-son-tra-hotel',          folderId: '1JCpeTi4ZcnsrahDnXXpzOP-foaimSgTD' },
  { slug: 'nha-nghi-duy-vu',            folderId: '1v0RV3wp4iPoLOsgd7gcRFS3BgtEVPVV5' },
  { slug: 'baan-mali-homestay',         folderId: '1SSB7-gvwQ1LdllWRq9-tzkNejQYtFjKY' },
  { slug: 'homestay-hoa-thao',          folderId: '1HXORopokxjMqRlI39c2MmPfQKJOhy3HG' },
  { slug: 'homestay-cuong-tu',          folderId: '1YLpgQdcGdKa9a6gWq0h8ROWR-EYTjIeH' },
  { slug: 'homestay-bao-lan',           folderId: '1592rCN-KZxWb7EYS7ty6iTMfI8x643NM' },
  { slug: 'win-homestay',               folderId: '1Eovea3kproJim_n4uaNYA1Chqkz6TEVA' },
  { slug: 'pu-nhu-house',               folderId: '1o5OBms9uDQJ2RbdbJIXORc21-twsaMNN' },
  { slug: 'co-gai-thai-homestay',       folderId: '1106A-VJf_zyWTydgyL-Vvz_t_Y3AXQwA' },
  { slug: 'moc-homestay',               folderId: '1Ay_UfAFE-RABtD-PlxGlvqg5n3IC9plI' },
  { slug: 'bungalow-xuan-giang',        folderId: '1wcd8sAwwkrLA-wmlOn1FD_zeZLXIWikI' },
  { slug: 'hotel-thuat-hoa',            folderId: '15YBCuQEOHnUejxFqFhI2dh3FMyY8uRo0' },
  { slug: 'chelly-hotel',               folderId: '1vYDf5PXDkTccrC_AUEPxFHv2WP62i-wa' },
  { slug: 'hanh-phuc-creek-homestay',   folderId: '13vFdKmWvTXEnqnF204XM6tFBvlSigzTN' },
  { slug: 'doi-doi-gio',                folderId: '1vUhEdi628k3OM3NUEJ2RvEqUYhans1QD' },
  { slug: 'mai-linh-hotel',             folderId: '1hD6l8n9h4K_ByLAigAIPo9OIWaQXK9oc' },
  { slug: 'sky-motel',                  folderId: '1mi9uyJ9w8uRtfNO_HMLhCPg99gZKzRY4' },
  { slug: 'nang-hotel',                 folderId: '1N_-3tfGYnhu4RI4XvTyUAFLiYawNAROf' },
  { slug: 'nha-nghi-ngu',               folderId: '1M1a7_7n4znBBJkDWcoBXQhoFXG-dSQa_' },
  { slug: 'chiba-ecolodge',             folderId: '17CRfE7zZsaYWhRPPOJOVKhM3HFDeo-S2' },
  { slug: 'ha-chau-2-homestay',         folderId: '123PRIqLKLsDBIeJUBFLkudPxFhbJYdV3' },
  { slug: 'hotel-nhat-phuong',          folderId: '1kvbvSL-FKY6wKG_w_okHWqF0d3RWcggU' },
];

const MAX_PHOTOS_PER_HOMESTAY = 10;

async function getDriveImages(folderId) {
  const base = 'https://www.googleapis.com/drive/v3/files';
  const fields = 'files(id,name,mimeType)';

  async function listFolder(id) {
    let q = `'${id}' in parents`;
    if (GOOGLE_API_KEY) q += ` and trashed = false`;
    const url = `${base}?q=${encodeURIComponent(q)}&fields=${fields}${GOOGLE_API_KEY ? `&key=${GOOGLE_API_KEY}` : ''}&pageSize=100`;
    const res = await fetch(url);
    const json = await res.json();
    if (json.error) throw new Error(json.error.message);
    return json.files || [];
  }

  let files = await listFolder(folderId);
  let images = files.filter(f => f.mimeType?.startsWith('image/'));

  if (images.length === 0) {
    const subfolders = files.filter(f => f.mimeType === 'application/vnd.google-apps.folder');
    for (const sf of subfolders) {
      const subFiles = await listFolder(sf.id);
      const subImages = subFiles.filter(f => f.mimeType?.startsWith('image/'));
      if (subImages.length > 0) { images = subImages; break; }
    }
  }

  return images.slice(0, MAX_PHOTOS_PER_HOMESTAY);
}

async function downloadDriveFile(fileId) {
  const url = `https://drive.google.com/uc?id=${fileId}&export=download`;
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status} khi download ${fileId}`);
  return Buffer.from(await res.arrayBuffer());
}

function sha1Hex(str) {
  return createHash('sha1').update(str, 'utf8').digest('hex');
}

async function uploadToCloudinary(buffer, slug, sha16) {
  const publicId = `viettrek/import-data-chinh-thong/${slug}/${sha16}`;
  const timestamp = Math.floor(Date.now() / 1000);
  const toSign = `public_id=${publicId}&timestamp=${timestamp}${API_SECRET}`;
  const signature = sha1Hex(toSign);

  const form = new FormData();
  form.append('file', buffer, { filename: `${sha16}.jpg`, contentType: 'image/jpeg' });
  form.append('public_id', publicId);
  form.append('timestamp', String(timestamp));
  form.append('api_key', API_KEY);
  form.append('signature', signature);

  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, {
    method: 'POST', body: form,
  });
  const body = await res.json();
  if (!res.ok || !body.secure_url) throw new Error(body.error?.message || `Cloudinary lỗi HTTP ${res.status}`);
  return { publicId: body.public_id ?? publicId, url: body.secure_url };
}

async function getPlaceId(slug) {
  const { data, error } = await supabase.from('place').select('id').eq('slug', slug).single();
  if (error) throw new Error(`Không tìm thấy place slug=${slug}: ${error.message}`);
  return data.id;
}

async function hasMedia(placeId) {
  const { count } = await supabase.from('place_media').select('id', { count: 'exact', head: true }).eq('place_id', placeId);
  return (count ?? 0) > 0;
}

async function insertMedia(placeId, storageKey, publicUrl, mimeType, sortOrder) {
  const { data: asset, error: e1 } = await supabase
    .from('media_asset')
    .insert({ storage_key: storageKey, public_url: publicUrl, mime_type: mimeType })
    .select('id').single();
  if (e1) throw new Error(`media_asset insert lỗi: ${e1.message}`);

  const role = sortOrder === 0 ? 'COVER' : 'GALLERY';
  const { error: e2 } = await supabase.from('place_media').insert({ place_id: placeId, media_id: asset.id, role, sort_order: sortOrder });
  if (e2) throw new Error(`place_media insert lỗi: ${e2.message}`);
}

async function processHomestay({ slug, folderId }) {
  console.log(`\n▶ ${slug}`);
  const placeId = await getPlaceId(slug);

  if (await hasMedia(placeId)) { console.log('  ✓ Đã có ảnh, bỏ qua'); return; }

  let images;
  try {
    images = await getDriveImages(folderId);
  } catch (err) {
    console.log(`  ⚠ Không lấy được danh sách ảnh: ${err.message}`);
    return;
  }

  if (images.length === 0) { console.log('  ⚠ Không tìm thấy ảnh trong folder Drive'); return; }
  console.log(`  Tìm thấy ${images.length} ảnh`);

  for (let i = 0; i < images.length; i++) {
    const img = images[i];
    process.stdout.write(`  [${i + 1}/${images.length}] ${img.name} → `);
    try {
      const buffer = await downloadDriveFile(img.id);
      const sha16 = createHash('sha256').update(buffer).digest('hex').slice(0, 16);
      const { publicId, url } = await uploadToCloudinary(buffer, slug, sha16);
      const storageKey = `cloudinary:${publicId}`;
      const mimeType = img.mimeType?.startsWith('image/') ? img.mimeType : 'image/jpeg';
      await insertMedia(placeId, storageKey, url, mimeType, i);
      console.log('✓');
    } catch (err) {
      console.log(`✗ ${err.message}`);
    }
  }
}

async function main() {
  console.log('═══════════════════════════════════════════');
  console.log(` Upload ảnh ĐiMCC → Cloudinary`);
  console.log(`  Cloud: ${CLOUD_NAME}`);
  console.log('═══════════════════════════════════════════');

  let ok = 0, fail = 0;
  for (const hs of HOMESTAYS) {
    try { await processHomestay(hs); ok++; }
    catch (err) { console.error(`  ✗ Lỗi: ${err.message}`); fail++; }
  }

  console.log('\n═══════════════════════════════════════════');
  console.log(` Xong: ${ok} homestay xử lý, ${fail} lỗi`);
  console.log('═══════════════════════════════════════════');
}

main().catch(err => { console.error(err); process.exit(1); });
