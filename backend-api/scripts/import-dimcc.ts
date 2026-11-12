import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { config, loadEnvFiles } from '../src/config/env.js';
import { migrate } from '../src/db/migrate.js';
import { closePool, exec, initPool, one, scalar, tx } from '../src/db/pool.js';
import { insertRow } from '../src/db/sql.js';
import { nowLocal } from '../src/lib/time.js';
import { insertRoomType } from '../src/repositories/roomRepo.js';
import { bumpCatalogVersion } from '../src/services/catalogCache.js';

/**
 * Đợt nhập "ĐiMCC homestay" — MỘT lệnh làm hết, dựa trên 'Tổng hợp thông tin ĐiMCC.xlsx' + thư mục 'ẢNH HOMESTAY MCC':
 *   1) áp migration còn thiếu (cho phép loại highlight NEARBY)
 *   2) tạo homestay mới từ dòng Excel chưa có trong DB, tải ảnh lên Supabase Storage và gắn vào địa điểm
 *      (tái dùng scripts/import-data-chinh-thong.ts: chạy lại nhiều lần an toàn, ảnh đã tải không tải lại)
 *   3) gắn / ghi đè "Khoảng cách đến điểm vui chơi nổi bật" (place_highlight NEARBY) cho cả 30 homestay trong Excel
 *   4) áp DỮ LIỆU ĐÃ XÁC THỰC ('DATA ĐÃ XÁC THỰC.xlsx') cho 12 homestay: giá, hạng phòng (chỉ khi chưa có hạng phòng nào),
 *      liên hệ, ưu / nhược điểm, tiện ích, đánh giá; đặt data_verified = TRUE
 *
 *   npm run import:dimcc                                               # CHẠY THỬ: chỉ đọc DB, không ghi gì
 *   npm run import:dimcc -- --apply --confirm-host=<host DB>           # ghi thật
 *
 * Các tùy chọn khác được chuyển nguyên cho import-data-chinh-thong.ts: --publish-held (công khai cả homestay "Chưa đăng"),
 * --visibility=DRAFT|PUBLISHED, --skip-images, --upload=supabase|cloudinary|fake, --verified, --concurrency=N.
 *
 * Dựng lại dataset từ Excel:  python -X utf8 ops/import/dimcc-homestay/build_dataset.py
 */

const REPO = path.resolve(import.meta.dirname, '../..');
const DATASET = path.join(REPO, 'ops/import/dimcc-homestay/dataset.json');
const REPORT = path.join(REPO, 'ops/import/dimcc-homestay/bao-cao-doi-chieu.md');
const VERIFIED = path.join(REPO, 'ops/import/dimcc-homestay/verified.json');
const DATASET_ATTRACTIONS = path.join(REPO, 'ops/import/dimcc-homestay/dataset-attractions.json');
const REPORT_ATTRACTIONS = path.join(REPO, 'ops/import/dimcc-homestay/bao-cao-diem-den.md');
const IMPORT_SCRIPT = path.join(import.meta.dirname, 'import-data-chinh-thong.ts');

interface VerifiedRoom { name: string; count: number; occupancy: number; basePrice: number | null; weekendPrice: number | null; note: string | null }
interface VerifiedPlace {
  slug: string; name: string; address: string | null; description: string; priceRefMin: number | null; priceRefMax: number | null;
  rating: number | null; view: string | null; suitability: string | null; otherAmenities: string | null;
  contacts: Array<{ channel: string; value: string }>; pros: string[]; cons: string[]; rooms: VerifiedRoom[];
}
interface NearbyRow { slug: string; name: string; content: string; existing: boolean; row: number }

const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const confirmHost = argv.find((a) => a.startsWith('--confirm-host='))?.split('=')[1];

