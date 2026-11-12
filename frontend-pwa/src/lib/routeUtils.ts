/**
 * routeUtils.ts - Tiện ích nhận diện phân loại route cho layout và header
 */

/**
 * Danh sách các tiền tố route của các trang chi tiết
 */
const DETAIL_ROUTE_PREFIXES = [
  'destinations',
  'places',
  'restaurants',
  'specialties',
  'food',
  'transport',
  'services',
  'photo',
  'rental',
  'experiences',
  'festivals',
  'culture',
  'explore',
  'bookings',
];

/**
 * Danh sách các trang danh sách có Hero Banner to tràn Header
 */
const HERO_LIST_ROUTES = [
  '/lich-trinh',
  '/destinations',
  '/restaurants',
  '/specialties',
  '/food',
  '/transport',
  '/services',
  '/photo',
  '/rental',
  '/culture',
  '/explore',
  '/experiences',
  '/tours',
];

/**
 * Kiểm tra xem pathname hiện tại có phải là trang chi tiết (địa điểm, di chuyển, dịch vụ, v.v.) hay không
 */
export function isDetailPage(pathname: string): boolean {
  const cleanPath = (pathname.split('?')[0] ?? '').replace(/\/+$/, '');
  const segments = cleanPath.split('/').filter(Boolean);

  // Trang chi tiết có dạng /[category]/[identifier]
  if (segments.length >= 2) {
    const parent = segments[0];
    if (parent !== undefined) {
      return DETAIL_ROUTE_PREFIXES.includes(parent);
    }
  }

  return false;
}

/**
 * Kiểm tra xem trang có sử dụng Hero image to tràn lên đỉnh Header (Header transparent) hay không.
 * Các trang chi tiết (địa điểm, di chuyển, dịch vụ) KHÔNG sử dụng hero tràn header
 * để nội dung luôn nằm dưới hẳn Header và Header luôn hiển thị rõ ràng (solid).
 */
export function hasHeroOverlay(pathname: string): boolean {
  const cleanPath = (pathname.split('?')[0] ?? '').replace(/\/+$/, '');

  // 1. Các trang chi tiết địa điểm, di chuyển, dịch vụ... KHÔNG dùng hero tràn header
  if (isDetailPage(cleanPath)) {
    return false;
  }

  // 2. Trang chủ
  if (!cleanPath || cleanPath === '') {
    return true;
  }

  // 3. Danh sách Homestay có Hero Search Hub. Trang chi tiết Homestay không còn thanh tìm kiếm phía trên
  //    (TEST: khách vào để xem phòng và đặt, bớt thông tin gây rối) nên dùng header đặc như các trang chi tiết khác.
  if (cleanPath === '/homestays') {
    return true;
  }

  // 4. Các trang danh sách chính có Hero Banner toàn cảnh
  return HERO_LIST_ROUTES.includes(cleanPath);
}
