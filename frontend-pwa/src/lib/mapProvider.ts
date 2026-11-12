import L from 'leaflet';

/**
 * Lớp trung gian nhà cung cấp bản đồ (XN-10 chưa chốt): mọi nền bản đồ và đường dẫn chỉ đường của EP02 đi qua đây; đổi
 * sang Google Maps / nhà cung cấp khác chỉ sửa file này. Nền giống VietmapView: VietMap khi có key, không thì ảnh vệ tinh
 * Esri (không vẽ OSM để tránh sai lệch chủ quyền Hoàng Sa – Trường Sa).
 */

export interface LatLngValue {
  lat: number;
  lng: number;
}

const vietmapKey = () => ((import.meta.env.VITE_VIETMAP_API_KEY as string | undefined) ?? '').trim();

/**
 * Gắn nền bản đồ và báo lỗi khi nền không tải được (AC-02.19). Ô nền đầu tiên tải được thì coi là bản đồ đã chạy; nền
 * chính lỗi thì chuyển sang nền dự phòng; quá {@code timeoutMs} chưa có ô nào tải được thì gọi {@code onFailure}.
 * Trả về hàm hủy hẹn giờ.
 */
export function attachBaseLayer(map: L.Map, onFailure: () => void, timeoutMs = 10_000): () => void {
  let loaded = false;
  let failed = false;
  const fail = () => {
    if (loaded || failed) return;
    failed = true;
    onFailure();
  };
  const watch = (layer: L.TileLayer, onError: () => void) => {
    layer.on('tileload', () => { loaded = true; });
    layer.on('tileerror', onError);
    layer.addTo(map);
  };
  const esri = () => L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    { attribution: 'Imagery &copy; Esri, Maxar, Earthstar Geographics', maxZoom: 19 },
  );
  const key = vietmapKey();
  if (key) {
    let fellBack = false;
    watch(L.tileLayer(`https://maps.vietmap.vn/tm/{z}/{x}/{y}.png?apikey=${encodeURIComponent(key)}`, {
      attribution: '&copy; VietMap', maxZoom: 19,
    }), () => {
      if (loaded || fellBack) return;
      fellBack = true;
      const fallback = esri();
      watch(fallback, fail);
      fallback.bringToBack();
    });
  } else {
    watch(esri(), fail);
  }
  const timer = window.setTimeout(fail, timeoutMs);
  return () => window.clearTimeout(timer);
}

/**
 * BR-02.08: đường dẫn chỉ đường mở ứng dụng bản đồ bên ngoài. Trên điện thoại có ứng dụng Google Maps, hệ điều hành mở
 * ứng dụng; không có thì mở bản web (AC-02.22). Không có điểm đi thì để ứng dụng dùng vị trí hiện tại.
 */
export function directionsUrl(destination: LatLngValue, origin?: LatLngValue | null): string {
  const params = new URLSearchParams({ api: '1', destination: `${destination.lat},${destination.lng}` });
  if (origin) params.set('origin', `${origin.lat},${origin.lng}`);
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

export function openDirections(destination: LatLngValue, origin?: LatLngValue | null) {
  window.open(directionsUrl(destination, origin), '_blank', 'noopener,noreferrer');
}
