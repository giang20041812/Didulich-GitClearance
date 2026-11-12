import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { Link, useNavigate, useSearchParams } from "react-router-dom"
import { ArrowRight, Calendar, Check, ChevronLeft, ChevronRight, MapPin, Search, Users, X, type LucideIcon } from "lucide-react"
import Stepper from "../ui/Stepper"
import SearchCalendar from "./SearchCalendar"
import { foldVietnamese } from "@/lib/mapLink"
import { addDaysKey, isDateKey, nightsBetween, parseDateKey, todayKey } from "@/lib/roomAvailability"
import { tripPlannerPath } from "@/lib/tripLinks"
import { fetchPublicRegions } from "@/services/homestayService"
import { fetchTripCatalog, prefetchTripCatalog } from "@/services/tripService"
import { setHeaderSearchCompact, useHeaderSearchSlot } from "@/lib/headerSearch"

type Tab = 'location' | 'dates' | 'guests';
const TAB_ORDER: Tab[] = ['location', 'dates', 'guests'];

/** Tỉnh / thành tìm được + dòng phụ: các vùng nổi bật (huyện) của tỉnh. */
interface RegionOption {
  name: string;
  areas: string[];
}

/**
 * Trước khi danh sách tỉnh tải xong (tải lúc trình duyệt rảnh để không chen nội dung chính) hoặc khi API lỗi: tỉnh đang có
 * dữ liệu kèm vùng nổi bật — lần vẽ đầu ô điểm đến đã có dòng phụ.
 */
const FALLBACK_REGIONS: RegionOption[] = [
  { name: 'Lào Cai', areas: ['Sa Pa', 'Bắc Hà', 'Bát Xát'] },
];
const MIN_GUESTS = 1;
const MAX_GUESTS = 50;
const GUEST_CHIPS = [2, 4, 6, 10];
const DEFAULT_GUESTS = 2;

/**
 * Thời lượng chọn nhanh: số đêm tính từ ngày đi (mặc định hôm nay). Khóa "ngày-đêm" trùng khóa thời lượng của gói lịch
 * trình (tripPlanner.durationKey) — không import lib/tripPlanner vào đây để trang chủ không kéo theo bộ lọc gói.
 * "1 tuần" = 7 ngày 6 đêm; "Tùy chọn" mở lịch để chọn ngày đi – về bất kỳ.
 */
type DurationKey = '2-1' | '3-2' | '7-6' | 'custom';
const DURATION_TAGS: { key: DurationKey; label: string; nights: number | null }[] = [
  { key: '2-1', label: '2N1Đ', nights: 1 },
  { key: '3-2', label: '3N2Đ', nights: 2 },
  { key: '7-6', label: '1 tuần', nights: 6 },
  { key: 'custom', label: 'Tùy chọn', nights: null },
];
const DEFAULT_NIGHTS = 1;

/** Thời lượng khớp số đêm (1 → 2N1Đ, 2 → 3N2Đ, 6 → 1 tuần), còn lại là "Tùy chọn". */
const durationOfNights = (nights: number): DurationKey => DURATION_TAGS.find((t) => t.nights === nights)?.key ?? 'custom';

const WEEKDAYS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

/** "11/10". */
const shortDate = (key: string) => {
  const d = parseDateKey(key);
  return `${d.getDate()}/${d.getMonth() + 1}`;
};

/** "CN 11/10". */
const dayLabel = (key: string) => `${WEEKDAYS[parseDateKey(key).getDay()] ?? ''} ${shortDate(key)}`;

interface StayRange {
  checkIn: string;
  checkOut: string;
}

/** Ngày đi – về trên đường dẫn (từ hôm nay trở đi, về sau ngày đi); không có thì hôm nay → mai (2N1Đ). */
function rangeFromParams(params: URLSearchParams): StayRange | null {
  const inKey = params.get('checkIn');
  const outKey = params.get('checkOut');
  return isDateKey(inKey) && isDateKey(outKey) && outKey > inKey && inKey >= todayKey() ? { checkIn: inKey, checkOut: outKey } : null;
}

/** Số người trên đường dẫn (1–50) hoặc null. */
function guestsFromParams(params: URLSearchParams): number | null {
  const count = Number(params.get('guests'));
  return Number.isInteger(count) && count >= MIN_GUESTS && count <= MAX_GUESTS ? count : null;
}

const defaultRange = (): StayRange => {
  const today = todayKey();
  return { checkIn: today, checkOut: addDaysKey(today, DEFAULT_NIGHTS) };
};

/** Nguồn của tỉnh đang chọn: đường dẫn / khách chọn thì giữ nguyên; mặc định thì danh mục lịch trình được phép thay. */
type ProvinceSource = 'url' | 'user' | 'catalog' | 'default';

/** Tỉnh lúc mở: đường dẫn → mặc định là Lào Cai. */
function initialProvince(params: URLSearchParams): { name: string; source: ProvinceSource } {
  const fromUrl = params.get('province')?.trim();
  if (fromUrl) return { name: fromUrl, source: 'url' };
  return { name: FALLBACK_REGIONS[0]!.name, source: 'default' };
}

/** Khung ô của khối tìm kiếm: điện thoại xếp dọc đủ rộng, cao 76px; máy tính là một ô trong hàng 3 ô bằng nhau. */
const FIELD = 'flex w-full min-w-0 min-h-[76px] items-center gap-3 px-3.5 py-3 text-left transition-colors md:h-full md:min-h-0 md:rounded-full md:px-5 md:py-0';
const FIELD_BUTTON = `${FIELD} cursor-pointer hover:bg-[#f3f7f1]`;
const FIELD_ACTIVE = 'md:bg-[var(--color-canvas)] md:shadow-[inset_0_0_0_1.5px_var(--color-primary)]';
const ICON_TILE = 'flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--color-nav-active-bg)] text-[var(--color-primary)] md:h-auto md:w-auto md:bg-transparent';
const FIELD_LABEL = 'text-[11px] font-extrabold uppercase tracking-[0.08em] text-[var(--color-muted)]';
const FIELD_VALUE = 'truncate text-base font-extrabold text-[var(--color-ink-deep)]';

