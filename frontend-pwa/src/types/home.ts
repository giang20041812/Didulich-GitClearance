import type { PlaceNeeds } from './homestay';
export type { PlaceNeeds } from './homestay';

/** Loại địa điểm — khớp CategoryKind.java (đặc sản là món ăn, nằm ở bảng riêng: DishSummaryDto). */
export type CategoryKind = 
  | 'ATTRACTION' 
  | 'HOMESTAY' 
  | 'RESTAURANT' 
  | 'PHOTO'
  | 'RENTAL'
  | 'TRANSPORT' 
  | 'SERVICE'
  | 'CULTURE';

export interface CategoryDto {
  id: number;
  kind: CategoryKind;
  needs?: PlaceNeeds;
  slug: string;
  name: string;
  description: string;
}

export interface PlaceSummaryDto {
  id: number;
  slug: string;
  name: string;
  regionName: string;
  coverImageUrl: string;
  description: string;
  priceRefMin: number;
  ratingAvg: number;
  ratingCount: number;
  /** Điểm Google Maps (0-5) từ dữ liệu đã xác thực. */
  googleRating?: number | null;
  attributesJson: string;
  kind: CategoryKind;
  priceUnitNote?: string;
  suitableDateStart?: string;
  suitableDateEnd?: string;
  
  // Virtual fields enriched by backend
  tagBadge?: string;
  statsText?: string;
  amenities?: string[];
  highlights?: string[];
  durationText?: string;
  /** Link video TikTok (thẻ điểm đến / đặc sản phát video thay cho ảnh bìa); không có thì hiện ảnh. */
  tiktokUrl?: string | null;
}

/** Món ăn đặc sản — khớp DishDtos.DishSummaryDto (kind luôn "DISH"). */
export interface DishSummaryDto {
  id: number;
  slug: string;
  name: string;
  kind: 'DISH';
  regionName?: string | null;
  coverImageUrl?: string | null;
  priceRefMin?: number | null;
  priceRefMax?: number | null;
  priceUnitNote?: string | null;
  tagBadge?: string | null;
  /** Link video TikTok (thẻ đặc sản phát video thay cho ảnh bìa); không có thì hiện ảnh. */
  tiktokUrl?: string | null;
}

export interface HomeResponseDto {
  categories: CategoryDto[];
  featuredDestinations: PlaceSummaryDto[];
  homestays: PlaceSummaryDto[];
  featuredTours: PlaceSummaryDto[];
  specialties?: DishSummaryDto[];
}
