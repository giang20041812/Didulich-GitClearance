import type { ReactNode } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, Bike, Camera, Compass, LogIn, Plus, SlidersHorizontal, UserRound } from 'lucide-react';
import { Button } from './button';
import { getCurrentCustomer } from '@/lib/currentCustomer';
import HomeMotifs, { type MotifVariant } from '@/components/home/HomeMotifs';
import TripShell from '@/components/trip/TripShell';
import { Skeleton } from './skeleton';
import {
  CardGridSkeleton,
  FilterPanelSkeleton,
  LIST_SKELETON_SPECS,
  TabsSkeleton,
  ToolbarSkeleton,
} from './ListPageSkeleton';
import { FeedListSkeleton, MyJourneysSkeleton } from '@/components/experience/FeedCardSkeleton';
import bannerHomestays from '@/assets/photos/banner-homestays.webp';
import bannerDestinations from '@/assets/photos/banner-destinations.webp';
import bannerRestaurants from '@/assets/photos/banner-restaurants.webp';
import bannerSpecialties from '@/assets/photos/banner-specialties.webp';
import bannerTransport from '@/assets/photos/banner-transport.webp';
import bannerUtilities from '@/assets/photos/banner-utilities.webp';
import bannerCulture from '@/assets/photos/banner-culture.webp';
import bannerGuide from '@/assets/photos/banner-guide.webp';
import comboImage from '@/assets/fluent/combo.webp';

/*
 * Khung chờ lúc đang tải mã của từng trang (Suspense trong AppRoutes). Mỗi khung dựng lại đúng phần tĩnh của trang
 * (ảnh bìa, tiêu đề, đường dẫn) và đúng khung chờ trang tự hiện ở lần tải dữ liệu đầu — nên khi mã trang tải xong,
 * khung chờ nối tiếp liền mạch, không đổi hình. Sửa bố cục trang nào thì sửa khung tương ứng ở đây.
 */

const bar = 'bg-slate-200 opacity-100';
const PAGE_BG =
  'relative isolate w-full flex flex-col min-h-screen overflow-x-clip bg-[linear-gradient(180deg,var(--color-canvas)_0%,#f1faf6_45%,#fbf7ee_100%)]';

