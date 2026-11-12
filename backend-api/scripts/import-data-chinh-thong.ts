import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { config, loadEnvFiles } from '../src/config/env.js';
import { closePool, exec, initPool, one, query, scalar, tx } from '../src/db/pool.js';
import { insertRow } from '../src/db/sql.js';
import { nowLocal } from '../src/lib/time.js';
import { normalize } from '../src/lib/vietnamese.js';
import { bumpCatalogVersion } from '../src/services/catalogCache.js';

/**
 * Bước 2/2 của đợt nhập "DATA CHÍNH THỐNG": đọc ops/import/data-chinh-thong/dataset.json (do build_dataset.py dựng từ file Excel)
 * rồi thêm vào hệ thống — mọi địa điểm mới đều mang cờ place.data_verified = FALSE ("chưa xác thực") và kèm ảnh từ các thư mục ảnh.
 *
 *   npm run import:data-chinh-thong                      # chạy THỬ (mặc định): chỉ đọc DB, in kế hoạch + ghi báo cáo, KHÔNG ghi gì
 *   npm run import:data-chinh-thong -- --apply --confirm-host=<host DB>   # ghi thật
 *
 * Tùy chọn:
 *   --visibility=PUBLISHED|DRAFT|UNPUBLISHED   hiển thị của địa điểm mới (mặc định PUBLISHED: khách thấy ngay; cờ "chưa xác thực" chỉ để Admin
 *                                              theo dõi, không ẩn dữ liệu khỏi khách)
 *   --publish-held           công khai luôn cả các mục dataset đề nghị giữ ẩn (chỉ có tên + ảnh; nhà hàng bị ghi "Không có")
 *   --festival-visibility=PUBLISHED|DRAFT      hiển thị của lễ hội mới (mặc định PUBLISHED)
 *   --attach-existing        gắn thêm ảnh từ thư mục ảnh vào các địa điểm ĐÃ CÓ (mặc định: không đụng tới địa điểm hiện hữu)
 *   --verified               đặt data_verified = TRUE cho địa điểm mới (dữ liệu đã xác thực xong)
 *   --skip-images            không tải / không gắn ảnh
 *   --only=HOMESTAY,RESTAURANT,...             chỉ xử lý các loại địa điểm này (mặc định: tất cả; lễ hội đi kèm khi có FESTIVAL)
 *   --upload=supabase|cloudinary|fake          nơi tải ảnh (mặc định supabase = Supabase Storage; fake: không gọi mạng)
 *   --report=<file.md>       ghi báo cáo đối chiếu (mặc định ops/import/data-chinh-thong/bao-cao-doi-chieu.md)
 *   --concurrency=3          số ảnh tải song song
 *
 * Chạy lại nhiều lần an toàn: địa điểm đã nhập (nhận biết bằng slug + source_name) được bỏ qua; ảnh đã tải được nhớ trong
 * .import-state/uploads.<kho ảnh>.json (tách riêng theo --upload và tài khoản Cloudinary, không bao giờ lẫn ảnh thử với ảnh thật)
 * nên không tải lại.
 */

const REPO = path.resolve(import.meta.dirname, '../..');
const DATA_DIR = path.join(REPO, 'ops/import/data-chinh-thong');
const MARKER = 'DATA CHÍNH THỐNG';
const MAX_IMAGES = 30; // khớp MAX_IMAGES_PER_OWNER của partnerMediaService
const IMAGE_MIME: Record<string, string> = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };

// ---- Kiểu dữ liệu của dataset.json ---------------------------------------------------------------------------------------------
interface DsContact { channel: string; value: string }
interface DsHighlight { type: string; content: string }
interface DsPlace {
  key: string; kind: string; name: string; slug: string; regionCode: string | null; address: string | null; description: string | null;
  accessNote: string | null; latitude: number | null; longitude: number | null; altitudeM: number | null;
  priceRefMin: number | null; priceRefMax: number | null; priceUnitNote: string | null; googleRating: number | null;
  sourceName: string | null; sourceUrl: string | null; operationNote: string | null;
  contacts: DsContact[]; highlights: DsHighlight[]; amenities: string[];
  homestayProfile: { viewHighlight?: string; suitability?: string; otherAmenities?: string } | null;
  attractionProfile: { needs?: string | null; suitableSessions?: string | null } | null;
  serviceProfile: {
    serviceGroup: string; vehicleType: string | null; routeFrom: string | null; routeTo: string | null; departureTimes: string | null;
    durationMinutes: number | null; seats: number | null; groupSizeMax: number | null; languages: string | null; includes: string | null;
  } | null;
  photoFolders: string[]; origins: Array<{ sheet: string; row: number }>; notes: string[]; holdBack: string | null;
}
interface DsFestival {
  key: string; slug: string; name: string; seasonNote: string; coreValue: string; suitableExperience: string; etiquetteDont: string;
  regionCode: string; origins: Array<{ sheet: string; row: number }>;
}
interface DsFolder {
  folder: string; images: string[]; videos: string[]; target?: string | null; targetKind?: 'new' | 'stub' | 'existing' | 'empty' | 'unmatched';
  existingName?: string; confidence?: string;
}
interface DsExistingRef { kind: 'ATTRACTION' | 'DISH'; sheet: string; row: number; name: string; expectNames: string[] }
interface Dataset {
  meta: { source: string; builtAt: string };
  places: DsPlace[]; festivals: DsFestival[]; existingRefs: DsExistingRef[]; folders: DsFolder[];
  unmapped: Array<{ sheet: string; row: number; name: string; reason: string }>;
}
interface CoverageRow { sheet: string; row: number; name: string; outcome: string; ref: string | null; note: string | null }

