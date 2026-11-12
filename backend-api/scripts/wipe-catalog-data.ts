import { config, loadEnvFiles } from '../src/config/env.js';
import { closePool, exec, initPool, query, scalar, tx } from '../src/db/pool.js';
import { bumpCatalogVersion } from '../src/services/catalogCache.js';

/**
 * Xóa dữ liệu nội dung / giao dịch CŨ để nạp lại dữ liệu mới (xem import-data-chinh-thong.ts).
 *
 *   npm run wipe:catalog                                  # CHẠY THỬ (mặc định): chỉ đếm dòng sẽ xóa, không ghi gì
 *   npm run wipe:catalog -- --apply --confirm-host=<host DB>   # XÓA THẬT, trong MỘT transaction (lỗi là hoàn tác hết)
 *
 * XÓA: đặt phòng + thanh toán + hoàn tiền + hoa hồng, đánh giá, hành trình / check-in, combo, SOS, thông báo,
 *      địa điểm (homestay, nhà hàng, vận chuyển, văn hóa, ảnh đẹp, dịch vụ) và mọi bảng con (phòng, ảnh, liên hệ, ...), lễ hội,
 *      media_asset mồ côi (không còn bảng nào tham chiếu).
 * GIỮ: tài khoản, nhà cung cấp, khu vực, tiện nghi, tag, cấu hình, cổng thanh toán, mẫu thông báo, liên hệ khẩn cấp, chính sách hủy,
 *      điểm đến (ATTRACTION) và đặc sản (dish) — dataset mới KHÔNG tạo lại hai loại này (chỉ tham chiếu "đã có sẵn").
 *
 * Tùy chọn:  --include-attractions   xóa luôn điểm đến     --include-dishes   xóa luôn đặc sản (và món trong hành trình)
 *            --keep-festivals        giữ lễ hội            --keep-bookings    không xóa đặt phòng / đánh giá (địa điểm có đặt phòng sẽ làm giao dịch lỗi)
 *
 * LƯU Ý: .env.local trỏ thẳng DB production (Supabase). Hãy sao lưu trước:  pg_dump "<DB_URL>" -Fc -f backup.dump
 */

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
const INCLUDE_ATTRACTIONS = args['include-attractions'] === true;
const INCLUDE_DISHES = args['include-dishes'] === true;
const KEEP_FESTIVALS = args['keep-festivals'] === true;
const KEEP_BOOKINGS = args['keep-bookings'] === true;

const log = (...a: unknown[]) => console.log(...a);
const q = (name: string) => `"${name.replace(/"/g, '""')}"`;

async function tableExists(name: string): Promise<boolean> {
  return (await scalar<boolean>(`SELECT count(*) > 0 FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = $1`, [name])) === true;
}

async function main() {
  loadEnvFiles();
  const dbCfg = config().db;
  log('='.repeat(100));
  log(`Đích: ${dbCfg.host}:${dbCfg.port}/${dbCfg.database} | chế độ: ${APPLY ? 'XÓA THẬT (--apply)' : 'CHẠY THỬ (chỉ đếm)'}`);
  log('='.repeat(100));
  if (APPLY && args['confirm-host'] !== dbCfg.host) {
    throw new Error(`Để xóa thật trên "${dbCfg.host}", chạy lại kèm --confirm-host=${dbCfg.host} (chốt chặn chống xóa nhầm môi trường).`);
  }
  initPool(dbCfg);

  const placeWhere = INCLUDE_ATTRACTIONS ? 'TRUE' : `kind <> 'ATTRACTION'`;

  // Thứ tự con → cha (các FK không CASCADE: booking*, review*, payment*, refund, commission_ledger).
  const full: string[] = [];
  if (!KEEP_BOOKINGS) {
    full.push('commission_ledger', 'refund', 'payment_transaction', 'booking_admin_note', 'booking_status_history', 'review_image', 'review', 'booking_night', 'booking_room', 'sos_request');
  }
  full.push('journey_checkin', 'journey_helpful', 'combo_request', 'combo_restaurant', 'combo_stop', 'combo', 'journey_stop_dish', 'journey_stop_alternative', 'journey_stop', 'journey_day', 'journey_tag', 'journey');
  if (!KEEP_BOOKINGS) full.push('booking');
  full.push('notification', 'place_edit_request', 'partner_change_request');
  if (!KEEP_FESTIVALS) full.push('festival_occurrence', 'festival');
  if (INCLUDE_DISHES) full.push('place_dish', 'dish_media', 'dish_highlight', 'dish');

  const existing: string[] = [];
  for (const t of full) if (await tableExists(t)) existing.push(t);

  log('\nBảng xóa toàn bộ:');
  for (const t of existing) log(`  ${t.padEnd(26)} ${Number(await scalar<number>(`SELECT count(*) FROM ${q(t)}`))}`);
  const placeCount = Number(await scalar<number>(`SELECT count(*) FROM place WHERE ${placeWhere}`));
  const keptAttractions = INCLUDE_ATTRACTIONS ? 0 : Number(await scalar<number>(`SELECT count(*) FROM place WHERE kind = 'ATTRACTION'`));
  log(`\nĐịa điểm (place) sẽ xóa: ${placeCount} (kèm bảng con qua ON DELETE CASCADE) | điểm đến giữ lại: ${keptAttractions}`);
  const byKind = await query<{ kind: string; n: number }>(`SELECT kind, count(*)::int AS n FROM place WHERE ${placeWhere} GROUP BY kind ORDER BY kind`);
  byKind.forEach((r) => log(`    ${r.kind.padEnd(14)} ${r.n}`));

  // Bảng tham chiếu media_asset (động theo FK) → biết ảnh mồ côi sau khi xóa
  const refs = await query<{ tbl: string; col: string }>(`
    SELECT cl.relname AS tbl, a.attname AS col
    FROM pg_constraint c
    JOIN pg_class cl ON cl.oid = c.conrelid
    JOIN pg_class rf ON rf.oid = c.confrelid AND rf.relname = 'media_asset'
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
    WHERE c.contype = 'f' AND cl.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = current_schema())`);
  log(`\nmedia_asset được tham chiếu bởi: ${refs.map((r) => `${r.tbl}.${r.col}`).join(', ') || '(không bảng nào)'}`);
  log(`media_asset hiện có: ${Number(await scalar<number>('SELECT count(*) FROM media_asset'))} (dòng mồ côi sẽ bị dọn; file trên Storage KHÔNG bị xóa)`);

  if (!APPLY) {
    log('\n[CHẠY THỬ] Không xóa gì. Chạy lại với --apply --confirm-host=<host> để xóa thật.');
    return;
  }

  await tx(async () => {
    for (const t of existing) await exec(`DELETE FROM ${q(t)}`);
    await exec(`DELETE FROM place WHERE ${placeWhere}`);
    const where = refs.length ? refs.map((r) => `NOT EXISTS (SELECT 1 FROM ${q(r.tbl)} x WHERE x.${q(r.col)} = m.id)`).join(' AND ') : 'TRUE';
    await exec(`DELETE FROM media_asset m WHERE ${where}`);
  });
  await bumpCatalogVersion();
  log(`\nĐã xóa xong. Còn lại ${Number(await scalar<number>('SELECT count(*) FROM place'))} địa điểm (điểm đến giữ lại).`);
  log(`Bước kế tiếp: npm run import:data-chinh-thong -- --apply --confirm-host=${dbCfg.host} --verified`);
}

main()
  .catch((e) => {
    console.error('LỖI:', e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => closePool());
