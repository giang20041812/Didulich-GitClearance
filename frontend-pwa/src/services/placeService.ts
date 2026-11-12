import { PlaceContactItem, PlaceDetail } from '../types/homestay';
import { cachedFetch, peekCache } from '@/lib/dataCache';
import { apiOrigin } from '@/lib/apiBase';
import {
  MapContextData,
  MapOverviewPlace,
  MapPoiItem,
  MapViewerScenario,
} from '../types/integrations/google-maps';

/**
 * Service địa điểm phía khách du lịch — dùng fetch (đi qua hàng đợi / hedge của lib/apiBase),
 * không axios, để chunk trang không phải kéo thêm axios.
 */

/** Toạ độ/khoảng cách từ backend (BigDecimal, có thể null) thành số hữu hạn hoặc null. */
const toNumberOrNull = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const getJson = async (path: string, init?: RequestInit): Promise<unknown> => {
  const response = await fetch(`${apiOrigin()}${path}`, init);
  if (!response.ok) throw new Error(`HTTP ${response.status} khi tải ${path}`);
  return response.json();
};

/**
 * Chi tiết địa điểm theo id hoặc slug. Lỗi (404, mạng...) được ném lên để trang hiển thị
 * trạng thái "Không tìm thấy" thay vì dữ liệu của một địa điểm khác.
 */
export const fetchPlaceDetail = (identifier: string): Promise<PlaceDetail> =>
  // Cùng khóa với homestayService.getHomestayById (cùng một API): dữ liệu tải ở trang này dùng lại được ở trang kia.
  cachedFetch(`place:${identifier}`, 60_000, async () => {
    return (await getJson(`/api/public/places/${encodeURIComponent(identifier)}`)) as PlaceDetail;
  });

/** Chi tiết địa điểm đã có trong tab (kể cả cũ) — vẽ ngay khi quay lại rồi làm mới ở nền. */
export const peekPlaceDetail = (identifier: string): PlaceDetail | undefined =>
  peekCache<PlaceDetail>(`place:${identifier}`);

/** Dạng phẳng backend trả về (MapContextDto): latitude/longitude nằm ngay ở gốc, không có object coordinates. */
interface MapContextApiResponse {
  placeId: number;
  placeSlug: string;
  placeName: string;
  regionName?: string | null;
  address?: string | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
  altitudeMeters?: number | null;
  accessNote?: string | null;
  verificationBadge?: string | null;
  pois?: Array<{
    id: number;
    name: string;
    category?: string | null;
    latitude?: number | string | null;
    longitude?: number | string | null;
    distanceKm?: number | string | null;
    note?: string | null;
    address?: string | null;
  }> | null;
  scenarios?: Array<{
    id: string;
    code: string;
    label: string;
    targetName: string;
    latitude?: number | string | null;
    longitude?: number | string | null;
    zoomLevel?: number | null;
    altitudeMeters?: number | null;
    accessNote?: string | null;
    isPrimary?: boolean | null;
  }> | null;
}

/** Bối cảnh bản đồ của một địa điểm. Lỗi được ném lên để trang hiển thị trạng thái lỗi. */
export const fetchMapContext = async (slug: string): Promise<MapContextData> => {
  const data = (await getJson(`/api/public/places/${encodeURIComponent(slug)}/map-context`)) as MapContextApiResponse;
  const latitude = toNumberOrNull(data.latitude);
  const longitude = toNumberOrNull(data.longitude);

  const pois: MapPoiItem[] = (data.pois ?? []).flatMap((poi) => {
    const lat = toNumberOrNull(poi.latitude);
    const lng = toNumberOrNull(poi.longitude);
    if (lat === null || lng === null) return [];
    return [{
      id: poi.id,
      name: poi.name,
      category: poi.category ?? '',
      latitude: lat,
      longitude: lng,
      distanceKm: toNumberOrNull(poi.distanceKm) ?? undefined,
      note: poi.note ?? undefined,
      address: poi.address ?? undefined,
    }];
  });

  const scenarios: MapViewerScenario[] = (data.scenarios ?? []).flatMap((scenario) => {
    const lat = toNumberOrNull(scenario.latitude);
    const lng = toNumberOrNull(scenario.longitude);
    if (lat === null || lng === null) return [];
    return [{
      id: scenario.id,
      code: scenario.code,
      label: scenario.label,
      targetName: scenario.targetName,
      latitude: lat,
      longitude: lng,
      zoomLevel: scenario.zoomLevel ?? 15,
      altitudeMeters: scenario.altitudeMeters ?? undefined,
      accessNote: scenario.accessNote ?? undefined,
      isPrimary: scenario.isPrimary ?? undefined,
    }];
  });

  return {
    placeId: data.placeId,
    placeSlug: data.placeSlug,
    placeName: data.placeName,
    regionName: data.regionName ?? undefined,
    address: data.address ?? undefined,
    coordinates: latitude !== null && longitude !== null ? { latitude, longitude } : null,
    altitudeMeters: data.altitudeMeters ?? undefined,
    accessNote: data.accessNote ?? undefined,
    verificationBadge: data.verificationBadge ?? '',
    pois,
    scenarios,
  };
};