// ---- Tham số dòng lệnh -----------------------------------------------------------------------------------------------------------
function parseArgs(argv: string[]): Record<string, string | true> {
  const out: Record<string, string | true> = {};
  for (const a of argv) {
    const m = /^--([^=]+)(?:=(.*))?$/.exec(a);
    if (m) out[m[1]] = m[2] ?? true;
  }
  return out;
}
const args = parseArgs(process.argv.slice(2));
const APPLY = args.apply === true;
const SKIP_IMAGES = args['skip-images'] === true;
const ATTACH_EXISTING = args['attach-existing'] === true;
const UPLOAD = String(args.upload ?? 'supabase');
const VISIBILITY = String(args.visibility ?? 'PUBLISHED');
const FESTIVAL_VISIBILITY = String(args['festival-visibility'] ?? 'PUBLISHED');
const PUBLISH_HELD = args['publish-held'] === true;
/** Dữ liệu đã được đội xác thực xong → đặt place.data_verified = TRUE cho địa điểm mới (mặc định FALSE như đợt đầu). */
const VERIFIED = args.verified === true;
const CONCURRENCY = Number(args.concurrency ?? 3);
const ONLY = args.only ? String(args.only).split(',').map((s) => s.trim().toUpperCase()) : null;
const DATASET_PATH = String(args.dataset ?? path.join(DATA_DIR, 'dataset.json'));
const COVERAGE_PATH = path.join(path.dirname(DATASET_PATH), 'coverage.json');
const REPORT_PATH = String(args.report ?? path.join(DATA_DIR, 'bao-cao-doi-chieu.md'));
const STATE_DIR = path.join(DATA_DIR, '.import-state');

if (!['DRAFT', 'UNPUBLISHED', 'PUBLISHED'].includes(VISIBILITY)) throw new Error(`--visibility không hợp lệ: ${VISIBILITY}`);
if (!['DRAFT', 'PUBLISHED'].includes(FESTIVAL_VISIBILITY)) throw new Error(`--festival-visibility không hợp lệ: ${FESTIVAL_VISIBILITY}`);
if (!['supabase', 'cloudinary', 'fake'].includes(UPLOAD)) throw new Error(`--upload không hợp lệ: ${UPLOAD}`);

// ---- Tiện ích ---------------------------------------------------------------------------------------------------------------------
const cut = (s: string | null | undefined, n: number): string | null => (s == null || s === '' ? null : s.length > n ? s.slice(0, n - 1) + '…' : s);
const round6 = (n: number | null): number | null => (n == null ? null : Math.round(n * 1e6) / 1e6);
const fmtVnd = (n: number | null) => (n == null ? '' : n.toLocaleString('vi-VN'));
const log = (...a: unknown[]) => console.log(...a);
let regionNames = new Map<string, string>(); // mã khu vực → tên, chỉ để báo cáo dễ đọc

interface ImageItem { abs: string; rel: string; sha: string; size: number; ext: string; srcUrl?: string }
const hashCache = new Map<string, { sha: string; size: number }>();
function describeFile(rel: string): ImageItem {
  const abs = path.join(REPO, rel);
  let h = hashCache.get(abs);
  if (!h && SKIP_IMAGES) {
    // Không có thư mục ảnh trên máy này: chỉ nhập phần chữ, không đọc file ảnh.
    h = { sha: crypto.createHash('sha256').update(rel).digest('hex'), size: 0 };
    hashCache.set(abs, h);
  }
  if (!h) {
    const buf = fs.readFileSync(abs);
    h = { sha: crypto.createHash('sha256').update(buf).digest('hex'), size: buf.length };
    hashCache.set(abs, h);
  }
  return { abs, rel, sha: h.sha, size: h.size, ext: path.extname(abs).toLowerCase() };
}

/** Ảnh của một nhóm thư mục: giữ thứ tự, bỏ ảnh trùng nội dung (cùng sha256), chặn quá MAX_IMAGES. */
function collectImages(folderRecs: DsFolder[], reserved = 0): { items: ImageItem[]; files: number; duplicates: number; overflow: number } {
  const seen = new Set<string>();
  const items: ImageItem[] = [];
  let files = 0;
  for (const rec of folderRecs) {
    for (const rel of rec.images) {
      if (!fs.existsSync(path.join(REPO, rel))) continue; // file gốc không còn trên máy: bỏ qua (ảnh lấy từ cache theo slug)
      files++;
      const it = describeFile(rel);
      if (seen.has(it.sha)) continue;
      seen.add(it.sha);
      items.push(it);
    }
  }
  const room = Math.max(0, MAX_IMAGES - reserved);
  const kept = items.slice(0, room);
  return { items: kept, files, duplicates: files - items.length, overflow: items.length - kept.length };
}

/**
 * Ảnh theo slug lấy từ cache đã tải lên Cloudinary (publicId dạng viettrek/import-data-chinh-thong/<slug>/<sha16>).
 * Dùng khi thư mục ảnh gốc không còn trên máy: ánh xạ ảnh ↔ địa điểm vẫn đúng vì slug được ghi vào publicId lúc tải.
 */
function itemsFromState(slug: string): ReturnType<typeof collectImages> {
  const legacyPrefix = `viettrek/import-data-chinh-thong/${slug}/`;
  const sbPrefix = `import-data-chinh-thong/${slug}/`;
  const bySha = new Map<string, ImageItem>();
  for (const [sha, u] of Object.entries(legacyCloudinary)) {
    if (u.publicId.startsWith(legacyPrefix)) bySha.set(sha, { abs: '', rel: `cloudinary:${u.publicId}`, sha, size: u.bytes ?? 0, ext: path.extname(u.url).toLowerCase() || '.jpg', srcUrl: u.url });
  }
  for (const [sha, u] of Object.entries(uploadState)) {
    if ((u.publicId.startsWith(sbPrefix) || u.publicId.startsWith(legacyPrefix)) && !bySha.has(sha)) {
      bySha.set(sha, { abs: '', rel: u.publicId, sha, size: u.bytes ?? 0, ext: path.extname(u.url).toLowerCase() || '.jpg', srcUrl: u.url });
    }
  }
  const items = [...bySha.values()];
  const kept = items.slice(0, MAX_IMAGES);
  return { items: kept, files: items.length, duplicates: 0, overflow: items.length - kept.length };
}
const localFilesExist = (recs: DsFolder[]) => recs.some((r) => r.images.some((rel) => fs.existsSync(path.join(REPO, rel))));

