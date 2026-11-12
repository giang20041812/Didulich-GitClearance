import type { ExploreCategory, ServiceGroup } from '@/types/explore';

export interface ServiceGroupOption {
  code: ServiceGroup;
  label: string;
  /** Loại địa điểm (place.kind) mà nhóm này áp dụng. */
  kind: 'TRANSPORT' | 'CULTURE';
}

/** Cùng tên với ServiceGroup.java — dùng ở form dịch vụ (NCC, Admin) và trang Di chuyển / Trải nghiệm. */
export const SERVICE_GROUPS: ServiceGroupOption[] = [
  { code: 'LOCAL_MOTO', label: 'Xe ôm, xe máy địa phương', kind: 'TRANSPORT' },
  { code: 'TOUR_MOTO', label: 'Tour xe máy', kind: 'TRANSPORT' },
  { code: 'SELF_DRIVE', label: 'Thuê xe tự lái', kind: 'TRANSPORT' },
  { code: 'INTERCITY_BUS', label: 'Xe khách liên tỉnh', kind: 'TRANSPORT' },
  { code: 'SHARED_CAR', label: 'Xe ghép, taxi', kind: 'TRANSPORT' },
  { code: 'TREKKING', label: 'Đi bộ, leo núi', kind: 'CULTURE' },
  { code: 'CRAFT', label: 'Làm nghề thủ công', kind: 'CULTURE' },
  { code: 'CUISINE', label: 'Ẩm thực bản địa', kind: 'CULTURE' },
  { code: 'CULTURE', label: 'Văn hóa, lễ hội', kind: 'CULTURE' },
  { code: 'ADVENTURE', label: 'Mạo hiểm (dù lượn, zipline…)', kind: 'CULTURE' },
  { code: 'FARM', label: 'Làm nông, hái chè', kind: 'CULTURE' },
];

/** Nhóm dịch vụ có trong một danh mục khám phá (Dịch vụ địa phương → nhà xe, Trải nghiệm → trải nghiệm). */
export function serviceGroupsFor(category: ExploreCategory | null): ServiceGroupOption[] {
  if (category === 'LOCAL_SERVICE') return SERVICE_GROUPS.filter((g) => g.kind === 'TRANSPORT');
  if (category === 'EXPERIENCE') return SERVICE_GROUPS.filter((g) => g.kind === 'CULTURE');
  return [];
}

export const serviceGroupOf = (code: ServiceGroup | null | undefined) => SERVICE_GROUPS.find((g) => g.code === code) ?? null;

/** Xe khách và xe ghép chạy tuyến cố định: bắt buộc điểm đi, điểm đến (như backend). */
export const FIXED_ROUTE_GROUPS: ServiceGroup[] = ['INTERCITY_BUS', 'SHARED_CAR'];

/** Gợi ý đơn vị giá — người nhập vẫn gõ được đơn vị khác (tối đa 32 ký tự). */
export const PRICE_UNIT_SUGGESTIONS = ['/khách', '/chuyến', '/xe', '/ngày', '/nhóm', '/lượt'];

/** Giới hạn của form dịch vụ — khớp ExplorePlaceWriter.java. */
export const SERVICE_LIMITS = {
  vehicleTypeMax: 64,
  routeMax: 120,
  departureTimesMax: 255,
  includesMax: 1000,
  priceUnitMax: 32,
  priceMax: 100_000_000,
  durationMinMinutes: 10,
  durationMaxMinutes: 10_080,
  seatsMax: 100,
  groupSizeMax: 500,
} as const;

/** 330 → "5 giờ 30 phút"; 2880 → "2 ngày" (như PlaceExtras.minutesText). */
export function minutesText(minutes: number | null | undefined): string | null {
  if (!minutes || minutes <= 0) return null;
  if (minutes < 60) return `${minutes} phút`;
  if (minutes >= 24 * 60) {
    const days = Math.floor(minutes / (24 * 60));
    const hours = Math.floor((minutes % (24 * 60)) / 60);
    return hours === 0 ? `${days} ngày` : `${days} ngày ${hours} giờ`;
  }
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} giờ` : `${hours} giờ ${rest} phút`;
}

/** 1890000 → "1.890.000 đ". */
export const formatVnd = (value: number | null | undefined) =>
  value == null ? '' : `${Math.round(value).toLocaleString('vi-VN')} đ`;
