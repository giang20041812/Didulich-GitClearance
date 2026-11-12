import { useState, useEffect, useMemo, useCallback, lazy, Suspense, type ReactNode } from "react"
import { Link } from "react-router-dom"
import SearchHub from "@/components/layout/SearchHub"
import { Handshake, Tag, Headphones, ShieldCheck, Mountain, Tent, BookOpenText, PhoneCall, CalendarCheck, Smartphone, ChevronRight, MapPin, ArrowRight, Compass } from "lucide-react"
import { fetchHomeData, peekHomeData } from "@/services/homeService"
import { prefetchHomestay } from "@/services/homestayService"
import { placeDetailPath } from "@/lib/placeRoutes"
import { HomeResponseDto, PlaceSummaryDto } from "@/types/home"
import { getCurrentCustomer, saveTravelerSession } from "@/lib/currentCustomer"
import type { GoogleSignupProfile } from "@/services/authService"
import FramerSwipeCardStack from "@/components/ui/FramerSwipeCardStack"
// Form tạo tài khoản khi One Tap gặp email Google lần đầu — nạp lười vì kéo theo axios (authService).
const GoogleSignupDialog = lazy(() => import("@/components/auth/GoogleSignupDialog"));
import NearMePanel from "@/components/home/NearMePanel"
import NearMeToggle from "@/components/home/NearMeToggle"
import TimelySuggestion from "@/components/home/TimelySuggestion"
import RevealBase from "@/components/ui/Reveal"
import TypeText from "@/components/ui/TypeText"
import CompactPlaceCard, { CompactCardBadge } from "@/components/ui/CompactPlaceCard"
import { formatVnd } from "@/lib/compactCard"
import { mediaUrl } from "@/lib/mediaUrl"
import { LogoMark } from "@/components/ui/logo"
import { resolvePlacePhoto } from "@/lib/placeImages"
import HeroBackdrop from "@/components/home/HeroBackdrop"
import HomeMotifs from "@/components/home/HomeMotifs"
import CardFrame from "@/components/ui/CardFrame"

/** Trang chủ: các khối hiện ra một lần khi cuộn tới, lướt qua rồi thì ở nguyên đó (không ẩn lại khi cuộn khuất). */
const Reveal = RevealBase;

/**
 * Tiêu đề section kiểu editorial: nhãn overline nhỏ (gạch ngang dẫn) + tiêu đề lớn + mô tả dẫn dắt. `action` (vd. "Xem
 * tất cả") nằm cùng hàng nhãn overline trên điện thoại; máy tính đặt nút riêng ở góc phải.
 */
function SectionHeading({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">

        {action && <div className="md:hidden">{action}</div>}
      </div>
      <h2 className="text-[26px] md:text-3xl lg:text-[36px] font-medium leading-tight text-[#0a2e26] tracking-tight">
        <TypeText repeat={false} text={title} speed={45} delay={150} />
      </h2>
      {description && (
        <p className="mt-2 max-w-xl text-sm md:text-[15px] font-medium leading-relaxed text-slate-500">
          {description}
        </p>
      )}
    </div>
  );
}

/** Link "Xem tất cả" gọn cho điện thoại (cùng hàng nhãn overline). */
function MobileSeeAll({ to }: { to: string }) {
  return (
    <Link to={to} className="inline-flex items-center gap-0.5 rounded-full px-2 py-1 text-xs font-bold text-[#052620] active:bg-emerald-50">
      Xem tất cả <ChevronRight className="h-3.5 w-3.5" aria-hidden />
    </Link>
  );
}

/** Nút "Xem thêm" ở góc phải tiêu đề section trên máy tính (viên thuốc, mũi tên trượt nhẹ khi rê chuột). */
function DesktopSeeAll({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link
      to={to}
      className="group/see hidden md:inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-white px-4 text-[13px] font-bold text-[#052620] ring-1 ring-[#052620]/20 shadow-[0_6px_16px_-10px_rgba(5,38,32,0.6)] transition-[background-color,color,box-shadow] duration-200 hover:bg-[#052620] hover:text-white hover:ring-[#052620] hover:shadow-[0_10px_22px_-10px_rgba(5,38,32,0.8)] active:scale-[0.98]"
    >
      {children}
      <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover/see:translate-x-0.5" aria-hidden />
    </Link>
  );
}

/**
 * Bề mặt thẻ dùng chung của trang chủ: bo 16px, viền bằng ring (vẽ theo đúng đường cong, không răng cưa như border + ảnh
 * tràn), bóng hai lớp nhuộm xanh rừng. Chỉ transition transform + box-shadow (không transition-all) cho rê chuột mượt. Viền xanh rừng
 * có sẵn (ring), rê chuột thì đậm lên.
 */
const CARD =
  'group relative flex h-full flex-col overflow-hidden rounded-2xl bg-white ring-1 shadow-[0_1px_2px_rgba(16,40,34,0.05),0_10px_24px_-14px_rgba(16,40,34,0.18)] transition-[transform,box-shadow] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]';