// ---- Tải ảnh ---------------------------------------------------------------------------------------------------------------------
interface Uploaded { publicId: string; url: string; width: number | null; height: number | null; bytes: number | null }
type UploadState = Record<string, Uploaded>;
let uploadState: UploadState = {};
let stateFile = '';
let legacyCloudinary: Record<string, { publicId: string; url: string; width: number | null; height: number | null; bytes: number | null }> = {};
/** Đọc cache ảnh đã tải; tên file gắn với kho ảnh nên ảnh "fake" không bao giờ bị dùng lại cho lần tải thật. */
function loadState(): void {
  const store = UPLOAD === 'fake' ? 'fake' : UPLOAD === 'supabase' ? `supabase.${config().supabase.storageBucket}` : `cloudinary.${config().cloudinary.cloudName || 'unset'}`;
  stateFile = path.join(STATE_DIR, `uploads.${store}.json`);
  uploadState = fs.existsSync(stateFile) ? (JSON.parse(fs.readFileSync(stateFile, 'utf8')) as UploadState) : {};
  // Ảnh đã lên Cloudinary ở lần chạy trước: nguồn để chép sang Supabase khi thư mục ảnh gốc không còn trên máy.
  legacyCloudinary = {};
  if (fs.existsSync(STATE_DIR)) {
    for (const f of fs.readdirSync(STATE_DIR).filter((n) => /^uploads\.cloudinary\..+\.json$/.test(n))) {
      Object.assign(legacyCloudinary, JSON.parse(fs.readFileSync(path.join(STATE_DIR, f), 'utf8')) as UploadState);
    }
  }
}
function saveState() {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.writeFileSync(stateFile, JSON.stringify(uploadState, null, 1));
}

async function uploadOne(item: ImageItem, folderId: string): Promise<Uploaded> {
  const cached = uploadState[item.sha];
  if (cached) return cached;
  const publicId = `viettrek/import-data-chinh-thong/${folderId}/${item.sha.slice(0, 16)}`;
  if (UPLOAD === 'fake') {
    const fake = { publicId, url: `https://res.cloudinary.com/fake-cloud/image/upload/${publicId}${item.ext}`, width: null, height: null, bytes: item.size };
    uploadState[item.sha] = fake;
    return fake;
  }
  if (UPLOAD === 'supabase') {
    const sb = config().supabase;
    if (!sb.url || !sb.serviceKey) throw new Error('Thiếu SUPABASE_URL / SUPABASE_SERVICE_KEY.');
    const objectPath = `import-data-chinh-thong/${folderId}/${item.sha.slice(0, 16)}${item.ext || '.jpg'}`;
    let buf: Buffer;
    if (item.abs && fs.existsSync(item.abs)) buf = fs.readFileSync(item.abs);
    else if (item.srcUrl) {
      const dl = await fetch(item.srcUrl, { signal: AbortSignal.timeout(120_000) });
      if (!dl.ok) throw new Error(`Không tải được nguồn ${item.srcUrl}: HTTP ${dl.status}`);
      buf = Buffer.from(await dl.arrayBuffer());
    } else throw new Error(`Không có nguồn cho ${item.rel}`);
    const base = sb.url.replace(/\/+$/, '');
    let lastE: unknown;
    for (let attempt = 1; attempt <= 4; attempt++) {
      try {
        const res = await fetch(`${base}/storage/v1/object/${sb.storageBucket}/${objectPath}`, {
          method: 'POST',
          headers: { apikey: sb.serviceKey, Authorization: `Bearer ${sb.serviceKey}`, 'Content-Type': IMAGE_MIME[item.ext] ?? 'image/jpeg', 'x-upsert': 'true' },
          body: new Blob([buf]),
          signal: AbortSignal.timeout(180_000),
        });
        if (res.ok) {
          const up = { publicId: objectPath, url: `${base}/storage/v1/object/public/${sb.storageBucket}/${objectPath}`, width: null, height: null, bytes: buf.length };
          uploadState[item.sha] = up;
          saveState();
          return up;
        }
        lastE = new Error(`Supabase ${res.status}: ${(await res.text()).slice(0, 150)}`);
        if (res.status < 500 && res.status !== 429) break;
      } catch (err) { lastE = err; }
      await new Promise((r) => setTimeout(r, 1500 * attempt));
    }
    throw new Error(`Không đưa được ${item.rel} lên Supabase: ${(lastE as Error).message}`);
  }
  const c = config().cloudinary;
  if (!c.cloudName || !c.apiKey || !c.apiSecret) throw new Error('Thiếu CLOUDINARY_CLOUD_NAME / CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET.');
  let lastErr: unknown;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const timestamp = Math.floor(Date.now() / 1000);
      const signature = crypto.createHash('sha1').update(`public_id=${publicId}&timestamp=${timestamp}${c.apiSecret}`).digest('hex');
      const form = new FormData();
      form.append('file', new Blob([fs.readFileSync(item.abs)], { type: IMAGE_MIME[item.ext] ?? 'image/jpeg' }), path.basename(item.abs));
      form.append('api_key', c.apiKey);
      form.append('timestamp', String(timestamp));
      form.append('public_id', publicId);
      form.append('signature', signature);
      const res = await fetch(`https://api.cloudinary.com/v1_1/${c.cloudName}/image/upload`, { method: 'POST', body: form, signal: AbortSignal.timeout(180_000) });
      const body = (await res.json().catch(() => ({}))) as { secure_url?: string; public_id?: string; width?: number; height?: number; bytes?: number; error?: { message?: string } };
      if (res.ok && body.secure_url) {
        const up = { publicId: body.public_id ?? publicId, url: body.secure_url, width: body.width ?? null, height: body.height ?? null, bytes: body.bytes ?? null };
        uploadState[item.sha] = up;
        saveState();
        return up;
      }
      lastErr = new Error(`Cloudinary ${res.status}: ${body.error?.message ?? 'lỗi không rõ'}`);
      if (res.status < 500 && res.status !== 429) break; // lỗi do yêu cầu, thử lại cũng vô ích
    } catch (err) {
      lastErr = err;
    }
    await new Promise((r) => setTimeout(r, 1500 * attempt));
  }
  throw new Error(`Không tải được ${item.rel}: ${(lastErr as Error).message}`);
}

async function uploadAll(items: Array<{ item: ImageItem; folderId: string }>): Promise<void> {
  const queue = [...items];
  const workers = Array.from({ length: Math.max(1, CONCURRENCY) }, async () => {
    for (let job = queue.shift(); job; job = queue.shift()) {
      await uploadOne(job.item, job.folderId);
    }
  });
  await Promise.all(workers);
  if (UPLOAD === 'fake') saveState();
}

