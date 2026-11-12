import type { PlaceRow } from '../repositories/placeRepo.js';
import { haversineKm } from './geo.js';

/**
 * Chọn nhà hàng gợi ý cho combo (combo không bao gồm ăn uống): nhà hàng trong {@link RADIUS_KM} km quanh các điểm dừng có tọa độ, xếp theo
 * chất lượng ({@link quality}) rồi tới khoảng cách. Thuần — không đụng DB.
 */

/** Nhà hàng cách điểm dừng gần nhất không quá 15 km (một buổi di chuyển trong vùng núi). */
export const RADIUS_KM = 15;
/** Điểm "nền" khi nhà hàng ít lượt đánh giá: 5 lượt ảo 4,0 sao — tránh quán 1 lượt 5 sao đứng đầu. */
const PRIOR_SCORE = 4.0;
const PRIOR_WEIGHT = 5;
const MIN_INTERNAL_REVIEWS = 3;

/** Điểm dừng có tọa độ của lộ trình. */
export interface Stop {
  name: string;
  latitude: number | null;
  longitude: number | null;
}

/** Nhà hàng được chọn, kèm điểm dừng gần nhất (null nếu lộ trình không có tọa độ). */
export interface Recommendation {
  place: PlaceRow;
  nearStop: string | null;
  distanceKm: number | null;
}

const bayesian = (average: number, count: number): number => (PRIOR_WEIGHT * PRIOR_SCORE + average * count) / (PRIOR_WEIGHT + count);

/**
 * Điểm chất lượng 0–5: có từ 3 lượt đánh giá trong ứng dụng thì dùng điểm đó (kéo về 4,0 theo số lượt); ít hơn mà có điểm Google Maps (đã
 * xác thực) thì dùng điểm Google; không có gì thì 0 (xếp cuối).
 */
export function quality(p: Pick<PlaceRow, 'ratingCount' | 'ratingAvg' | 'googleRating'>): number {
  const count = p.ratingCount ?? 0;
  const internal = p.ratingAvg ?? 0;
  if (count >= MIN_INTERNAL_REVIEWS) return bayesian(internal, count);
  if (p.googleRating != null && p.googleRating > 0) return p.googleRating;
  return count > 0 ? bayesian(internal, count) : 0;
}

/** Điểm dừng gần nhất của một địa điểm; `nearStop` null nếu địa điểm hoặc lộ trình không có tọa độ. */
export function nearest(stops: Stop[], place: PlaceRow): Recommendation {
  if (place.latitude == null || place.longitude == null) return { place, nearStop: null, distanceKm: null };
  let best = Number.MAX_VALUE;
  let near: Stop | null = null;
  for (const s of stops) {
    if (s.latitude == null || s.longitude == null) continue;
    const km = haversineKm(s.latitude, s.longitude, place.latitude, place.longitude);
    if (km < best) {
      best = km;
      near = s;
    }
  }
  return near ? { place, nearStop: near.name, distanceKm: best } : { place, nearStop: null, distanceKm: null };
}

/**
 * Tối đa `limit` nhà hàng tốt nhất quanh lộ trình, bỏ các nhà hàng trong `exclude` (người tạo đã chọn). Lộ trình không có điểm nào có
 * tọa độ thì xếp toàn vùng theo chất lượng.
 */
export function recommend(stops: Stop[], candidates: PlaceRow[], exclude: Set<number>, limit: number): Recommendation[] {
  const located = stops.filter((s) => s.latitude != null && s.longitude != null);
  const scored: Array<{ pick: Recommendation; quality: number }> = [];
  for (const p of candidates) {
    if (exclude.has(p.id)) continue;
    if (located.length === 0) {
      scored.push({ pick: { place: p, nearStop: null, distanceKm: null }, quality: quality(p) });
      continue;
    }
    const pick = nearest(located, p);
    if (pick.distanceKm != null && pick.distanceKm <= RADIUS_KM) scored.push({ pick, quality: quality(p) });
  }
  const byName = (a: string | null | undefined, b: string | null | undefined): number => (a == null ? (b == null ? 0 : 1) : b == null ? -1 : a < b ? -1 : a > b ? 1 : 0);
  return scored
    .sort((a, b) => b.quality - a.quality || (a.pick.distanceKm ?? 0) - (b.pick.distanceKm ?? 0) || byName(a.pick.place.name, b.pick.place.name))
    .slice(0, Math.max(limit, 0))
    .map((s) => s.pick);
}
