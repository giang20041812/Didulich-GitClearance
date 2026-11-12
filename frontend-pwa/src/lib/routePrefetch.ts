/**
 * Tải trước (prefetch) chunk của trang đích khi người dùng RÊ CHUỘT / chạm / focus vào link.
 *
 * Lần truy cập đầu service worker chưa kịp precache các chunk trang; bình thường phải bấm link rồi mới
 * bắt đầu tải (mạng chậm thì thấy con quay loading). Nuốt sự kiện pointerover/focusin lấy href của link
 * gần nhất, tra bảng dưới đây và gọi đúng dynamic import — khi người dùng bấm thật, chunk đã nằm sẵn
 * trong bộ nhớ trình duyệt, trang hiện gần như tức thì. Mỗi chunk chỉ tải một lần (Set đã tải).
 *
 * Bảng loader y hệt các import trong routes/AppRoutes.tsx — Vite gộp cùng một chunk cho mỗi trang.
 */

type Loader = () => Promise<unknown>;

const HomestayListPage: Loader = () => import('@/pages/customer/homestay/HomestayListPage');
const HomestayDetailPage: Loader = () => import('@/pages/customer/homestay/HomestayDetailPage');
const FullScreenMapPage: Loader = () => import('@/pages/customer/homestay/FullScreenMapPage');
const BookingPage: Loader = () => import('@/pages/customer/booking/BookingPage');
const UserBookingListPage: Loader = () => import('@/pages/customer/booking/UserBookingListPage');
const UserBookingDetailPage: Loader = () => import('@/pages/customer/booking/UserBookingDetailPage');
const CultureFestivalPage: Loader = () => import('@/pages/customer/culture/CultureFestivalPage');
const FestivalDetailPage: Loader = () => import('@/pages/customer/culture/FestivalDetailPage');
const DestinationListPage: Loader = () => import('@/pages/customer/culture/DestinationListPage');
const TravelGuidePage: Loader = () => import('@/pages/customer/guide/TravelGuidePage');
const PlaceDetailPage: Loader = () => import('@/pages/customer/culture/PlaceDetailPage');
const RestaurantListPage: Loader = () => import('@/pages/customer/services/RestaurantListPage');
const SpecialtyListPage: Loader = () => import('@/pages/customer/services/SpecialtyListPage');
const DishDetailPage: Loader = () => import('@/pages/customer/services/DishDetailPage');
const TransportListPage: Loader = () => import('@/pages/customer/services/TransportListPage');
const UtilityListPage: Loader = () => import('@/pages/customer/services/UtilityListPage');
const PortalLoginPage: Loader = () => import('@/pages/portal/PortalLoginPage');
const UserProfilePage: Loader = () => import('@/pages/customer/profile/UserProfilePage');
const RegisterPage: Loader = () => import('@/pages/auth/RegisterPage');
const ProviderRegisterPage: Loader = () => import('@/pages/auth/ProviderRegisterPage');
const AdminDashboardPage: Loader = () => import('@/pages/admin/AdminDashboardPage');
const PartnerCalendarPage: Loader = () => import('@/pages/partner/PartnerCalendarPage');
const PartnerDashboardPage: Loader = () => import('@/pages/partner/PartnerDashboardPage');
const PartnerHomestaysPage: Loader = () => import('@/pages/partner/PartnerHomestaysPage');
const PartnerRoomsPage: Loader = () => import('@/pages/partner/PartnerRoomsPage');
const PartnerBookingsPage: Loader = () => import('@/pages/partner/PartnerBookingsPage');
const PartnerBookingProcessPage: Loader = () => import('@/pages/partner/PartnerBookingProcessPage');
const PartnerReviewsPage: Loader = () => import('@/pages/partner/PartnerReviewsPage');
const PartnerHomestayEditPage: Loader = () => import('@/pages/partner/PartnerHomestayEditPage');
const PartnerHomestayCreatePage: Loader = () => import('@/pages/partner/PartnerHomestayCreatePage');
const PartnerProfilePage: Loader = () => import('@/pages/partner/PartnerProfilePage');
const NotFoundPage: Loader = () => import('@/pages/system/NotFoundPage');
const DesignSystemPage: Loader = () => import('@/pages/system/DesignSystemPage');
const DownloadAppPage: Loader = () => import('@/pages/system/DownloadAppPage');
const SharedJourneyPage: Loader = () => import('@/pages/customer/journey/SharedJourneyPage');
const TripPlannerPage: Loader = () => import('@/pages/customer/trip/TripPlannerPage');
const TripsHubPage: Loader = () => import('@/pages/customer/trip/TripsHubPage');

