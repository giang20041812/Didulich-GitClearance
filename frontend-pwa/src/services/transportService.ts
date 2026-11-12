import { PlaceContactItem } from '../types/homestay';
import { apiOrigin } from '@/lib/apiBase';

export interface TransportDto {
  id: string;
  name: string;
  coverImageUrl: string;
  description?: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  ratingScore: number;
  ratingText: string;
  reviewCount: number;
  priceRef: number;
  priceUnitNote?: string;
  categoryGroup: string; // 'LOCAL_MOTO' | 'TOUR_MOTO' | 'SELF_DRIVE' | 'INTERCITY_BUS' | 'SHARED_CAR'
  categoryGroupName: string;
  vehicleType: string;
  routeType: string;
  distance?: string;
  duration?: string;
  positiveReview?: string;
  negativeReview?: string;
  painPointNote?: string;
  contacts?: PlaceContactItem[];
  /** true = nhà xe đã khai báo thông tin dịch vụ (loại xe, tuyến, giờ chạy, giá) — hiển thị đúng như khai báo. */
  hasServiceProfile?: boolean;
  departureTimes?: string;
  seats?: number;
}

export interface TransportFilterParams {
  keyword?: string;
  categoryGroups?: string[];
  vehicleTypes?: string[];
  minPrice?: number;
  maxPrice?: number;
}

