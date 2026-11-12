import { DishSummaryDto, HomeResponseDto, PlaceSummaryDto } from '../types/home';
import { FestivalDto } from '../types/festival';
import { cachedFetch, peekCache } from '@/lib/dataCache';
import { apiOrigin } from '@/lib/apiBase';

/**
 * Dữ liệu trang chủ — dùng fetch (đi qua hàng đợi / hedge / cache service worker của lib/apiBase),
 * không axios: HomePage nằm trong bundle chính, kéo axios theo sẽ làm nặng lần tải đầu của khách.
 */

/**
 * Dữ liệu trang chủ chỉ cần MỘT request: /api/public/home đã trả điểm đến (16), homestay (16) và đặc sản (10, tự
 * fallback sang nhà hàng) với cùng bộ lọc và thứ tự như /api/public/places. Trước đây trang chủ gọi thêm tuần tự
 * 3 lần /places?kind=... khi danh sách ít hơn ngưỡng; với cùng bộ lọc các lần gọi đó không thể thêm mục nào,
 * chỉ kéo dài thời gian tải (thác nước 4 request) và đánh thức thêm container backend khi lạnh.
 */
const HOME_CACHE_KEY = 'home';
/** Trang chủ giữ trong bộ nhớ 60 giây: quay lại trang chủ hiện ngay, không gọi lại API. */
const HOME_TTL_MS = 60_000;

/** Dữ liệu trang chủ đã có trong tab (kể cả cũ) — vẽ ngay khi quay lại, rồi làm mới ở nền. */
export const peekHomeData = (): HomeResponseDto | undefined => peekCache<HomeResponseDto>(HOME_CACHE_KEY);

export const fetchHomeData = (): Promise<HomeResponseDto> =>
  cachedFetch(HOME_CACHE_KEY, HOME_TTL_MS, async () => {
    try {
      const response = await fetch(`${apiOrigin()}/api/public/home`);
      if (!response.ok) throw new Error(`Không tải được dữ liệu trang chủ (HTTP ${response.status}).`);
      const data = (await response.json()) as HomeResponseDto;
      const featuredDestinations: PlaceSummaryDto[] = data.featuredDestinations || [];
      const homestays: PlaceSummaryDto[] = data.homestays || [];
      const specialties: DishSummaryDto[] = data.specialties || [];

      return {
        ...data,
        featuredDestinations,
        homestays,
        specialties
      };
    } catch (error) {
      console.error('Error fetching home data:', error);
      throw error;
    }
  });

export const fetchFestivals = async (): Promise<FestivalDto[]> => {
  try {
    const response = await fetch(`${apiOrigin()}/api/public/festivals`);
    if (!response.ok) return [];
    return ((await response.json()) as FestivalDto[]) || [];
  } catch (error) {
    console.warn('Could not fetch festivals:', error);
    return [];
  }
};