function Busy({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <div role="status" aria-busy="true" className={className}>
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

/** Nền trang danh sách: hai quầng màu + họa tiết nét mảnh dưới ảnh bìa (giống trang thật). */
function ListPage({ motif, motifTop, label, children }: { motif: MotifVariant; motifTop: string; label: string; children: ReactNode }) {
  return (
    <Busy label={label} className={PAGE_BG}>
      <div aria-hidden="true" className="pointer-events-none absolute right-[-120px] top-[520px] h-[380px] w-[380px] rounded-full bg-emerald-300/20 blur-3xl" />
      <div aria-hidden="true" className="pointer-events-none absolute left-[-140px] top-[1100px] h-[420px] w-[420px] rounded-full bg-amber-200/25 blur-3xl" />
      <HomeMotifs variant={motif} className={`inset-x-0 bottom-0 ${motifTop}`} />
      {children}
    </Busy>
  );
}

/** Ảnh bìa chuẩn của các trang danh sách (Du lịch, Nhà hàng, Đặc sản, Di chuyển, Dịch vụ, Văn hóa). */
function BannerHero({ image, title, overlay = 'via-[#0f2d3c]/50' }: { image: string; title: string; overlay?: string }) {
  return (
    <section className="relative w-full min-h-[360px] md:min-h-[360px] flex items-start md:items-center justify-center pt-[calc(145px+var(--safe-top))] md:pt-[calc(130px+var(--safe-top))] pb-10 md:pb-8">
      <div className="absolute inset-0 z-0 bg-cover bg-center bg-[#0f2d3c]" style={{ backgroundImage: `url(${image})` }}>
        <div className={`absolute inset-0 bg-gradient-to-b from-[#0f2d3c]/85 ${overlay} to-transparent`} />
      </div>
      <div className="relative z-10 w-full max-w-4xl mx-auto px-4 text-center">
        <h1 className="text-3xl md:text-4xl lg:text-5xl font-extrabold font-display text-white tracking-tight drop-shadow-md">{title}</h1>
      </div>
    </section>
  );
}

function Crumb({ label, className = 'mb-3' }: { label: string; className?: string }) {
  return (
    <div className={`flex items-center gap-2 text-xs md:text-sm text-[var(--color-muted)] ${className}`}>
      <Link to="/" className="hover:text-[var(--color-primary)] transition-colors">Trang chủ</Link>
      <span>/</span>
      <span className="text-[var(--color-ink-deep)] font-semibold">{label}</span>
    </div>
  );
}

/** Nút mở bộ lọc trên điện thoại (cột bộ lọc ẩn) — chữ tĩnh, dựng y như nút của trang. */
function MobileFilterButton({ label, homestay = false }: { label: string; homestay?: boolean }) {
  return (
    <div aria-hidden="true" className="flex md:hidden mb-2">
      <span className={`flex w-full items-center justify-center gap-2 bg-white rounded-xl shadow-xs border text-sm font-bold text-[var(--color-primary)] ${homestay ? 'h-11 border-emerald-600/30' : 'p-3.5 border-slate-200'}`}>
        <SlidersHorizontal className="w-4 h-4" /> {label}
      </span>
    </div>
  );
}

/** Thân trang có cột bộ lọc từ md (Lưu trú, Du lịch, Nhà hàng). */
function SidebarBody({ filter, mobileFilter, count }: { filter: ReactNode; mobileFilter: ReactNode; count: number }) {
  return (
    <div className="w-full flex flex-col gap-6 md:flex-row md:items-stretch">
      {mobileFilter}
      <aside className="hidden w-[300px] shrink-0 flex-col gap-4 md:flex">
        <div className="sticky top-24">{filter}</div>
      </aside>
      <div className="flex min-h-0 flex-1 flex-col gap-4">
        <CardGridSkeleton count={count} withSidebar />
      </div>
    </div>
  );
}

export function HomestayListFallback() {
  const spec = LIST_SKELETON_SPECS.homestays;
  const [params] = useSearchParams();
  const forJourney = params.has('forJourney');
  return (
    <ListPage motif="stay" motifTop="top-[460px] md:top-[360px]" label="Đang tải danh sách chỗ nghỉ">
      <section className="relative w-full min-h-[460px] md:min-h-[360px] flex items-start md:items-center justify-center pt-[calc(106px+var(--safe-top))] md:pt-[calc(86px+var(--safe-top))] pb-8 md:pb-6">
        <div className="absolute inset-0 z-0 bg-cover bg-center bg-[#0f2d3c]" style={{ backgroundImage: `url(${bannerHomestays})` }}>
          <div className="absolute inset-0 bg-gradient-to-b from-[#1d2d4f]/85 via-[#16524a]/45 to-transparent" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(251,191,36,0.22),transparent_55%)]" />
        </div>
        {/* Ô tìm kiếm (SearchHub): điện thoại một hàng 60px, máy tính ba ô + nút tìm cao 78px */}
        <div className="relative z-10 w-full max-w-5xl mx-auto px-4">
          <div aria-hidden="true" className="flex h-[60px] items-center gap-1.5 rounded-2xl bg-white p-1.5 ring-1 ring-white/70 shadow-[0_2px_6px_rgba(4,36,29,0.12),0_28px_60px_-24px_rgba(4,36,29,0.6)] md:h-[78px] md:gap-1">
            {[0, 1, 2].map((i) => (
              <div key={i} className={`h-full min-w-0 flex-1 items-center gap-2.5 px-2 ${i > 0 ? 'hidden md:flex' : 'flex'}`}>
                <Skeleton className={`${bar} h-9 w-9 shrink-0 rounded-xl`} />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className={`${bar} h-3 w-16`} />
                  <Skeleton className={`${bar} h-4 w-3/4`} />
                </div>
              </div>
            ))}
            <Skeleton className="h-full w-24 shrink-0 rounded-xl bg-emerald-600/80 opacity-100 md:w-36" />
          </div>
          {/* Lối phụ "Hoặc lên lịch trình trước" dưới ô tìm (ẩn khi đang chọn chỗ ở cho một lịch trình) */}
          {!forJourney && (
            <div aria-hidden="true" className="mt-2 flex justify-center px-1 md:justify-start">
              <span className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-black/15 px-4 text-sm font-extrabold text-white ring-1 ring-white/25">
                Hoặc lên lịch trình trước <ArrowRight className="h-4 w-4" strokeWidth={2.5} />
              </span>
            </div>
          )}
        </div>
      </section>
      <div className="max-w-[1280px] mx-auto w-full px-4 md:px-8 pt-4 pb-8">
        <Crumb label="Homestay & Chỗ nghỉ" />
        <div className="mb-5">
          <h1 className="text-2xl md:text-3xl lg:text-[36px] font-extrabold tracking-tight bg-gradient-to-r from-[#0a2e26] via-[#052620] to-[#d97706] bg-clip-text text-transparent">
            Chốn nghỉ giữa ruộng bậc thang
          </h1>
        </div>
        <ToolbarSkeleton {...spec.toolbar} />
        <SidebarBody filter={<FilterPanelSkeleton {...spec.filter} />} mobileFilter={<MobileFilterButton label="Lọc kết quả homestay" homestay />} count={spec.count} />
      </div>
    </ListPage>
  );
}