/** Màu viền: xanh rừng cho thẻ điểm đến / tiện ích (đặc sản dùng vàng hổ phách), có sẵn và đậm lên khi rê chuột. */
const CARD_GREEN = `${CARD} ring-emerald-800/25`;
/** Thẻ điểm đến / đặc sản: ảnh phủ kín cả thẻ, chữ nằm đè lên chân ảnh trên một lớp glow xanh (CARD_GLOW) — không còn phần nền xanh riêng. */
const CARD_DARK =
  'group relative flex h-full flex-col overflow-hidden rounded-2xl bg-neutral-900 ring-1 ring-black/10 shadow-[0_2px_12px_rgba(0,0,0,0.08)] transition-[transform,box-shadow] duration-300 ease-out';
/** Lớp glow xanh tan dần từ chân thẻ lên ảnh, nằm DƯỚI chữ (chữ ở lớp z-10 phía trên). */
const CARD_GLOW = 'pointer-events-none absolute inset-x-0 bottom-0 h-[48%] bg-gradient-to-t from-black/85 via-black/40 via-45% to-transparent';
/** Ảnh phủ kín thẻ. */
const CARD_MEDIA = 'absolute inset-0 overflow-hidden bg-slate-100';
const CARD_IMAGE = 'h-full w-full object-cover transition-transform duration-[900ms] ease-[cubic-bezier(0.22,1,0.36,1)]';

/**
 * Các phần sau hero là những "tấm" vuông vức nối tiếp nhau (không bo góc), đổ bóng nhẹ ngược lên phần trước để có chiều
 * sâu. Mỗi tấm là một màn hình (home-screen) và một điểm dừng của scroll-snap (home-snap-panel, xem globals.css).
 */
const SHEET = 'home-snap-panel home-screen relative isolate pt-12 pb-10 md:pt-14 md:pb-12 shadow-[0_-14px_30px_-26px_rgba(10,46,38,0.45)]';

/** Phần "Đặc Sản Nổi Tiếng" trên trang chủ: tạm ẩn. */
const SHOW_SPECIALTIES = false as boolean;

/** Tiện ích cho chuyến đi (cột trái phần cuối trang). */
const TRAVEL_TOOLS = [
  {
    to: '/cam-nang',
    Icon: BookOpenText,
    title: 'Cẩm nang du lịch',
    text: 'Thời điểm đẹp, đường đi, chi phí và lưu ý vùng cao.',
    cta: 'Đọc cẩm nang',
    tile: 'from-[#12a184] to-[#07604c] shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_8px_16px_-8px_rgba(7,96,76,0.8)]',
    accent: 'text-emerald-700',
  },
  {
    to: '/cam-nang#khan-cap',
    Icon: PhoneCall,
    title: 'Danh bạ khẩn cấp',
    text: 'Gọi ngay 113 · 114 · 115 và gửi SOS kèm vị trí.',
    cta: 'Xem danh bạ',
    tile: 'from-[#f43f5e] to-[#be123c] shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_8px_16px_-8px_rgba(190,18,60,0.8)]',
    accent: 'text-rose-600',
  },
  {
    to: '/bookings',
    Icon: CalendarCheck,
    title: 'Đơn đặt phòng',
    text: 'Tra cứu mã đơn, hủy/sửa phòng và đánh giá chuyến đi.',
    cta: 'Tra cứu đơn',
    tile: 'from-[#fbbf24] to-[#d97706] shadow-[inset_0_1px_0_rgba(255,255,255,0.3),0_8px_16px_-8px_rgba(217,119,6,0.8)]',
    accent: 'text-amber-700',
  },
  {
    to: '/download',
    Icon: Smartphone,
    title: 'Cài app du lịch',
    text: 'Dùng offline, nhận thông báo tình trạng phòng.',
    cta: 'Tải ứng dụng',
    tile: 'from-[#334155] to-[#0f172a] shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_8px_16px_-8px_rgba(15,23,42,0.8)]',
    accent: 'text-slate-800',
  },
];

/** Bốn cam kết giá trị (cột phải, nền xanh rừng đậm). */
const COMMITMENTS = [
  { Icon: Handshake, title: 'Trải Nghiệm Bản Địa', text: 'Do chính người Mông, Thái bản địa làm chủ và dẫn dắt trọn vẹn.', tag: 'Văn hóa thật', tile: 'bg-emerald-400/15 text-emerald-300 ring-emerald-300/25' },
  { Icon: Tag, title: 'Giá Niêm Yết Minh Bạch', text: 'Đúng giá chủ nhà niêm yết, không phí ẩn hay phụ thu vô lý.', tag: 'Minh bạch 100%', tile: 'bg-amber-300/15 text-amber-300 ring-amber-300/25' },
  { Icon: Headphones, title: 'Đồng Hành 24/7', text: 'Hỗ trợ suốt hành trình di chuyển, sẵn sàng kể cả lúc nửa đêm.', tag: 'Hỗ trợ tức thì', tile: 'bg-rose-400/15 text-rose-300 ring-rose-300/25' },
  { Icon: ShieldCheck, title: 'Linh Hoạt & An Tâm', text: 'Đổi lịch dễ dàng khi thời tiết xấu, đặt phòng có bảo vệ an toàn.', tag: 'Bảo vệ quyền lợi', tile: 'bg-cyan-300/15 text-cyan-200 ring-cyan-200/25' },
];