interface PlaceSummaryApiItem {
  id: number;
  slug?: string | null;
  name: string;
  kind?: string | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
  address?: string | null;
  regionName?: string | null;
  coverImageUrl?: string | null;
  priceRefMin?: number | string | null;
  ratingAvg?: number | string | null;
  ratingCount?: number | null;
  contacts?: PlaceContactItem[] | null;
}

/** Tối đa backend cho phép mỗi trang (PublicPlaceService.MAX_PAGE_SIZE). */
const MAP_OVERVIEW_PAGE_SIZE = 100;

/** Các địa điểm công khai có toạ độ cho bản đồ tổng quan /map (đánh giá cao trước). */
export const fetchMapOverviewPlaces = async (): Promise<MapOverviewPlace[]> => {
  const params = new URLSearchParams({ page: '0', size: String(MAP_OVERVIEW_PAGE_SIZE) });
  const data = (await getJson(`/api/public/places?${params}`)) as { content?: PlaceSummaryApiItem[] };
  return (data.content ?? []).flatMap((item) => {
    const lat = toNumberOrNull(item.latitude);
    const lng = toNumberOrNull(item.longitude);
    if (lat === null || lng === null) return [];
    return [{
      id: item.id,
      slug: item.slug ?? String(item.id),
      name: item.name,
      kind: item.kind ?? '',
      latitude: lat,
      longitude: lng,
      address: item.address ?? undefined,
      regionName: item.regionName ?? undefined,
      coverImageUrl: item.coverImageUrl ?? undefined,
      priceRefMin: toNumberOrNull(item.priceRefMin) ?? undefined,
    }];
  });
};

/** Địa điểm có toạ độ cho "Gần tôi" / "Gợi ý lúc này" ở trang chủ. */
export interface NearMePlace {
  id: number;
  kind: string;
  name: string;
  regionName?: string;
  coverImageUrl?: string;
  latitude: number;
  longitude: number;
  priceRefMin?: number;
  ratingAvg?: number;
  ratingCount?: number;
  /** Liên hệ công khai — backend chỉ trả kèm danh sách cho quán ăn, nhà xe, dịch vụ. */
  contacts?: PlaceContactItem[];
}

export type NearMeKind = 'ATTRACTION' | 'HOMESTAY' | 'RESTAURANT';

/**
 * Mọi điểm đến / homestay / quán ăn công khai có toạ độ (≤ 100 mục mỗi loại, giới hạn của backend) — khoảng cách tới khách tính
 * ngay trên máy nên vị trí khách không gửi lên máy chủ và kéo bán kính không gọi lại API. Giữ trong tab 10 phút.
 */
export const fetchNearMeCandidates = (kind: NearMeKind): Promise<NearMePlace[]> =>
  cachedFetch(`nearme:${kind}`, 10 * 60_000, async () => {
    const params = new URLSearchParams({ kind, page: '0', size: String(MAP_OVERVIEW_PAGE_SIZE) });
    const data = (await getJson(`/api/public/places?${params}`, { priority: 'low' })) as { content?: PlaceSummaryApiItem[] };
    return (data.content ?? []).flatMap((item) => {
      const lat = toNumberOrNull(item.latitude);
      const lng = toNumberOrNull(item.longitude);
      if (lat === null || lng === null) return [];
      return [{
        id: item.id,
        kind: item.kind ?? kind,
        name: item.name,
        regionName: item.regionName ?? undefined,
        coverImageUrl: item.coverImageUrl ?? undefined,
        latitude: lat,
        longitude: lng,
        priceRefMin: toNumberOrNull(item.priceRefMin) ?? undefined,
        ratingAvg: toNumberOrNull(item.ratingAvg) ?? undefined,
        ratingCount: item.ratingCount ?? undefined,
        contacts: item.contacts?.filter((contact) => contact.isPublic !== false && contact.value) ?? undefined,
      }];
    });
  });