async function main() {
  loadEnvFiles();
  const db = config().db;
  const dataset = JSON.parse(fs.readFileSync(DATASET, 'utf8')) as { nearby: NearbyRow[] };
  console.log('='.repeat(100));
  console.log(`ĐiMCC homestay → ${db.host}:${db.port}/${db.database} | chế độ: ${APPLY ? 'GHI THẬT' : 'CHẠY THỬ (không ghi)'}`);
  console.log('='.repeat(100));
  if (APPLY && confirmHost !== db.host) throw new Error(`Để ghi thật vào "${db.host}", thêm --confirm-host=${db.host}`);

  const pool = initPool(db);

  // 1) Migration
  if (APPLY) {
    console.log('\n[1/4] Áp migration còn thiếu...');
    const r = await migrate(pool);
    console.log(`      đã áp dụng ${r.applied.length}, chờ điều kiện ${r.skipped.length}`);
  } else {
    console.log('\n[1/4] (chạy thử) bỏ qua migration');
  }

  // 2) Homestay mới + ảnh: giao cho script nhập sẵn có, kế thừa chế độ thử / ghi thật.
  console.log('\n[2/4] Homestay mới + ảnh...');
  const passthrough = argv.filter((a) => a !== '--apply' && !a.startsWith('--confirm-host='));
  const runImport = (label: string, dataset: string, only: string, report: string) => {
    const childArgs = [
      '--env-file-if-exists=.env.local', '--import', 'tsx', IMPORT_SCRIPT,
      `--dataset=${dataset}`, `--only=${only}`, '--attach-existing', `--report=${report}`, ...passthrough,
      ...(APPLY ? ['--apply', `--confirm-host=${db.host}`] : []),
    ];
    const child = spawnSync(process.execPath, childArgs, { stdio: 'inherit', cwd: path.resolve(import.meta.dirname, '..') });
    if (child.status !== 0) throw new Error(`Bước nhập ${label} thất bại (mã ${child.status}). Dừng, các bước sau chưa chạy.`);
  };
  runImport('homestay + ảnh', DATASET, 'HOMESTAY', REPORT);

  // 2b) Điểm đến (ATTRACTION) từ các thư mục ảnh điểm đến ở gốc repo (Móng Ngựa, Rừng Trúc, Mâm Xôi...)
  console.log('\n[2b/4] Điểm đến + ảnh...');
  runImport('điểm đến + ảnh', DATASET_ATTRACTIONS, 'ATTRACTION', REPORT_ATTRACTIONS);

  // 3) Khoảng cách NEARBY cho cả 30 homestay
  console.log('\n[3/4] Khoảng cách đến điểm vui chơi nổi bật...');
  let ok = 0;
  const missing: string[] = [];
  for (const n of dataset.nearby) {
    const place = await one<{ id: number }>('SELECT id FROM place WHERE slug = $1 AND is_deleted = FALSE', [n.slug]);
    if (!place) {
      missing.push(`${n.name} (${n.slug})${APPLY ? '' : ' — chưa tồn tại, sẽ được tạo ở bước 2'}`);
      continue;
    }
    ok++;
    if (!APPLY) continue;
    await tx(async () => {
      await exec(`DELETE FROM place_highlight WHERE place_id = $1 AND type = 'NEARBY'`, [place.id]);
      await insertRow('place_highlight', { placeId: place.id, type: 'NEARBY', content: n.content, isPublic: true, sortOrder: 99 });
    });
  }
  console.log(`      ${APPLY ? 'đã ghi' : 'sẽ ghi'} ${ok}/${dataset.nearby.length} homestay` + (missing.length ? `; chưa có địa điểm: ${missing.join(' | ')}` : ''));

  // 4) Dữ liệu đã xác thực
  console.log('\n[4/4] Dữ liệu đã xác thực (giá, hạng phòng, liên hệ, ưu / nhược điểm)...');
  const verified = (JSON.parse(fs.readFileSync(VERIFIED, 'utf8')) as { places: VerifiedPlace[] }).places;
  let vOk = 0;
  let roomsAdded = 0;
  const roomsSkipped: string[] = [];
  const vMissing: string[] = [];
  for (const v of verified) {
    const place = await one<{ id: number }>('SELECT id FROM place WHERE slug = $1 AND is_deleted = FALSE', [v.slug]);
    if (!place) {
      vMissing.push(v.slug);
      continue;
    }
    const existingRooms = (await scalar<number>('SELECT count(*) FROM room_type WHERE place_id = $1', [place.id])) ?? 0;
    vOk++;
    if (existingRooms > 0) roomsSkipped.push(v.slug);
    else roomsAdded += v.rooms.length;
    if (!APPLY) continue;
    const now = nowLocal();
    await tx(async () => {
      await exec(
        `UPDATE place SET description = $2, price_ref_min = $3, price_ref_max = $4, price_unit_note = 'đêm (tùy loại phòng)',
           google_rating = COALESCE($5, google_rating), address = COALESCE($6, address), data_verified = TRUE, updated_at = $7 WHERE id = $1`,
        [place.id, v.description, v.priceRefMin, v.priceRefMax, v.rating, v.address, now],
      );
      const updated = await exec(
        'UPDATE homestay_profile SET view_highlight = $2, suitability = $3, other_amenities = $4, updated_at = $5 WHERE place_id = $1',
        [place.id, v.view, v.suitability, v.otherAmenities, now],
      );
      if (updated === 0) {
        await insertRow('homestay_profile', { placeId: place.id, viewHighlight: v.view, suitability: v.suitability, otherAmenities: v.otherAmenities, updatedAt: now });
      }
      await exec(`DELETE FROM place_contact WHERE place_id = $1 AND channel IN ('PHONE', 'FACEBOOK', 'TIKTOK')`, [place.id]);
      for (const [i, c] of v.contacts.entries()) await insertRow('place_contact', { placeId: place.id, channel: c.channel, value: c.value, isPublic: true, sortOrder: i });
      await exec(`DELETE FROM place_highlight WHERE place_id = $1 AND type IN ('PRO', 'CON')`, [place.id]);
      for (const [i, t] of v.pros.entries()) await insertRow('place_highlight', { placeId: place.id, type: 'PRO', content: t, isPublic: true, sortOrder: i });
      for (const [i, t] of v.cons.entries()) await insertRow('place_highlight', { placeId: place.id, type: 'CON', content: t, isPublic: true, sortOrder: i });
      if (existingRooms === 0) {
        for (const r of v.rooms) {
          await insertRoomType({
            placeId: place.id, name: r.name, description: r.note, maxOccupancy: r.occupancy, totalRoomCount: r.count,
            basePrice: r.basePrice, weekendPrice: r.weekendPrice,
          } as Parameters<typeof insertRoomType>[0]);
        }
      }
    });
  }
  console.log(`      ${APPLY ? 'đã áp' : 'sẽ áp'} ${vOk}/${verified.length} homestay; ${APPLY ? 'đã thêm' : 'sẽ thêm'} ${roomsAdded} hạng phòng`
    + (roomsSkipped.length ? `; giữ nguyên hạng phòng đang có của: ${roomsSkipped.join(', ')}` : '')
    + (vMissing.length ? `; chưa có địa điểm: ${vMissing.join(', ')}${APPLY ? '' : ' (sẽ được tạo ở bước 2)'}` : ''));

  if (APPLY) {
    await bumpCatalogVersion();
    const total = await scalar<number>(`SELECT count(*) FROM place_highlight WHERE type = 'NEARBY'`);
    console.log(`\nXong. Tổng số dòng NEARBY trong DB: ${total}`);
  } else {
    console.log('\n[CHẠY THỬ] Chưa ghi gì. Xem báo cáo: ' + path.relative(REPO, REPORT));
  }
}

main()
  .catch((err) => {
    console.error('LỖI:', (err as Error).message);
    process.exitCode = 1;
  })
  .finally(() => closePool());