export function DestinationListFallback() {
  const spec = LIST_SKELETON_SPECS.destinations;
  return (
    <ListPage motif="explore" motifTop="top-[360px]" label="Đang tải điểm đến">
      <BannerHero image={bannerDestinations} title="Điểm Đến & Thắng Cảnh" />
      <div className="max-w-[1280px] mx-auto w-full px-4 md:px-8 pt-3 pb-8">
        <Crumb label="Danh thắng & Điểm tham quan" />
        <ToolbarSkeleton {...spec.toolbar} />
        <SidebarBody filter={<FilterPanelSkeleton {...spec.filter} />} mobileFilter={<MobileFilterButton label="Lọc cảnh quan" />} count={spec.count} />
      </div>
    </ListPage>
  );
}

export function RestaurantListFallback() {
  const spec = LIST_SKELETON_SPECS.restaurants;
  return (
    <ListPage motif="restaurant" motifTop="top-[360px]" label="Đang tải nhà hàng">
      <BannerHero image={bannerRestaurants} title="Hương Vị Tây Bắc Nguyên Bản" />
      <div className="max-w-[1280px] mx-auto w-full px-4 md:px-8 pt-3 pb-8">
        <Crumb label="Nhà hàng & Ẩm thực" />
        <ToolbarSkeleton {...spec.toolbar} />
        <SidebarBody filter={<FilterPanelSkeleton {...spec.filter} />} mobileFilter={<MobileFilterButton label="Lọc kết quả ẩm thực" />} count={spec.count} />
      </div>
    </ListPage>
  );
}

/** Di chuyển: cột bộ lọc chỉ hiện từ lg (lưới 4 cột: 1 bộ lọc + 3 danh sách). */
export function TransportListFallback() {
  const spec = LIST_SKELETON_SPECS.transport;
  const [params] = useSearchParams();
  const filtering = params.has('q') || params.has('groups');
  return (
    <ListPage motif="transport" motifTop="top-[360px]" label="Đang tải dịch vụ di chuyển">
      <BannerHero image={bannerTransport} title="Dịch Vụ Di Chuyển & Xe Ôm Vượt Dốc" overlay="via-[#0f2d3c]/60" />
      <div className="max-w-[1280px] mx-auto w-full px-4 md:px-8 pt-3 pb-8">
        <Crumb label="Dịch vụ di chuyển" />
        <ToolbarSkeleton {...spec.toolbar} />
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <div className="hidden lg:block lg:col-span-1">
            <div className="sticky top-24"><FilterPanelSkeleton {...spec.filter} /></div>
          </div>
          <div aria-hidden="true" className="lg:hidden mb-2">
            <Button
              variant="outline"
              tabIndex={-1}
              className="w-full flex items-center justify-center gap-2 rounded-xl font-bold py-3 text-sm bg-white border-slate-200 shadow-xs"
            >
              <SlidersHorizontal className="w-4 h-4 text-[var(--color-primary)]" />
              Bộ Lọc Phân Loại ({filtering ? 'Đang lọc' : 'Mặc định'})
            </Button>
          </div>
          <div className="lg:col-span-3">
            <CardGridSkeleton count={spec.count} withSidebar />
          </div>
        </div>
      </div>
    </ListPage>
  );
}

