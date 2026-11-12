import type { ReactNode } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { Compass, LogIn, Plus, UserRound, type LucideIcon } from 'lucide-react';
import HomeMotifs from '@/components/home/HomeMotifs';
import ExploreFeed from '@/components/experience/ExploreFeed';
import MyJourneysList from '@/components/journey/MyJourneysList';
import VisitedPlaces from '@/components/journey/VisitedPlaces';
import { getCurrentCustomer } from '@/services/authService';
import { installAxiosBoot } from '@/lib/axiosBoot';
import bannerGuide from '@/assets/photos/banner-guide.webp';

// Trang dùng axios (lịch trình — services/journeyService): cài cấu hình (baseURL, hàng đợi / hedge / interceptor)
// trước request đầu tiên.
installAxiosBoot();

/** Tham số của trang tạo lịch trình — đường dẫn cũ /lich-trinh?province=…&tpl=… chuyển sang /lich-trinh/tao. */
const BUILDER_KEYS = ['province', 'checkIn', 'checkOut', 'guests', 'stay', 'forBooking', 'tpl', 'step', 'resume', 'd', 'p', 'an', 'mt'];

type HubTab = 'explore' | 'mine';

const isTraveler = () => getCurrentCustomer()?.role === 'TRAVELER';

function TabButton({ active, onClick, Icon, children }: { active: boolean; onClick: () => void; Icon: LucideIcon; children: ReactNode }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`relative -mb-px inline-flex min-h-11 items-center gap-1.5 border-b-2 px-3 text-[15px] font-extrabold transition-colors cursor-pointer ${
        active ? 'border-[var(--color-primary)] text-[var(--color-ink-deep)]' : 'border-transparent text-[#59766e] hover:text-[var(--color-ink-deep)]'
      }`}
    >
      <Icon className="h-4 w-4" aria-hidden /> {children}
    </button>
  );
}

/**
 * Trang "Lịch trình" (/lich-trinh) — gộp trang Trải nghiệm và lối vào trang lên lịch trình: một nút chính "Tạo lịch trình"
 * (sang /lich-trinh/tao) và hai tab — "Khám phá": lịch trình du khách đã đăng công khai; "Của tôi" (?tab=cua-toi): lịch
 * trình đã lưu theo giai đoạn + nơi đã check-in (chưa đăng nhập thì mời đăng nhập). /trai-nghiem, /journeys chuyển về đây.
 */
export default function TripsHubPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  if (BUILDER_KEYS.some((key) => params.has(key))) return <Navigate to={`/lich-trinh/tao?${params.toString()}`} replace />;

  const tab: HubTab = params.get('tab') === 'cua-toi' ? 'mine' : 'explore';
  const setTab = (next: HubTab) => setParams(next === 'mine' ? { tab: 'cua-toi' } : {}, { replace: true });
  const login = () => navigate('/login', {
    state: { returnUrl: '/lich-trinh?tab=cua-toi', message: 'Đăng nhập để xem và quản lý lịch trình của bạn.' },
  });

  return (
    <div className="relative isolate w-full flex flex-col min-h-screen overflow-x-clip pb-16 bg-[linear-gradient(180deg,var(--color-canvas)_0%,#f1faf6_45%,#fbf7ee_100%)]">
      <div aria-hidden="true" className="pointer-events-none absolute right-[-120px] top-[520px] h-[380px] w-[380px] rounded-full bg-emerald-300/20 blur-3xl" />
      <div aria-hidden="true" className="pointer-events-none absolute left-[-140px] top-[1100px] h-[420px] w-[420px] rounded-full bg-amber-200/25 blur-3xl" />
      <HomeMotifs variant="journey" className="inset-x-0 bottom-0 top-[360px]" />

      {/* Hero Section */}
      <section className="relative w-full min-h-[360px] md:min-h-[360px] flex items-start md:items-center justify-center pt-[calc(145px+var(--safe-top))] md:pt-[calc(130px+var(--safe-top))] pb-10 md:pb-8">
        <div
          className="absolute inset-0 z-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${bannerGuide})` }}
        >
          <div className="absolute inset-0 bg-gradient-to-b from-[#0f2d3c]/85 via-[#0f2d3c]/50 to-transparent" />
        </div>

        <div className="relative z-10 w-full max-w-4xl mx-auto px-4 text-center">
          <h1 className="text-3xl md:text-4xl lg:text-5xl font-extrabold font-display text-white tracking-tight drop-shadow-md">
            Lịch Trình & Hành Trình Khám Phá
          </h1>
        </div>
      </section>

      <div className="max-w-[1280px] mx-auto w-full px-4 md:px-8 pt-3 pb-8">
        <div className="mb-3 flex items-center gap-2 text-xs text-[var(--color-muted)] md:text-sm">
          <Link to="/" className="transition-colors hover:text-[var(--color-primary)]">Trang chủ</Link>
          <span>/</span>
          <span className="font-semibold text-[var(--color-ink-deep)]">Lịch trình</span>
        </div>

        <div className="relative overflow-hidden bg-white/90 backdrop-blur-md ring-1 ring-slate-900/[0.06] rounded-2xl p-4 md:p-5 shadow-[0_12px_32px_-18px_rgba(16,40,34,0.28)] mb-6 transition-shadow duration-500 hover:shadow-[0_18px_40px_-18px_rgba(16,40,34,0.34)]">
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

          <div role="tablist" aria-label="Lịch trình" className="mt-4 flex gap-2 border-b border-[#e3e8dc]">
            <TabButton active={tab === 'explore'} onClick={() => setTab('explore')} Icon={Compass}>Khám phá</TabButton>
            <TabButton active={tab === 'mine'} onClick={() => setTab('mine')} Icon={UserRound}>Của tôi</TabButton>
          </div>
        </div>

        <div className="mt-5" role="tabpanel">
          {tab === 'explore' ? (
            <ExploreFeed />
          ) : isTraveler() ? (
            <div className="space-y-10">
              <MyJourneysList onExplore={() => setTab('explore')} />
              <VisitedPlaces compact />
            </div>
          ) : (
            <div className="rounded-2xl bg-white px-6 py-10 text-center ring-1 ring-slate-200">
              <p className="text-base font-extrabold text-slate-900">Đăng nhập để xem lịch trình của bạn</p>
              <p className="mx-auto mt-1 max-w-sm text-sm leading-relaxed text-slate-600">
                Lịch trình đã lưu, chuyến đang đi và nơi bạn đã check-in nằm ở đây — trên mọi thiết bị.
              </p>
              <button type="button" onClick={login} className="mt-4 inline-flex h-11 items-center gap-1.5 rounded-xl bg-[var(--color-ink-deep)] px-5 text-sm font-bold text-white hover:bg-black cursor-pointer">
                <LogIn className="h-4 w-4" aria-hidden /> Đăng nhập
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
