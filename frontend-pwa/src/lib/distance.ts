/**
 * Hiển thị khoảng cách tới địa điểm quanh chỗ nghỉ. Trước đây khoảng cách bị làm tròn 0,1 km nên mọi điểm gần đều hiện
 * "100 m" (TEST: kéo bán kính thì danh sách đổi nhưng khoảng cách vẫn 100 m) — giờ làm tròn theo 10 m.
 */
export function formatDistance(km: number | null | undefined): string {
  if (km == null || !Number.isFinite(km)) return '—';
  if (km < 0.05) return 'Rất gần';
  if (km < 1) return `${Math.round(km * 100) * 10} m`;
  if (km < 10) return `${(Math.round(km * 10) / 10).toLocaleString('vi-VN')} km`;
  return `${Math.round(km).toLocaleString('vi-VN')} km`;
}

export interface LatLng {
  lat: number;
  lng: number;
}

/** Khoảng cách đường chim bay (km, Haversine) — không dùng dịch vụ chỉ đường nào. */
export function haversineKm(a: LatLng, b: LatLng): number {
  const rad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Trung tâm thị trấn Mù Cang Chải — mốc thay cho vị trí khách khi khách ở xa hoặc không cho lấy vị trí. */
export const MU_CANG_CHAI_CENTER: LatLng = { lat: 21.851, lng: 104.088 };

export function nearbyKindLabel(kind?: string | null): string {
  switch (kind) {
    case 'FOOD':
    case 'RESTAURANT': return 'Ẩm thực & Quán ăn';
    case 'ATTRACTION': return 'Danh lam thắng cảnh';
    case 'TRANSPORT': return 'Bến xe & Di chuyển';
    default: return 'Điểm lân cận';
  }
}
