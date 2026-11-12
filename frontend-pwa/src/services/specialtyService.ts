import { apiOrigin } from '@/lib/apiBase';
import { cachedFetch, peekCache } from '@/lib/dataCache';
import type { DishSummaryDto } from '@/types/home';
import type { PlaceHighlightItem } from '@/types/homestay';

/** Thẻ đặc sản trên trang "Đặc sản". */
export interface SpecialtyDto {
  id: string;
  name: string;
  coverImageUrl: string;
  district?: string;
  tagBadge?: string;
}

/** Chi tiết món đặc sản — khớp DishDtos.DishDetailDto. */
export interface DishDetailDto {
  id: number;
  slug: string;
  name: string;
  kind: 'DISH';
  description?: string | null;
  regionName?: string | null;
  coverImageUrl?: string | null;
  /** URL ảnh đã sắp (ảnh bìa trước). */
  images: string[];
  /** Nguồn gốc / nơi làm ra món. */
  origin?: string | null;
  /** Gợi ý nơi ăn / mua (chữ tự do). */
  whereToEat?: string | null;
  ingredients?: string | null;
  culturalMeaning?: string | null;
  servingNote?: string | null;
  tagBadge?: string | null;
  priceRefMin?: number | null;
  priceRefMax?: number | null;
  priceUnitNote?: string | null;
  /** Link video (TikTok / YouTube). */
  videoUrl?: string | null;
  highlights: PlaceHighlightItem[];
  /** Địa điểm (nhà hàng, homestay...) đang phục vụ món; signature = món tủ của nơi đó. */
  servedAt: { id: number; slug: string; name: string; kind: string; address?: string | null; signature: boolean }[];
}

const SPECIALTIES_CACHE_KEY = 'specialties';

const getJson = async (path: string): Promise<unknown> => {
  const response = await fetch(`${apiOrigin()}${path}`);
  if (!response.ok) throw new Error(`HTTP ${response.status} khi tải ${path}`);
  return response.json();
};

const loadSpecialties = async (): Promise<SpecialtyDto[]> => {
  const dishes = (await getJson('/api/public/dishes')) as DishSummaryDto[];
  return (dishes || []).map((dish) => ({
    id: dish.id.toString(),
    name: dish.name,
    coverImageUrl: dish.coverImageUrl || '',
    district: dish.regionName || 'Mù Cang Chải',
    tagBadge: dish.tagBadge || undefined,
  }));
};

/** Danh sách đặc sản đã có trong tab — vẽ ngay khi quay lại từ trang chi tiết. */
export const peekSpecialties = (): SpecialtyDto[] | undefined => peekCache<SpecialtyDto[]>(SPECIALTIES_CACHE_KEY);

export const fetchSpecialties = (): Promise<SpecialtyDto[]> =>
  cachedFetch(SPECIALTIES_CACHE_KEY, 60_000, loadSpecialties).catch((error: unknown) => {
    console.error('Error fetching specialties:', error);
    return [];
  });

/**
 * Chi tiết món đặc sản theo id hoặc slug. Lỗi (404, mạng...) được ném lên để trang hiển thị "Không tìm thấy".
 */
export const fetchDishDetail = (identifier: string): Promise<DishDetailDto> =>
  cachedFetch(`dish:${identifier}`, 60_000, async () =>
    (await getJson(`/api/public/dishes/${encodeURIComponent(identifier)}`)) as DishDetailDto);

/** Chi tiết món đã có trong tab — vẽ ngay khi quay lại rồi làm mới ở nền. */
export const peekDishDetail = (identifier: string): DishDetailDto | undefined => peekCache<DishDetailDto>(`dish:${identifier}`);