// ---- Ghi DB ---------------------------------------------------------------------------------------------------------------------
async function findOrCreateAsset(item: ImageItem, up: Uploaded, altText: string, folderLabel: string): Promise<number> {
  const existing = await one<{ id: number }>('SELECT id FROM media_asset WHERE checksum_sha256 = $1', [item.sha]);
  if (existing) return existing.id;
  const row = await insertRow<{ id: number }>('media_asset', {
    storageKey: UPLOAD === 'supabase' ? up.publicId : `cloudinary:${up.publicId}`,
    publicUrl: up.url,
    mimeType: IMAGE_MIME[item.ext] ?? 'image/jpeg',
    widthPx: up.width,
    heightPx: up.height,
    sizeBytes: up.bytes ?? item.size,
    checksumSha256: item.sha,
    altText: cut(altText, 500),
    licenseNote: cut(`Ảnh nhập từ thư mục "${folderLabel}" của đội dữ liệu; chưa xác minh nguồn / bản quyền — nên thay bằng ảnh chính chủ trước khi công khai.`, 2000),
    createdAt: nowLocal(),
  });
  return row.id;
}

async function attachImages(placeId: number, placeName: string, items: ImageItem[], folderLabel: string, startOrder: number, hasCover: boolean): Promise<number> {
  let order = startOrder;
  let attached = 0;
  for (const item of items) {
    const up = uploadState[item.sha];
    if (!up) throw new Error(`Chưa có kết quả tải cho ${item.rel}`);
    const mediaId = await findOrCreateAsset(item, up, placeName, folderLabel);
    const already = await scalar<boolean>('SELECT count(*) > 0 FROM place_media WHERE place_id = $1 AND media_id = $2', [placeId, mediaId]);
    if (already) continue;
    await exec('INSERT INTO place_media (place_id, media_id, role, caption, sort_order) VALUES ($1,$2,$3,NULL,$4)', [
      placeId, mediaId, !hasCover && attached === 0 ? 'COVER' : 'GALLERY', order++,
    ]);
    attached++;
  }
  return attached;
}

/** Hiển thị của địa điểm mới: mặc định theo --visibility; mục dataset đề nghị giữ ẩn (holdBack) ở DRAFT trừ khi --publish-held. */
const visibilityOf = (p: DsPlace): string => (p.holdBack && !PUBLISH_HELD && VISIBILITY === 'PUBLISHED' ? 'DRAFT' : VISIBILITY);

// ---- Kế hoạch ---------------------------------------------------------------------------------------------------------------------
type Action = 'create' | 'already-imported' | 'duplicate-existing';
interface PlaceDecision {
  place: DsPlace; action: Action; slug: string; existingId?: number; existingName?: string;
  images: ReturnType<typeof collectImages>; folderRecs: DsFolder[]; videos: string[];
}
interface AttachDecision { existingName: string; placeId: number | null; kind?: string; folders: DsFolder[]; images: ReturnType<typeof collectImages>; present: number; hasCover: boolean; willAttach: boolean }