export const fetchTransports = async (params?: TransportFilterParams): Promise<TransportDto[]> => {
  try {
    const url = new URL('/api/public/places', apiOrigin());
    url.searchParams.append('kind', 'TRANSPORT');
    url.searchParams.append('size', '50');

    if (params?.minPrice !== undefined) url.searchParams.append('minPrice', params.minPrice.toString());
    if (params?.maxPrice !== undefined) url.searchParams.append('maxPrice', params.maxPrice.toString());

    const response = await fetch(url.toString());
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const data = await response.json();
    const content: Array<{
      id: number;
      name: string;
      coverImageUrl?: string | null;
      description?: string | null;
      priceRefMin?: number | null;
      priceRefMax?: number | null;
      priceUnitNote?: string | null;
      ratingAvg?: number | null;
      ratingCount?: number | null;
      address?: string | null;
      latitude?: number | null;
      longitude?: number | null;
      attributes?: Record<string, unknown>;
      contacts?: PlaceContactItem[];
    }> = data.content || [];

    const mapped: TransportDto[] = content.map((item) => {
      const attrs = item.attributes || {};
      const cover: string = (item.coverImageUrl && item.coverImageUrl.trim().length > 0)
        ? item.coverImageUrl
        : (typeof attrs.coverImageUrl === 'string' && attrs.coverImageUrl.trim().length > 0)
          ? attrs.coverImageUrl
          : '';

      const lowerName = item.name.toLowerCase();
      // Nhà xe đã khai báo thông tin dịch vụ: dùng đúng dữ liệu đó, không đoán theo tên, không tự đặt giá.
      if (typeof attrs.categoryGroup === 'string' && attrs.categoryGroup) {
        const text = (key: string) => (typeof attrs[key] === 'string' ? (attrs[key] as string) : '');
        const unit = item.priceUnitNote || text('priceDetails');
        return {
          id: item.id.toString(),
          name: item.name,
          coverImageUrl: cover,
          description: item.description || '',
          address: item.address || '',
          latitude: item.latitude || undefined,
          longitude: item.longitude || undefined,
          ratingScore: item.ratingAvg && item.ratingAvg > 0 ? Math.round(item.ratingAvg * 10) / 10 : 0,
          ratingText: item.ratingAvg && item.ratingAvg > 0 ? 'Đánh giá của khách' : 'Chưa có đánh giá',
          reviewCount: item.ratingCount || 0,
          priceRef: item.priceRefMin && item.priceRefMin > 0 ? item.priceRefMin : 0,
          priceUnitNote: unit ? unit.replace(/^\/\s*/, '') : undefined,
          categoryGroup: attrs.categoryGroup,
          categoryGroupName: text('categoryGroupName'),
          vehicleType: text('vehicleType'),
          routeType: text('routeSchedule') || text('departureTimes'),
          duration: text('duration') || undefined,
          contacts: item.contacts || [],
          hasServiceProfile: true,
          departureTimes: text('departureTimes') || undefined,
          seats: typeof attrs.seats === 'number' ? attrs.seats : undefined,
        };
      }

      // Phân nhóm theo categoryGroup từ DB attributes hoặc suy luận
      let categoryGroup = typeof attrs.categoryGroup === 'string' ? attrs.categoryGroup : '';
      let categoryGroupName = typeof attrs.categoryGroupName === 'string' ? attrs.categoryGroupName : '';

      if (!categoryGroup) {
        if (lowerName.includes('xe ôm') || lowerName.includes('ngã 3') || lowerName.includes('trung chuyển')) {
          categoryGroup = 'LOCAL_MOTO';
          categoryGroupName = 'Xe ôm bản địa vượt dốc';
        } else if (lowerName.includes('ghép đoàn') || lowerName.includes('tour')) {
          categoryGroup = 'TOUR_MOTO';
          categoryGroupName = 'Xe ôm tour & ghép đoàn';
        } else if (lowerName.includes('thuê xe') || lowerName.includes('tự lái') || lowerName.includes('bán tải')) {
          categoryGroup = 'SELF_DRIVE';
          categoryGroupName = 'Thuê xe tự lái (Xe máy / Ô tô)';
        } else if (lowerName.includes('limousine') || lowerName.includes('giường nằm') || lowerName.includes('hà trang') || lowerName.includes('cường lan') || lowerName.includes('hưng thành') || lowerName.includes('sơn phương')) {
          categoryGroup = 'INTERCITY_BUS';
          categoryGroupName = 'Xe khách & Limousine liên tỉnh';
        } else {
          categoryGroup = 'SHARED_CAR';
          categoryGroupName = 'Xe ghép liên xã & bán tải';
        }
      }

      let vType = typeof attrs.vehicleType === 'string' ? attrs.vehicleType : 'Phương tiện di chuyển';
      let rType = typeof attrs.routeSchedule === 'string' ? attrs.routeSchedule : (typeof attrs.schedule === 'string' ? attrs.schedule : 'Di chuyển quanh Mù Cang Chải');

      if (!vType || vType === 'Phương tiện di chuyển') {
        if (categoryGroup === 'LOCAL_MOTO') {
          vType = 'Xe ôm số chuyên leo dốc bản địa';
          rType = 'Đưa đón tận nơi các điểm hiểm trở';
        } else if (categoryGroup === 'TOUR_MOTO') {
          vType = 'Xe máy kèm tài xế bản địa kiêm thợ ảnh';
          rType = 'Lịch trình trọn ngày các điểm săn lúa';
        } else if (categoryGroup === 'SELF_DRIVE') {
          vType = 'Xe máy số / Xe bán tải 4x4';
          rType = 'Tự do trải nghiệm toàn huyện';
        } else if (categoryGroup === 'INTERCITY_BUS') {
          vType = lowerName.includes('limousine') ? 'Xe Limousine VIP 9–11 chỗ' : 'Xe khách giường nằm 40 chỗ VIP';
          rType = 'Hà Nội – Mù Cang Chải (Hàng ngày)';
        } else {
          vType = 'Xe taxi 7 chỗ ghép chuyến';
          rType = 'Lào Cai ↔ Mù Cang Chải ↔ Các xã';
        }
      }

      const price = item.priceRefMin && item.priceRefMin > 0 
        ? item.priceRefMin 
        : (categoryGroup === 'LOCAL_MOTO' ? 60000 : (categoryGroup === 'SELF_DRIVE' ? 150000 : 250000));
        
      const rating = item.ratingAvg && item.ratingAvg > 0 ? item.ratingAvg : 0;

      return {
        id: item.id.toString(),
        name: item.name,
        coverImageUrl: cover,
        description: item.description || '',
        address: item.address || 'Huyện Mù Cang Chải, Tỉnh Lào Cai',
        latitude: item.latitude || undefined,
        longitude: item.longitude || undefined,
        ratingScore: Math.round(rating * 10) / 10,
        ratingText: rating >= 4.8 ? 'Tuyệt vời & An toàn' : rating > 0 ? 'Uy tín & Chu đáo' : 'Chưa có đánh giá',
        reviewCount: item.ratingCount || 0,
        priceRef: price,
        priceUnitNote: item.priceUnitNote || (typeof attrs.priceDetails === 'string' ? attrs.priceDetails : undefined),
        categoryGroup,
        categoryGroupName,
        vehicleType: vType,
        routeType: rType,
        distance: typeof attrs.distance === 'string' ? attrs.distance : undefined,
        duration: typeof attrs.duration === 'string' ? attrs.duration : undefined,
        positiveReview: typeof attrs.positiveReview === 'string' ? attrs.positiveReview : undefined,
        negativeReview: typeof attrs.negativeReview === 'string' ? attrs.negativeReview : undefined,
        painPointNote: typeof attrs.painPointNote === 'string' ? attrs.painPointNote : undefined,
        contacts: item.contacts || [],
      };
    });

    let result = mapped;
    if (params?.categoryGroups && params.categoryGroups.length > 0) {
      result = result.filter(t => params.categoryGroups!.includes(t.categoryGroup));
    }
    if (params?.vehicleTypes && params.vehicleTypes.length > 0) {
      result = result.filter(t => params.vehicleTypes!.includes(t.vehicleType));
    }
    if (params?.keyword && params.keyword.trim().length > 0) {
      const kw = params.keyword.trim().toLowerCase();
      result = result.filter(t => 
        t.name.toLowerCase().includes(kw) || 
        t.vehicleType.toLowerCase().includes(kw) ||
        t.categoryGroupName.toLowerCase().includes(kw) ||
        t.routeType.toLowerCase().includes(kw) ||
        (t.address && t.address.toLowerCase().includes(kw))
      );
    }

    return result;
  } catch (error) {
    console.error('Error fetching transports:', error);
    return [];
  }
};
