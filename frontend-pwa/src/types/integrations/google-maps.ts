// Integration types for Google Maps / Geolocation according to official spec

export interface GeoCoordinates {
  latitude: number;
  longitude: number;
}

export interface MapPoiItem {
  id: number;
  name: string;
  /** Loại địa điểm (kind) backend trả về: ATTRACTION, CUISINE, TRANSPORT, SERVICE... */
  category: string;
  latitude: number;
  longitude: number;
  distanceKm?: number;
  note?: string;
  address?: string;
}

export interface MapViewerScenario {
  id: string;
  code: string; // e.g. "MAP-12"
  label: string; // e.g. "1. Chuẩn: Homestay Đồi Mâm Xôi"
  targetName: string;
  latitude: number;
  longitude: number;
  zoomLevel: number;
  altitudeMeters?: number;
  accessNote?: string;
  isPrimary?: boolean;
}

export interface MapContextData {
  placeId: number;
  placeSlug: string;
  placeName: string;
  regionName?: string;
  address?: string;
  /** null khi địa điểm chưa có toạ độ GPS. */
  coordinates: GeoCoordinates | null;
  altitudeMeters?: number;
  accessNote?: string;
  verificationBadge: string;
  pois: MapPoiItem[];
  scenarios: MapViewerScenario[];
}

/** Một địa điểm công khai có toạ độ, dùng cho bản đồ tổng quan /map. */
export interface MapOverviewPlace {
  id: number;
  slug: string;
  name: string;
  kind: string;
  latitude: number;
  longitude: number;
  address?: string;
  regionName?: string;
  coverImageUrl?: string;
  priceRefMin?: number;
}
