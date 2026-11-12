import { HomestayDto, HomestayDetailDto, PublicAmenityItem } from "../types/homestay";
import { apiOrigin } from '@/lib/apiBase';
import { cachedFetch, peekCache } from '@/lib/dataCache';

export interface HomestayFilterParams {
  checkIn?: string;
  checkOut?: string;
  minPrice?: number;
  maxPrice?: number;
  amenities?: string[];
  province?: string;
  district?: string;
  ward?: string;
  attractions?: string[];
  keyword?: string;
  /** Số khách — chỉ trả chỗ nghỉ đủ sức chứa (tổng sức chứa các loại phòng đang bán). */
  guests?: number;
  page?: number;
  /** Số chỗ nghỉ mỗi trang (mặc định 12). */
  size?: number;
  sort?: 'recommended' | 'price_asc' | 'price_desc';
}

export interface PageResponse<T> {
  content: T[];
  totalElements: number;
  totalPages: number;
  number: number;
  size: number;
}

interface PlaceSummaryApiItem {
  id: number;
  name: string;
  description?: string | null;
  coverImageUrl?: string | null;
  regionName?: string | null;
  attributes?: Record<string, unknown> | null;
  ratingAvg?: number | null;
  ratingCount?: number | null;
  googleRating?: number | null;
  priceRefMin?: number | null;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  tagBadge?: string | null;
  statsText?: string | null;
  contacts?: HomestayDto['contacts'];
  amenities?: string[];
  operationStatus?: HomestayDto['operationStatus'];
  operationStatusReason?: string | null;
  availableForSelectedDates?: boolean;
  hasOnlineRooms?: boolean;
}

const readPageResponse = (value: unknown): PageResponse<PlaceSummaryApiItem> => {
  if (!value || typeof value !== 'object') throw new Error('Phản hồi tìm kiếm không hợp lệ.');
  const data = value as Record<string, unknown>;
  if (!Array.isArray(data.content) || typeof data.totalElements !== 'number' || typeof data.totalPages !== 'number') {
    throw new Error('Phản hồi tìm kiếm không hợp lệ.');
  }
  return {
    content: data.content as PlaceSummaryApiItem[],
    totalElements: data.totalElements,
    totalPages: data.totalPages,
    number: typeof data.number === 'number' ? data.number : 0,
    size: typeof data.size === 'number' ? data.size : 12,
  };
};

/** Danh mục tiện ích đang có ở ít nhất một homestay công khai — dùng cho bộ lọc tìm kiếm. */
export const fetchHomestayAmenities = (): Promise<PublicAmenityItem[]> =>
  cachedFetch('amenities:HOMESTAY', 30 * 60_000, async () => {
    const url = new URL('/api/public/places/amenities', apiOrigin());
    url.searchParams.append('kind', 'HOMESTAY');
    // Ưu tiên thấp: danh sách homestay (nội dung chính) được gửi trước bộ lọc.
    const response = await fetch(url.toString(), { priority: 'low' });
    if (!response.ok) throw new Error(`Không tải được danh mục tiện ích (HTTP ${response.status}).`);
    const raw: unknown = await response.json();
    if (!Array.isArray(raw)) throw new Error('Danh mục tiện ích không hợp lệ.');
    return raw.filter((item): item is PublicAmenityItem =>
      !!item && typeof item === 'object'
      && typeof (item as { code?: unknown }).code === 'string'
      && typeof (item as { name?: unknown }).name === 'string'
      && ((item as { scope?: unknown }).scope === 'PLACE' || (item as { scope?: unknown }).scope === 'ROOM'));
  });

/**
 * Lựa chọn sắp xếp trên UI → tham số `sort` của Spring Data, ghi rõ chiều. Gửi "recommended" trần
 * thì Spring hiểu là ASC (đánh giá thấp nhất lên đầu) nếu backend không tự đổi chiều.
 */
