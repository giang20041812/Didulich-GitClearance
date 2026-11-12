/**
 * Mục điều hướng (header / sidebar / breadcrumb) của từng loại địa điểm và đường dẫn chi tiết tương ứng.
 * Một nơi duy nhất để đặc sản luôn mở dưới "Đặc sản" (/specialties/:id) — trước đây trang chủ, bản đồ, cẩm nang dẫn
 * đặc sản qua /food/:id hoặc /restaurants/:id nên header sáng mục "Nhà hàng" và breadcrumb ghi "Ẩm thực & Quán ăn".
 */

export interface PlaceSection {
  /** Đường dẫn trang danh sách của mục (khớp CUSTOMER_NAV). */
  path: string;
  /** Tên mục trên breadcrumb — trùng tên trên thanh điều hướng. */
  label: string;
  /** Nút quay lại danh sách. */
  backLabel: string;
  /** Các tiền tố đường dẫn chi tiết cũng thuộc mục này (bí danh cũ vẫn mở được, không phải chuyển hướng). */
  detailPrefixes: string[];
}

const SECTIONS = {
  homestays: { path: '/homestays', label: 'Lưu trú', backLabel: 'Quay lại danh sách lưu trú', detailPrefixes: ['homestays'] },
  destinations: { path: '/destinations', label: 'Du lịch', backLabel: 'Quay lại danh sách điểm đến', detailPrefixes: ['destinations', 'places'] },
  specialties: { path: '/specialties', label: 'Đặc sản', backLabel: 'Quay lại danh sách đặc sản', detailPrefixes: ['specialties'] },
  restaurants: { path: '/restaurants', label: 'Nhà hàng', backLabel: 'Quay lại danh sách nhà hàng', detailPrefixes: ['restaurants', 'food'] },
  transport: { path: '/transport', label: 'Di chuyển', backLabel: 'Quay lại danh sách di chuyển', detailPrefixes: ['transport'] },
  services: { path: '/services', label: 'Dịch vụ & Tiện ích', backLabel: 'Quay lại dịch vụ & tiện ích', detailPrefixes: ['services', 'photo', 'rental'] },
} satisfies Record<string, PlaceSection>;

/** Mục điều hướng theo loại địa điểm (CategoryKind của backend). */
export function placeSectionFor(kind: string | null | undefined): PlaceSection {
  switch ((kind ?? '').toUpperCase()) {
    case 'HOMESTAY':
    case 'HOTEL':
      return SECTIONS.homestays;
    case 'DISH':
      return SECTIONS.specialties;
    case 'RESTAURANT':
    case 'FOOD':
      return SECTIONS.restaurants;
    case 'TRANSPORT':
      return SECTIONS.transport;
    case 'SERVICE':
    case 'PHOTO':
    case 'RENTAL':
      return SECTIONS.services;
    default:
      return SECTIONS.destinations;
  }
}

/** Đường dẫn chi tiết chuẩn của một địa điểm theo loại. */
export function placeDetailPath(kind: string | null | undefined, id: string | number): string {
  const section = placeSectionFor(kind);
  return `${section.path}/${id}`;
}

/**
 * Đường dẫn chuẩn để chuyển tới khi địa điểm đang mở dưới mục sai (vd đặc sản mở qua /restaurants/:id từ link cũ),
 * hoặc null nếu đường dẫn hiện tại đã thuộc đúng mục.
 */
export function canonicalPlacePath(kind: string | null | undefined, pathname: string, id: string): string | null {
  const prefix = pathname.split('/').filter(Boolean)[0] ?? '';
  const section = placeSectionFor(kind);
  return section.detailPrefixes.includes(prefix) ? null : `${section.path}/${id}`;
}