/** Chip chọn thời lượng / số người: cao 40px, bo 8px; đang chọn viền xanh 1.5px + nền xanh nhạt + dấu tích. */
const chipClass = (active: boolean, padding = 'px-1.5') => `inline-flex h-10 min-w-0 items-center justify-center gap-1 rounded-lg ${padding} text-sm transition-colors cursor-pointer ${active
    ? 'border-[1.5px] border-[var(--color-primary)] bg-[var(--color-nav-active-bg)] font-extrabold text-[#06604a]'
    : 'border border-[#d6dfd0] bg-white font-bold text-[var(--color-ink)] hover:border-[var(--color-primary)] hover:text-[#06604a]'
  }`;

/**
 * Khối tìm kiếm (trang chủ, danh sách homestay) — đặt phòng trước: Điểm đến (mặc định tỉnh đầu tiên có lịch trình gợi ý) ·
 * Thời gian (2N1Đ / 3N2Đ / 1 tuần / Tùy chọn, mặc định hôm nay → mai) · Số người (mặc định 2) → "Tìm homestay"
 * (/homestays). Lối phụ "Hoặc lên lịch trình trước" mở /lich-trinh với cùng bối cảnh. Cuộn khuất thì thu gọn vào giữa
 * header (kiểu Airbnb); máy tính mở popover theo từng bước, điện thoại chọn thời lượng / số người ngay trên khối, ô điểm
 * đến và lịch mở sheet.
 */
interface SearchHubProps {
  /**
   * Hiệu ứng mở đầu (trang chủ): chính nút tìm kiếm (kính lúp tròn) bật ra ở đầu trái thanh, rồi gạt sang phải tới cuối
   * thanh, khối trắng mở theo ngay sau nút lộ các ô còn lại.
   */
  intro?: boolean;
}

