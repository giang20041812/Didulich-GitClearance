import { exec, query, tx } from '../db/pool.js';
import { IllegalArgumentError } from '../lib/errors.js';
import * as rules from '../lib/exploreRules.js';
import { nowLocal } from '../lib/time.js';
import * as audit from './auditLogService.js';

/**
 * Cấu hình bán kính "Khám phá quanh đây" (BR-02.04): mặc định 10 km, Admin đổi trong khoảng 1–50 km, áp dụng toàn hệ thống. Lưu ở bảng
 * app_setting (khóa explore.radius_km) như phiên bản danh mục.
 */

const valid = (km: number): boolean => Number.isInteger(km) && km >= rules.RADIUS_MIN_KM && km <= rules.RADIUS_MAX_KM;

/** Bán kính đang áp dụng; giá trị lưu hỏng / ngoài khoảng hoặc chưa có thì dùng mặc định 10 km. */
export async function radiusKm(): Promise<number> {
  try {
    const rows = await query<{ settingValue: string }>('SELECT setting_value FROM app_setting WHERE setting_key = $1', [rules.RADIUS_SETTING_KEY]);
    if (rows.length === 0) return rules.RADIUS_DEFAULT_KM;
    const km = Number(rows[0].settingValue.trim());
    return valid(km) ? km : rules.RADIUS_DEFAULT_KM;
  } catch {
    return rules.RADIUS_DEFAULT_KM;
  }
}

export async function settings() {
  return { radiusKm: await radiusKm(), radiusMinKm: rules.RADIUS_MIN_KM, radiusMaxKm: rules.RADIUS_MAX_KM };
}

/** AC-02.13: ngoài 1–50 km thì báo "Bán kính phải từ 1 đến 50 km." và không lưu. */
export function updateRadius(radius: number | null | undefined, adminAccountId: number | null) {
  return tx(async () => {
    if (radius == null || !valid(radius)) throw new IllegalArgumentError(`Bán kính phải từ ${rules.RADIUS_MIN_KM} đến ${rules.RADIUS_MAX_KM} km.`);
    const before = await radiusKm();
    const now = nowLocal();
    const updated = await exec('UPDATE app_setting SET setting_value = $1, updated_at = $2 WHERE setting_key = $3', [String(radius), now, rules.RADIUS_SETTING_KEY]);
    if (updated === 0) {
      await exec('INSERT INTO app_setting (setting_key, setting_value, updated_at) VALUES ($1, $2, $3)', [rules.RADIUS_SETTING_KEY, String(radius), now]);
    }
    await audit.record(adminAccountId, 'EXPLORE_RADIUS_UPDATED', 'ExploreSetting', null, null, { radiusKm: before }, { radiusKm: radius });
    return settings();
  });
}
