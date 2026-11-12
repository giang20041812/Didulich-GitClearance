/**
 * Phân trang trả về cùng cấu trúc JSON với org.springframework.data.domain.Page (PageImpl) của bản Java — frontend
 * đọc content / totalElements / totalPages / number / size / first / last...
 */

export interface SortJson {
  empty: boolean;
  sorted: boolean;
  unsorted: boolean;
}

export interface PageJson<T> {
  content: T[];
  pageable: {
    pageNumber: number;
    pageSize: number;
    sort: SortJson;
    offset: number;
    paged: boolean;
    unpaged: boolean;
  };
  last: boolean;
  totalElements: number;
  totalPages: number;
  size: number;
  number: number;
  sort: SortJson;
  first: boolean;
  numberOfElements: number;
  empty: boolean;
}

const sortJson = (sorted: boolean): SortJson => ({ empty: !sorted, sorted, unsorted: !sorted });

export function pageOf<T>(content: T[], page: number, size: number, total: number, sorted = false): PageJson<T> {
  const totalPages = size > 0 ? Math.ceil(total / size) : 1;
  return {
    content,
    pageable: { pageNumber: page, pageSize: size, sort: sortJson(sorted), offset: page * size, paged: true, unpaged: false },
    last: page + 1 >= totalPages,
    totalElements: total,
    totalPages,
    size,
    number: page,
    sort: sortJson(sorted),
    first: page === 0,
    numberOfElements: content.length,
    empty: content.length === 0,
  };
}

/** Trang rỗng. */
export function emptyPage<T>(page: number, size: number): PageJson<T> {
  return pageOf<T>([], page, size, 0);
}

/** Cắt một danh sách đã có đủ trong bộ nhớ thành một trang. */
export function pageFromList<T>(all: T[], page: number, size: number, sorted = false): PageJson<T> {
  const from = Math.min(page * size, all.length);
  return pageOf(all.slice(from, from + size), page, size, all.length, sorted);
}

/** Chuẩn hoá page / size từ tham số query: page >= 0, size trong [1, max]. */
export function clampPage(page: unknown, size: unknown, defaultSize = 20, maxSize = 200): { page: number; size: number } {
  const p = Number.parseInt(String(page ?? ''), 10);
  const s = Number.parseInt(String(size ?? ''), 10);
  return {
    page: Number.isFinite(p) && p > 0 ? p : 0,
    size: Number.isFinite(s) && s > 0 ? Math.min(s, maxSize) : defaultSize,
  };
}
