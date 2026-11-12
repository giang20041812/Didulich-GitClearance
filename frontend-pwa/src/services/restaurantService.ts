import { PlaceContactItem } from '../types/homestay';
import { apiOrigin } from '@/lib/apiBase';

export interface RestaurantDto {
  id: string;
  name: string;
  coverImageUrl: string;
  images?: string[];
  description?: string;
  categoryName?: string;

  // Location
  district?: string;
  address?: string;
  latitude?: number;
  longitude?: number;

  // Rating
  ratingScore: number;
  ratingText: string;
  reviewCount: number;

  // Badges & Specialties
  promotionalBadge?: string;
  specialtyTag?: string;
  cuisineType?: string;

  // Pricing
  priceMin: number;
  priceMax?: number;
  priceUnitNote?: string;

  // Tags & Amenities
  amenities: string[];

  // Contacts
  contacts?: PlaceContactItem[];
}

export interface RestaurantFilterParams {
  keyword?: string;
  minPrice?: number;
  maxPrice?: number;
  cuisineTypes?: string[];
  amenities?: string[];
}


interface RawBackendPlaceItem {
  id: number;
  slug?: string;
  name: string;
  regionName?: string;
  coverImageUrl?: string | null;
  description?: string | null;
  priceRefMin?: number | null;
  priceRefMax?: number | null;
  priceUnitNote?: string | null;
  ratingAvg?: number | null;
  ratingCount?: number | null;
  kind?: string;
  latitude?: number | null;
  longitude?: number | null;
  address?: string | null;
  contacts?: PlaceContactItem[];
  tagBadge?: string | null;
  amenities?: string[] | null;
  attributes?: Record<string, unknown> | null;
}

interface RawBackendPageResponse {
  content?: RawBackendPlaceItem[];
}

export const fetchRestaurants = async (params?: RestaurantFilterParams): Promise<RestaurantDto[]> => {
  try {
    const url = new URL('/api/public/places', apiOrigin());
    url.searchParams.append('kind', 'RESTAURANT');
    url.searchParams.append('size', '50'); // Lấy danh sách đầy đủ để lọc & phân trang

    if (params?.minPrice !== undefined) url.searchParams.append('minPrice', params.minPrice.toString());
    if (params?.maxPrice !== undefined) url.searchParams.append('maxPrice', params.maxPrice.toString());
    if (params?.amenities && params.amenities.length > 0) {
      params.amenities.forEach(amenity => url.searchParams.append('amenities', amenity));
    }

    const response = await fetch(url.toString());
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data: RawBackendPageResponse = await response.json();
    const content = data.content || [];

    const mappedList: RestaurantDto[] = content.map((item) => {
      const cover: string = (typeof item.coverImageUrl === 'string' && item.coverImageUrl.trim().length > 0)
        ? item.coverImageUrl
        : '';

      // Nhận diện loại hình món ăn từ tên quán
      const lowerName = item.name.toLowerCase();
      let cuisine = 'Đặc sản Tây Bắc';
      let specialtyTag = 'Món ngon bản địa';

      if (lowerName.includes('thắng cố') || lowerName.includes('ngựa')) {
        cuisine = 'Thắng cố & Thịt ngựa';
        specialtyTag = 'Thắng cố truyền thống';
      } else if (lowerName.includes('quán ăn') || lowerName.includes('cơm')) {
        cuisine = 'Cơm bản & Lẩu nướng';
        specialtyTag = 'Cơm gia đình & Lẩu';
      } else if (lowerName.includes('nhà sàn')) {
        cuisine = 'Ẩm thực nhà sàn Thái';
        specialtyTag = 'Không gian nhà sàn';
      } else if (lowerName.includes('vườn đào') || lowerName.includes('quán')) {
        cuisine = 'Gà đồi & Lợn bản';
        specialtyTag = 'Gà đồi nướng mác khén';
      }

      const basePrice = item.priceRefMin && item.priceRefMin > 0 ? item.priceRefMin : 0;
      const rating = item.ratingAvg || 0;
      const count = item.ratingCount || 0;

      // Tiện ích quán ăn
      const amenities: string[] = [];

      return {
        id: item.id.toString(),
        name: item.name,
        coverImageUrl: cover,
        description: item.description || '',
        district: item.regionName || 'Mù Cang Chải',
        address: item.address || 'Lào Cai',
        latitude: item.latitude || undefined,
        longitude: item.longitude || undefined,
        ratingScore: rating,
        ratingText: rating >= 4.7 ? 'Xuất sắc' : rating >= 4.4 ? 'Tuyệt hảo' : rating > 0 ? 'Rất tốt' : 'Chưa có đánh giá',
        reviewCount: count,
        promotionalBadge: item.tagBadge || undefined,
        specialtyTag,
        cuisineType: cuisine,
        priceMin: basePrice,
        priceMax: item.priceRefMax || (basePrice > 0 ? basePrice * 2 : 0),
        priceUnitNote: item.priceUnitNote || 'người',
        amenities,
        contacts: item.contacts || [],
      };
    });

    let result = mappedList;

    // Lọc cuisineTypes nếu có
    if (params?.cuisineTypes && params.cuisineTypes.length > 0) {
      result = result.filter(r => params.cuisineTypes!.includes(r.cuisineType || ''));
    }

    // Lọc keyword cục bộ (nếu người dùng gõ tìm kiếm)
    if (params?.keyword && params.keyword.trim().length > 0) {
      const kw = params.keyword.trim().toLowerCase();
      result = result.filter(r =>
        r.name.toLowerCase().includes(kw) ||
        (r.address && r.address.toLowerCase().includes(kw)) ||
        (r.cuisineType && r.cuisineType.toLowerCase().includes(kw)) ||
        (r.specialtyTag && r.specialtyTag.toLowerCase().includes(kw))
      );
    }

    return result;
  } catch (error) {
    console.error('Error fetching restaurants:', error);
    return [];
  }
};
