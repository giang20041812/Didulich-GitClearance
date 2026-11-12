import { useCallback, useMemo } from 'react';
import { MapPoiItem } from '../../types/integrations/google-maps';
import VietmapView from './VietmapView';
import type { VietmapMarkerItem } from '@/types/integrations/vietmap';

interface InteractiveMapViewProps {
  /** Tâm khung nhìn (điểm đang chọn). */
  centerLat: number;
  centerLng: number;
  /** Địa điểm chính: marker "Chính" luôn nằm đúng toạ độ của nó, kể cả khi đang xem điểm lân cận. */
  placeName: string;
  placeLat: number;
  placeLng: number;
  pois?: MapPoiItem[];
  zoomLevel?: number;
  onMarkerSelect?: (poi: MapPoiItem | null) => void;
}

export default function InteractiveMapView({
  centerLat,
  centerLng,
  placeName,
  placeLat,
  placeLng,
  pois = [],
  zoomLevel = 14,
  onMarkerSelect
}: InteractiveMapViewProps) {
  // Giữ nguyên danh sách marker khi chỉ đổi điểm đang xem, để bản đồ không fitBounds lại đè lên vị trí vừa chọn.
  const vietmapMarkers: VietmapMarkerItem[] = useMemo(() => [
    {
      id: 'main-place',
      name: placeName,
      latitude: placeLat,
      longitude: placeLng,
      isMain: true,
      kind: 'HOMESTAY',
      displayMode: 'name' as const,
    },
    ...pois.map((poi): VietmapMarkerItem => ({
      id: `poi-${poi.id}`,
      name: poi.name,
      latitude: poi.latitude,
      longitude: poi.longitude,
      address: poi.address,
      distance: poi.distanceKm,
      kind: poi.category,
      category: poi.category,
      displayMode: 'name' as const,
    }))
  ], [placeName, placeLat, placeLng, pois]);

  const handleMarkerClick = useCallback((m: VietmapMarkerItem) => {
    if (m.id === 'main-place') {
      onMarkerSelect?.(null);
    } else {
      const foundPoi = pois.find(p => `poi-${p.id}` === m.id);
      onMarkerSelect?.(foundPoi || null);
    }
  }, [pois, onMarkerSelect]);

  return (
    <div className="relative w-full h-full">
      <VietmapView
        centerLat={centerLat}
        centerLng={centerLng}
        zoomLevel={zoomLevel}
        markers={vietmapMarkers}
        className="w-full h-full min-h-screen"
        onMarkerClick={handleMarkerClick}
      />
    </div>
  );
}