export function SpecialtyListFallback() {
  return (
    <ListPage motif="gift" motifTop="top-[360px]" label="Đang tải đặc sản">
      <BannerHero image={bannerSpecialties} title="Đặc Sản Bản Địa" />
      <div className="max-w-[1280px] mx-auto w-full px-4 md:px-8 pt-3 pb-8">
        <Crumb label="Đặc sản địa phương" />
        <CardGridSkeleton count={LIST_SKELETON_SPECS.specialties.count} />
      </div>
    </ListPage>
  );
}

export function UtilityListFallback() {
  const spec = LIST_SKELETON_SPECS.services;
  const [params] = useSearchParams();
  return (
    <ListPage motif="utility" motifTop="top-[360px]" label="Đang tải dịch vụ & tiện ích">
      <BannerHero image={bannerUtilities} title="Dịch Vụ & Tiện Ích Du Lịch" />
      <div className="max-w-[1280px] mx-auto w-full px-4 md:px-8 pt-3 pb-8">
        <Crumb label="Dịch vụ & Tiện ích" />
        {/* Ba tab loại dịch vụ — chữ tĩnh, dựng y như trang (tab đang chọn theo ?tab=) */}
        <div aria-hidden="true" className="flex items-center gap-2 mb-5 p-1.5 bg-white border border-slate-200 rounded-2xl shadow-xs max-w-lg">
          {([
            ['ALL', 'Tất cả dịch vụ', null],
            ['photo', 'Chụp ảnh & Trang phục', Camera],
            ['rental', 'Thuê xe & Lều trại', Bike],
          ] as const).map(([id, label, Icon]) => (
            <span
              key={id}
              className={`flex-1 py-2.5 px-3 text-xs md:text-sm font-bold rounded-xl flex items-center justify-center gap-1.5 ${(params.get('tab') ?? 'ALL') === id
                ? 'bg-gradient-to-br from-emerald-600 to-teal-500 text-white shadow-md shadow-emerald-600/30'
                : 'text-slate-600'}`}
            >
              {Icon && <Icon className="w-4 h-4" />}
              {label}
            </span>
          ))}
        </div>
        <ToolbarSkeleton {...spec.toolbar} />
        <CardGridSkeleton count={spec.count} />
      </div>
    </ListPage>
  );
}

export function CultureFallback() {
  return (
    <ListPage motif="culture" motifTop="top-[360px]" label="Đang tải lễ hội văn hóa">
      <BannerHero image={bannerCulture} title="Trải Nghiệm & Lễ Hội Văn Hóa" />
      <div className="max-w-[1280px] mx-auto w-full px-4 md:px-8 pt-3 pb-12">
        <Crumb label="Trải nghiệm & Lễ hội bản địa" className="mb-5" />
        <TabsSkeleton count={4} className="mb-6 pb-3.5" />
        <CardGridSkeleton count={LIST_SKELETON_SPECS.culture.count} />
      </div>
    </ListPage>
  );
}

/** Combo: không có ảnh bìa — tiêu đề + tab thời lượng + lưới 3 cột thẻ cao. */
export function ComboListFallback() {
  return (
    <Busy label="Đang tải combo" className="mx-auto w-full max-w-[1280px] px-4 pb-12 pt-6 md:px-8">
      <header className="flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex items-start gap-3">
          <img src={comboImage} alt="" aria-hidden width={52} height={52} className="h-[52px] w-[52px] shrink-0 object-contain" />
          <div>
            <h1 className="font-display text-2xl font-extrabold text-ink-deep sm:text-3xl">Combo du lịch</h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-600">
              Trọn lịch trình, địa điểm, giờ đi và giá. Giá không gồm ăn uống — mỗi combo có gợi ý nhà hàng quanh lộ trình.
            </p>
          </div>
        </div>
        <div aria-hidden="true" className="flex flex-wrap gap-1.5">
          {['Tất cả', 'Đi trong ngày', '2–3 ngày', 'Từ 4 ngày'].map((label, i) => (
            <span
              key={label}
              className={`inline-flex min-h-9 items-center rounded-full border px-3.5 text-xs font-semibold ${i === 0 ? 'border-ink-deep bg-ink-deep text-white' : 'border-slate-200 bg-white text-slate-700'}`}
            >
              {label}
            </span>
          ))}
        </div>
      </header>
      <div aria-hidden="true" className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((i) => <div key={i} className="h-80 animate-pulse rounded-2xl bg-white" />)}
      </div>
    </Busy>
  );
}