export default function SearchHub({ intro = false }: SearchHubProps) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [activeTab, setActiveTab] = useState<Tab | null>(null);
  const [mountedTab, setMountedTab] = useState<Tab | null>(null);

  // Khối tìm kiếm trên trang đã cuộn khuất dưới header: true thì hiện nút tìm kiếm nhỏ dính theo màn hình bên dưới
  // (có độ trễ quanh mép, xem stickAtRef bên dưới — tránh nút nhấp nháy khi dừng cuộn đúng ngay mép header).
  const [isSticky, setIsSticky] = useState(false);
  // Khối tìm kiếm gốc đang nằm khuất dưới đáy header hiện tại (ẩn nó đi để không lộ qua nền header trong mờ)
  const [blockUnderHeader, setBlockUnderHeader] = useState(false);

  const [regions, setRegions] = useState<RegionOption[]>(FALLBACK_REGIONS);
  // Tỉnh: danh mục lịch trình tải xong sau đó chỉ thay tỉnh mặc định, không đè tỉnh khách đã chọn / tỉnh trên đường dẫn.
  const [startProvince] = useState(() => initialProvince(searchParams));
  const provinceSource = useRef<ProvinceSource>(startProvince.source);
  const [province, setProvince] = useState(startProvince.name);
  // Ngày luôn có: theo đường dẫn, không thì hôm nay → mai (2N1Đ). Thời lượng đang chọn suy từ số đêm.
  const [range, setRange] = useState<StayRange>(() => rangeFromParams(searchParams) ?? defaultRange());
  const [duration, setDuration] = useState<DurationKey>(() => durationOfNights(nightsBetween(range.checkIn, range.checkOut)));
  const [guests, setGuests] = useState(() => guestsFromParams(searchParams) ?? DEFAULT_GUESTS);
  const [provinceSearch, setProvinceSearch] = useState('');

  const searchRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const ctaMobileRef = useRef<HTMLButtonElement>(null);
  const ctaDesktopRef = useRef<HTMLButtonElement>(null);

  // Hiệu ứng mở đầu: đo nút kính lúp đang hiện (điện thoại / máy tính) — cỡ nút để khối trắng mở từ đúng vòng tròn ở mép
  // trái, quãng nút trượt từ đầu thanh tới chỗ của nó ở cuối thanh (--cta-travel). Đo bằng offset* (không tính transform
  // của animation đang chạy).
  useLayoutEffect(() => {
    if (!intro) return undefined;
    const measure = () => {
      const form = formRef.current;
      if (!form) return;
      for (const btn of [ctaMobileRef.current, ctaDesktopRef.current]) {
        if (!btn || btn.offsetWidth === 0) continue;
        form.style.setProperty('--cta-h', `${btn.offsetHeight}px`);
        form.style.setProperty('--cta-travel', `${form.offsetWidth - 12 - btn.offsetWidth}px`);
      }
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [intro]);

  // Đồng bộ với đường dẫn (quay lại / mở link kết quả tìm kiếm). Đường dẫn không có thì giữ giá trị mặc định đang có.
  useEffect(() => {
    const fromUrl = searchParams.get('province')?.trim();
    if (fromUrl) {
      provinceSource.current = 'url';
      setProvince(fromUrl);
    }
    const fromUrlRange = rangeFromParams(searchParams);
    if (fromUrlRange) {
      setRange((current) => (current.checkIn === fromUrlRange.checkIn && current.checkOut === fromUrlRange.checkOut ? current : fromUrlRange));
      setDuration(durationOfNights(nightsBetween(fromUrlRange.checkIn, fromUrlRange.checkOut)));
    }
    const count = guestsFromParams(searchParams);
    if (count) setGuests(count);
  }, [searchParams]);

  // Hiện nút tìm kiếm dính màn hình khi khối tìm kiếm gốc đã cuộn khuất dưới đáy header thật. Có độ trễ (hysteresis):
  // ghi lại đáy header lúc bắt đầu thu gọn và chỉ ẩn nút lại khi khối tìm kiếm trồi lên quá mốc đó — trên điện thoại
  // header co lại khi thu gọn (hàng menu ẩn đi), nếu so với đáy hiện tại thì trạng thái sẽ bật/tắt liên tục quanh mép.
  const stickAtRef = useRef<number | null>(null);
  useEffect(() => {
    const header = document.getElementById('app-header');
    // Đo vị trí (getBoundingClientRect ép trình duyệt tính lại bố cục) tối đa một lần mỗi khung hình, không phải mỗi sự
    // kiện cuộn — trước đây đo liên tục làm cuộn trang chủ bị khựng.
    let frame = 0;
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    const measure = () => {
      frame = 0;
      const el = searchRef.current;
      if (!el) return;
      const headerBottom = header?.getBoundingClientRect().bottom ?? 0;
      const bottom = el.getBoundingClientRect().bottom;
      setBlockUnderHeader(bottom <= headerBottom);
      if (stickAtRef.current === null) {
        if (bottom <= headerBottom) {
          stickAtRef.current = headerBottom;
          setIsSticky(true);
        } else {
          setIsSticky(false);
        }
      } else if (bottom > stickAtRef.current) {
        stickAtRef.current = null;
        setIsSticky(false);
      }
    };
    // Đổi kích thước cửa sổ / xoay máy: mốc cũ không còn đúng, tính lại từ đầu.
    const handleResize = () => {
      stickAtRef.current = null;
      schedule();
    };

    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', handleResize, { passive: true });
    // Header co/giãn (thanh CTA, hàng menu điện thoại thu lại) mà không có sự kiện cuộn: cập nhật lại khối tìm kiếm.
    const observer = header && typeof ResizeObserver !== 'undefined' ? new ResizeObserver(schedule) : null;
    if (header) observer?.observe(header);
    measure();
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', handleResize);
      observer?.disconnect();
    };
  }, []);

  // Popover máy tính: mở từ thanh thu gọn trong header thì nằm dưới header (docked), mở từ khối trên trang thì bám dưới
  // khối đó — đo lại theo từng nhịp cuộn; khối cuộn khuất dưới header thì đóng popover (không để nó trôi đè lên header).
  const popoverOpen = activeTab !== null;
  const tabIdx = activeTab ? TAB_ORDER.indexOf(activeTab) : 0;
  const tabDir = useRef({ idx: 0, dir: 1 });
  if (activeTab && tabDir.current.idx !== tabIdx) tabDir.current = { idx: tabIdx, dir: tabIdx > tabDir.current.idx ? 1 : -1 };
  // Khối tìm kiếm cuộn khuất dưới header -> thanh thu gọn nằm trong header (thay menu giữa), như Airbnb — cả máy tính lẫn
  // điện thoại (máy tính: 3 ô; điện thoại: một viên "tỉnh · thời gian" mở bảng tìm kiếm).
  const headerSlot = useHeaderSearchSlot();
  const headerCompact = isSticky && !!headerSlot;
  useEffect(() => {
    setHeaderSearchCompact(headerCompact);
    return () => setHeaderSearchCompact(false);
  }, [headerCompact]);
  const [popoverDocked, setPopoverDocked] = useState(false);
  const [popoverBounds, setPopoverBounds] = useState<DOMRect | null>(null);
  // Popover mở từ nút sticky (khối gốc đã cuộn khuất) thì "chốt" ở chế độ docked ngay lúc mở — không đổi giữa chừng dù
  // khách cuộn lên lại trong lúc popover đang mở.
  const stickyAtOpenRef = useRef(false);
  useEffect(() => { stickyAtOpenRef.current = isSticky; }, [isSticky]);
  useLayoutEffect(() => {
    if (!popoverOpen || !window.matchMedia('(min-width: 768px)').matches) return undefined;
    const docked = stickyAtOpenRef.current;
    setPopoverDocked(docked);
    if (docked) return undefined;
    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const el = formRef.current ?? searchRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const headerBottom = document.getElementById('app-header')?.getBoundingClientRect().bottom ?? 0;
        if (rect.bottom - 40 < headerBottom) setActiveTab(null);
        else setPopoverBounds(rect);
      });
    };
    setPopoverBounds((formRef.current ?? searchRef.current)?.getBoundingClientRect() ?? null);
    window.addEventListener('scroll', measure, { passive: true });
    window.addEventListener('resize', measure, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', measure);
      window.removeEventListener('resize', measure);
    };
  }, [popoverOpen]);

  // Danh sách tỉnh + tỉnh mặc định chỉ cần khi khách mở ô tìm kiếm: tải khi khách bắt đầu tương tác hoặc lúc trình duyệt
  // rảnh sau khi trang đã tải — không chen trước nội dung chính của trang (request tới backend đi lần lượt, xem lib/requestQueue).
  const [regionsWanted, setRegionsWanted] = useState(false);
  const wantRegions = regionsWanted || activeTab !== null;
  useEffect(() => {
    if (regionsWanted) return undefined;
    const timer = window.setTimeout(() => setRegionsWanted(true), 2500);
    return () => window.clearTimeout(timer);
  }, [regionsWanted]);

  useEffect(() => {
    if (!wantRegions) return undefined;
    let alive = true;
    void fetchPublicRegions().then((data) => {
      if (!alive) return;
      const mapped: RegionOption[] = data
        .map((d) => ({
          name: (d.province || d.name || '').trim(),
          areas: (d.districts ?? []).map((district) => district.name.trim()).filter(Boolean),
        }))
        .filter((r) => r.name);
      if (mapped.length === 0) return;
      const merged = [...mapped];
      for (const fb of FALLBACK_REGIONS) {
        if (!merged.some((m) => foldVietnamese(m.name) === foldVietnamese(fb.name))) {
          merged.unshift(fb);
        }
      }
      // Ưu tiên xếp Lào Cai lên đầu danh sách tỉnh
      merged.sort((a, b) => {
        if (foldVietnamese(a.name) === 'lao cai') return -1;
        if (foldVietnamese(b.name) === 'lao cai') return 1;
        return 0;
      });
      setRegions(merged);
      // Tỉnh mặc định: giữ Lào Cai
      if (provinceSource.current === 'default') {
        setProvince('Lào Cai');
      }
    });
    return () => { alive = false; };
  }, [wantRegions]);

  // Tải trước danh mục lịch trình của tỉnh mặc định (Lào Cai) hoặc tỉnh đang chọn
  useEffect(() => {
    if (!wantRegions) return undefined;
    void fetchTripCatalog(province || 'Lào Cai').catch(() => undefined);
  }, [wantRegions, province]);

  // Lối phụ "Lên lịch trình trước": tải trước danh mục gói của tỉnh khi khách mở bộ lọc — bấm là có ngay.
  useEffect(() => {
    if (activeTab) prefetchTripCatalog(province);
  }, [activeTab, province]);

  // Click outside to close popover
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Element | null;
      if (!target) return;
      if (
        target.closest('.search-popover-panel') ||
        target.closest('.search-modal-portal') ||
        target.closest('.search-fab') ||
        (searchRef.current && searchRef.current.contains(target))
      ) {
        return;
      }
      setActiveTab(null);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Mount/Unmount modal animation for mobile
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (activeTab) {
      setMountedTab(activeTab);
    } else {
      timer = setTimeout(() => setMountedTab(null), 300);
    }
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [activeTab]);

  // Modal mobile dùng portal nên cần khóa scroll của trang phía sau.
  // Chỉ áp dụng dưới breakpoint md để không ảnh hưởng desktop popover.
  useEffect(() => {
    if (!mountedTab || !window.matchMedia('(max-width: 767px)').matches) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [mountedTab]);

  const goNext = () => {
    if (!activeTab) return;
    const next = TAB_ORDER[TAB_ORDER.indexOf(activeTab) + 1];
    setActiveTab(next ?? null);
  };

  const goPrev = () => {
    if (!activeTab) return;
    const prev = TAB_ORDER[TAB_ORDER.indexOf(activeTab) - 1];
    if (prev) setActiveTab(prev);
  };

  const closeModal = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setActiveTab(null);
  };

  const stopPropagation = (e: React.MouseEvent) => e.stopPropagation();
  const toggleTab = (tab: Tab) => setActiveTab(activeTab === tab ? null : tab);
  /** Nút tìm kiếm nhỏ dính theo màn hình: bấm mở lại từ bước điểm đến, bấm lần nữa thì đóng. */
  const toggleSearch = () => setActiveTab(activeTab ? null : 'location');

  const region = useMemo(
    () => regions.find((r) => foldVietnamese(r.name) === foldVietnamese(province)) ?? null,
    [regions, province],
  );
  const areas = region && region.areas.length > 0 ? region.areas.slice(0, 3) : null;
  const areasLine = areas ? areas.join(' · ') : 'Toàn tỉnh';

  const filteredRegions = useMemo(() => {
    const q = foldVietnamese(provinceSearch.trim());
    if (!q) return regions;
    return regions.filter((r) => foldVietnamese(r.name).includes(q) || r.areas.some((a) => foldVietnamese(a).includes(q)));
  }, [provinceSearch, regions]);

  const { checkIn, checkOut } = range;
  const nights = Math.max(1, nightsBetween(checkIn, checkOut));
  const today = todayKey();
  const durationTag = DURATION_TAGS.find((t) => t.key === duration);
  /** Tag thời lượng gọn: "2N1Đ", "1 tuần" hoặc số ngày đêm thật khi chọn tùy ý. */
  const durationShort = duration !== 'custom' && durationTag ? durationTag.label : `${nights + 1}N${nights}Đ`;
  const nightsText = `${nights + 1} ngày ${nights} đêm`;
  const dateText = `${shortDate(checkIn)} → ${shortDate(checkOut)}`;
  const guestText = `${guests} người`;

  /** Chọn thời lượng: giữ ngày đi (mặc định hôm nay), ngày về = ngày đi + số đêm; "Tùy chọn" mở lịch. */
  const pickDuration = (key: DurationKey) => {
    setDuration(key);
    const tag = DURATION_TAGS.find((t) => t.key === key);
    if (tag?.nights) setRange((current) => ({ checkIn: current.checkIn, checkOut: addDaysKey(current.checkIn, tag.nights!) }));
    else setActiveTab('dates');
  };

  /** Đổi ngày trên lịch: thời lượng suy lại theo số đêm (1 → 2N1Đ, 2 → 3N2Đ, 6 → 1 tuần, còn lại Tùy chọn). */
  const changeDates = (from: string | null, to: string | null) => {
    if (!from || !to || to <= from) return;
    setRange({ checkIn: from, checkOut: to });
    setDuration(durationOfNights(nightsBetween(from, to)));
  };

  const resetDates = () => {
    setRange(defaultRange());
    setDuration(durationOfNights(DEFAULT_NIGHTS));
  };

  const changeGuests = (value: number) => setGuests(Math.min(MAX_GUESTS, Math.max(MIN_GUESTS, value)));

  // Tìm homestay: tỉnh, ngày, số người (+ lịch trình đang chọn chỗ ở) — danh sách homestay lọc đủ sức chứa, còn phòng.
  const stayPath = () => {
    const params = new URLSearchParams();
    params.set('province', province);
    params.set('checkIn', checkIn);
    params.set('checkOut', checkOut);
    params.set('guests', String(guests));
    const forJourney = searchParams.get('forJourney');
    if (forJourney) params.set('forJourney', forJourney);
    return `/homestays?${params.toString()}`;
  };
  const tripPath = tripPlannerPath({ province, checkIn, checkOut, guests });

  const handleSearch = () => {
    navigate(stayPath());
    setActiveTab(null);
  };

  const pickProvince = (name: string) => {
    provinceSource.current = 'user';
    setProvince(name);
    setProvinceSearch('');
    setActiveTab('dates');
  };

  const ctaLabel = 'Tìm homestay';
  const choosingForJourney = !!searchParams.get('forJourney');
  const prefetchTrip = () => prefetchTripCatalog(province);

  // Popover desktop: dưới khối tìm kiếm trên trang, hoặc (khi đã thu gọn vào header) ngay dưới header hiện tại.
  // Chế độ chốt lúc mở (không đổi giữa chừng khi cuộn làm khối thu gọn / bung ra), vị trí đo lại khi cuộn / đổi cỡ để
  // popover luôn bám ngay dưới khối tìm kiếm thay vì đứng yên rồi nhảy.
  const searchBounds = popoverBounds;
  const popoverTop = (searchBounds?.bottom ?? 0) + 6;
  const popoverStyle: React.CSSProperties = popoverDocked
    ? {
      top: 'calc(var(--app-header-offset, 64px) + 8px)',
      maxHeight: 'calc(100dvh - var(--app-header-offset, 64px) - 24px)',
    }
    : {
      top: `${popoverTop}px`,
      maxHeight: `calc(100dvh - ${popoverTop + 16}px)`,
      left: `${searchBounds?.left ?? 0}px`,
      width: `${searchBounds?.width ?? 820}px`,
      maxWidth: 'calc(100vw - 32px)',
    };

  const tabButton = (tab: Tab, index: number, label: string, Icon: LucideIcon, compact = false) => (
    <button
      key={tab}
      type="button"
      onClick={() => setActiveTab(tab)}
      aria-pressed={activeTab === tab}
      className={`flex items-center justify-center gap-1.5 truncate rounded-lg text-center font-bold transition-[background-color,color,box-shadow] duration-200 cursor-pointer ${compact ? 'min-h-9 py-1.5 text-xs' : 'relative z-10 px-2 py-2 text-xs sm:text-sm'
        } ${activeTab === tab ? (compact ? 'bg-white text-[var(--color-primary)] shadow-xs' : 'text-[var(--color-primary)]') : compact ? 'text-gray-600 hover:bg-white/60 hover:text-gray-900' : 'text-gray-600 hover:text-gray-900'}`}
    >
      {!compact && <Icon className="h-4 w-4 shrink-0 text-[var(--color-primary)]" aria-hidden />}
      <span className="truncate">{index}. {label}</span>
    </button>
  );

  const tabs = (compact = false) => [
    tabButton('location', 1, 'Điểm đến', MapPin, compact),
    tabButton('dates', 2, 'Thời gian', Calendar, compact),
    tabButton('guests', 3, 'Số người', Users, compact),
  ];

  /** Bốn chip thời lượng (bấm chọn — "Tùy chọn" mở lịch). */
  const durationChips = (labelledBy?: string) => (
    <div role="group" aria-label={labelledBy ? undefined : 'Thời lượng chuyến'} aria-labelledby={labelledBy} className="grid grid-cols-4 gap-1.5 md:gap-2">
      {DURATION_TAGS.map((tag) => {
        const active = duration === tag.key;
        return (
          <button key={tag.key} type="button" onClick={() => pickDuration(tag.key)} aria-pressed={active} className={chipClass(active)}>
            {/* Ô hẹp (4 chip trên điện thoại): "Tùy chọn" bỏ dấu tích cho khỏi bị cắt chữ */}
            {active && <Check className={`h-3.5 w-3.5 shrink-0 ${tag.key === 'custom' ? 'hidden sm:block' : ''}`} strokeWidth={3} aria-hidden />}
            <span className="truncate">{tag.label}</span>
          </button>
        );
      })}
    </div>
  );

  const locationPanel = (mobile: boolean) => (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden />
        <input
          type="text"
          placeholder="Tìm tỉnh, thành phố, vùng…"
          aria-label="Tìm tỉnh, thành phố"
          value={provinceSearch}
          onChange={(e) => setProvinceSearch(e.target.value)}
          className={`w-full rounded-xl border border-gray-200 bg-gray-50 pl-9 pr-3 text-gray-800 outline-none focus:border-[var(--color-primary)] focus:bg-white ${mobile ? 'py-2.5 text-base' : 'py-2 text-sm'}`}
          autoFocus={!mobile}
        />
      </div>
      {filteredRegions.length === 0 ? (
        <p className="rounded-lg bg-slate-50 px-3 py-4 text-center text-sm text-slate-500">
          Chưa có điểm đến “{provinceSearch.trim()}” — hiện có {regions.map((r) => r.name).join(', ')}.
        </p>
      ) : (
        <div className={`grid gap-2 overflow-y-auto pr-1 ${mobile ? 'grid-cols-1' : 'max-h-[300px] grid-cols-2'}`}>
          {filteredRegions.map((r) => {
            const selected = foldVietnamese(r.name) === foldVietnamese(province);
            return (
              <button
                key={r.name}
                type="button"
                onClick={() => pickProvince(r.name)}
                aria-pressed={selected}
                className={`flex items-center gap-3 rounded-xl border p-3 text-left transition-[background-color,border-color,box-shadow] duration-200 cursor-pointer ${selected ? 'border-[var(--color-primary)] bg-[var(--color-primary-50)] shadow-xs' : 'border-gray-200 bg-white hover:border-[var(--color-primary)] hover:bg-gray-50'
                  }`}
              >
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${selected ? 'bg-[var(--color-primary)] text-white' : 'bg-[var(--color-primary-50)] text-[var(--color-primary)]'}`}>
                  <MapPin className="h-4 w-4" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className={`block truncate text-sm font-bold ${selected ? 'text-[#06604a]' : 'text-gray-900'}`}>{r.name}</span>
                  <span className="block truncate text-xs text-gray-500">{r.areas.length > 0 ? r.areas.join(' · ') : 'Toàn tỉnh'}</span>
                </span>
                {selected && <Check className="h-4 w-4 shrink-0 text-[var(--color-primary)]" aria-hidden />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );

  /** Bước "Thời gian" của popover / sheet: thời lượng, dòng ngày đi – về, lịch. */
  const datesPanel = (idPrefix: string) => (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <span id={`${idPrefix}-duration`} className="text-[13px] font-extrabold text-[var(--color-ink-deep)]">Bạn đi mấy ngày?</span>
        {durationChips(`${idPrefix}-duration`)}
        <span className="text-[13px] leading-snug text-[var(--color-muted)]">
          Đi <b className="text-[var(--color-ink-deep)]">{dayLabel(checkIn)}</b>{checkIn === today ? ' (hôm nay)' : ''} · về{' '}
          <b className="text-[var(--color-ink-deep)]">{dayLabel(checkOut)}</b>
          {duration === 'custom' ? ` — ${nightsText}, chọn ngày đi rồi ngày về trên lịch.` : ' — đổi ngày đi, ngày về tự dời theo.'}
        </span>
      </div>
      <div className="border-t border-[var(--color-mist)] pt-3">
        <SearchCalendar
          checkIn={checkIn}
          checkOut={checkOut}
          onChange={changeDates}
          fromLabel="Ngày đi"
          toLabel="Ngày về"
          keepNights={durationTag?.nights ?? null}
          allowClear={false}
        />
      </div>
    </div>
  );

  const guestsPanel = (
    <div className="flex flex-col gap-3">
      <Stepper
        label="Số người đi"
        hint="Chỉ hiện chỗ nghỉ đủ chỗ cho cả đoàn"
        value={guests}
        min={MIN_GUESTS}
        max={MAX_GUESTS}
        onChange={changeGuests}
      />
      <div className="flex flex-wrap gap-2" role="group" aria-label="Chọn nhanh số người">
        {GUEST_CHIPS.map((count) => (
          <button key={count} type="button" onClick={() => setGuests(count)} aria-pressed={guests === count} className={chipClass(guests === count, 'px-4')}>
            {guests === count && <Check className="h-3.5 w-3.5 shrink-0" strokeWidth={3} aria-hidden />}
            {count} người
          </button>
        ))}
      </div>
    </div>
  );

  const summary = `${province} · ${dateText} (${durationShort}) · ${guestText}`;

  return (
    <div
      ref={searchRef}
      className="w-full relative z-30 transition-all text-left"
    >
      {/* ---------------- KHU VỰC TÌM KIẾM GỐC TRÊN TRANG ----------------
          Điện thoại: MỘT hàng gọn — tóm tắt (tỉnh · ngày · số người) bấm vào mở bảng chọn từng bước + nút tìm. Máy tính: một
          hàng ba ô bằng nhau + nút tìm. */}
      <div className="relative">
        <form
          ref={formRef}
          role="search"
          aria-label="Tìm homestay"
          onSubmit={(e) => { e.preventDefault(); handleSearch(); }}
          className={`${intro ? 'search-unfold' : ''} w-full rounded-full bg-white ring-1 ring-white/70 shadow-[0_2px_6px_rgba(4,36,29,0.12),0_28px_60px_-24px_rgba(4,36,29,0.6)] transition-opacity duration-200 md:grid md:h-[78px] md:grid-cols-[repeat(3,minmax(0,1fr))_auto] md:items-stretch md:gap-1 md:p-1.5 ${blockUnderHeader ? 'pointer-events-none opacity-0' : 'opacity-100'
            }`}
        >
          {/* Điện thoại: một hàng — phần tóm tắt mở bảng chọn (điểm đến → thời gian → số người), nút tìm chạy tìm kiếm ngay */}
          <div className="flex items-center gap-1.5 p-1.5 md:hidden">
            <button
              type="button"
              onClick={() => setActiveTab('location')}
              aria-haspopup="dialog"
              aria-label={`Sửa tìm kiếm: ${summary}`}
              className={`flex h-12 min-w-0 flex-1 items-center gap-2.5 rounded-full pl-1.5 pr-1 text-left transition-colors active:bg-[#f3f7f1] cursor-pointer ${intro ? 'search-unfold-content' : ''}`}
            >
              <span className={ICON_TILE}><MapPin className="h-[18px] w-[18px]" aria-hidden /></span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate text-[15px] font-extrabold leading-none text-[var(--color-ink-deep)]">{province}</span>
                <span className="truncate text-xs font-semibold leading-none tabular-nums text-[var(--color-muted)]">
                  {dateText} · {durationShort} · {guestText}
                </span>
              </span>
            </button>
            <button
              ref={ctaMobileRef}
              type="submit"
              aria-label={ctaLabel}
              className={`relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full cta cta-primary text-white cursor-pointer ${intro ? 'search-cta' : ''}`}
            >
              <Search className="h-5 w-5" strokeWidth={2.75} aria-hidden />
            </button>
          </div>

          {/* Điểm đến — máy tính */}
          <button
            type="button"
            onClick={() => toggleTab('location')}
            aria-haspopup="dialog"
            aria-expanded={activeTab === 'location'}
            aria-label={`Điểm đến: ${province}, ${areasLine}`}
            className={`${FIELD_BUTTON} hidden md:flex ${intro ? 'search-unfold-content' : ''} ${activeTab === 'location' ? FIELD_ACTIVE : ''}`}
          >
            <span className={ICON_TILE}><MapPin className="h-5 w-5" aria-hidden /></span>
            <span className="flex min-w-0 flex-1 flex-col gap-0.5 md:gap-px">
              <span className={FIELD_LABEL}>Điểm đến</span>
              <span className={FIELD_VALUE}>
                {province}
                {areas && <span className="text-[13px] font-semibold text-[var(--color-muted)]"> · {areas.join(', ')}</span>}
              </span>
            </span>
          </button>

          {/* Thời gian — máy tính: một ô mở popover */}
          <button
            type="button"
            onClick={() => toggleTab('dates')}
            aria-haspopup="dialog"
            aria-expanded={activeTab === 'dates'}
            aria-label={`Thời gian: ${dayLabel(checkIn)} đến ${dayLabel(checkOut)}, ${nightsText}`}
            className={`${FIELD_BUTTON} hidden md:flex ${intro ? 'search-unfold-content' : ''} ${activeTab === 'dates' ? FIELD_ACTIVE : ''}`}
          >
            <span className={ICON_TILE}><Calendar className="h-5 w-5" aria-hidden /></span>
            <span className="flex min-w-0 flex-1 flex-col gap-px">
              <span className={FIELD_LABEL}>Thời gian</span>
              <span className={`${FIELD_VALUE} tabular-nums`}>
                {dateText} <span className="text-[13px] font-bold text-[#06604a]">· {durationShort}</span>
              </span>
            </span>
          </button>

          {/* Số người — máy tính: một ô mở popover */}
          <button
            type="button"
            onClick={() => toggleTab('guests')}
            aria-haspopup="dialog"
            aria-expanded={activeTab === 'guests'}
            aria-label={`Số người: ${guestText}`}
            className={`${FIELD_BUTTON} hidden md:flex ${intro ? 'search-unfold-content' : ''} ${activeTab === 'guests' ? FIELD_ACTIVE : ''}`}
          >
            <span className={ICON_TILE}><Users className="h-5 w-5" aria-hidden /></span>
            <span className="flex min-w-0 flex-1 flex-col gap-px">
              <span className={FIELD_LABEL}>Số người</span>
              <span className={FIELD_VALUE}>{guestText}</span>
            </span>
          </button>

          <div className="hidden md:block">
            <button
              ref={ctaDesktopRef}
              type="submit"
              aria-label={ctaLabel}
              className={`relative flex h-full w-[66px] items-center justify-center rounded-full cta cta-primary text-white cursor-pointer ${intro ? 'search-cta' : ''}`}
            >
              <Search className="h-6 w-6" strokeWidth={2.75} aria-hidden />
            </button>
          </div>
        </form>
      </div>

      {/* Lối phụ: lên lịch trình trước (cùng tỉnh, ngày, số người) — ẩn khi đang chọn chỗ ở cho một lịch trình */}
      {!choosingForJourney && (
        <div className={`${intro ? 'search-unfold-content' : ''} mt-2 flex justify-center px-1 transition-opacity duration-200 md:justify-start ${blockUnderHeader ? 'opacity-0' : 'opacity-100'}`}>
          <Link
            to={tripPath}
            onPointerEnter={prefetchTrip}
            onFocus={prefetchTrip}
            onTouchStart={prefetchTrip}
            className="group inline-flex min-h-10 items-center gap-1.5 rounded-full bg-black/15 px-4 text-sm font-extrabold text-white ring-1 ring-white/25 transition-colors duration-200 hover:bg-white/15 hover:ring-white/40"
          >
            Hoặc lên lịch trình trước
            <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" strokeWidth={2.5} aria-hidden />
          </Link>
        </div>
      )}

      {/* ---------------- NÚT TÌM KIẾM NHỎ, DÍNH THEO MÀN HÌNH ----------------
          Khối tìm kiếm gốc cuộn khuất dưới header thì nút tròn gọn này hiện ra giữa đáy màn hình (tự né lên khi thanh cài
          app PWA đang hiện — xem data-pwa-bar ở HeroPwaDownloadBanner); bấm mở lại đúng luồng 3 bước như khối gốc.
          Portal thẳng ra body (như modal điện thoại bên dưới): bên trong cây DOM có div.hero-rise — animation của nó để lại
          transform sau khi chạy xong (dù là ma trận đơn vị), biến div đó thành containing block cho mọi "fixed" lồng bên
          trong, nên "fixed" sẽ bám theo div đang cuộn thay vì theo màn hình nếu không thoát ra ngoài bằng portal. */}
      {headerCompact && headerSlot && createPortal(
        <>
          <button
            type="button"
            onClick={toggleSearch}
            aria-haspopup="dialog"
            aria-expanded={activeTab !== null}
            aria-label={`Tìm homestay: ${summary}`}
            className="md:hidden flex h-10 w-full min-w-0 items-center gap-2 rounded-full bg-white py-0 pl-1 pr-4 text-[13px] font-semibold text-[var(--color-ink-deep)] shadow-[0_6px_20px_-8px_rgba(4,36,29,0.55)] ring-1 ring-slate-900/10 cursor-pointer active:scale-[0.98]"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full cta cta-primary text-white">
              <Search className="h-3.5 w-3.5" strokeWidth={2.75} aria-hidden />
            </span>
            <span className="min-w-0 truncate">{province} · {durationShort} · {guestText}</span>
          </button>
          <div role="group" aria-label="Tìm homestay" className="hidden md:flex h-11 items-center rounded-full bg-white pl-1.5 pr-1.5 text-[var(--color-ink-deep)] shadow-[0_6px_20px_-8px_rgba(4,36,29,0.55)] ring-1 ring-slate-900/10">
            {([['location', province], ['dates', `${dateText} · ${durationShort}`], ['guests', guestText]] as [Tab, string][]).map(([tab, text], i) => (
              <button
                key={tab}
                type="button"
                onClick={() => toggleTab(tab)}
                aria-haspopup="dialog"
                aria-expanded={activeTab === tab}
                className={`h-8 max-w-[220px] truncate rounded-full px-4 text-[13px] font-medium cursor-pointer transition-colors hover:bg-slate-100 ${i > 0 ? 'border-l border-slate-200' : ''} ${activeTab === tab ? 'bg-slate-100 text-[var(--color-primary)]' : ''}`}
              >
                {text}
              </button>
            ))}
            <button type="button" onClick={handleSearch} aria-label={ctaLabel} className="ml-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full cta cta-primary text-white cursor-pointer">
              <Search className="h-4 w-4" strokeWidth={2.75} aria-hidden />
            </button>
          </div>
        </>,
        headerSlot
      )}
      {typeof window !== 'undefined' && createPortal(
        <button
          type="button"
          onClick={toggleSearch}
          aria-haspopup="dialog"
          aria-expanded={activeTab !== null}
          aria-label={`Tìm homestay: ${summary}`}
          className={`search-fab fixed left-1/2 z-40 flex h-11 w-fit max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-2 rounded-full bg-[var(--color-ink-deep)]/95 py-0 pl-1.5 pr-4 text-sm font-bold text-white shadow-[0_10px_28px_-8px_rgba(4,36,29,0.6)] ring-1 ring-white/15 backdrop-blur transition-[opacity,transform] duration-300 cursor-pointer hover:bg-black active:scale-95 bottom-5 max-md:[html[data-pwa-bar]_&]:bottom-24 mb-[var(--safe-bottom)] ${isSticky && !headerCompact ? 'opacity-100 translate-y-0' : 'pointer-events-none translate-y-3 opacity-0'
            }`}
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary)]">
            <Search className="h-3.5 w-3.5" strokeWidth={2.75} aria-hidden />
          </span>
          <span className="min-w-0 truncate">{province} · {durationShort}</span>
        </button>,
        document.body
      )}

      {/* ---------------- DESKTOP POPOVER 3 BƯỚC ----------------
          Portal ra body (cùng lý do với nút sticky ở trên): nếu để tại chỗ, popover "fixed" sẽ vô tình bám theo
          div.hero-rise thay vì màn hình thật — định vị sai hẳn khi khối tìm kiếm gốc đã cuộn xa khỏi tầm nhìn. */}
      {activeTab && (popoverDocked || popoverBounds) && typeof window !== 'undefined' && createPortal(
        <div
          style={{ ...popoverStyle, transformOrigin: popoverDocked ? '50% 0' : '30% 0' }}
          role="dialog"
          aria-label="Tìm homestay"
          className={`search-popover-panel hidden md:flex ${popoverDocked
              ? 'fixed left-1/2 -translate-x-1/2 w-[820px] max-w-[calc(100vw-32px)] shadow-2xl'
              : 'fixed shadow-2xl'
            } max-h-[calc(100dvh-1rem)] overflow-y-auto overscroll-contain bg-white rounded-2xl ring-1 ring-slate-900/[0.06] shadow-[0_30px_70px_-30px_rgba(4,36,29,0.5)] p-4 z-[100] flex-col gap-3.5 search-pop`}
          onClick={stopPropagation}
        >
          <div className="flex items-center justify-between gap-3 border-b border-gray-100 pb-2.5">
            <div className="relative grid flex-1 grid-cols-3 rounded-xl bg-slate-100 p-1">
              {/* Viên nền trắng trượt giữa 3 ô (kiểu Airbnb) */}
              <span
                aria-hidden
                className="absolute inset-y-1 left-1 w-[calc((100%-0.5rem)/3)] rounded-lg bg-white shadow-xs transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
                style={{ transform: `translateX(${tabIdx * 100}%)` }}
              />
              {tabs()}
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <button
                type="button"
                onClick={goPrev}
                disabled={activeTab === 'location'}
                aria-label="Bước trước"
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-500 transition-colors hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] disabled:cursor-not-allowed disabled:opacity-30 cursor-pointer"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={goNext}
                disabled={activeTab === 'guests'}
                aria-label="Bước tiếp theo"
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--color-primary)] cta cta-primary text-white shadow-xs transition-colors disabled:cursor-not-allowed disabled:opacity-30 cursor-pointer"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={closeModal}
                aria-label="Đóng"
                className="ml-1 flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800 cursor-pointer"
              >
                <X className="h-4 w-4" strokeWidth={2.5} />
              </button>
            </div>
          </div>

          <div key={activeTab} className={`flex flex-col gap-3 ${tabDir.current.dir > 0 ? 'search-panel-next' : 'search-panel-prev'}`}>
            {activeTab === 'location' && locationPanel(false)}

            {activeTab === 'dates' && (
              <div className="flex flex-col gap-3">
                {datesPanel('search-popover')}
                <div className="flex items-center justify-end gap-2 border-t border-[var(--color-mist)] pt-3">
                  <button
                    type="button"
                    onClick={resetDates}
                    className="h-10 rounded-lg px-3.5 text-sm font-extrabold text-[var(--color-ink)] transition-colors hover:bg-gray-100 cursor-pointer"
                  >
                    Đặt lại
                  </button>
                  <button
                    type="button"
                    onClick={goNext}
                    className="flex h-10 items-center gap-1.5 rounded-lg bg-[var(--color-ink-deep)] px-4 text-sm font-extrabold text-white transition-colors hover:bg-black cursor-pointer"
                  >
                    Tiếp: Số người <ChevronRight className="h-4 w-4" aria-hidden />
                  </button>
                </div>
              </div>
            )}

            {activeTab === 'guests' && (
              <div className="flex flex-col gap-3">
                <div className="max-w-md">{guestsPanel}</div>
                <div className="flex items-center justify-between gap-3 border-t border-gray-100 pt-3">
                  <span className="min-w-0 truncate text-xs text-gray-500">{summary}</span>
                  <button
                    type="button"
                    onClick={handleSearch}
                    className="flex h-10 shrink-0 items-center gap-1.5 rounded-lg cta cta-primary px-5 text-sm font-extrabold text-white transition-colors cursor-pointer"
                  >
                    <Search className="h-4 w-4" aria-hidden /> {ctaLabel}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>,
        document.body
      )}

      {/* ---------------- MOBILE MODAL (ĐIỂM ĐẾN, THỜI GIAN, SỐ NGƯỜI) ---------------- */}
      {mountedTab && typeof window !== 'undefined' && createPortal(
        <div className="md:hidden fixed inset-0 z-[9999] flex justify-center items-end search-modal-portal">
          <div
            className={`absolute inset-0 bg-black/60 backdrop-blur-sm ${activeTab ? 'fade-in-overlay' : 'fade-out-overlay'}`}
            onClick={closeModal}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Tìm homestay"
            className={`relative w-full h-[85dvh] max-h-[calc(100dvh-1.5rem)] bg-white rounded-t-3xl flex flex-col shadow-2xl ${activeTab ? 'modal-slide-in' : 'modal-slide-out'}`}
            onClick={stopPropagation}
          >
            <div className="flex justify-center pt-2.5 pb-1.5">
              <div className="h-1 w-10 rounded-full bg-gray-300" />
            </div>

            <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-4 pb-2">
              <h3 className="text-base font-bold text-gray-900">Tìm homestay</h3>
              <button type="button" onClick={closeModal} aria-label="Đóng" className="-mr-2 flex h-11 w-11 items-center justify-center rounded-lg text-gray-400 hover:text-gray-700">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid grid-cols-3 gap-1 border-b border-gray-200 bg-gray-100 p-2">{tabs(true)}</div>

            <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-3">
              {activeTab === 'location' && locationPanel(true)}
              {activeTab === 'dates' && datesPanel('search-sheet')}
              {activeTab === 'guests' && guestsPanel}
            </div>

            <div className="flex shrink-0 items-center justify-between gap-2 border-t border-gray-100 bg-white px-4 pt-3 pb-[max(var(--safe-bottom),1rem)]">
              <span className="min-w-0 flex-1 truncate text-xs text-gray-600">{summary}</span>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); goPrev(); }}
                  disabled={activeTab === 'location'}
                  aria-label="Bước trước"
                  className="flex h-11 w-11 items-center justify-center rounded-lg border border-gray-200 text-gray-500 transition-colors hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] disabled:cursor-not-allowed disabled:opacity-30 cursor-pointer"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                {activeTab === 'guests' ? (
                  <button
                    type="button"
                    onClick={handleSearch}
                    className="flex h-11 items-center gap-1.5 rounded-lg cta cta-primary px-5 text-sm font-extrabold text-white shadow-xs transition-colors active:scale-95 cursor-pointer"
                  >
                    <Search className="h-4 w-4" aria-hidden />
                    {ctaLabel}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); goNext(); }}
                    aria-label="Bước tiếp theo"
                    className="flex h-11 w-11 items-center justify-center rounded-lg border border-[var(--color-primary)] cta cta-primary text-white shadow-xs transition-colors cursor-pointer"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
