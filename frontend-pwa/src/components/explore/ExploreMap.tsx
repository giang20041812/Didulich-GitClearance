import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapPinOff } from 'lucide-react';
import { attachBaseLayer, type LatLngValue } from '@/lib/mapProvider';

export interface ExploreMarker {
  id: number;
  lat: number;
  lng: number;
  /** Tên hiện khi rê / chạm ghim — gán bằng textContent, không ghép HTML (tên do NCC nhập). */
  label: string;
  /** homestay = ghim mốc (màu chính); place = địa điểm. */
  kind: 'homestay' | 'place';
}

interface ExploreMapProps {
  markers: ExploreMarker[];
  /** Bấm ghim địa điểm (KH-01 mở chi tiết). */
  onMarkerClick?: (id: number) => void;
  /** Chế độ chọn tọa độ (AD-02): bấm bản đồ hoặc kéo ghim để chọn điểm. */
  pick?: { value: LatLngValue | null; onChange: (value: LatLngValue) => void; center: LatLngValue };
  className?: string;
  /** Bản đồ không tải được (AC-02.19) — trang tự ẩn / thay bằng ô nhập tay. */
  onError?: () => void;
}

const PIN_STYLE = 'display:block;width:18px;height:18px;border-radius:9999px;border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35)';
const iconFor = (kind: 'homestay' | 'place' | 'pick') => L.divIcon({
  className: '',
  html: `<span style="${PIN_STYLE};background:${kind === 'place' ? '#f97316' : '#0a7d64'}${kind === 'pick' ? ';width:22px;height:22px' : ''}"></span>`,
  iconSize: kind === 'pick' ? [22, 22] : [18, 18],
  iconAnchor: kind === 'pick' ? [11, 11] : [9, 9],
});

/**
 * Bản đồ Leaflet nhỏ cho EP02. Nền bản đồ qua {@link attachBaseLayer} (lớp trung gian XN-10); nền không tải được thì hiện
 * "Không tải được bản đồ" thay cho bản đồ (AC-02.19) — danh sách thẻ bên ngoài vẫn dùng bình thường.
 */
export default function ExploreMap({ markers, onMarkerClick, pick, className = 'h-64', onError }: ExploreMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const [failed, setFailed] = useState(false);
  const clickRef = useRef(onMarkerClick);
  const pickRef = useRef(pick);
  const errorRef = useRef(onError);
  // Luôn gọi bản mới nhất của các hàm truyền vào mà không phải tạo lại bản đồ.
  useEffect(() => {
    clickRef.current = onMarkerClick;
    pickRef.current = pick;
    errorRef.current = onError;
  });

  // Tạo bản đồ một lần.
  useEffect(() => {
    if (!containerRef.current) return undefined;
    let map: L.Map;
    try {
      const start = pickRef.current?.value ?? pickRef.current?.center ?? markers[0] ?? { lat: 21.851, lng: 104.088 };
      map = L.map(containerRef.current, { center: [start.lat, start.lng], zoom: 13, scrollWheelZoom: false });
    } catch {
      setFailed(true);
      errorRef.current?.();
      return undefined;
    }
    const stop = attachBaseLayer(map, () => {
      setFailed(true);
      errorRef.current?.();
    });
    map.on('click', (e: L.LeafletMouseEvent) => pickRef.current?.onChange({ lat: e.latlng.lat, lng: e.latlng.lng }));
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    return () => {
      stop();
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- tạo bản đồ một lần; ghim cập nhật ở effect dưới
  }, []);

  // Vẽ lại ghim khi danh sách đổi.
  const markerKey = markers.map((m) => `${m.id}:${m.lat}:${m.lng}`).join('|');
  const pickKey = pick?.value ? `${pick.value.lat}:${pick.value.lng}` : '';
  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();
    const points: L.LatLngExpression[] = [];
    for (const m of markers) {
      const marker = L.marker([m.lat, m.lng], { icon: iconFor(m.kind), keyboard: true, title: m.label, alt: m.label });
      const tip = document.createElement('span');
      tip.textContent = m.label;
      marker.bindTooltip(tip, { direction: 'top', offset: [0, -10] });
      if (m.kind === 'place') marker.on('click', () => clickRef.current?.(m.id));
      marker.addTo(layer);
      points.push([m.lat, m.lng]);
    }
    const value = pickRef.current?.value;
    if (value) {
      const picker = L.marker([value.lat, value.lng], { icon: iconFor('pick'), draggable: true, title: 'Vị trí đã chọn' });
      picker.on('dragend', () => {
        const ll = picker.getLatLng();
        pickRef.current?.onChange({ lat: ll.lat, lng: ll.lng });
      });
      picker.addTo(layer);
      points.push([value.lat, value.lng]);
    }
    if (points.length > 1) map.fitBounds(L.latLngBounds(points), { padding: [28, 28], maxZoom: 15 });
    else if (points.length === 1) map.setView(points[0] as L.LatLngTuple, Math.max(map.getZoom(), 14));
  }, [markerKey, pickKey, markers]);

  if (failed) {
    return (
      <div role="status" className={`flex flex-col items-center justify-center gap-2 rounded-xl bg-slate-100 p-4 text-center text-sm text-slate-500 ${className}`}>
        <MapPinOff className="h-6 w-6" aria-hidden />
        Không tải được bản đồ
      </div>
    );
  }
  return <div ref={containerRef} className={`relative z-0 overflow-hidden rounded-xl ${className}`} aria-label="Bản đồ" />;
}