async function main() {
  loadEnvFiles();
  const dbCfg = config().db;
  const dataset = JSON.parse(fs.readFileSync(DATASET_PATH, 'utf8')) as Dataset;
  const coverage = fs.existsSync(COVERAGE_PATH) ? (JSON.parse(fs.readFileSync(COVERAGE_PATH, 'utf8')) as CoverageRow[]) : [];

  log('='.repeat(100));
  log(`Đích: ${dbCfg.host}:${dbCfg.port}/${dbCfg.database}  | chế độ: ${APPLY ? 'GHI THẬT (--apply)' : 'CHẠY THỬ (chỉ đọc)'}  | hiển thị mới: ${VISIBILITY}${PUBLISH_HELD ? ' (kể cả mục nên giữ ẩn)' : ''}`);
  log(`Dataset: ${path.relative(REPO, DATASET_PATH)} (dựng ${dataset.meta.builtAt}) | ảnh: ${SKIP_IMAGES ? 'bỏ qua' : UPLOAD} | gắn ảnh cho địa điểm đã có: ${ATTACH_EXISTING ? 'CÓ' : 'không'}`);
  log('='.repeat(100));
  if (APPLY && args['confirm-host'] !== dbCfg.host) {
    throw new Error(`Để ghi thật vào "${dbCfg.host}", chạy lại kèm --confirm-host=${dbCfg.host} (chốt chặn chống ghi nhầm môi trường).`);
  }

  loadState();
  initPool(dbCfg);
  const hasFlag = await scalar<boolean>(`SELECT count(*) > 0 FROM information_schema.columns WHERE table_name = 'place' AND column_name = 'data_verified' AND table_schema = current_schema()`);
  if (!hasFlag) throw new Error('DB chưa có cột place.data_verified — áp dụng migration 016 trước (npm run migrate), rồi chạy lại.');

  const regionRows = await query<{ id: number; code: string; name: string }>('SELECT id, code, name FROM region');
  const regionId = new Map(regionRows.map((r) => [r.code, r.id]));
  regionNames = new Map(regionRows.map((r) => [r.code, r.name]));
  const amenityId = new Map((await query<{ id: number; code: string }>(`SELECT id, code FROM amenity WHERE scope = 'PLACE'`)).map((r) => [r.code, r.id]));
  const folderByName = new Map(dataset.folders.map((f) => [f.folder, f]));

  // 1) Đối chiếu dòng Excel đã có sẵn trong hệ thống (điểm đến, đặc sản)
  const dbAttractions = await query<{ id: number; name: string }>(`SELECT id, name FROM place WHERE kind = 'ATTRACTION' AND is_deleted = FALSE`);
  const dbDishes = await query<{ id: number; name: string }>('SELECT id, name FROM dish');
  const existingChecks = dataset.existingRefs.map((ref) => {
    const pool = ref.kind === 'ATTRACTION' ? dbAttractions : dbDishes;
    const found = pool.find((r) => ref.expectNames.some((n) => normalize(n) === normalize(r.name)));
    return { ref, found: found ?? null };
  });

  // 2) Kế hoạch từng địa điểm
  const wanted = (p: DsPlace) => !ONLY || ONLY.includes(p.kind);
  const decisions: PlaceDecision[] = [];
  for (const p of dataset.places.filter(wanted)) {
    const folderRecs = p.photoFolders.map((f) => folderByName.get(f)).filter((f): f is DsFolder => !!f);
    const images = folderRecs.length === 0 || localFilesExist(folderRecs) ? collectImages(folderRecs) : itemsFromState(p.slug);
    const videos = folderRecs.flatMap((f) => f.videos);
    let slug = p.slug;
    const bySlug = await one<{ id: number; sourceName: string | null; name: string }>('SELECT id, source_name, name FROM place WHERE slug = $1', [slug]);
    if (bySlug && (bySlug.sourceName ?? '').startsWith(MARKER)) {
      decisions.push({ place: p, action: 'already-imported', slug, existingId: bySlug.id, existingName: bySlug.name, images, folderRecs, videos });
      continue;
    }
    const byName = await one<{ id: number; slug: string; name: string }>('SELECT id, slug, name FROM place WHERE name_norm = $1 AND is_deleted = FALSE', [normalize(p.name)]);
    if (byName) {
      decisions.push({ place: p, action: 'duplicate-existing', slug, existingId: byName.id, existingName: byName.name, images, folderRecs, videos });
      continue;
    }
    for (let i = 2; bySlug && (await scalar<boolean>('SELECT count(*) > 0 FROM place WHERE slug = $1', [slug])); i++) {
      if (i > 20) throw new Error(`Không tìm được slug trống cho ${p.name}`);
      slug = `${p.slug}-${i}`; // slug gốc đang bị một địa điểm khác (không phải của đợt nhập này) chiếm
    }
    decisions.push({ place: p, action: 'create', slug, images, folderRecs, videos });
  }

  // 3) Ảnh cho địa điểm đã có
  const attachByName = new Map<string, AttachDecision>();
  for (const f of dataset.folders.filter((x) => x.targetKind === 'existing' && x.existingName)) {
    const key = normalize(f.existingName!);
    let a = attachByName.get(key);
    if (!a) {
      const row = await one<{ id: number; kind: string }>('SELECT id, kind FROM place WHERE name_norm = $1 AND is_deleted = FALSE', [key]);
      const present = row ? ((await scalar<number>('SELECT count(*) FROM place_media WHERE place_id = $1', [row.id])) ?? 0) : 0;
      const hasCover = row ? (await scalar<boolean>(`SELECT count(*) > 0 FROM place_media WHERE place_id = $1 AND role = 'COVER'`, [row.id])) === true : false;
      a = { existingName: f.existingName!, placeId: row?.id ?? null, kind: row?.kind, folders: [], images: { items: [], files: 0, duplicates: 0, overflow: 0 }, present: Number(present), hasCover, willAttach: ATTACH_EXISTING && !!row };
      attachByName.set(key, a);
    }
    a.folders.push(f);
  }
  for (const a of attachByName.values()) a.images = collectImages(a.folders, a.present);

  // ---- In kế hoạch -----------------------------------------------------------------------------------------------------------
  const count = (action: Action) => decisions.filter((d) => d.action === action).length;
  log(`\nĐịa điểm: ${decisions.length} trong dataset → tạo mới ${count('create')}, đã nhập trước đó ${count('already-imported')}, trùng địa điểm đang có ${count('duplicate-existing')}`);
  const byKind = new Map<string, number>();
  decisions.filter((d) => d.action === 'create').forEach((d) => byKind.set(d.place.kind, (byKind.get(d.place.kind) ?? 0) + 1));
  log('  tạo mới theo loại:', Object.fromEntries(byKind));
  const held = decisions.filter((d) => d.action === 'create' && visibilityOf(d.place) !== VISIBILITY);
  if (held.length) log(`  giữ ở DRAFT (chưa cho khách thấy) ${held.length} mục: ${held.map((d) => d.place.name).join(', ')}`);
  for (const d of decisions.filter((x) => x.action !== 'create')) log(`  - ${d.action}: ${d.place.name} ↔ #${d.existingId} ${d.existingName}`);
  const newFestivals: DsFestival[] = [];
  if (!ONLY || ONLY.includes('FESTIVAL')) {
    for (const f of dataset.festivals) {
      if (!(await scalar<boolean>('SELECT count(*) > 0 FROM festival WHERE slug = $1', [f.slug]))) newFestivals.push(f);
    }
  }
  log(`Lễ hội: ${dataset.festivals.length} trong dataset → tạo mới ${newFestivals.length}`);
  const miss = existingChecks.filter((c) => !c.found);
  log(`Đối chiếu dữ liệu đã có: ${existingChecks.length - miss.length}/${existingChecks.length} dòng Excel (điểm đến + đặc sản) khớp bản ghi trong hệ thống${miss.length ? '; THIẾU: ' + miss.map((m) => m.ref.name).join(' | ') : ''}`);

  const newImgs = decisions.filter((d) => d.action !== 'duplicate-existing').reduce((s, d) => s + d.images.items.length, 0);
  const attachImgs = [...attachByName.values()].reduce((s, a) => s + a.images.items.length, 0);
  const videoCount = dataset.folders.reduce((s, f) => s + f.videos.length, 0);
  log(`Ảnh: ${newImgs} ảnh khác nhau cho địa điểm mới; ${attachImgs} ảnh cho địa điểm đã có (${ATTACH_EXISTING ? 'SẼ gắn' : 'KHÔNG gắn, thêm --attach-existing nếu muốn'}); ${videoCount} video chưa nhập.`);

  writeReport({ dataset, coverage, decisions, newFestivals, existingChecks, attachByName });

  if (!APPLY) {
    log(`\n[CHẠY THỬ] Không ghi gì vào DB. Báo cáo: ${path.relative(REPO, REPORT_PATH)}`);
    return;
  }

  // ---- Ghi thật -------------------------------------------------------------------------------------------------------------
  const failures: string[] = [];
  const toUpload: Array<{ item: ImageItem; folderId: string }> = [];
  if (!SKIP_IMAGES) {
    for (const d of decisions.filter((x) => x.action === 'create' || x.action === 'already-imported')) {
      for (const item of d.images.items) toUpload.push({ item, folderId: d.slug });
    }
    if (ATTACH_EXISTING) {
      for (const a of attachByName.values()) if (a.willAttach) for (const item of a.images.items) toUpload.push({ item, folderId: normalize(a.existingName).replace(/ /g, '-') });
    }
    const pending = toUpload.filter((j) => !uploadState[j.item.sha]);
    log(`\nTải ảnh: ${pending.length} ảnh mới (đã có sẵn trong cache: ${toUpload.length - pending.length})...`);
    try {
      await uploadAll(pending);
    } catch (err) {
      failures.push((err as Error).message);
      log('!! Lỗi tải ảnh:', (err as Error).message);
    }
  }

  const now = nowLocal();
  let created = 0;
  for (const d of decisions) {
    const p = d.place;
    try {
      if (d.action === 'create') {
        await tx(async () => {
          const place = await insertRow<{ id: number }>('place', {
            slug: d.slug, kind: p.kind, name: p.name, nameNorm: normalize(p.name), description: p.description, providerId: null,
            regionId: p.regionCode ? regionId.get(p.regionCode) ?? null : null, address: cut(p.address, 500),
            latitude: round6(p.latitude), longitude: round6(p.longitude), altitudeM: p.altitudeM, accessNote: p.accessNote,
            priceRefMin: p.priceRefMin, priceRefMax: p.priceRefMax, priceUnitNote: cut(p.priceUnitNote, 64),
            visibility: visibilityOf(p), operationStatus: 'OPERATING', operationNote: cut(p.operationNote, 500), isDeleted: false,
            googleRating: p.googleRating, ratingCount: 0, sourceType: 'PUBLIC_TRUSTED', sourceName: cut(p.sourceName, 255),
            sourceUrl: cut(p.sourceUrl, 1000), verification: 'UNVERIFIED', coordVerified: false,
            dataVerified: VERIFIED, // mặc định CHƯA xác thực; --verified khi dữ liệu đã được đội xác thực xong
            approvalStatus: 'APPROVED', createdAt: now, updatedAt: now,
          });
          const id = place.id;
          if (p.kind === 'HOMESTAY') {
            await insertRow('homestay_profile', {
              placeId: id, viewHighlight: p.homestayProfile?.viewHighlight ?? null, suitability: p.homestayProfile?.suitability ?? null,
              otherAmenities: p.homestayProfile?.otherAmenities ?? null, updatedAt: now,
            });
          }
          if (p.attractionProfile) {
            await insertRow('attraction_profile', { placeId: id, needs: p.attractionProfile.needs ?? null, suitableSessions: p.attractionProfile.suitableSessions ?? null });
          }
          if (p.serviceProfile) {
            const sp = p.serviceProfile;
            await insertRow('place_service_profile', {
              placeId: id, serviceGroup: sp.serviceGroup, vehicleType: cut(sp.vehicleType, 64), routeFrom: cut(sp.routeFrom, 120), routeTo: cut(sp.routeTo, 120),
              departureTimes: cut(sp.departureTimes, 255), durationMinutes: sp.durationMinutes, seats: sp.seats, groupSizeMax: sp.groupSizeMax,
              languages: cut(sp.languages, 64), includes: cut(sp.includes, 1000), updatedAt: now,
            });
          }
          for (const [i, c] of p.contacts.entries()) await insertRow('place_contact', { placeId: id, channel: c.channel, value: c.value, isPublic: true, sortOrder: i });
          for (const [i, h] of p.highlights.entries()) await insertRow('place_highlight', { placeId: id, type: h.type, content: h.content, isPublic: true, sortOrder: i });
          for (const code of p.amenities) {
            const aid = amenityId.get(code);
            if (aid) await exec(`INSERT INTO place_amenity (place_id, amenity_id, value) VALUES ($1,$2,'YES')`, [id, aid]);
          }
          if (!SKIP_IMAGES && d.images.items.length > 0) await attachImages(id, p.name, d.images.items, d.folderRecs.map((f) => f.folder).join(' + '), 0, false);
        });
        created++;
        log(`  [tạo] ${p.kind.padEnd(10)} ${p.name}${d.images.items.length && !SKIP_IMAGES ? `  (+${d.images.items.length} ảnh)` : ''}`);
      } else if (d.action === 'already-imported' && !SKIP_IMAGES && d.images.items.length > 0 && d.existingId) {
        const has = await scalar<number>('SELECT count(*) FROM place_media WHERE place_id = $1', [d.existingId]);
        if (Number(has) === 0) {
          await tx(() => attachImages(d.existingId!, p.name, d.images.items, d.folderRecs.map((f) => f.folder).join(' + '), 0, false));
          log(`  [bổ sung ảnh] ${p.name} (+${d.images.items.length} ảnh)`);
        }
      }
    } catch (err) {
      failures.push(`${p.name}: ${(err as Error).message}`);
      log(`  !! ${p.name}: ${(err as Error).message}`);
    }
  }

  for (const f of newFestivals) {
    try {
      await insertRow('festival', {
        slug: f.slug, name: f.name, nameNorm: normalize(f.name), seasonNote: cut(f.seasonNote, 500), coreValue: f.coreValue || null,
        suitableExperience: f.suitableExperience || null, etiquetteDont: f.etiquetteDont || null, regionId: regionId.get(f.regionCode) ?? null,
        visibility: FESTIVAL_VISIBILITY, isDeleted: false,
      });
      log(`  [tạo] FESTIVAL   ${f.name}`);
    } catch (err) {
      failures.push(`Lễ hội ${f.name}: ${(err as Error).message}`);
    }
  }

  let attached = 0;
  if (ATTACH_EXISTING && !SKIP_IMAGES) {
    for (const a of attachByName.values()) {
      if (!a.willAttach || !a.placeId || a.images.items.length === 0) continue;
      try {
        const n = await tx(() => attachImages(a.placeId!, a.existingName, a.images.items, a.folders.map((f) => f.folder).join(' + '), a.present, a.hasCover));
        attached += n;
        log(`  [gắn ảnh vào địa điểm có sẵn] ${a.existingName}: +${n}`);
      } catch (err) {
        failures.push(`Gắn ảnh ${a.existingName}: ${(err as Error).message}`);
      }
    }
  }

  await bumpCatalogVersion();
  log(`\nXong: tạo ${created} địa điểm, ${newFestivals.length} lễ hội, gắn ${attached} ảnh vào địa điểm có sẵn.`);
  const total = await scalar<number>(`SELECT count(*) FROM place WHERE source_name LIKE $1 AND data_verified = $2 AND is_deleted = FALSE`, [`${MARKER}%`, VERIFIED]);
  log(`Kiểm tra: ${total} địa điểm mang nguồn "${MARKER}" có data_verified = ${VERIFIED ? 'TRUE' : 'FALSE'}.`);
  if (failures.length) {
    log(`\n!! ${failures.length} lỗi (chạy lại lệnh này để thử tiếp phần còn lại):`);
    failures.forEach((f) => log('  -', f));
    process.exitCode = 1;
  }
}