const formatDayMonth = (dStr?: string) => {
  if (!dStr) return '';
  const parts = dStr.split('-');
  return parts.length === 3 ? `${parts[2]}/${parts[1]}` : dStr;
};

/** Nhãn mùa đẹp của điểm đến từ dữ liệu ("Mùa đẹp: 15/09 – 10/10" hoặc "Quanh năm"). */
const seasonLabel = (dest: PlaceSummaryDto): { text: string; yearRound: boolean } => {
  const start = formatDayMonth(dest.suitableDateStart);
  const end = formatDayMonth(dest.suitableDateEnd);
  if ((!start && !end) || dest.suitableDateStart?.toLowerCase() === 'quanh năm') return { text: 'Quanh năm', yearRound: true };
  if (start && end) return { text: `Mùa đẹp: ${start} – ${end}`, yearRound: false };
  return { text: end ? `Mùa đẹp đến: ${end}` : `Mùa đẹp: ${start}`, yearRound: false };
};

/**
 * Logo + "Đi Du Lịch" + tagline. `compact`: cỡ nhỏ để nằm gọn trong thẻ banner 3:2 trên điện thoại (bản máy tính ở ngoài
 * thẻ, cỡ lớn). Hai bản cùng có trong DOM nhưng luôn ẩn một (display: none) nên chỉ một tiêu đề được đọc / hiện.
 */
function HeroTitle({ compact = false, className = '' }: { compact?: boolean; className?: string }) {
  return (
    <div className={`${compact ? 'flex min-w-0 items-center gap-3' : 'flex-wrap sm:flex-nowrap items-center gap-3 sm:gap-4 md:gap-5 mb-4 md:mb-[clamp(0.5rem,2vh,1.25rem)]'} ${className}`}>
      {/* Biểu tượng "Đi" + chữ "Du Lịch" bên dưới đọc liền thành "Đi Du Lịch". Không còn khung kính / viền trắng quanh logo. */}
      <div className="hero-rise relative shrink-0 drop-shadow-[0_18px_30px_rgba(0,0,0,0.45)]">
        <LogoMark size={96} plate className={compact ? 'w-16 h-16 min-[420px]:w-20 min-[420px]:h-20' : 'w-20 h-20 sm:w-24 sm:h-24 md:w-[clamp(4.5rem,13vh,7rem)] md:h-[clamp(4.5rem,13vh,7rem)]'} />
      </div>
      <div className="min-w-0">
        {compact ? (
          <h1 className="hero-rise max-w-full break-words [overflow-wrap:anywhere] font-display font-bold text-[clamp(2.1rem,10.5vw,3rem)] text-[var(--color-sun)] leading-[0.95] [text-shadow:0_4px_24px_rgba(0,0,0,0.45)] text-left [animation-delay:120ms]">
            Đi Du Lịch
          </h1>
        ) : (
          <h1 className="hero-rise max-w-full break-words [overflow-wrap:anywhere] font-display font-bold text-[clamp(2.5rem,min(7vw,9.5vh),6rem)] text-[var(--color-sun)] leading-[0.95] [text-shadow:0_4px_24px_rgba(0,0,0,0.35)] text-left [animation-delay:120ms]">
            Đi Du Lịch
          </h1>
        )}
        {/* Hiện sau ~3 giây như một nét viết tiếp; giữ chỗ ngay từ đầu nên không đẩy bố cục */}
        <p className={`hero-tagline mt-2 pl-[0.35em] not-italic uppercase tracking-[0.12em] font-bold leading-none text-white [text-shadow:0_2px_16px_rgba(0,0,0,0.4)] ${compact ? 'text-[clamp(0.95rem,4.6vw,1.3rem)]' : 'text-[clamp(1.2rem,min(2.6vw,3.8vh),2.2rem)]'}`} style={{ fontFamily: 'var(--font-display)' }}>
          đi như người bản địa
        </p>
      </div>
    </div>
  );
}