/** Trang danh sách / trang tĩnh: khớp theo path tuyệt đối (đúng path-to-regexp style của AppRoutes). */
const STATIC_ROUTES: Record<string, Loader> = {
  '/homestays': HomestayListPage,
  '/booking': BookingPage,
  '/bookings': UserBookingListPage,
  '/my-bookings': UserBookingListPage,
  '/experiences': CultureFestivalPage,
  '/culture': CultureFestivalPage,
  '/explore': CultureFestivalPage,
  '/tours': CultureFestivalPage,
  '/destinations': DestinationListPage,
  '/restaurants': RestaurantListPage,
  '/food': RestaurantListPage,
  '/specialties': SpecialtyListPage,
  '/transport': TransportListPage,
  '/services': UtilityListPage,
  '/photo': UtilityListPage,
  '/rental': UtilityListPage,
  '/profile': UserProfilePage,
  '/cam-nang': TravelGuidePage,
  '/guide': TravelGuidePage,
  '/download': DownloadAppPage,
  '/tai-app': DownloadAppPage,
  '/cai-dat-app': DownloadAppPage,
  '/lich-trinh': TripsHubPage,
  '/trai-nghiem': TripsHubPage,
  '/journeys': TripsHubPage,
  '/map': FullScreenMapPage,
  '/login': PortalLoginPage,
  '/admin/login': PortalLoginPage,
  '/portal/login': PortalLoginPage,
  '/register': RegisterPage,
  '/register/partner': ProviderRegisterPage,
  '/design-system': DesignSystemPage,
  '/admin': AdminDashboardPage,
  '/partner': PartnerCalendarPage,
  '/partner/overview': PartnerDashboardPage,
  '/partner/homestays': PartnerHomestaysPage,
  '/partner/rooms': PartnerRoomsPage,
  '/partner/bookings': PartnerBookingsPage,
  '/partner/reviews': PartnerReviewsPage,
  '/partner/homestay/create': PartnerHomestayCreatePage,
  '/partner/profile': PartnerProfilePage,
};

/** Trang chi tiết theo segment đầu tiên của path (path có ≥ 2 segment). */
const DETAIL_BY_FIRST_SEGMENT: Record<string, Loader> = {
  homestays: HomestayDetailPage,
  bookings: UserBookingDetailPage,
  experiences: FestivalDetailPage,
  culture: FestivalDetailPage,
  explore: FestivalDetailPage,
  tours: FestivalDetailPage,
  festivals: FestivalDetailPage,
  destinations: PlaceDetailPage,
  places: PlaceDetailPage,
  restaurants: PlaceDetailPage,
  food: PlaceDetailPage,
  specialties: DishDetailPage,
  transport: PlaceDetailPage,
  services: PlaceDetailPage,
  photo: PlaceDetailPage,
  rental: PlaceDetailPage,
  j: SharedJourneyPage,
  'lich-trinh': TripPlannerPage,
};

/** Cổng NCC: segment thứ hai quyết định trang. */
const PARTNER_BY_SECOND_SEGMENT: Record<string, Loader> = {
  overview: PartnerDashboardPage,
  homestays: PartnerHomestaysPage,
  rooms: PartnerRoomsPage,
  bookings: PartnerBookingsPage,
  reviews: PartnerReviewsPage,
  profile: PartnerProfilePage,
  create: PartnerHomestayCreatePage,
  edit: PartnerHomestayEditPage,
};

const loaded = new Set<Loader>();

function prefetch(loader: Loader) {
  if (loaded.has(loader)) return;
  loaded.add(loader);
  loader().catch(() => loaded.delete(loader));
}

function loaderFor(pathname: string): Loader | undefined {
  if (!pathname.startsWith('/') || pathname.startsWith('/api/')) return undefined;
  const clean = pathname.replace(/\/+$/, '') || '/';
  if (STATIC_ROUTES[clean]) return STATIC_ROUTES[clean];
  if (clean === '/') return undefined; // Trang chủ nằm sẵn trong bundle chính.
  const segments = clean.slice(1).split('/');
  if (segments[0] === 'partner') {
    if (segments[1] === 'homestay') {
      // /partner/homestay/create | /:id/edit | /:id/rooms — khớp theo segment thứ ba, mặc định là trang sửa.
      const action = PARTNER_BY_SECOND_SEGMENT[segments[2] ?? ''];
      return action ?? PartnerHomestayEditPage;
    }
    if (segments[1] === 'bookings' && segments.length >= 3) return PartnerBookingProcessPage;
    return PARTNER_BY_SECOND_SEGMENT[segments[1] ?? ''] ?? PartnerCalendarPage;
  }
  if (segments.length >= 2) return DETAIL_BY_FIRST_SEGMENT[segments[0] ?? ''];
  // Đường dẫn một segment không khớp bảng trên → trang "không tồn tại" (route * trong AppRoutes).
  return NotFoundPage;
}

/** Gắn listener một lần khi app khởi động (gọi từ main.tsx). */
export function installRoutePrefetch() {
  if (typeof document === 'undefined' || (window as { __routePrefetchInstalled?: boolean }).__routePrefetchInstalled) return;
  (window as { __routePrefetchInstalled?: boolean }).__routePrefetchInstalled = true;

  const handler = (event: Event) => {
    const target = event.target instanceof Element ? event.target.closest('a[href]') : null;
    if (!target) return;
    const href = target.getAttribute('href');
    if (!href || href.startsWith('http') || href.startsWith('mailto:') || href.startsWith('tel:')) return;
    // Chunk trang portal (Admin/Partner/Login) đã kéo theo lib/axiosBoot + axios trong đồ phụ thuộc của nó,
    // nên prefetch trang là đủ — không nạp axios ở đây để tránh bị inline vào bundle chính.
    const loader = loaderFor(new URL(href, window.location.origin).pathname);
    if (loader) prefetch(loader);
  };

  // capture để bắt link render sau này mà không cần gắn từng link; focusin phục vụ người dùng bàn phím.
  document.addEventListener('pointerover', handler, { capture: true, passive: true });
  document.addEventListener('focusin', handler, { capture: true, passive: true });
}