const HOMESTAY_SORT_PARAM: Record<NonNullable<HomestayFilterParams['sort']>, string> = {
  recommended: 'ratingAvg,desc',
  price_asc: 'priceRefMin,asc',
  price_desc: 'priceRefMin,desc',
};

export const fetchHomestays = async (params?: HomestayFilterParams): Promise<PageResponse<HomestayDto>> => {
    const url = new URL('/api/public/places', apiOrigin());
    url.searchParams.append('kind', 'HOMESTAY');
    
    if (params?.checkIn) url.searchParams.append('checkIn', params.checkIn);
    if (params?.checkOut) url.searchParams.append('checkOut', params.checkOut);
    if (params?.minPrice !== undefined) url.searchParams.append('minPrice', params.minPrice.toString());
    if (params?.maxPrice !== undefined) url.searchParams.append('maxPrice', params.maxPrice.toString());
    if (params?.province) url.searchParams.append('province', params.province);
    if (params?.district) url.searchParams.append('district', params.district);
    if (params?.ward) url.searchParams.append('ward', params.ward);
    if (params?.attractions && params.attractions.length > 0) {
      url.searchParams.append('attractions', params.attractions.join(','));
    }
    if (params?.keyword) {
      const keyword = params.keyword.trim();
      if (keyword) url.searchParams.append('keyword', keyword);
    }
    if (params?.amenities && params.amenities.length > 0) {
      params.amenities.forEach(amenity => url.searchParams.append('amenities', amenity));
    }
    if (params?.guests && params.guests > 0) url.searchParams.append('guests', String(Math.round(params.guests)));
    url.searchParams.append('page', String(params?.page ?? 0));
    url.searchParams.append('size', String(params?.size ?? 12));
    // sort có thể đến từ URL (?sort=...) nên giá trị lạ quay về "recommended".
    url.searchParams.append('sort', HOMESTAY_SORT_PARAM[params?.sort ?? 'recommended'] ?? HOMESTAY_SORT_PARAM.recommended);

    const response = await fetch(url.toString());
    if (!response.ok) {
      let message = `Không thể tải danh sách Homestay (HTTP ${response.status}).`;
      try {
        const body: unknown = await response.json();
        if (body && typeof body === 'object' && typeof (body as { message?: unknown }).message === 'string') {
          message = (body as { message: string }).message;
        }
      } catch { /* Giữ thông báo mặc định khi server không trả JSON. */ }
      throw new Error(message);
    }
    const raw: unknown = await response.json();
    const data = readPageResponse(raw);
    return {
      ...data,
      content: data.content.map((item) => {
      const attrs = item.attributes || {};
      
      return {
        id: item.id.toString(),
        name: item.name,
        description: item.description || '',
        coverImageUrl: item.coverImageUrl || '',
        district: item.regionName || '',
        distanceFromCenter: typeof attrs.distanceFromCenter === 'string' ? attrs.distanceFromCenter : undefined,
        ratingScore: item.ratingAvg || 0,
        ratingText: typeof attrs.ratingText === 'string' ? attrs.ratingText : '',
        reviewCount: item.ratingCount || 0,
        googleRating: item.googleRating ?? null,
        isGenius: attrs.isGenius === true,
        promotionalBadge: item.tagBadge || undefined,
        roomType: typeof attrs.roomType === 'string' ? attrs.roomType : 'Phòng Homestay',
        bedInfo: typeof attrs.bedInfo === 'string' ? attrs.bedInfo : '',
        freeCancellation: attrs.freeCancellation === true,
        noPrepayment: attrs.noPrepayment === true,
        scarcityMessage: item.statsText || undefined,
        originalPrice: typeof attrs.originalPrice === 'number' ? attrs.originalPrice : undefined,
        price: item.priceRefMin || 0,
        priceDetails: typeof attrs.priceDetails === 'string' ? attrs.priceDetails : undefined,
        taxesAndFeesIncluded: attrs.taxesAndFeesIncluded === true,
        address: item.address || undefined,
        latitude: item.latitude || undefined,
        longitude: item.longitude || undefined,
        contacts: item.contacts || [],
        amenities: item.amenities || [],
        operationStatus: item.operationStatus,
        operationStatusReason: item.operationStatusReason,
        availableForSelectedDates: item.availableForSelectedDates,
        hasOnlineRooms: item.hasOnlineRooms,
      };
      }),
    };
};

