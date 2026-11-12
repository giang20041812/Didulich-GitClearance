/** Khung tọa độ (min/max vĩ độ, kinh độ) bao trọn vòng tròn bán kính quanh một điểm — lọc trước cho truy vấn lân cận. */
export interface GeoBox {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

const KM_PER_DEGREE = (6371 * Math.PI) / 180;

/** Cộng thêm 5% để khung luôn chứa trọn vòng tròn (kinh độ co lại về phía cực). */
export function geoBoxAround(lat: number, lng: number, radiusKm: number): GeoBox {
  const dLat = (radiusKm / KM_PER_DEGREE) * 1.05;
  const cos = Math.max(0.01, Math.cos(((Math.min(89, Math.abs(lat) + dLat)) * Math.PI) / 180));
  const dLng = Math.min(180, (radiusKm / (KM_PER_DEGREE * cos)) * 1.05);
  return { minLat: lat - dLat, maxLat: lat + dLat, minLng: lng - dLng, maxLng: lng + dLng };
}

/** Khoảng cách đường chim bay (km) giữa hai tọa độ — công thức Haversine. */
export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Làm tròn half-up tới `scale` chữ số thập phân (BigDecimal.setScale(scale, HALF_UP)). */
export function roundHalfUp(value: number, scale: number): number {
  const f = 10 ** scale;
  return Math.sign(value) * Math.round(Math.abs(value) * f + Number.EPSILON) / f;
}