/** Lịch trình (/lich-trinh): tiêu đề + nút tạo + hai tab; tab đang chọn hiện đúng khung chờ của nội dung tab đó. */
export function TripsHubFallback() {
  const [params] = useSearchParams();
  const mine = params.get('tab') === 'cua-toi';
  const tab = (active: boolean) =>
    `relative -mb-px inline-flex min-h-11 items-center gap-1.5 border-b-2 px-3 text-[15px] font-extrabold ${
      active ? 'border-[var(--color-primary)] text-[var(--color-ink-deep)]' : 'border-transparent text-[#59766e]'
    }`;
  return (
    <ListPage motif="journey" motifTop="top-[360px]" label="Đang tải lịch trình">
      <BannerHero image={bannerGuide} title="Lịch Trình & Hành Trình Khám Phá" />
      <div className="max-w-[1280px] mx-auto w-full px-4 md:px-8 pt-3 pb-8">
        <Crumb label="Lịch trình" />
        <div className="relative overflow-hidden bg-white/90 backdrop-blur-md ring-1 ring-slate-900/[0.06] rounded-2xl p-4 md:p-5 shadow-[0_12px_32px_-18px_rgba(16,40,34,0.28)] mb-6">
          <div aria-hidden="true" className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-emerald-500 via-teal-400 to-amber-400" />
          <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0">
              <h2 className="text-xl font-black leading-tight tracking-tight text-[var(--color-ink-deep)] md:text-2xl">Lịch trình</h2>
              <p className="mt-1 max-w-xl text-xs md:text-sm leading-relaxed text-[#59766e]">
                Lên lịch trình theo giờ cho chuyến đi, hoặc áp dụng lịch trình du khách đã đi — miễn phí.
              </p>
            </div>
            <Link
              to="/lich-trinh/tao"
              className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-[#052620] px-5 text-sm font-extrabold text-white shadow-[0_10px_24px_-12px_rgba(5,38,32,0.8)] transition-colors hover:bg-[#0a3a31]"
            >
              <Plus className="h-4 w-4" strokeWidth={2.75} aria-hidden /> Tạo lịch trình
            </Link>
          </header>
          <div aria-hidden="true" className="mt-4 flex gap-2 border-b border-[#e3e8dc]">
            <span className={tab(!mine)}><Compass className="h-4 w-4" /> Khám phá</span>
            <span className={tab(mine)}><UserRound className="h-4 w-4" /> Của tôi</span>
          </div>
        </div>
        <div className="mt-5">
          {mine && getCurrentCustomer()?.role === 'TRAVELER' ? (
            <MyJourneysSkeleton />
          ) : mine ? (
            <div className="rounded-2xl bg-white px-6 py-10 text-center ring-1 ring-slate-200">
              <p className="text-base font-extrabold text-slate-900">Đăng nhập để xem lịch trình của bạn</p>
              <p className="mx-auto mt-1 max-w-sm text-sm leading-relaxed text-slate-600">
                Lịch trình đã lưu, chuyến đang đi và nơi bạn đã check-in nằm ở đây — trên mọi thiết bị.
              </p>
              <Link
                to="/login"
                state={{ returnUrl: '/lich-trinh?tab=cua-toi', message: 'Đăng nhập để xem và quản lý lịch trình của bạn.' }}
                className="mt-4 inline-flex h-11 items-center gap-1.5 rounded-xl bg-[var(--color-ink-deep)] px-5 text-sm font-bold text-white hover:bg-black"
              >
                <LogIn className="h-4 w-4" aria-hidden /> Đăng nhập
              </Link>
            </div>
          ) : (
            <section>
              <div className="mb-3 min-w-0">
                <h2 className="text-base font-extrabold text-[var(--color-ink-deep)]">Du khách đã đi và chia sẻ</h2>
                <p className="text-xs text-[#59766e]">Mở một lịch trình để xem từng ngày, rồi áp dụng cho chuyến của bạn.</p>
              </div>
              <FeedListSkeleton />
            </section>
          )}
        </div>
      </div>
    </ListPage>
  );
}

/** Cẩm nang: ảnh bìa nhỏ + hàng mục lục + các khối nội dung. */
export function TravelGuideFallback() {
  return (
    <Busy label="Đang tải cẩm nang" className="w-full min-w-0 overflow-x-hidden flex flex-col">
      <section className="relative w-full min-h-[300px] md:min-h-[340px] flex items-end pt-[calc(120px+var(--safe-top))] pb-8">
        <div className="absolute inset-0 z-0 bg-cover bg-center bg-[#07362c]" style={{ backgroundImage: `url(${bannerGuide})` }}>
          <div className="absolute inset-0 bg-gradient-to-b from-black/55 via-black/35 to-[#0f2d3c]/85" />
        </div>
        <div className="relative z-10 mx-auto w-full max-w-[1000px] px-4 md:px-8">
          <p className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--color-sun)]">Tiện ích du khách</p>
          <h1 className="text-3xl md:text-4xl font-extrabold text-white tracking-tight">Cẩm nang du lịch Mù Cang Chải</h1>
          <p className="mt-2 max-w-2xl text-sm md:text-base font-medium text-white/90">
            Mọi thứ cần biết trước chuyến đi: thời điểm đẹp, đường đi, chi phí, món nên ăn và những lưu ý để chuyến đi trọn vẹn.
          </p>
        </div>
      </section>
      <div aria-hidden="true" className="mx-auto w-full max-w-[1000px] px-4 pb-14 md:px-8">
        <div className="flex flex-wrap items-center gap-2 py-4">
          {['w-28', 'w-24', 'w-20', 'w-24', 'w-32', 'w-24'].map((w, i) => <Skeleton key={i} className={`${bar} h-8 rounded-full ${w}`} />)}
          <Skeleton className={`ml-auto h-8 w-40 rounded-full bg-rose-200 opacity-100`} />
        </div>
        <Skeleton className={`${bar} mb-2 h-3 w-36`} />
        <Skeleton className={`${bar} mb-2 h-6 w-56`} />
        <Skeleton className={`${bar} mb-5 h-4 w-80 max-w-full`} />
        <div className="grid gap-4 sm:grid-cols-2">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-32 rounded-2xl bg-white opacity-100 ring-1 ring-slate-200/80" />)}
        </div>
      </div>
    </Busy>
  );
}

