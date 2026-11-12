import type { ExploreCategory } from '../domain/enums.js';
import { PAGE_SIZE } from './exploreRules.js';

/**
 * Thứ tự và phân trang mục "Khám phá quanh đây" — logic thuần, không truy cập DB.
 *  - BR-02.06: địa điểm ghim theo thứ tự Admin sắp → địa điểm không ghim trong bán kính theo khoảng cách tăng dần → trùng khoảng cách
 *    thì theo tên A–Z (bảng chữ cái tiếng Việt). Khoảng cách so theo mét (làm tròn).
 *  - BR-02.05: địa điểm ghim được nằm ngoài bán kính. Một địa điểm vừa ghim vừa trong bán kính chỉ xuất hiện một lần.
 *  - BR-02.07: mỗi trang PAGE_SIZE địa điểm.
 */

/** Một địa điểm đủ điều kiện kèm khoảng cách tới homestay (km). */
export interface Candidate {
  id: number;
  name: string;
  category: ExploreCategory;
  distanceKm: number;
}

/** Địa điểm đã xếp thứ tự; `pinned` = được Admin ghim. */
export interface Ranked {
  candidate: Candidate;
  pinned: boolean;
}

export interface RankedPage {
  items: Ranked[];
  page: number;
  size: number;
  totalElements: number;
  hasMore: boolean;
}

// Collator.SECONDARY của Java: phân biệt dấu nhưng không phân biệt hoa/thường.
const VIETNAMESE = new Intl.Collator('vi', { sensitivity: 'accent' });

const meters = (km: number): number => Math.round(km * 1000);

export function byDistanceThenName(a: Candidate, b: Candidate): number {
  return meters(a.distanceKm) - meters(b.distanceKm) || VIETNAMESE.compare(a.name ?? '', b.name ?? '') || a.id - b.id;
}

/**
 * Xếp toàn bộ danh sách (chưa lọc danh mục). `pinned`: địa điểm ghim ĐỦ ĐIỀU KIỆN hiển thị, đúng thứ tự Admin sắp; `inRadius`: địa
 * điểm đủ điều kiện nằm trong bán kính (thứ tự bất kỳ).
 */
export function rank(pinned: Candidate[], inRadius: Candidate[]): Ranked[] {
  const result: Ranked[] = [];
  const seen = new Set<number>();
  for (const c of pinned) {
    if (!seen.has(c.id)) {
      seen.add(c.id);
      result.push({ candidate: c, pinned: true });
    }
  }
  for (const c of inRadius.filter((x) => !seen.has(x.id)).sort(byDistanceThenName)) {
    if (!seen.has(c.id)) {
      seen.add(c.id);
      result.push({ candidate: c, pinned: false });
    }
  }
  return result;
}

/** AC-02.17: chỉ giữ danh mục được chọn (undefined = tất cả), giữ nguyên thứ tự. */
export function filter(ranked: Ranked[], category: ExploreCategory | undefined): Ranked[] {
  return category ? ranked.filter((r) => r.candidate.category === category) : ranked;
}

/** Số địa điểm theo danh mục trên toàn danh sách (theo thứ tự xuất hiện) — để chỉ hiện chip của danh mục có dữ liệu. */
export function countByCategory(ranked: Ranked[]): Map<ExploreCategory, number> {
  const counts = new Map<ExploreCategory, number>();
  for (const r of ranked) counts.set(r.candidate.category, (counts.get(r.candidate.category) ?? 0) + 1);
  return counts;
}

/** BR-02.07 / AC-02.15: trang thứ `page` (0 = trang đầu); trang âm coi là trang đầu. */
export function pageOf(ranked: Ranked[], page: number): RankedPage {
  const safePage = Math.max(0, page);
  const from = Math.min(ranked.length, safePage * PAGE_SIZE);
  const to = Math.min(ranked.length, from + PAGE_SIZE);
  return { items: ranked.slice(from, to), page: safePage, size: PAGE_SIZE, totalElements: ranked.length, hasMore: to < ranked.length };
}
