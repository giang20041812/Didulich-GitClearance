// Types for Homestay & Place Detail Module matching backend-api DTOs

export type PlaceOperationStatus = 'OPERATING' | 'TEMPORARILY_CLOSED' | 'PERMANENTLY_CLOSED';
export type PlaceVerificationStatus = 'UNVERIFIED' | 'COMMUNITY_VERIFIED' | 'OFFICIAL_VERIFIED';
export type ContactChannel = 'PHONE' | 'EMAIL' | 'ZALO' | 'FACEBOOK' | 'WEBSITE' | 'TIKTOK' | 'YOUTUBE' | 'GOOGLE_MAPS' | 'OTHER';
export type AmenityValue = 'YES' | 'NO' | 'OPTIONAL' | 'UNVERIFIED';
export type HighlightType = 'PRO' | 'CON' | 'TIP' | 'PAIN_POINT' | 'NEARBY';
export type PlaceNeeds = 'enjoy' | 'adventure';

export interface PlaceMediaItem {
  id: number;
  publicUrl: string;
  role: 'COVER' | 'GALLERY' | 'MENU' | 'AVATAR';
  caption?: string;
  sortOrder?: number;
}

export interface PlaceAmenityItem {
  id: number;
  code: string;
  name: string;
  icon?: string;
  value: AmenityValue;
  note?: string;
}

/** Tiện ích cho bộ lọc tìm kiếm — GET /api/public/places/amenities (PublicAmenityDto). */
export interface PublicAmenityItem {
  code: string;
  name: string;
  scope: 'PLACE' | 'ROOM';
  count?: number;
}

export interface PlaceContactItem {
  id: number;
  channel: ContactChannel;
  value: string;
  isPublic: boolean;
  sortOrder: number;
}

export interface PlaceHighlightItem {
  id: number;
  type: HighlightType;
  content: string;
}

export interface HomestayServiceOffer {
  id: number; name: string; description: string | null; price: number | null; priceUnit: string | null; active: boolean;
}
export type HomestayServiceInput = Omit<HomestayServiceOffer, 'id'>;

export interface CancellationPolicySummary {
  id: number;
  name: string;
  description: string;
}

export interface HomestayProfileDetail {
  placeId: number;
  checkInFrom: string | null; // e.g. "14:00"
  checkOutUntil: string | null; // e.g. "12:00"
  houseRules?: string | null;
  surchargeNote?: string | null;
  childrenPolicy?: string | null;
  petsPolicy?: string | null;
  viewHighlight?: string | null;
  /** Nhóm khách phù hợp (homestay_profile.suitability). */
  suitability?: string | null;
  /** "Tiện ích khác" NCC tự gõ, ngoài danh mục tiện nghi. */
  otherAmenities?: string | null;
  currentPolicy?: CancellationPolicySummary | null;
}

export interface PlaceDetail {
  id: number;
  slug: string;
  name: string;
  categoryKind: string;
  needs?: PlaceNeeds;
  categoryName?: string;
  regionName?: string;
  address?: string;
  latitude: number;
  longitude: number;
  accessNote?: string;
  priceRefMin?: number;
  priceRefMax?: number;
  priceUnitNote?: string;
  operationStatus: PlaceOperationStatus;
  verification: PlaceVerificationStatus;
  ratingAvg?: number;
  ratingCount: number;
  /** Điểm Google Maps (0-5) từ dữ liệu đã xác thực, tách biệt với ratingAvg nội bộ. */
  googleRating?: number | null;
  description?: string;
  altitudeMeters?: number;
  verifiedGpsText?: string;
  suitableDateStart?: string;
  suitableDateEnd?: string;
  
  // Rich embedded objects
  /** URL ảnh đã sắp xếp (ảnh bìa trước) — nguồn ảnh chính của trang chi tiết. */
  images?: string[];
  media?: PlaceMediaItem[];
  /** Tên tiện ích (backend trả mảng chuỗi); chi tiết từng tiện ích nằm ở amenityItems. */
  amenities?: string[];
  amenityItems?: PlaceAmenityItem[];
  contacts: PlaceContactItem[];
  highlights: PlaceHighlightItem[];
  homestayProfile?: HomestayProfileDetail | null;
  services?: HomestayServiceOffer[];
}

export interface HomestayDto {
  id: string;
  name: string;
  coverImageUrl: string;
  images?: string[];
  description?: string;
  
  // Location
  district?: string;
  distanceFromCenter?: string;
  
  // Rating
  ratingScore: number;
  ratingText: string;
  reviewCount: number;
  /** Điểm Google Maps (0-5) từ dữ liệu đã xác thực. */
  googleRating?: number | null;
  
  // Badges
  isGenius?: boolean;
  promotionalBadge?: string;
  
  // Room Info
  roomType: string;
  bedInfo: string;
  
  // Policies
  freeCancellation?: boolean;
  noPrepayment?: boolean;
  scarcityMessage?: string; // e.g. "Chúng tôi còn 2 với giá này"
  
  // Pricing
  originalPrice?: number;
  price: number;
  priceDetails?: string; // e.g. "Giá cho 1 đêm, 2 người lớn"
  taxesAndFeesIncluded?: boolean;

  // Real Contacts & Location for List View
  address?: string;
  latitude?: number;
  longitude?: number;
  operationStatus?: PlaceOperationStatus;
  operationStatusReason?: string | null;
  availableForSelectedDates?: boolean;
  /** false = chưa mở bán phòng trực tuyến (chỉ có thông tin tham khảo): khách liên hệ trực tiếp. */
  hasOnlineRooms?: boolean;
  contacts?: PlaceContactItem[];
  amenities?: string[];
  suitableDateStart?: string;
  suitableDateEnd?: string;
}

import { RoomTypeDto } from './room';
export type { RoomTypeDto };


export interface HomestayDetailDto {
  id: number;
  name: string;
  description: string;
  kind: string;
  needs?: PlaceNeeds;
  operationStatus: PlaceOperationStatus;
  operationStatusReason?: string | null;
  address: string;
  accessNote?: string | null;
  district?: string;
  latitude: number;
  longitude: number;
  priceRefMin: number;
  priceRefMax: number;
  priceUnitNote?: string | null;
  ratingAvg: number;
  ratingCount: number;
  /** Điểm Google Maps (0-5) từ dữ liệu đã xác thực, tách biệt với ratingAvg nội bộ. */
  googleRating?: number | null;
  suitableDateStart?: string;
  suitableDateEnd?: string;
  attributes: Record<string, unknown>;
  
  images: string[];
  amenities: string[];
  amenityItems?: PlaceAmenityItem[];
  rooms: RoomTypeDto[];
  regionName?: string;
  homestayProfile?: HomestayProfileDetail | null;
  services?: HomestayServiceOffer[];
  contacts?: PlaceContactItem[];
  highlights?: PlaceHighlightItem[];
  /** Tỉnh / thành của chỗ nghỉ — thẻ "Lên lịch trình" mở /lich-trinh đúng tỉnh. */
  provinceName?: string | null;
}