/** Thân trang tạo / sửa lịch trình đang tải (tên chuyến, hàng tiêu chí, lộ trình) — dùng chung cho trang và khung chờ route. */
export function PlannerSkeleton({ label = 'Đang chuẩn bị lịch trình' }: { label?: string }) {
  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 px-4 pt-6 sm:px-6" role="status" aria-label={label}>
      <div className="h-9 w-2/3 animate-pulse rounded-md bg-white/80" />
      <div className="h-16 animate-pulse rounded-lg bg-white/80" />
      <div className="h-80 animate-pulse rounded-lg bg-white/80" />
    </div>
  );
}

/** Tạo / sửa lịch trình: khung riêng (TripShell) + thân đang tải. */
export function PlannerFallback() {
  const navigate = useNavigate();
  const editing = useLocation().pathname !== '/lich-trinh/tao';
  return (
    <TripShell title={editing ? 'Sửa lịch trình' : 'Tạo lịch trình'} onClose={() => navigate('/lich-trinh')}>
      <PlannerSkeleton label={editing ? 'Đang tải lịch trình' : undefined} />
    </TripShell>
  );
}

/** Bản đồ toàn màn hình: cùng màn chờ tối mà trang bản đồ tự hiện khi tải dữ liệu. */
export function MapFallback() {
  return (
    <div role="status" className="h-screen w-screen flex items-center justify-center bg-slate-900 text-white">
      <div className="text-center space-y-3">
        <div className="w-10 h-10 border-3 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-xs font-semibold text-slate-400">Đang tải bản đồ...</p>
      </div>
    </div>
  );
}
