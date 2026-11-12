import { config, loadEnvFiles } from '../src/config/env.js';
import { closePool, exec, initPool, query, tx } from '../src/db/pool.js';
import { bumpCatalogVersion } from '../src/services/catalogCache.js';

/**
 * Dọn dữ liệu CHƯA XÁC NHẬN của đợt "DATA CHÍNH THỐNG.xlsx": giữ lại duy nhất những gì có trong
 *   - 'Tổng hợp thông tin ĐiMCC.xlsx'   (tab Homestay, Nhà xe, Nhà hàng – quán ăn)
 *   - 'DATA ĐÃ XÁC THỰC.xlsx'           (tab Homestay, Xe xác thực)
 * còn lại (địa điểm + lễ hội có nguồn 'DATA CHÍNH THỐNG.xlsx...') bị xóa.
 *
 *   npm run prune:unconfirmed                                       # CHẠY THỬ: chỉ liệt kê GIỮ / XÓA, không ghi gì
 *   npm run prune:unconfirmed -- --apply --confirm-host=<host DB>   # xóa MỀM (is_deleted = TRUE, khôi phục được)
 *   npm run prune:unconfirmed -- --apply --hard --confirm-host=...  # xóa CỨNG (không khôi phục)
 *
 * Địa điểm do đợt ĐiMCC tạo (source_name 'DATA CHÍNH THỐNG – Tổng hợp thông tin ĐiMCC...') luôn được giữ.
 * Ảnh (media_asset + file trong Storage) không bị xóa; chỉ mất liên kết khi xóa cứng.
 */

/** Slug / tên địa điểm của đợt cũ mà vẫn có trong hai file Excel nên được GIỮ. */
const KEEP_SLUGS = new Set([
  // Homestay có trong Excel ĐiMCC (tab Homestay)
  'homestay-cuong-tu', 'winds-homestay', 'pu-nhu-homestay', 'chai-eco-house', 'hanh-phuc-creek', 'nang-hotel', 'nha-nghi-ngu',
  'chiba-ecolodge', 'ha-chau-2-homestay', 'sky-motel', 'nhat-phuong-homestay',
]);
const KEEP_NAMES: Record<string, string[]> = {
  // Nhà xe có trong tab "Nhà xe" (ĐiMCC) / "Xe xác thực"
  TRANSPORT: [
    'An Bình Limousine', 'Anh Khang Authentic', 'Cường Lan', 'Gia Khánh', 'Golden Limousine', 'Hà Trang (Lai Châu)',
    'Hưng Thành (Lai Châu)', 'Nam Thắng Limousine', 'Sơn Phương', 'Xe Ghép Yên Bái', 'Xe ghép Yên Bái – Chế Cu Nha',
    'Thuê xe máy tự lái (Thị trấn / Ngã Ba Kim)',
  ],
  // Nhà hàng có trong tab "Nhà hàng – quán ăn" (ĐiMCC)
  RESTAURANT: [
    'Nhà hàng A Tân Quán', 'Nhà hàng Quyền Hường', 'Nhà hàng Thắng Dung', 'Nhà hàng Thành Oanh', 'Nhà hàng Thùy Linh',
    'Nhà hàng Tuấn Thúy', 'Nhà hàng Vườn Đào', 'Quán Thuật Hà', 'Vua Xứ Mù Cafe',
  ],
};

const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const HARD = argv.includes('--hard');
const confirmHost = argv.find((a) => a.startsWith('--confirm-host='))?.split('=')[1];
const log = (...a: unknown[]) => console.log(...a);

interface Row { id: number; slug: string; name: string; kind: string; images: string }

async function main() {
  loadEnvFiles();
  const db = config().db;
  log('='.repeat(100));
  log(`Dọn dữ liệu chưa xác nhận → ${db.host}:${db.port}/${db.database} | chế độ: ${APPLY ? (HARD ? 'XÓA CỨNG' : 'XÓA MỀM') : 'CHẠY THỬ (không ghi)'}`);
  log('='.repeat(100));
  if (APPLY && confirmHost !== db.host) throw new Error(`Để ghi thật vào "${db.host}", thêm --confirm-host=${db.host}`);
  initPool(db);

  const rows = await query<Row>(
    `SELECT p.id, p.slug, p.name, p.kind, (SELECT count(*) FROM place_media m WHERE m.place_id = p.id)::text AS images
       FROM place p WHERE p.is_deleted = FALSE AND p.source_name LIKE 'DATA CHÍNH THỐNG.xlsx%' ORDER BY p.kind, p.name`,
  );
  const keepNames = new Map(Object.entries(KEEP_NAMES).map(([k, v]) => [k, new Set(v)]));
  const keep: Row[] = [];
  const drop: Row[] = [];
  for (const r of rows) (KEEP_SLUGS.has(r.slug) || keepNames.get(r.kind)?.has(r.name) ? keep : drop).push(r);

  const festivals = await query<{ id: number; name: string }>('SELECT id, name FROM festival WHERE is_deleted = FALSE ORDER BY name');
  const fmt = (r: Row) => `${r.kind.padEnd(10)} ${r.name} (${r.slug}, ${r.images} ảnh)`;
  log(`\nĐợt cũ có ${rows.length} địa điểm → GIỮ ${keep.length}, XÓA ${drop.length}; lễ hội XÓA ${festivals.length}`);
  log('\n--- GIỮ ---');
  keep.forEach((r) => log('  ' + fmt(r)));
  log('\n--- XÓA ---');
  drop.forEach((r) => log('  ' + fmt(r)));
  festivals.forEach((f) => log(`  FESTIVAL   ${f.name}`));
  const unmatchedKeep = [...keepNames.entries()].flatMap(([k, names]) => [...names].filter((n) => !rows.some((r) => r.kind === k && r.name === n)).map((n) => `${k}: ${n}`));
  if (unmatchedKeep.length) log('\nCẢNH BÁO: tên trong danh sách GIỮ không tìm thấy trong DB:', unmatchedKeep.join(' | '));

  if (!APPLY) {
    log('\n[CHẠY THỬ] Chưa ghi gì. Kiểm tra danh sách rồi chạy lại với --apply --confirm-host=' + db.host);
    return;
  }

  const ids = drop.map((r) => r.id);
  const fIds = festivals.map((f) => f.id);
  await tx(async () => {
    if (HARD) {
      if (ids.length) await exec('DELETE FROM place WHERE id = ANY($1)', [ids]);
      if (fIds.length) await exec('DELETE FROM festival WHERE id = ANY($1)', [fIds]);
    } else {
      if (ids.length) await exec('UPDATE place SET is_deleted = TRUE, visibility = $2 WHERE id = ANY($1)', [ids, 'UNPUBLISHED']);
      if (fIds.length) await exec('UPDATE festival SET is_deleted = TRUE, visibility = $2 WHERE id = ANY($1)', [fIds, 'DRAFT']);
    }
  });
  await bumpCatalogVersion();
  log(`\nXong: ${HARD ? 'đã xóa cứng' : 'đã xóa mềm'} ${ids.length} địa điểm và ${fIds.length} lễ hội.`);
}

main()
  .catch((err) => {
    console.error('LỖI:', (err as Error).message);
    process.exitCode = 1;
  })
  .finally(() => closePool());
