import { PlaceContactItem } from '../types/homestay';
import { apiOrigin } from '@/lib/apiBase';

export interface DestinationDto {
  id: string;
  name: string;
  coverImageUrl: string;
  images?: string[];
  description?: string;
  district?: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  ratingScore: number;
  ratingText: string;
  reviewCount: number;
  ticketPrice: number;
  priceUnitNote?: string;
  tagBadge?: string;
  scenicType: string;
  amenities: string[];
  contacts?: PlaceContactItem[];
  isSuitableByTime?: boolean;
  suitableDateStart?: string;
  suitableDateEnd?: string;
  needs?: 'enjoy' | 'adventure';
}

export interface DestinationFilterParams {
  keyword?: string;
  scenicTypes?: string[];
  minPrice?: number;
  maxPrice?: number;
  needs?: 'enjoy' | 'adventure';
}

export const fetchDestinations = async (params?: DestinationFilterParams): Promise<DestinationDto[]> => {
  try {
    const url = new URL('/api/public/places', apiOrigin());
    url.searchParams.append('kind', 'ATTRACTION');
    url.searchParams.append('size', '50');

    if (params?.minPrice !== undefined) url.searchParams.append('minPrice', params.minPrice.toString());
    if (params?.maxPrice !== undefined) url.searchParams.append('maxPrice', params.maxPrice.toString());
    if (params?.needs) url.searchParams.append('needs', params.needs);

    const response = await fetch(url.toString());
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    const content: Array<{
      id: number;
      name: string;
      regionName?: string;
      coverImageUrl?: string | null;
      description?: string | null;
      priceRefMin?: number | null;
      ratingAvg?: number | null;
      ratingCount?: number | null;
      latitude?: number | null;
      longitude?: number | null;
      address?: string | null;
      contacts?: PlaceContactItem[];
      suitableDateStart?: string | null;
      suitableDateEnd?: string | null;
      needs?: 'enjoy' | 'adventure' | null;
    }> = data.content || [];

    const mapped: DestinationDto[] = content.map((item) => {
      const cover = (typeof item.coverImageUrl === 'string' && item.coverImageUrl.trim().length > 0)
        ? item.coverImageUrl
        : '';

      // Nhận diện loại cảnh quan
      const lowerName = item.name.toLowerCase();
      let scenic = 'Thắng cảnh thiên nhiên';
      if (lowerName.includes('thác')) scenic = 'Thác nước & Suối nguồn';
      else if (lowerName.includes('đèo') || lowerName.includes('khau phạ')) scenic = 'Đèo hùng vĩ & Đỉnh mây';
      else if (lowerName.includes('rừng')) scenic = 'Rừng sinh thái nguyên sinh';
      else if (lowerName.includes('sống lưng')) scenic = 'Điểm săn mây & Trekking';
      else if (lowerName.includes('thung lũng')) scenic = 'Thung lũng & Bản làng';
      else if (lowerName.includes('ruộng') || lowerName.includes('mâm xôi') || lowerName.includes('móng ngựa')) scenic = 'Ruộng bậc thang di sản';

      const price = item.priceRefMin && item.priceRefMin > 0 ? item.priceRefMin : (item.priceRefMin === 0 ? 0 : 0);
      const rating = item.ratingAvg || 0;
      const count = item.ratingCount || 0;

      return {
        id: item.id.toString(),
        name: item.name,
        coverImageUrl: cover,
        description: item.description || '',
        district: item.regionName || '',
        address: item.address || '',
        latitude: item.latitude || undefined,
        longitude: item.longitude || undefined,
        ratingScore: rating,
        ratingText: rating >= 4.5 ? 'Tuyệt vời' : '',
        reviewCount: count,
        ticketPrice: price,
        priceUnitNote: price === 0 ? 'Miễn phí' : 'vé/lượt',
        tagBadge: price === 0 ? 'Miễn phí vé' : 'Điểm đến nổi bật',
        scenicType: scenic,
        amenities: [],
        contacts: item.contacts || [],
        suitableDateStart: item.suitableDateStart || undefined,
        suitableDateEnd: item.suitableDateEnd || undefined,
        needs: item.needs || undefined,
      };
    });

    let result = mapped;
    if (params?.scenicTypes && params.scenicTypes.length > 0) {
      result = result.filter(d => params.scenicTypes!.includes(d.scenicType));
    }
    if (params?.keyword && params.keyword.trim().length > 0) {
      const kw = params.keyword.trim().toLowerCase();
      result = result.filter(d => 
        d.name.toLowerCase().includes(kw) || 
        (d.address && d.address.toLowerCase().includes(kw)) ||
        d.scenicType.toLowerCase().includes(kw)
      );
    }

    return result;
  } catch (error) {
    console.error('Error fetching destinations:', error);
    return [];
  }
};
