import { useState, useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  Menu,
  LogIn,
  UserPlus,
  User,
  Heart,
  LogOut,
  ChevronDown,
  Calendar,
  Route,
  ShieldCheck,
} from "lucide-react";
import { LogoMark, LogoWordmark, BRAND_NAME } from "../ui/logo";
import { getCurrentCustomer, logoutCurrentSession, type CurrentCustomer } from "@/lib/currentCustomer";
import NotificationBell from "./NotificationBell";
import { hasHeroOverlay } from "@/lib/routeUtils";
import RecentBookingTag from "./RecentBookingTag";
import { CUSTOMER_NAV, isCustomerNavActive } from "./customerNav";
import { setHeaderSearchSlot, useHeaderSearchCompact } from "@/lib/headerSearch";

/** Nhãn "Mới" nhỏ cạnh mục điều hướng vừa ra mắt. */
function NavBadge({ text }: { text: string }) {
  return (
    <span className="rounded-full bg-[var(--color-sun)] px-1.5 py-[3px] text-[9px] font-extrabold uppercase leading-none tracking-wide text-[var(--color-ink-deep)]">
      {text}
    </span>
  );
}

/** Khung chung của các menu thả xuống trên header (Thêm, tài khoản). */
const DROPDOWN_PANEL = 'rounded-xl border border-slate-200 bg-white p-1.5 shadow-[var(--shadow-lg)]';
const DROPDOWN_ITEM =
  'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-semibold text-slate-700 transition-colors text-left cursor-pointer menu-fx hover:text-[var(--color-primary)]';

/** Từ md (48rem, cùng đơn vị với Tailwind để khớp khi trình duyệt đổi cỡ chữ mặc định) header dùng lưới 3 cột:
 *  logo | menu giữa | tài khoản. */
const DESKTOP_QUERY = '(min-width: 48rem)';

interface PillRect { left: number; top: number; width: number; height: number }

/** Viên thuốc nền trượt theo mục đang chọn (aria-current="page") trong `navRef`: đo vị trí mục đó, đổi mục thì viên
 *  thuốc di chuyển sang chỗ mới thay vì mỗi mục tự đổi nền. Lần đo đầu không có chuyển động để khỏi trượt từ góc. */