// ---- Báo cáo đối chiếu -----------------------------------------------------------------------------------------------------------
function writeReport(ctx: {
  dataset: Dataset; coverage: CoverageRow[]; decisions: PlaceDecision[]; newFestivals: DsFestival[];
  existingChecks: Array<{ ref: DsExistingRef; found: { id: number; name: string } | null }>; attachByName: Map<string, AttachDecision>;
}) {
  const { dataset, coverage, decisions, newFestivals, existingChecks, attachByName } = ctx;
  const L: string[] = [];
  const kindLabel: Record<string, string> = { HOMESTAY: 'Homestay / khách sạn', RESTAURANT: 'Nhà hàng / quán', TRANSPORT: 'Vận chuyển', CULTURE: 'Trải nghiệm văn hóa', PHOTO: 'Chụp ảnh & trang phục', SERVICE: 'Dịch vụ', ATTRACTION: 'Điểm tham quan', RENTAL: 'Thuê xe' };
  const esc = (s: string | null | undefined) => (s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
  L.push('# Báo cáo đối chiếu — đợt nhập "DATA CHÍNH THỐNG"', '');
  L.push(`- Nguồn: \`${dataset.meta.source}\` (dựng dataset ngày ${dataset.meta.builtAt}) + 3 thư mục ảnh \`ẢNH HOMESTAY MCC\`, \`ẢNH HOTEL - KHÁCH SẠN MCC\`, \`NHÀ HÀNG\`.`);
  L.push(`- Đích: \`${config().db.host}/${config().db.database}\` — ${APPLY ? '**đã ghi**' : '**chạy thử, chưa ghi gì**'}.`);
  L.push('- Quy ước: địa điểm mới có **data_verified = FALSE (chưa xác thực — chỉ là cờ để Admin theo dõi)**, `verification = UNVERIFIED`, hiển thị `' + VISIBILITY + '` (khách thấy ngay), không gắn nhà cung cấp.');
  const heldAll = decisions.filter((d) => d.action === 'create' && d.place.holdBack);
  if (heldAll.length) {
    L.push(`- **${heldAll.length} mục giữ ở DRAFT** (chưa cho khách thấy) vì chưa đủ thông tin / còn nghi vấn; Admin bấm *Công khai* khi sẵn sàng, hoặc chạy với \`--publish-held\`:`);
    heldAll.forEach((d) => L.push(`  - ${d.place.name}: ${d.place.holdBack}`));
  }
  L.push('');

  L.push('## 1. Tóm tắt', '');
  const create = decisions.filter((d) => d.action === 'create');
  const kinds = [...new Set(create.map((d) => d.place.kind))];
  L.push('| Loại | Tạo mới | Đã nhập trước đó | Trùng địa điểm đang có |', '|---|---:|---:|---:|');
  for (const k of kinds) {
    const of = decisions.filter((d) => d.place.kind === k);
    L.push(`| ${kindLabel[k] ?? k} | ${of.filter((d) => d.action === 'create').length} | ${of.filter((d) => d.action === 'already-imported').length} | ${of.filter((d) => d.action === 'duplicate-existing').length} |`);
  }
  L.push(`| Lễ hội (bảng festival) | ${newFestivals.length} | ${dataset.festivals.length - newFestivals.length} | 0 |`, '');
  const imgFiles = create.reduce((s, d) => s + d.images.files, 0);
  const imgUnique = create.reduce((s, d) => s + d.images.items.length, 0);
  L.push(`Ảnh cho địa điểm mới: **${imgUnique}** ảnh khác nhau (từ ${imgFiles} file; bỏ ${create.reduce((s, d) => s + d.images.duplicates, 0)} ảnh trùng nội dung, ${create.reduce((s, d) => s + d.images.overflow, 0)} ảnh vượt giới hạn ${MAX_IMAGES}/địa điểm).`, '');

  L.push('## 2. Địa điểm tạo mới', '');
  L.push('| # | Loại | Tên | Khu vực | Giá tham khảo | Toạ độ | SĐT | Ảnh (file→khác nhau) | Nguồn dòng Excel |', '|---:|---|---|---|---|---|---|---|---|');
  create.forEach((d, i) => {
    const p = d.place;
    const phones = p.contacts.filter((c) => c.channel === 'PHONE').map((c) => c.value).join(', ');
    const price = p.priceRefMin == null ? '' : `${fmtVnd(p.priceRefMin)}${p.priceRefMax !== p.priceRefMin ? '–' + fmtVnd(p.priceRefMax) : ''} ${p.priceUnitNote ?? ''}`;
    const origin = p.origins.length ? p.origins.map((o) => `${o.sheet} #${o.row}`).join(' + ') : '(chỉ thư mục ảnh)';
    L.push(`| ${i + 1} | ${kindLabel[p.kind] ?? p.kind} | ${esc(p.name)} | ${p.regionCode ? regionNames.get(p.regionCode) ?? p.regionCode : '—'} | ${esc(price)} | ${p.latitude != null ? 'có' : '—'} | ${phones || '—'} | ${d.images.files ? `${d.images.files}→${d.images.items.length}` : '—'} | ${origin} |`);
  });
  L.push('');
  const dup = decisions.filter((d) => d.action !== 'create');
  if (dup.length) {
    L.push('### Bỏ qua (đã có)', '');
    dup.forEach((d) => L.push(`- ${d.place.name} ↔ #${d.existingId} "${d.existingName}" — ${d.action === 'already-imported' ? 'đã nhập ở lần chạy trước' : 'trùng tên với địa điểm đang có'}`));
    L.push('');
  }

  // Ảnh giống hệt nhau (cùng sha256) xuất hiện ở nhiều địa điểm mới: dấu hiệu hai tên là một cơ sở, hoặc ảnh chụp chung khu vực.
  const shaToPlaces = new Map<string, Set<string>>();
  for (const d of create) for (const it of d.images.items) shaToPlaces.set(it.sha, (shaToPlaces.get(it.sha) ?? new Set()).add(d.place.name));
  const shared = new Map<string, number>();
  for (const names of shaToPlaces.values()) if (names.size > 1) shared.set([...names].sort().join(' ↔ '), (shared.get([...names].sort().join(' ↔ ')) ?? 0) + 1);
  if (shared.size) {
    L.push('### Ảnh giống hệt nhau giữa các địa điểm mới', '', 'Các cặp sau dùng chung ảnh (cùng nội dung file). Có thể là cùng một cơ sở đăng dưới hai tên — cần người xác nhận. Hệ thống lưu mỗi ảnh một lần và dùng lại cho cả hai.', '');
    for (const [pair, n] of shared) L.push(`- ${pair}: ${n} ảnh`);
    L.push('');
  }

  L.push('## 3. Dòng Excel đã có sẵn trong hệ thống (đối chiếu với DB)', '');
  L.push('| Sheet | Dòng | Tên trong Excel | Bản ghi trong hệ thống |', '|---|---:|---|---|');
  existingChecks.forEach((c) => L.push(`| ${c.ref.sheet} | ${c.ref.row} | ${esc(c.ref.name)} | ${c.found ? `#${c.found.id} ${esc(c.found.name)}` : '**THIẾU — chưa có trong hệ thống**'} |`));
  L.push('');

  L.push('## 4. Thư mục ảnh → nơi gắn', '');
  L.push('| Thư mục | Ảnh | Khác nhau | Video | Gắn vào | Ghi chú |', '|---|---:|---:|---:|---|---|');
  const planned = new Map(create.map((d) => [d.place.key, d]));
  for (const f of dataset.folders) {
    const uniq = collectImages([f]).items.length;
    let dest = '';
    let note = '';
    if (f.targetKind === 'existing') {
      dest = `địa điểm có sẵn "${f.existingName}"`;
      note = ATTACH_EXISTING ? 'sẽ gắn thêm ảnh (--attach-existing)' : 'KHÔNG gắn (giữ nguyên địa điểm hiện có; thêm --attach-existing nếu muốn)';
    } else if (f.targetKind === 'empty') {
      dest = '—';
      note = 'thư mục rỗng, không có gì để nhập';
    } else if (f.target) {
      const pl = dataset.places.find((p) => p.key === f.target);
      dest = `${pl?.name ?? f.target}${f.targetKind === 'stub' ? ' (tạo mới chỉ từ ảnh)' : ''}`;
      note = f.confidence && f.confidence !== 'khớp tên' ? `⚠ ${f.confidence}` : planned.has(f.target) ? '' : 'đã có / bỏ qua';
    } else {
      dest = '—';
      note = 'không khớp địa điểm nào';
    }
    L.push(`| ${esc(f.folder)} | ${f.images.length} | ${uniq} | ${f.videos.length} | ${esc(dest)} | ${esc(note)} |`);
  }
  L.push('');
  const vids = dataset.folders.flatMap((f) => f.videos.map((v) => ({ folder: f.folder, file: v })));
  if (vids.length) {
    L.push(`### Video chưa nhập (${vids.length} file)`, '', 'Hệ thống chỉ lưu và hiển thị ảnh cho địa điểm (place_media là ảnh), chưa có chỗ chứa video của địa điểm nên các file sau KHÔNG được nhập — cần quyết định hướng xử lý (vd đăng YouTube/TikTok rồi gắn link kênh).', '');
    vids.forEach((v) => L.push(`- ${v.file}`));
    L.push('');
  }
  const attachList = [...attachByName.values()];
  if (attachList.length) {
    L.push('### Ảnh của địa điểm ĐÃ CÓ trong hệ thống', '');
    L.push('| Địa điểm có sẵn | Ảnh sẵn có | Ảnh trong thư mục | Khác nhau (còn chỗ) | Trạng thái |', '|---|---:|---:|---:|---|');
    attachList.forEach((a) => L.push(`| ${esc(a.existingName)}${a.placeId ? ` (#${a.placeId})` : ' — **không tìm thấy trong DB**'} | ${a.present} | ${a.images.files} | ${a.images.items.length} | ${ATTACH_EXISTING ? 'sẽ gắn' : 'chưa gắn'} |`));
    L.push('', '> Lưu ý: ảnh đã có sẵn của các địa điểm này được tải từ trước nên không có mã băm để so trùng; gắn thêm có thể tạo ảnh lặp.', '');
  }

  L.push('## 5. Mỗi dòng Excel đi đâu (phủ 100% dòng có dữ liệu)', '');
  const bySheet = new Map<string, CoverageRow[]>();
  coverage.forEach((c) => bySheet.set(c.sheet, [...(bySheet.get(c.sheet) ?? []), c]));
  L.push('| Sheet | Số dòng | Tạo mới | Gộp | Đã có sẵn | Không có bảng đích |', '|---|---:|---:|---:|---:|---:|');
  for (const [sheet, rows] of bySheet) {
    const n = (o: string) => rows.filter((r) => r.outcome === o).length;
    L.push(`| ${sheet} | ${rows.length} | ${n('created')} | ${n('merged')} | ${n('existing')} | ${n('unmapped')} |`);
  }
  L.push('', 'Chi tiết từng dòng: `coverage.json`.', '');
  if (dataset.unmapped.length) {
    L.push('### Không nhập được (không có bảng đích)', '');
    dataset.unmapped.forEach((u) => L.push(`- ${u.sheet} dòng ${u.row} — ${u.name}: ${u.reason}`));
    L.push('');
  }

  L.push('## 6. Cảnh báo chất lượng dữ liệu cần người rà soát', '');
  for (const d of create) {
    const notes = d.place.notes.filter((n) => !n.startsWith('Google Maps ghi tên cơ sở'));
    if (notes.length) {
      L.push(`**${d.place.name}**`);
      notes.forEach((n) => L.push(`- ${n}`));
      L.push('');
    }
  }
  fs.writeFileSync(REPORT_PATH, L.join('\n'));
}

main()
  .catch((err) => {
    console.error('LỖI:', (err as Error).message);
    process.exitCode = 1;
  })
  .finally(() => closePool());