/** Chi tiết chỗ nghỉ giữ trong bộ nhớ của tab 60 giây (dùng chung khóa với placeService.fetchPlaceDetail). */
const DETAIL_TTL_MS = 60_000;
export const placeDetailCacheKey = (identifier: string | number) => `place:${identifier}`;

class PlaceNotFoundError extends Error {}

const loadPlaceDetail = async (id: string, priority: RequestPriority): Promise<HomestayDetailDto> => {
  const url = new URL(`/api/public/places/${encodeURIComponent(id)}`, apiOrigin());
  const response = await fetch(url.toString(), { priority });
  if (response.status === 404) throw new PlaceNotFoundError(`Không tìm thấy chỗ nghỉ ${id}`);
  if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
  return (await response.json()) as HomestayDetailDto;
};

/** Chi tiết đã có trong tab (kể cả cũ) — trang chi tiết vẽ ngay rồi làm mới ở nền. */
export const peekHomestay = (id: string): HomestayDetailDto | undefined =>
  peekCache<HomestayDetailDto>(placeDetailCacheKey(id));

export const getHomestayById = async (id: string, priority: RequestPriority = 'auto'): Promise<HomestayDetailDto | null> => {
  try {
    return await cachedFetch(placeDetailCacheKey(id), DETAIL_TTL_MS, () => loadPlaceDetail(id, priority));
  } catch (error) {
    if (!(error instanceof PlaceNotFoundError)) console.error("Error fetching homestay detail:", error);
    return null;
  }
};

/** Khách sắp mở chi tiết (rê chuột / chạm vào thẻ): tải trước với ưu tiên thấp để bấm vào là hiện ngay. */
export const prefetchHomestay = (id: string | number): void => {
  void getHomestayById(String(id), 'low');
};

/** Đánh giá công khai — không cache (đánh giá mới hiện ngay); trang chỉ gọi khi chỗ nghỉ đã có đánh giá. */
export const fetchPlaceReviews = async (id: string): Promise<import("../types/review").ReviewDto[]> => {
  try {
    const url = new URL(`/api/public/places/${encodeURIComponent(id)}/reviews`, apiOrigin());
    const response = await fetch(url.toString());
    if (!response.ok) return [];
    return await response.json();
  } catch (error) {
    console.error("Error fetching place reviews:", error);
    return [];
  }
};

export interface PublicRegionWardDto {
  id?: number;
  name: string;
}

export interface PublicRegionDistrictDto {
  id?: number;
  name: string;
  wards: PublicRegionWardDto[];
}

export interface PublicRegionDto {
  id?: number;
  province?: string;
  name?: string;
  districts?: PublicRegionDistrictDto[];
  wards?: PublicRegionWardDto[];
}

export const peekPublicRegions = (): PublicRegionDto[] | undefined => peekCache<PublicRegionDto[]>('regions');

/** Cây khu vực cho ô tìm kiếm — ít đổi: giữ trong tab 30 phút, ưu tiên thấp (không chặn nội dung trang). */
export const fetchPublicRegions = async (): Promise<PublicRegionDto[]> => {
  try {
    return await cachedFetch('regions', 30 * 60_000, async () => {
      const url = new URL('/api/public/places/regions', apiOrigin());
      const response = await fetch(url.toString(), { priority: 'low' });
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      return (await response.json()) as PublicRegionDto[];
    });
  } catch (error) {
    console.error("Error fetching public regions:", error);
    return [];
  }
};