function useSlidingPill(navRef: RefObject<HTMLElement | null>, deps: unknown[]) {
  const [rect, setRect] = useState<PillRect | null>(null);
  const [animate, setAnimate] = useState(false);

  useLayoutEffect(() => {
    const nav = navRef.current;
    if (!nav) return undefined;
    const measure = () => {
      const el = nav.querySelector<HTMLElement>('[aria-current="page"]');
      if (!el || !el.offsetWidth) {
        setRect(null);
        return;
      }
      const next = { left: el.offsetLeft, top: el.offsetTop, width: el.offsetWidth, height: el.offsetHeight };
      setRect((prev) =>
        prev && prev.left === next.left && prev.top === next.top && prev.width === next.width && prev.height === next.height
          ? prev
          : next,
      );
    };
    measure();
    // Một số máy: font web tải xong / thang hiển thị (zoom 125%, 150%) khiến từng mục đổi bề rộng mà khung nav không đổi
    // → viên thuốc lệch khỏi mục. Theo dõi cả từng mục con, sự kiện tải font và đổi cỡ cửa sổ để đo lại.
    const raf = requestAnimationFrame(measure);
    const fonts = typeof document !== 'undefined' ? document.fonts : undefined;
    fonts?.ready.then(measure).catch(() => undefined);
    fonts?.addEventListener?.('loadingdone', measure);
    window.addEventListener('resize', measure);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    if (observer) {
      observer.observe(nav);
      Array.from(nav.children).forEach((child) => observer.observe(child));
    }
    return () => {
      cancelAnimationFrame(raf);
      fonts?.removeEventListener?.('loadingdone', measure);
      window.removeEventListener('resize', measure);
      observer?.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    if (rect && !animate) {
      const id = requestAnimationFrame(() => setAnimate(true));
      return () => cancelAnimationFrame(id);
    }
    return undefined;
  }, [rect, animate]);

  return { rect, animate };
}

function SlidingPill({ rect, animate, className }: { rect: PillRect | null; animate: boolean; className: string }) {
  return (
    <span
      aria-hidden="true"
      className={`pointer-events-none absolute left-0 top-0 rounded-full ${
        animate ? 'transition-[transform,width,height,opacity,background-color,box-shadow] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]' : ''
      } ${rect ? 'opacity-100' : 'opacity-0'} ${className}`}
      style={rect ? { width: rect.width, height: rect.height, transform: `translate(${rect.left}px, ${rect.top}px)` } : undefined}
    />
  );
}

interface HeaderProps {
  isSidebarOpen?: boolean;
  toggleSidebar?: () => void;
}

export default function Header({ isSidebarOpen = false, toggleSidebar }: HeaderProps) {
  const [isScrolled, setIsScrolled] = useState(false);
  const [user, setUser] = useState<CurrentCustomer | null>(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  /** Thanh menu điện thoại còn mục ở bên phải (chưa cuộn hết): làm mờ mép phải để khách biết vuốt được. */
  const [navMore, setNavMore] = useState(false);
  /** Số mục menu giữa hiện thẳng trên header (desktop); các mục còn lại vào nút "Thêm". */
  const [visibleCount, setVisibleCount] = useState(CUSTOMER_NAV.length);
  /** Menu "Thêm" mở cho lần điều hướng nào (object location đổi mỗi lần chuyển trang, kể cả Back/Forward) → tự đóng khi
   *  chuyển trang mà không cần effect. */
  const [moreOpenFor, setMoreOpenFor] = useState<ReturnType<typeof useLocation> | null>(null);

  const headerRef = useRef<HTMLElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const leftRef = useRef<HTMLDivElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const moreMeasureRef = useRef<HTMLSpanElement>(null);
  const moreRef = useRef<HTMLDivElement>(null);
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  const accountRef = useRef<HTMLDivElement>(null);
  const accountButtonRef = useRef<HTMLButtonElement>(null);
  const mobileNavRef = useRef<HTMLDivElement>(null);
  const desktopNavRef = useRef<HTMLElement>(null);
  const mobileNavListRef = useRef<HTMLElement>(null);
  const location = useLocation();
  const navigate = useNavigate();
  /** Khối tìm kiếm của trang (SearchHub) đã cuộn khuất: ô giữa header hiển thị thanh tìm kiếm thu gọn thay cho menu. */
  const searchCompact = useHeaderSearchCompact();
  // Ô giữa chuyển sang thanh tìm kiếm thu gọn thì menu "Thêm" bị gỡ khỏi DOM: đóng hẳn để khi menu quay lại không tự bung ra.
  if (searchCompact && moreOpenFor !== null) setMoreOpenFor(null);

  // Đồng bộ phiên người dùng và lắng nghe sự thay đổi
  useEffect(() => {
    const syncUser = () => {
      setUser(getCurrentCustomer());
    };
    syncUser();
    window.addEventListener('auth_change', syncUser);
    window.addEventListener('storage', syncUser);
    return () => {
      window.removeEventListener('auth_change', syncUser);
      window.removeEventListener('storage', syncUser);
    };
  }, []);

  // Đóng dropdown tài khoản / menu "Thêm" khi click ra ngoài hoặc nhấn Escape
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (accountRef.current && !accountRef.current.contains(target)) setIsDropdownOpen(false);
      if (moreRef.current && !moreRef.current.contains(target)) setMoreOpenFor(null);
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // Đang focus trong menu sắp đóng: trả focus về nút mở menu để người dùng bàn phím không bị rơi về đầu trang.
      const active = document.activeElement;
      if (active && moreRef.current?.contains(active)) moreButtonRef.current?.focus();
      else if (active && accountRef.current?.contains(active)) accountButtonRef.current?.focus();
      setIsDropdownOpen(false);
      setMoreOpenFor(null);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // Chiều cao thật của header (gồm vùng tai thỏ, hàng menu điện thoại, ghim đơn đặt) cho phần nội dung bên dưới:
  // --app-header-height = khi ở đầu trang (đệm trên của nội dung, không đổi theo cuộn để khỏi giật trang),
  // --app-header-offset = hiện tại (cho thanh dính / thông báo bám ngay dưới header khi header thu gọn).
  // Trước đây chỉ có giá trị dự phòng 130px nên trang nào cũng hở một dải trống dưới header.
  useLayoutEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const root = document.documentElement;
    const apply = () => {
      const height = Math.round(el.getBoundingClientRect().height);
      if (!height) return;
      root.style.setProperty('--app-header-offset', `${height}px`);
      if (window.scrollY <= 20 || !root.style.getPropertyValue('--app-header-height')) {
        root.style.setProperty('--app-header-height', `${height}px`);
      }
    };
    apply();
    if (!('ResizeObserver' in window)) return;
    const observer = new ResizeObserver(apply);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Menu giữa kiểu "priority+": hiện được bao nhiêu mục thì hiện, phần còn lại vào nút "Thêm". Chỗ trống cho menu = bề
  // rộng hàng trừ hai cụm hai bên; còn dư thì lưới 1fr|auto|1fr chia đều hai bên nên menu nằm chính giữa như Airbnb, chật
  // thì menu lệch nhẹ về phía cụm hẹp hơn thay vì bớt mục. Đo trên bản sao ẩn của các mục (measureRef) nên kết quả không
  // phụ thuộc số mục đang hiện → không bị nhảy qua lại.
  useLayoutEffect(() => {
    const row = rowRef.current;
    const left = leftRef.current;
    const right = rightRef.current;
    const measure = measureRef.current;
    const moreMeasure = moreMeasureRef.current;
    if (!row || !left || !right || !measure || !moreMeasure) return;
    const desktop = window.matchMedia(DESKTOP_QUERY);
    const compute = () => {
      if (!desktop.matches) {
        setVisibleCount(CUSTOMER_NAV.length);
        return;
      }
      const rowStyle = getComputedStyle(row);
      const inner = row.clientWidth - parseFloat(rowStyle.paddingLeft) - parseFloat(rowStyle.paddingRight);
      const columnGap = parseFloat(rowStyle.columnGap) || 0;
      const available = inner - left.offsetWidth - right.offsetWidth - 2 * columnGap;
      const itemGap = parseFloat(getComputedStyle(measure).columnGap) || 0;
      const widths = Array.from(measure.children, (child) => child.getBoundingClientRect().width);
      const total = widths.reduce((sum, w) => sum + w, 0) + itemGap * Math.max(0, widths.length - 1);
      if (total <= available) {
        setVisibleCount(widths.length);
        return;
      }
      let used = moreMeasure.getBoundingClientRect().width;
      let count = 0;
      for (const w of widths) {
        if (used + itemGap + w > available) break;
        used += itemGap + w;
        count += 1;
      }
      setVisibleCount(count);
    };
    compute();
    desktop.addEventListener('change', compute);
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', compute);
      return () => {
        desktop.removeEventListener('change', compute);
        window.removeEventListener('resize', compute);
      };
    }
    const observer = new ResizeObserver(compute);
    [row, left, right, measure, moreMeasure].forEach((el) => observer.observe(el));
    return () => {
      desktop.removeEventListener('change', compute);
      observer.disconnect();
    };
  }, []);

  // Thanh menu điện thoại cuộn ngang: đưa mục đang chọn vào giữa để khách thấy mình đang ở đâu (vd. "Du lịch" nằm
  // ngoài mép phải màn hình 390px).
  useEffect(() => {
    const strip = mobileNavRef.current;
    const current = strip?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!strip || !current || strip.scrollWidth <= strip.clientWidth) return;
    const target = current.offsetLeft - (strip.clientWidth - current.offsetWidth) / 2;
    strip.scrollTo({ left: Math.max(0, target), behavior: 'smooth' });
  }, [location.pathname]);

  useEffect(() => {
    const strip = mobileNavRef.current;
    if (!strip) return undefined;
    const update = () => setNavMore(strip.scrollLeft + strip.clientWidth < strip.scrollWidth - 4);
    update();
    strip.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => { strip.removeEventListener('scroll', update); window.removeEventListener('resize', update); };
  }, []);

  // Scroll listener for sticky navigation state
  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleOpen = () => {
    if (toggleSidebar) toggleSidebar();
  };

  const handleLogout = () => {
    setIsDropdownOpen(false);
    logoutCurrentSession();
    navigate('/login');
  };

  const handleOpenProfile = () => {
    setIsDropdownOpen(false);
    navigate('/profile');
  };

  // Các trang có hero image dùng header transparent khi ở đỉnh trang
  const hasHeroImage = hasHeroOverlay(location.pathname);

  const isSolid = !hasHeroImage || isScrolled;

  const visibleNav = CUSTOMER_NAV.slice(0, visibleCount);
  const overflowNav = CUSTOMER_NAV.slice(visibleCount);
  const overflowActive = overflowNav.some((item) => isCustomerNavActive(item, location.pathname));
  const isMoreOpen = moreOpenFor === location && overflowNav.length > 0;

  // Cỡ chữ / đệm / độ đậm của mục menu desktop: dùng chung cho mục thật và bản sao đo bề rộng. Mọi thứ làm đổi bề rộng
  // phải giống hệt nhau giữa hai bên (kể cả mục đang chọn), nếu không mục cuối sẽ tràn vào nút chuông.
  const navItemSize = 'px-2.5 xl:px-3 py-1.5 rounded-full text-sm font-medium';
  // Mục đang chọn: viên thuốc nền nhạt + chữ màu nhấn. Nền trắng dùng xanh thương hiệu (vàng trên trắng không đọc được),
  // nền ảnh hero dùng vàng nắng trên kính mờ.
  const navItemTone = (active: boolean) =>
    active
      ? isSolid
        ? 'text-white'
        : 'text-[#06604a]'
      : isSolid
        ? 'text-[#123f35] hover:text-[var(--color-primary)]'
        : 'text-white hover:text-[var(--color-sun)] [text-shadow:0_1px_2px_rgba(0,0,0,0.35)]';

  const desktopPill = useSlidingPill(desktopNavRef, [location.pathname, visibleCount, isSolid, searchCompact]);
  const mobilePill = useSlidingPill(mobileNavListRef, [location.pathname, isSolid]);

  const userInitial = user?.fullName
    ? user.fullName.trim().charAt(0).toUpperCase()
    : user?.email
    ? user.email.charAt(0).toUpperCase()
    : 'U';

  return (
    <>
      <header
        ref={headerRef}
        id="app-header"
        className={`fixed top-0 inset-x-0 z-50 flex flex-col w-full border-b transition-[background-color,border-color] duration-300 ease-out pt-[var(--safe-top)] pl-[var(--safe-left)] pr-[var(--safe-right)] ${
          isSolid
            ? 'bg-[linear-gradient(180deg,rgba(255,255,255,0.985),rgba(236,253,245,0.97))] border-emerald-900/[0.08] shadow-[0_12px_32px_-18px_rgba(10,46,38,0.45)]'
            : 'bg-transparent border-transparent'
        }`}
      >
        {/* Vạch gradient thương hiệu ở chân header khi header nền sáng: tách header khỏi nội dung, tạo điểm nhấn màu */}
        <span
          aria-hidden
          className={`pointer-events-none absolute inset-x-0 bottom-[-1px] h-[2px] bg-[linear-gradient(90deg,#0a7d64,#12b886_35%,#06b6d4_65%,#facc15)] transition-opacity duration-300 ${isSolid ? 'opacity-100' : 'opacity-0'}`}
        />
        {/* Chiều cao hàng cố định, không co lại khi cuộn: co chiều cao / đổi cỡ logo làm cả trang dàn lại từng khung hình
            (header, khối tìm kiếm, đo menu "Thêm") nên cuộn bị giật — giờ cuộn chỉ đổi nền header.
            Hàng chính. Điện thoại: [☰ logo] … [tài khoản]; khi cuộn qua ô tìm kiếm: [☰] [ô tìm kiếm] [tài khoản].
            Nút ☰ (mở sidebar) hiện ở mọi kích thước.
            Từ md: lưới 1fr | auto | 1fr — menu (hoặc ô tìm kiếm thu gọn) luôn nằm chính giữa, hai cụm bên chia đều. */}
        <div
          ref={rowRef}
          className="relative w-full flex items-center gap-2 md:grid md:grid-cols-[1fr_auto_1fr] md:gap-3 lg:gap-4 px-3.5 sm:px-6 lg:px-8 py-1.5 min-h-[58px] md:min-h-[64px]"
        >
          {/* Logo & Menu Drawer Toggle */}
          <div ref={leftRef} className="flex items-center gap-2 shrink-0 md:justify-self-start">
            {toggleSidebar && (
              <button
                type="button"
                onClick={handleOpen}
                aria-label="Mở menu điều hướng"
                title="Mở menu điều hướng"
                className={`icon-fx relative p-2 rounded-full cursor-pointer flex items-center justify-center md:hidden ${
                  isSidebarOpen
                    ? 'opacity-0 pointer-events-none invisible'
                    : 'opacity-100'
                } ${
                  isSolid
                    ? 'text-slate-800 hover:text-[var(--color-primary)]'
                    : 'text-white drop-shadow-md'
                }`}
              >
                <Menu className="w-5 h-5 sm:w-5.5 sm:h-5.5" strokeWidth={2.4} />
              </button>
            )}

            {/* Điện thoại: nhường chỗ cho ô tìm kiếm thu gọn; màn rất hẹp (<360px) bỏ chữ để cụm tài khoản không bị cắt.
                Máy tính bảng (md): chỉ biểu tượng, chữ từ lg. */}
            <Link
              to="/"
              onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
              aria-label={`${BRAND_NAME} — Trang chủ`}
              className={`flex items-center gap-2.5 group shrink-0 ${searchCompact ? 'max-md:hidden' : ''}`}
            >
              <LogoMark
                size={36}
                plate={!isSolid}
                className="transition-transform duration-300 ease-out group-hover:scale-105"
              />
              <LogoWordmark
                size={22}
                tone={isSolid ? 'dark' : 'light'}
                className={`max-[359px]:hidden md:hidden lg:block ${isSolid ? '' : 'drop-shadow-md'}`}
              />
            </Link>
          </div>

          {/* Ô giữa: menu điều hướng chính (từ md) hoặc thanh tìm kiếm thu gọn (mọi kích thước) khi khối tìm kiếm cuộn khuất */}
          <div className={`min-w-0 md:justify-self-center ${searchCompact ? 'flex-1 md:flex-none' : 'hidden md:block'}`}>
            <nav ref={desktopNavRef} aria-label="Điều hướng chính" className={`relative items-center justify-center gap-1 ${searchCompact ? "hidden" : "flex"}`}>
              <SlidingPill
                rect={desktopPill.rect}
                animate={desktopPill.animate}
                className={
                  isSolid
                    ? 'bg-[linear-gradient(120deg,#0a7d64,#12b886_55%,#06b6d4)] shadow-[inset_0_1px_0_rgba(255,255,255,0.3),0_8px_18px_-8px_rgba(10,125,100,0.85)]'
                    : 'bg-white/95 shadow-[0_8px_20px_-8px_rgba(0,0,0,0.45)]'
                }
              />
              {visibleNav.map((item) => {
                const active = isCustomerNavActive(item, location.pathname);
                return (
                  <Link
                    key={item.id}
                    to={item.path}
                    onClick={() => {
                      if (item.path === '/') window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    aria-current={active ? 'page' : undefined}
                    className={`nav-fx ${isSolid ? '' : 'nav-fx-light'} relative flex items-center gap-1.5 shrink-0 whitespace-nowrap transition-colors duration-200 ${navItemSize} ${navItemTone(active)}`}
                  >
                    <item.Icon className="w-4 h-4 shrink-0" aria-hidden />
                    <span>{item.label}</span>
                    {item.badge && <NavBadge text={item.badge} />}
                  </Link>
                );
              })}

              {overflowNav.length > 0 && (
                <div ref={moreRef} className="relative shrink-0">
                  <button
                    ref={moreButtonRef}
                    type="button"
                    onClick={() => setMoreOpenFor(isMoreOpen ? null : location)}
                    aria-expanded={isMoreOpen}
                    aria-haspopup="true"
                    aria-current={overflowActive ? 'page' : undefined}
                    className={`nav-fx ${isSolid ? '' : 'nav-fx-light'} relative flex items-center gap-1 whitespace-nowrap transition-colors duration-200 cursor-pointer ${navItemSize} ${navItemTone(overflowActive)}`}
                  >
                    Thêm
                    <ChevronDown className={`w-3.5 h-3.5 shrink-0 transition-transform duration-200 ${isMoreOpen ? 'rotate-180' : ''}`} aria-hidden />
                  </button>
                  {isMoreOpen && (
                    <div className={`absolute right-0 top-full mt-2 w-56 z-[60] ${DROPDOWN_PANEL}`}>
                      {overflowNav.map((item) => {
                        const active = isCustomerNavActive(item, location.pathname);
                        return (
                          <Link
                            key={item.id}
                            to={item.path}
                            aria-current={active ? 'page' : undefined}
                            onClick={() => setMoreOpenFor(null)}
                            className={`${DROPDOWN_ITEM} ${active ? 'bg-[var(--color-primary-50)] text-[var(--color-primary)]' : ''}`}
                          >
                            <item.Icon className="w-4 h-4 shrink-0 text-[var(--color-primary)]" aria-hidden />
                            <span>{item.label}</span>
                            {item.badge && <NavBadge text={item.badge} />}
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </nav>
            {/* Ô chứa thanh tìm kiếm thu gọn (SearchHub đưa vào khi khối tìm kiếm cuộn khuất) */}
            <div ref={setHeaderSearchSlot} className={searchCompact ? 'flex justify-center' : 'hidden'} />
          </div>

          {/* Bản sao ẩn của menu giữa để đo bề rộng từng mục (không nhận focus, không chiếm chỗ) */}
          <div aria-hidden="true" className="invisible pointer-events-none absolute left-0 top-0 h-0 w-0 overflow-hidden">
            <div ref={measureRef} className="flex w-max items-center gap-1">
              {CUSTOMER_NAV.map((item) => (
                <span key={item.id} className={`flex items-center gap-1.5 shrink-0 whitespace-nowrap ${navItemSize}`}>
                  <item.Icon className="w-4 h-4 shrink-0" />
                  <span>{item.label}</span>
                  {item.badge && <NavBadge text={item.badge} />}
                </span>
              ))}
            </div>
            <span ref={moreMeasureRef} className={`flex w-max items-center gap-1 whitespace-nowrap ${navItemSize}`}>
              Thêm
              <ChevronDown className="w-3.5 h-3.5 shrink-0" />
            </span>
          </div>

          {/* Cụm bên phải: Nút Đăng nhập/Đăng ký HOẶC Icon người dùng kèm Tên & Dropdown */}
          {/* whitespace-nowrap: chữ trong cụm (Đăng nhập, Đăng ký…) không được xuống dòng khi lưới tính bề rộng tối thiểu —
              nếu không, cột 1fr chỉ chừa bề rộng "đã ngắt dòng", cụm thật rộng hơn và tràn sang trái đè lên menu giữa. */}
          <div ref={rightRef} className="ml-auto flex items-center justify-end gap-1.5 sm:gap-2 shrink-0 whitespace-nowrap z-20 md:ml-0 md:justify-self-end">
            {user ? (
              <div className="flex items-center gap-1.5 sm:gap-2">
                {/* Icon hình thông báo ở bên cạnh icon ava */}
                <NotificationBell isSolid={isSolid} />

                <div ref={accountRef} className="relative">
                  <button
                    ref={accountButtonRef}
                    type="button"
                    onClick={() => setIsDropdownOpen((v) => !v)}
                    className={`acct-glow relative flex items-center gap-2 p-1 sm:pl-1.5 sm:pr-2.5 sm:py-1 rounded-full cursor-pointer border ${
                      isSolid
                        ? 'bg-white/90 border-slate-200/80 hover:border-emerald-500/50 shadow-2xs'
                        : 'bg-white/20 backdrop-blur-md border-white/30 text-white hover:border-white/60 shadow-xs'
                    }`}
                    aria-label={`Tài khoản: ${user.fullName || user.email}`}
                    aria-expanded={isDropdownOpen}
                    aria-haspopup="true"
                  >
                  {user.picture ? (
                    <img
                      src={user.picture}
                      alt=""
                      className="w-7 h-7 rounded-full object-cover border border-white/50 shrink-0"
                    />
                  ) : (
                    <div className="w-7 h-7 rounded-full bg-[var(--color-primary)] text-white flex items-center justify-center text-xs font-bold shrink-0 shadow-2xs">
                      {userInitial}
                    </div>
                  )}
                  {/* Tên chỉ hiện trên màn hình rất rộng để menu giữa còn chỗ (như Airbnb chỉ để ảnh đại diện) */}
                  <span
                    className={`hidden 2xl:inline text-xs font-medium max-w-[140px] truncate ${
                      isSolid ? 'text-slate-800' : 'text-white drop-shadow-sm'
                    }`}
                    title={user.fullName || user.email}
                  >
                    {user.fullName || user.email.split('@')[0]}
                  </span>
                  <ChevronDown
                    className={`hidden sm:inline-block w-3.5 h-3.5 transition-transform duration-200 ${
                      isDropdownOpen ? 'rotate-180' : ''
                    } ${isSolid ? 'text-slate-500' : 'text-white/90'}`}
                  />
                </button>

                {/* Dropdown Menu */}
                {isDropdownOpen && (
                  <div className={`absolute right-0 mt-2.5 w-64 z-[9998] ${DROPDOWN_PANEL}`}>
                    {/* Header tóm tắt tài khoản */}
                    <div className="px-3 py-2.5 mb-1 rounded-lg bg-slate-50 flex items-center gap-2.5">
                      {user.picture ? (
                        <img
                          src={user.picture}
                          alt={user.fullName}
                          className="w-9 h-9 rounded-full object-cover border border-slate-200 shrink-0"
                        />
                      ) : (
                        <div className="w-9 h-9 rounded-full bg-[var(--color-primary)] text-white flex items-center justify-center text-sm font-bold shrink-0 shadow-2xs">
                          {userInitial}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-bold text-slate-900 truncate">
                          {user.fullName || 'Khách hàng'}
                        </div>
                        <div className="text-[11px] text-slate-500 truncate">{user.email}</div>
                        <span className="inline-block mt-0.5 text-[10px] font-bold text-[var(--color-primary)] bg-[var(--color-primary-50)] px-2 py-0.5 rounded-full">
                          {user.role === 'ADMIN' ? 'Quản trị viên' : user.role === 'PROVIDER' ? 'Nhà cung cấp' : 'Khách du lịch'}
                        </span>
                      </div>
                    </div>

                    {/* Danh sách hành động: List booking & Thông tin cá nhân */}
                    <div className="space-y-0.5 py-1">
                      <button
                        type="button"
                        onClick={() => {
                          setIsDropdownOpen(false);
                          navigate('/lich-trinh?tab=cua-toi');
                        }}
                        className={DROPDOWN_ITEM}
                      >
                        <Route className="w-4 h-4 text-[var(--color-primary)] shrink-0" />
                        <span>Lịch trình của tôi</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setIsDropdownOpen(false);
                          navigate('/bookings');
                        }}
                        className={DROPDOWN_ITEM}
                      >
                        <Calendar className="w-4 h-4 text-[var(--color-primary)] shrink-0" />
                        <span>Đơn đặt phòng</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setIsDropdownOpen(false);
                          navigate('/homestays?saved=1');
                        }}
                        className={DROPDOWN_ITEM}
                      >
                        <Heart className="w-4 h-4 text-[var(--color-primary)] shrink-0" />
                        <span>Chỗ nghỉ đã lưu</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleOpenProfile}
                        className={DROPDOWN_ITEM}
                      >
                        <User className="w-4 h-4 text-[var(--color-primary)] shrink-0" />
                        <span>Thông tin cá nhân</span>
                      </button>

                      {user.role !== 'TRAVELER' && (
                        <button
                          type="button"
                          onClick={() => {
                            setIsDropdownOpen(false);
                            navigate(user.role === 'ADMIN' ? '/admin' : '/partner');
                          }}
                          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-semibold text-amber-800 menu-fx menu-fx-warn text-left cursor-pointer"
                        >
                          <ShieldCheck className="w-4 h-4 text-amber-600 shrink-0" />
                          <span>Cổng {user.role === 'ADMIN' ? 'Quản trị hệ thống' : 'Nhà cung cấp đối tác'}</span>
                        </button>
                      )}
                    </div>

                    {/* Đăng xuất */}
                    <div className="pt-1 mt-1 border-t border-slate-100">
                      <button
                        type="button"
                        onClick={handleLogout}
                        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-semibold text-[var(--color-danger)] menu-fx menu-fx-danger text-left cursor-pointer"
                      >
                        <LogOut className="w-4 h-4 shrink-0" />
                        <span>Đăng xuất</span>
                      </button>
                    </div>
                  </div>
                )}
                </div>
              </div>
            ) : (
              /* Nút Đăng nhập / Đăng ký trên Header */
              <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                <NotificationBell isSolid={isSolid} />
                <Link
                  to="/login"
                  title="Đăng nhập"
                  aria-label="Đăng nhập"
                  className={`cta inline-flex items-center justify-center gap-1.5 h-9 max-sm:w-9 sm:px-4 rounded-full text-xs font-bold cursor-pointer ${
                    isSolid
                      ? 'cta-primary text-white'
                      : 'cta-glass backdrop-blur-md text-white border border-white/40'
                  }`}
                >
                  <LogIn className="w-3.5 h-3.5 shrink-0" />
                  <span className="hidden sm:inline">Đăng nhập</span>
                </Link>
                {/* Điện thoại: cả hai nút chỉ còn icon (vuông 36px) cho đủ chỗ, từ sm trở lên hiện icon + chữ */}
                <Link
                  to="/register"
                  title="Đăng ký tài khoản"
                  aria-label="Đăng ký"
                  className={`cta cta-coral inline-flex items-center justify-center gap-1.5 h-9 max-sm:w-9 sm:px-4 rounded-full text-xs font-bold text-white cursor-pointer`}
                >
                  <UserPlus className="w-3.5 h-3.5 shrink-0" />
                  <span className="hidden sm:inline">Đăng ký</span>
                </Link>
              </div>
            )}
          </div>
        </div>

        {/* Hàng menu điện thoại (cuộn ngang). Thu lại khi ô tìm kiếm thu gọn chiếm hàng chính để header chỉ còn 1 hàng;
            menu đầy đủ vẫn mở được bằng nút ☰. */}
        <div
          className={`md:hidden grid transition-opacity duration-300 ${searchCompact ? 'grid-rows-[0fr] opacity-0' : 'grid-rows-[1fr] opacity-100'}`}
          aria-hidden={searchCompact || undefined}
          inert={searchCompact || undefined}
        >
          <div className="min-h-0 overflow-hidden">
            <div
              ref={mobileNavRef}
              className={`relative w-full overflow-x-auto scrollbar-hide px-3 py-2 flex justify-start transition-colors duration-300 ${
                isSolid ? 'border-t border-slate-200/60 bg-white/70' : 'bg-transparent'
              } ${navMore ? '[mask-image:linear-gradient(to_right,#000_calc(100%-44px),transparent)]' : ''}`}
            >
              <nav ref={mobileNavListRef} aria-label="Điều hướng chính" className="relative flex items-center gap-1.5 shrink-0 min-w-max mx-auto">
                <SlidingPill
                  rect={mobilePill.rect}
                  animate={mobilePill.animate}
                  className={isSolid ? 'bg-[linear-gradient(120deg,#0a7d64,#12b886,#06b6d4)] shadow-[0_6px_14px_-6px_rgba(10,125,100,0.6)]' : 'bg-[linear-gradient(120deg,rgba(255,255,255,0.28),rgba(250,204,21,0.24))]'}
                />
                {CUSTOMER_NAV.map((item) => {
                  const active = isCustomerNavActive(item, location.pathname);
                  return (
                    <Link
                      key={item.id}
                      to={item.path}
                      aria-current={active ? 'page' : undefined}
                      className={`nav-fx ${isSolid ? '' : 'nav-fx-light'} relative flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors duration-200 shrink-0 rounded-full ${
                        active
                          ? isSolid
                            ? 'text-white'
                            : 'text-[var(--color-sun)]'
                          : isSolid
                            ? 'text-slate-600 hover:text-[var(--color-primary)]'
                            : 'text-white/85 hover:text-white'
                      }`}
                    >
                      <item.Icon className="w-3.5 h-3.5 shrink-0" />
                      <span>{item.label}</span>
                      {item.badge && <NavBadge text={item.badge} />}
                    </Link>
                  );
                })}
              </nav>
            </div>
          </div>
        </div>

        {/* Recent Booking Tag */}
        <RecentBookingTag />
      </header>


    </>
  );
}
