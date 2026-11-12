/** Đọc tọa độ (và tên địa điểm nếu có) từ link Google Maps chủ nhà dán vào. */
export interface MapLinkInfo { latitude: number | null; longitude: number | null; placeName: string | null; shortLink: boolean }

const round6 = (n: number) => Number(n.toFixed(6));

export function parseGoogleMapsLink(url: string): MapLinkInfo {
  const value = url.trim();
  const at = value.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  const bang = value.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
  const query = value.match(/[?&](?:q|query|ll|destination)=(-?\d+\.\d+)(?:,|%2C)\s*(-?\d+\.\d+)/i);
  // Ưu tiên !3d!4d (vị trí chính xác của địa điểm) hơn @ (tâm khung bản đồ đang xem).
  const hit = bang ?? at ?? query;
  let placeName: string | null = null;
  const place = value.match(/\/place\/([^/@?]+)/);
  if (place?.[1]) {
    try { placeName = decodeURIComponent(place[1].replace(/\+/g, ' ')).trim() || null; } catch { placeName = null; }
  }
  return {
    latitude: hit ? round6(Number(hit[1])) : null,
    longitude: hit ? round6(Number(hit[2])) : null,
    placeName,
    shortLink: /^(https?:\/\/)?(maps\.app\.goo\.gl|goo\.gl\/maps)\//i.test(value),
  };
}

/** Link mở Google Maps tại đúng tọa độ — để chủ nhà tự kiểm tra vị trí. */
export const mapsUrl = (lat: number, lng: number) => `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;

/** So khớp không dấu, không phân biệt hoa thường — dùng để tự chọn Khu vực theo địa chỉ chủ nhà gõ. */
export const foldVietnamese = (s: string) =>
  s.normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().replace(/\s+/g, ' ').trim();

/** Khu vực có tên dài nhất xuất hiện trong địa chỉ (cụ thể nhất: "Mù Cang Chải" thắng "Yên Bái"). */
export function guessRegion<T extends { id: number; name: string }>(address: string, regions: T[]): T | null {
  const folded = foldVietnamese(address);
  if (!folded) return null;
  let best: T | null = null;
  for (const region of regions) {
    const name = foldVietnamese(region.name).replace(/^(tinh|thanh pho|tp\.?|huyen|thi xa|xa|phuong|thi tran)\s+/, '');
    if (name.length >= 3 && folded.includes(name) && (!best || name.length > foldVietnamese(best.name).length)) best = region;
  }
  return best;
}