/** Thẻ điểm đến: ảnh vuông + tag mùa đẹp + địa phương và tên (cả thẻ là link, không cần nút mũi tên). Dùng cho cả lưới (tablet+) lẫn băng chuyền (điện thoại). */
function DestinationCard({ dest }: { dest: PlaceSummaryDto }) {
  const src = mediaUrl(resolvePlacePhoto(dest.coverImageUrl), 640);
  return (
    <CardFrame kind="mountain">
      <Link to={`/destinations/${dest.id}`} className={`${CARD_DARK} aspect-[4/5]`}>
        <div className={CARD_MEDIA}>
          {src ? (
            <img src={src} alt={dest.name} loading="lazy" className={CARD_IMAGE} />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-slate-100 text-slate-400">
              <Mountain className="h-7 w-7" />
            </div>
          )}
        </div>
        <div className={CARD_GLOW} aria-hidden />

        {/* Chữ đè lên glow ở chân thẻ */}
        <div className="relative z-10 mt-auto px-3 pb-3 pt-10">
          <div className="min-w-0">
            {dest.regionName && (
              <p className="flex items-center gap-1 text-[11px] font-semibold text-emerald-100 [text-shadow:0_1px_4px_rgba(0,0,0,0.5)]">
                <MapPin className="w-3 h-3 text-emerald-300 shrink-0" />
                <span className="truncate">{dest.regionName}</span>
              </p>
            )}
            <h3 className="mt-0.5 text-base font-medium leading-snug text-white [text-shadow:0_1px_8px_rgba(0,0,0,0.45)] line-clamp-1">
              {dest.name}
            </h3>
            {dest.description && (
              <p className="mt-0.5 text-[11px] font-normal leading-relaxed text-white/80 line-clamp-2">{dest.description}</p>
            )}
            <div className="mt-2 flex items-center justify-between border-t border-white/15 pt-2 text-[11px] font-medium text-white/95">
              <span className="text-amber-200">{seasonLabel(dest).text}</span>
              <span className="inline-flex items-center gap-1">Khám phá ngay <ArrowRight className="h-3 w-3 text-amber-300 transition-transform duration-300 group-hover:translate-x-1" aria-hidden /></span>
            </div>
          </div>
        </div>
      </Link>
    </CardFrame>
  );
}

/** Thẻ đặc sản: ảnh vuông + tag + địa phương, tên và giá. Dùng cho cả lưới (tablet+) lẫn băng chuyền (điện thoại). */
function SpecialtyCard({ item }: { item: NonNullable<HomeResponseDto['specialties']>[number] }) {
  const authenticUrl = resolvePlacePhoto(item.coverImageUrl);
  const src = authenticUrl ? mediaUrl(authenticUrl, 640) : null;
  return (
    <CardFrame kind="specialty">
      <Link to={placeDetailPath(item.kind, item.id)} className={`${CARD_DARK} aspect-[4/5]`}>
        <div className={CARD_MEDIA}>
          {src ? (
            <img src={src} alt={item.name} loading="lazy" className={CARD_IMAGE} />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-slate-100 text-slate-400">
              <Tag className="h-6 w-6" />
            </div>
          )}
        </div>
        <div className={CARD_GLOW} aria-hidden />

        {/* Tag đặc sản / món ngon */}
        {item.tagBadge && (
          <div className="absolute left-1.5 top-1.5 z-10 max-w-[calc(100%-0.75rem)]">
            <span className="inline-flex max-w-full rounded-full bg-amber-400 px-2 py-0.5 text-[10px] font-extrabold text-amber-950 shadow-[0_4px_10px_-4px_rgba(180,83,9,0.7)]">
              <span className="truncate">{item.tagBadge}</span>
            </span>
          </div>
        )}

        {/* Chữ đè lên glow ở chân thẻ */}
        <div className="relative z-10 mt-auto px-2.5 pb-2.5 pt-8">
          {item.regionName && (
            <p className="flex items-center gap-0.5 text-[11px] font-semibold text-emerald-100 [text-shadow:0_1px_4px_rgba(0,0,0,0.5)]">
              <MapPin className="w-3 h-3 text-amber-300 shrink-0" />
              <span className="truncate">{item.regionName}</span>
            </p>
          )}
          <h3 className="mt-0.5 text-[13px] font-extrabold text-white [text-shadow:0_1px_8px_rgba(0,0,0,0.45)] line-clamp-1">
            {item.name}
          </h3>
          {item.priceRefMin ? (
            <p className="mt-0.5 truncate text-[11px] font-bold text-emerald-200">
              Từ {formatVnd(item.priceRefMin)} {item.priceUnitNote ? `/ ${item.priceUnitNote}` : ''}
            </p>
          ) : (
            <p className="mt-0.5 truncate text-[11px] text-white/75 font-medium">Thức quà truyền thống</p>
          )}
        </div>
      </Link>
    </CardFrame>
  );
}

