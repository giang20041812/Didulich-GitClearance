import { useEffect, useState } from 'react';

/**
 * Số lượng cho từng tab trạng thái. `fetchCount('')` trả tổng của tab "Tất cả".
 * Tải lại khi `depsKey` đổi (các bộ lọc khác đổi) hoặc `refreshKey` đổi, nên số đếm luôn khớp với bộ lọc đang áp dụng.
 * Giữ số cũ trong lúc tải để tab không nhấp nháy; một tab lỗi chỉ ẩn số của tab đó.
 */
export function useStatusCounts<T extends string>(
  values: readonly T[],
  fetchCount: (status: T | '') => Promise<number>,
  depsKey: string,
  refreshKey = 0,
  /** Lấy mọi số trong MỘT lượt gọi khi có thể (vd không lọc gì: API tổng hợp theo trạng thái); null = gọi từng số. */
  fetchAll?: () => Promise<Partial<Record<T, number>>> | null,
): Record<string, number | null> {
  const [counts, setCounts] = useState<Record<string, number | null>>({});
  const valuesKey = values.join('|');

  useEffect(() => {
    let alive = true;
    const keys: (T | '')[] = ['', ...(valuesKey.split('|').filter(Boolean) as T[])];
    // Lần lượt từng số (không gửi song song tới backend — xem lib/requestQueue).
    void (async () => {
      const next: Record<string, number | null> = {};
      const all = fetchAll?.();
      if (all) {
        try {
          const byStatus = await all;
          if (!alive) return;
          let total = 0;
          for (const k of keys) {
            if (k === '') continue;
            const n = byStatus[k as T] ?? 0;
            next[k] = n;
            total += n;
          }
          next[''] = total;
          setCounts(next);
          return;
        } catch {
          if (!alive) return; // lỗi thì thử từng số bên dưới
        }
      }
      for (const k of keys) {
        try {
          next[k] = await fetchCount(k);
        } catch {
          next[k] = null;
        }
        if (!alive) return;
      }
      setCounts(next);
    })();
    return () => {
      alive = false;
    };
    // fetchCount được tạo lại mỗi lần render; chỉ phụ thuộc vào khóa bộ lọc để không gọi lặp.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valuesKey, depsKey, refreshKey]);

  return counts;
}
