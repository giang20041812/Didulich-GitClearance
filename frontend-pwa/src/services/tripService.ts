import type { TripCatalog } from '@/types/trip';
import { cachedFetch, peekCache } from '@/lib/dataCache';
import { apiOrigin } from '@/lib/apiBase';

/**
 * Danh mục lên lịch trình của một tỉnh (gói mẫu + tag lọc, dịch vụ thêm, điểm tham quan, món) — dùng fetch như các
 * service trang khách, giữ trong bộ nhớ của tab 10 phút (mở lại trang /lich-trinh hiện ngay).
 */
const CATALOG_TTL_MS = 10 * 60_000;

const keyOf = (province?: string | null) => `trips:${(province ?? '').trim().toLowerCase()}`;

export const peekTripCatalog = (province?: string | null): TripCatalog | undefined => peekCache<TripCatalog>(keyOf(province));

export const fetchTripCatalog = (province?: string | null): Promise<TripCatalog> =>
  cachedFetch(keyOf(province), CATALOG_TTL_MS, async () => {
    const url = new URL('/api/public/trips/catalog', apiOrigin());
    if (province?.trim()) url.searchParams.set('province', province.trim());
    const response = await fetch(url.toString());
    if (!response.ok) throw new Error(`Không tải được danh sách lịch trình gợi ý (HTTP ${response.status}).`);
    const data = (await response.json()) as Partial<TripCatalog>;
    return {
      region: data.region ?? null,
      templates: data.templates ?? [],
      tags: data.tags ?? [],
      addons: data.addons ?? [],
      places: data.places ?? [],
      dishes: data.dishes ?? [],
    };
  });

/** Tải trước (ưu tiên thấp) khi khách vừa mở SearchHub — bấm "Lên lịch trình" là có ngay. */
export const prefetchTripCatalog = (province?: string | null): void => {
  void fetchTripCatalog(province).catch(() => undefined);
};