export default function HomePage() {
  // Quay lại trang chủ: hiện ngay dữ liệu đã có trong tab, làm mới ở nền (không màn hình chờ).
  const [homeData, setHomeData] = useState<HomeResponseDto | null>(() => peekHomeData() ?? null);
  const [loading, setLoading] = useState(() => !peekHomeData());
  /** Mục đang hiện danh sách "Gần tôi" thay cho thẻ gợi ý. */
  const [nearDestinations, setNearDestinations] = useState(false);
  const [nearHomestays, setNearHomestays] = useState(false);

  const loadHomeData = useCallback(async () => {
    if (!peekHomeData()) setLoading(true);
    try {
      setHomeData(await fetchHomeData());
    } catch (err) {
      console.error('Error in HomePage fetch:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadHomeData();
  }, [loadHomeData]);


  useEffect(() => {
    if (loading || homeData) return;
    const retry = () => { void loadHomeData(); };
    window.addEventListener('focus', retry);
    window.addEventListener('online', retry);
    return () => {
      window.removeEventListener('focus', retry);
      window.removeEventListener('online', retry);
    };
  }, [loading, homeData, loadHomeData]);

  // Email Google lần đầu qua One Tap: khách điền form tạo tài khoản rồi mới vào.
  const [googleSignup, setGoogleSignup] = useState<{ idToken: string; profile: GoogleSignupProfile } | null>(null);

  // Tự động gọi Sign In Google One Tap trên trang chủ khi chưa đăng nhập
  useEffect(() => {
    const customer = getCurrentCustomer();
    if (customer) return; // Đã đăng nhập thì không gọi

    let cleanupFn: (() => void) | undefined;

    const handleGoogleCredential = async (idToken: string) => {
      try {
        // authService dùng axios — nạp lười lúc thật sự đăng nhập, khỏi kéo axios vào bundle trang chủ.
        const { googleSignIn } = await import("@/services/authService");
        const result = await googleSignIn(idToken);
        if (result.kind === 'signup') {
          setGoogleSignup({ idToken: result.idToken, profile: result.profile });
          return;
        }
        saveTravelerSession(result.session);
      } catch (err) {
        console.warn('Auto Google login failed:', err);
      }
    };

    // Tải Firebase / Google Identity sau lần render đầu để không nằm trong bundle chính của trang chủ.
    import("@/lib/firebase")
      .then(({ initGoogleOneTap }) => initGoogleOneTap(handleGoogleCredential))
      .then((cancel) => {
        cleanupFn = cancel;
      });

    return () => {
      if (cleanupFn) cleanupFn();
    };
  }, []);

  // Merge API destinations with curated destinations (avoid duplicates by slug or id)
  const allDestinations = useMemo(() => {
    const list: PlaceSummaryDto[] = [];
    const seen = new Set<string>();

    if (homeData?.featuredDestinations) {
      homeData.featuredDestinations.forEach(item => {
        const key = item.slug || String(item.id);
        if (!seen.has(key)) {
          seen.add(key);
          list.push(item);
        }
      });
    }

    return list;
  }, [homeData]);

  // Ưu tiên điểm đến có mùa đẹp cụ thể trước "Quanh năm", hiện hết (lưới 10 thẻ mỗi trang, lướt / bấm ‹ › xem thêm như homestay)
  const filteredDestinations = useMemo(() => {
    const list = [...allDestinations];
    list.sort((a, b) => {
      const aHasSeason = a.suitableDateStart && a.suitableDateStart.toLowerCase() !== 'quanh năm' && /\d/.test(a.suitableDateStart);
      const bHasSeason = b.suitableDateStart && b.suitableDateStart.toLowerCase() !== 'quanh năm' && /\d/.test(b.suitableDateStart);

      if (aHasSeason && !bHasSeason) return -1;
      if (!aHasSeason && bHasSeason) return 1;
      return 0;
    });

    // Trang chủ chỉ giữ 2 trang (16 thẻ); muốn xem thêm thì bấm "Xem tất cả".
    return list.slice(0, 16);
  }, [allDestinations]);

  // Homestay: mọi homestay API trả về — mỗi trang 8 thẻ, lướt sang để xem thêm.
  const displayedHomestays = useMemo(() => (homeData?.homestays ?? []).slice(0, 16), [homeData]);

  // Đặc sản: hiện hết món API trả về (lưới 10 thẻ mỗi trang, 2 hàng × 5 cột)
  const displayedSpecialties = useMemo(() => (homeData?.specialties ?? []).slice(0, 20), [homeData]);

  if (loading) return null;

  if (!homeData) {
    return (
      <div className="w-full h-screen flex flex-col items-center justify-center text-red-500 font-medium">
        <p>Không thể kết nối đến hệ thống. Vui lòng thử lại sau.</p>
        <button
          type="button"
          onClick={() => { void loadHomeData(); }}
          className="mt-4 rounded-full bg-[#043D32] px-5 py-2 text-white transition-colors hover:bg-[#052620]"
        >
          Thử lại
        </button>
      </div>
    );
  }

  return (
    // overflow-x-clip (không phải hidden): hidden biến khung này thành vùng cuộn riêng, scroll-snap của các phần sẽ gắn vào
    // nó thay vì vào trang.
    <div className="w-full min-w-0 overflow-x-clip flex flex-col bg-white">
      {/* 1. Hero Section */}
      <section className="home-snap-panel relative z-30 w-full min-h-[520px] md:h-[100dvh] md:min-h-[540px] flex flex-col pt-[calc(var(--app-header-height,130px)+16px)] pb-8 md:pb-[min(44vh,26rem)]">
        {/* Ảnh ruộng bậc thang cũ + chuyển động: trôi chậm, nắng, mây, gió lướt ruộng lúa (xem HeroBackdrop).
            Mọi kích thước: ảnh phủ kín cả hero, header đè lên; điện thoại chỉ thu nhỏ lại và rút ngắn hero. */}
        <HeroBackdrop />

        <div className="relative z-30 flex min-w-0 flex-col max-md:gap-4 flex-1 px-4 md:px-8 max-w-[1280px] mx-auto w-full overflow-x-clip">
          <div className="self-start w-full min-w-0 max-w-[760px] text-left my-auto py-4 md:py-[clamp(0.5rem,4vh,3rem)]">
            <HeroTitle className="flex" />
            <p className="hero-rise block [animation-delay:260ms] mt-2 max-w-[640px] break-words [overflow-wrap:anywhere] text-sm sm:text-base md:text-[clamp(1rem,2.7vh,1.5rem)] font-normal text-white/95 leading-snug [text-shadow:0_2px_12px_rgba(0,0,0,0.4)] text-left">
              <TypeText
                text="Nền tảng đặt phòng Homestay & khám phá trải nghiệm du lịch di sản, sinh thái Việt Nam. Tìm nơi phù hợp cho chuyến đi của bạn"
                delay={700}
                speed={26}
              />
            </p>
          </div>

          <div className="hero-rise [animation-delay:420ms] w-full flex flex-col items-center">
            {/* SearchHub (đặt phòng trước): tỉnh / thành · thời gian · số người → "Tìm homestay" (/homestays); lối phụ
                "Hoặc lên lịch trình trước" (/lich-trinh/tao) */}
            <div className="w-full max-w-5xl mx-auto relative z-20">
              <SearchHub intro />
            </div>
          </div>
        </div>
      </section>

      {/* Các phần sau hero: TRẮNG → SƯƠNG CHÀM → LÚA CHÍN → TRẮNG, mỗi phần là một tấm vuông nối tiếp nhau (SHEET), nền
          có quầng màu tĩnh (globals.css: .home-glow-*) và họa tiết minh họa riêng cho từng phần (HomeMotifs), rồi tới chân trang. */}
      {/* 2. Gần bạn: gợi ý theo giờ + vị trí khách (lấy mỗi lần mở trang), kèm cách đi và liên hệ xe. Chỉ hiện khi
          quanh khách có chỗ — không có vị trí / không có gì gần thì không render. */}
      <TimelySuggestion />

      {/* 3. Homestay Bản Địa & Chốn Nghỉ Bình Yên */}
      <section className="home-snap-panel home-screen relative isolate pt-12 pb-10 md:pt-14 md:pb-12 home-glow-mint">
        <HomeMotifs variant="homestay" />
        <div className="max-w-[1280px] mx-auto w-full px-4 md:px-8">
          <div className="mb-6 flex items-end justify-between gap-4">
            <Reveal className="min-w-0 flex-1">
              <SectionHeading

                title="Homestay & Nhà Nghỉ"

                action={<MobileSeeAll to="/homestays" />}
              />
            </Reveal>
            <DesktopSeeAll to="/homestays">Xem tất cả Homestay bản địa</DesktopSeeAll>
          </div>

          {/* "Gần tôi": nút chính của phần homestay, kèm lời giải thích ngắn */}
          <Reveal delay={60}>
            <div className="mb-7 flex items-center gap-3">
              <NearMeToggle
                active={nearHomestays}
                onToggle={() => setNearHomestays((on) => !on)}
                noun="homestay"
              />
              <p className="min-w-0 text-xs font-medium leading-snug text-slate-500">
                {nearHomestays
                  ? 'Xếp theo khoảng cách từ chỗ bạn đứng.'
                  : 'Đang đi du lịch? Tìm chỗ nghỉ gần nhất.'}
              </p>
            </div>
          </Reveal>

          {/* Homestay: từ tablet mỗi trang 8 thẻ (2 hàng × 4 cột), lướt / bấm ‹ › xem thêm; điện thoại vuốt từng thẻ */}
          <Reveal delay={100}>
            {nearHomestays ? (
              <NearMePanel kind="HOMESTAY" />
            ) : displayedHomestays.length > 0 ? (
              <FramerSwipeCardStack perPage={8} gridClassName="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 lg:gap-5" label="Homestay & nhà nghỉ">
                {displayedHomestays.map((hs) => (
                  <CompactPlaceCard
                    key={hs.id}
                    to={`/homestays/${hs.id}`}
                    name={hs.name}
                    imageUrl={hs.coverImageUrl}
                    location={hs.regionName}
                    price={formatVnd(hs.priceRefMin, 'Liên hệ')}
                    priceUnit={hs.priceRefMin ? 'đêm' : null}
                    // Khách sắp mở chi tiết: tải trước (ưu tiên thấp) để bấm vào là hiện ngay.
                    onIntent={() => prefetchHomestay(hs.id)}
                    badge={hs.tagBadge ? <CompactCardBadge className="bg-[#052620]/90">{hs.tagBadge}</CompactCardBadge> : undefined}
                    compact={true}
                    frame="house"
                    // Điện thoại: cột thẻ 44% bề ngang; tablet 3 cột; máy tính 4 cột.
                    sizes="(max-width: 767px) 45vw, (max-width: 1023px) 33vw, 25vw"
                  />
                ))}
              </FramerSwipeCardStack>
            ) : (
              <div className="py-10 flex flex-col items-center justify-center text-slate-500 bg-white/70 rounded-2xl border-2 border-dashed border-slate-200">
                <Tent className="w-10 h-10 text-slate-300 mb-2" />
                <p className="font-medium text-sm">Chưa có homestay bản địa nào</p>
              </div>
            )}
          </Reveal>
        </div>
      </section>

      {/* 4. Điểm Đến Thích Hợp Theo Mùa */}
      <section className={`${SHEET} home-glow-sky`}>
        <HomeMotifs variant="destinations" />
        <div className="max-w-[1280px] mx-auto w-full px-4 md:px-8">
          {/* Tiêu đề bên trái, "Khám phá thêm" ở góc phải (máy tính) / cạnh nhãn overline (điện thoại) */}
          <div className="mb-6 flex items-end justify-between gap-4">
            <Reveal className="min-w-0 flex-1">
              <SectionHeading

                title="Hôm nay đi đâu"
                action={<MobileSeeAll to="/destinations" />}
              />
            </Reveal>
            <DesktopSeeAll to="/destinations">Khám phá thêm điểm đến</DesktopSeeAll>
          </div>

          {/* "Gần tôi" nổi bật, kèm lời giải thích ngắn (bỏ chip lọc khu vực — carousel đã gọn) */}
          <Reveal delay={80}>
            <div className="mb-7 flex items-center gap-3">
              <NearMeToggle
                active={nearDestinations}
                onToggle={() => setNearDestinations((on) => !on)}
                noun="điểm đến"
              />
              <p className="min-w-0 text-xs font-medium leading-snug text-slate-500">
                {nearDestinations
                  ? 'Xếp theo khoảng cách từ chỗ bạn đứng.'
                  : 'Đang đi du lịch? Xem điểm đến quanh bạn.'}
              </p>
            </div>
          </Reveal>

          {/* Điểm đến: danh sách dạng lưới (list/grid) kèm hiệu ứng động khi chuột chạm đến */}
          <Reveal delay={140}>
            {nearDestinations ? (
              <NearMePanel kind="ATTRACTION" />
            ) : filteredDestinations.length > 0 ? (
              // Từ tablet: lưới 4 cột × 2 hàng (8 thẻ). Điện thoại: lướt từng thẻ như homestay (thẻ giữa + hai thẻ mờ hai bên).
              <FramerSwipeCardStack
                perPage={8}
                gridClassName="grid grid-cols-4 gap-3 md:gap-4"
                label="Điểm đến theo mùa"
              >
                {filteredDestinations.map((dest) => <DestinationCard key={dest.id} dest={dest} />)}
              </FramerSwipeCardStack>
            ) : (
              <div className="py-12 flex flex-col items-center justify-center text-[#66716c] bg-white/70 rounded-2xl border-2 border-dashed border-slate-200">
                <Mountain className="w-10 h-10 text-slate-300 mb-3" />
                <p className="font-medium text-sm text-slate-600">Chưa có dữ liệu điểm đến</p>
              </div>
            )}
          </Reveal>
        </div>
      </section>

      {/* 5. Đặc Sản Nổi Tiếng - Danh sách món ngon & thức quà bản địa dạng list/grid kèm hiệu ứng hover. Tạm ẩn
          (SHOW_SPECIALTIES) — bật lại thì đổi cờ thành true. */}
      {SHOW_SPECIALTIES && (
        <section className={`${SHEET} home-glow-ripe`}>
          <HomeMotifs variant="specialty" />
          <div className="max-w-[1280px] mx-auto w-full px-4 md:px-8">
            <div className="mb-7 flex items-end justify-between gap-4">
              <Reveal className="min-w-0 flex-1">
                <SectionHeading

                  title="Đặc Sản Nổi Tiếng"
                  action={<MobileSeeAll to="/specialties" />}
                />
              </Reveal>
              <DesktopSeeAll to="/specialties">Khám phá thêm thức quà</DesktopSeeAll>
            </div>

            <Reveal delay={100}>
              {displayedSpecialties.length > 0 ? (
                // Từ tablet: lưới 5 cột × 2 hàng (10 thẻ nhỏ). Điện thoại: lướt từng thẻ (thẻ vuông nên hẹp hơn thẻ điểm đến).
                <FramerSwipeCardStack
                  perPage={10}
                  gridClassName="grid grid-cols-5 gap-3 md:gap-4"
                  label="Đặc sản nổi tiếng"
                >
                  {displayedSpecialties.map((item) => <SpecialtyCard key={item.id} item={item} />)}
                </FramerSwipeCardStack>
              ) : (
                <div className="py-12 flex flex-col items-center justify-center text-slate-500 bg-white/70 rounded-2xl border-2 border-dashed border-slate-200">
                  <Tag className="w-10 h-10 text-slate-300 mb-2" />
                  <p className="font-medium text-sm">Chưa có đặc sản nào</p>
                </div>
              )}
            </Reveal>
          </div>
        </section>
      )}

      {/* 6. KẾT HỢP: TIỆN ÍCH DU KHÁCH & CAM KẾT DU LỊCH */}
      <section className={`${SHEET} bg-white`}>
        <HomeMotifs variant="journey" />
        <div aria-hidden className="home-dots pointer-events-none absolute inset-x-0 top-0 h-[420px]" />
        <div className="relative max-w-[1280px] mx-auto w-full px-4 md:px-8">
          <Reveal className="mb-9 md:mb-12 text-center">

            <h2 className="text-[26px] md:text-3xl lg:text-[36px] font-medium leading-tight text-[#0a2e26] tracking-tight">
              <TypeText repeat={false} text="Tiện Ích Du Khách & Cam Kết Du Lịch" speed={40} delay={150} />
            </h2>

          </Reveal>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8">
            {/* Cột 1: Tiện ích cho chuyến đi — tấm sáng */}
            <div className="flex flex-col rounded-3xl bg-gradient-to-b from-[#f2f7f4] to-white p-4 sm:p-5 md:p-6 ring-1 ring-slate-900/[0.05]">
              <Reveal delay={40} className="mb-4 flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-white ring-1 ring-emerald-600/15 shadow-[0_4px_10px_-6px_rgba(5,38,32,0.5)] flex items-center justify-center text-[#052620]">
                  <Compass className="w-[18px] h-[18px]" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-base md:text-lg leading-tight">Tiện Ích Cho Chuyến Đi</h3>
                  <p className="text-xs text-slate-500">Công cụ chuẩn bị nhanh và tra cứu hành trình</p>
                </div>
              </Reveal>

              <div className="grid grid-cols-2 gap-2.5 sm:gap-3.5 flex-1">
                {TRAVEL_TOOLS.map(({ to, Icon, title, text, cta, tile, accent }, i) => (
                  <Reveal key={to} delay={80 + i * 40}>
                    <Link to={to} className={`${CARD_GREEN} justify-between p-3 sm:p-4`}>
                      <div>
                        <div className={`w-9 h-9 sm:w-11 sm:h-11 rounded-xl bg-gradient-to-br ${tile} flex items-center justify-center text-white transition-transform duration-300`}>
                          <Icon className="w-[18px] h-[18px] sm:w-5 sm:h-5" />
                        </div>
                        <h4 className="mt-2.5 sm:mt-3.5 font-bold text-slate-900 text-[13px] sm:text-sm leading-snug">{title}</h4>
                        <p className="mt-1 text-[11px] sm:text-xs text-slate-500 leading-relaxed">{text}</p>
                      </div>
                      <div className={`mt-2.5 sm:mt-3.5 pt-2 sm:pt-2.5 border-t border-slate-100 flex items-center text-[11px] sm:text-xs font-bold ${accent}`}>
                        <span>{cta}</span>
                        <ArrowRight className="w-3.5 h-3.5 ml-1 transition-transform duration-200 group-hover:translate-x-1" />
                      </div>
                    </Link>
                  </Reveal>
                ))}
              </div>
            </div>

            {/* Cột 2: Cam kết giá trị — tấm xanh rừng đậm làm điểm nhấn cuối trang */}
            <div className="relative flex flex-col overflow-hidden rounded-3xl bg-gradient-to-br from-[#0d4a3d] via-[#083a30] to-[#05241e] p-4 sm:p-5 md:p-6 text-white shadow-[0_30px_60px_-30px_rgba(5,36,30,0.8)]">
              <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(28rem_18rem_at_100%_0%,rgba(250,204,21,0.16),transparent_70%),radial-gradient(24rem_16rem_at_0%_100%,rgba(45,212,191,0.14),transparent_70%)]" />
              <Reveal delay={40} className="relative mb-4 flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-white/10 ring-1 ring-white/20 flex items-center justify-center text-[var(--color-sun)]">
                  <ShieldCheck className="w-[18px] h-[18px]" />
                </div>
                <div>
                  <h3 className="font-extrabold text-white text-base md:text-lg leading-tight">Cam Kết Giá Trị</h3>
                  <p className="text-xs text-white/60">4 lời hứa đồng hành cùng mỗi chuyến đi của bạn</p>
                </div>
              </Reveal>

              <div className="relative grid grid-cols-2 gap-2.5 sm:gap-3.5 flex-1">
                {COMMITMENTS.map(({ Icon, title, text, tag, tile }, i) => (
                  <Reveal key={title} delay={80 + i * 40}>
                    <div className="flex h-full flex-col justify-between rounded-2xl bg-white/[0.06] p-3 sm:p-4 ring-1 ring-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] transition-[background-color,transform] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]">
                      <div>
                        <div className={`w-9 h-9 sm:w-11 sm:h-11 rounded-xl ring-1 flex items-center justify-center ${tile}`}>
                          <Icon className="w-[18px] h-[18px] sm:w-5 sm:h-5" />
                        </div>
                        <h4 className="mt-2.5 sm:mt-3.5 font-bold text-white text-[13px] sm:text-sm leading-snug">{title}</h4>
                        <p className="mt-1 text-[11px] sm:text-xs text-white/65 leading-relaxed">{text}</p>
                      </div>
                      <span className="mt-2.5 sm:mt-3.5 pt-2 sm:pt-2.5 border-t border-white/10 text-[10px] sm:text-[11px] font-bold text-[var(--color-sun)] uppercase tracking-wider">
                        {tag}
                      </span>
                    </div>
                  </Reveal>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {googleSignup && (
        <Suspense fallback={null}>
          <GoogleSignupDialog
            idToken={googleSignup.idToken}
            profile={googleSignup.profile}
            onClose={() => setGoogleSignup(null)}
            onCreated={(session) => {
              saveTravelerSession(session);
              setGoogleSignup(null);
            }}
          />
        </Suspense>
      )}
    </div>
  )
}
