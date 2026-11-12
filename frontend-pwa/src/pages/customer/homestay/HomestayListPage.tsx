import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Link, useSearchParams } from 'react-router-dom';
import { fetchHomestays, fetchHomestayAmenities, prefetchHomestay, HomestayFilterParams } from '@/services/homestayService';
import { HomestayDto, PublicAmenityItem } from '@/types/homestay';
import SearchHub from '@/components/layout/SearchHub';
import JourneyContextBanner from '@/components/trip/JourneyContextBanner';
import { parseJourneyId, stayContextFor } from '@/lib/stayContext';
import { formatVnDate } from '@/lib/roomAvailability';
import { PriceSlider } from '@/components/ui/price-slider';
import { Button } from '@/components/ui/button';
import { CardSkeleton } from '@/components/ui/CardSkeleton';
import CompactPlaceCard from '@/components/ui/CompactPlaceCard';
import { COMPACT_GRID_WITH_SIDEBAR_COLS, formatVnd } from '@/lib/compactCard';
import FramerSwipeCardStack from '@/components/ui/FramerSwipeCardStack';
import Reveal from '@/components/ui/Reveal'
import HomeMotifs from '@/components/home/HomeMotifs';
import Stepper from '@/components/ui/Stepper';
import heroListBg from '@/assets/photos/banner-homestays.webp';
import {
  MapPin,
  SlidersHorizontal,
  Heart,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  X,
  Search,
  ArrowUpDown,
  RotateCcw,
  Map,
  Sparkles,
  Wind,
  Mountain,
  Bath,
  Utensils,
  Flame,
  Users,
  Home,
  type LucideIcon
} from 'lucide-react';
import VietmapView from '@/components/map/VietmapView';
import { getFavoriteIds, onFavoritesChange } from '@/lib/favorites';
import { ToolbarSkeleton, FilterPanelSkeleton, LIST_SKELETON_SPECS } from '@/components/ui/ListPageSkeleton';
import { useFirstLoad } from '@/hooks/useFirstLoad';

const SKELETON = LIST_SKELETON_SPECS.homestays;

// Chip "Lọc nhanh": chỉ hiện khi mã tiện ích có trong danh mục đang dùng (GET /api/public/places/amenities).
const QUICK_AMENITY_ICONS: [string, LucideIcon][] = [
  ['AIR_CONDITIONING', Wind],
  ['TERRACE', Mountain],
  ['BATHTUB', Bath],
  ['KITCHEN', Utensils],
  ['BREAKFAST', Utensils],
  ['BBQ_AREA', Flame],
];

const AREA_OPTIONS = [
  { id: 'tt-mcc', label: 'Thị trấn Mù Cang Chải', keywords: ['thị trấn mù cang chải', 'tt. mù cang chải', 'tt mù cang chải', 'tổ 1', 'tổ 2', 'tổ 3', 'tổ 4', 'tổ 5'] },
  { id: 'la-pan-tan', label: 'Xã La Pán Tẩn', keywords: ['la pán tẩn', 'mâm xôi'] },
  { id: 'che-cu-nha', label: 'Xã Chế Cu Nha', keywords: ['chế cu nha'] },
  { id: 'de-xu-phinh', label: 'Xã Dế Xu Phình', keywords: ['dế xu phình'] },
  { id: 'tu-le', label: 'Xã Tú Lệ', keywords: ['tú lệ', 'lìm thái', 'nước nóng'] },
  { id: 'cao-pha', label: 'Xã Cao Phạ', keywords: ['cao phạ', 'lìm mông', 'khau phạ'] },
  { id: 'pung-luong', label: 'Xã Púng Luông', keywords: ['púng luông', 'móng ngựa'] },
  { id: 'nam-khat', label: 'Xã Nậm Khắt', keywords: ['nậm khắt'] },
  { id: 'kim-noi', label: 'Xã Kim Nọi', keywords: ['kim nọi', 'bản thái'] },
  { id: 'mo-de', label: 'Xã Mồ Dề', keywords: ['mồ dề', 'rừng trúc'] },
] as const;

const PROPERTY_TYPE_OPTIONS = [
  { id: 'nha-san', label: 'Nhà sàn', keywords: ['nhà sàn', 'sàn', 'stilt', 'cộng đồng', 'dorm', 'bản thái'] },
  { id: 'bungalow', label: 'Bungalow', keywords: ['bungalow', 'chòi', 'cabin', 'wooden house'] },
  { id: 'eco-lodge', label: 'Eco Lodge', keywords: ['eco', 'lodge', 'resort', 'retreat', 'glamping', 'sinh thái'] },
  { id: 'homestay-ban-dia', label: 'Homestay bản địa', keywords: ['homestay', 'home', 'bản', 'h\'mông', 'mông', 'thái'] },
  { id: 'khach-san', label: 'Khách sạn / Nhà nghỉ', keywords: ['khách sạn', 'nhà nghỉ', 'hotel', 'motel', 'guesthouse', 'guest house'] },
] as const;

const NEARBY_SPOT_OPTIONS = [
  { id: 'mam-xoi', label: 'Đồi Mâm Xôi', keywords: ['la pán tẩn', 'mâm xôi', 'chế cu nha'] },
  { id: 'khau-pha', label: 'Đèo Khau Phạ', keywords: ['cao phạ', 'khau phạ', 'lìm mông', 'tú lệ'] },
  { id: 'mong-ngua', label: 'Đồi Móng Ngựa', keywords: ['púng luông', 'móng ngựa', 'sáng nhù'] },
  { id: 'rung-truc', label: 'Rừng trúc Mồ Dề', keywords: ['mồ dề', 'thị trấn mù cang chải', 'kim nọi'] },
  { id: 'lim-mong', label: 'Bản Lìm Mông', keywords: ['cao phạ', 'lìm mông'] },
  { id: 'suoi-khoang-tu-le', label: 'Suối khoáng Tú Lệ', keywords: ['tú lệ'] },
] as const;

const matchesKeywords = (hs: HomestayDto, keywords: readonly string[]) => {
  const hay = `${hs.name || ''} ${hs.district || ''} ${hs.address || ''} ${hs.roomType || ''} ${hs.description || ''}`.toLowerCase();
  return keywords.some(kw => hay.includes(kw));
};

/** ?guests= hợp lệ (1–200, như backend) hoặc undefined. */
const guestsParam = (value: string | null): number | undefined => {
  const count = Number(value);
  return Number.isInteger(count) && count >= 1 && count <= 200 ? count : undefined;
};

export default function HomestayListPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const [homestays, setHomestays] = useState<HomestayDto[]>([]);
  const [allHomestays, setAllHomestays] = useState<HomestayDto[]>([]);
  const [loading, setLoading] = useState(true);
  const firstLoad = useFirstLoad(loading);
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'recommended' | 'price_asc' | 'price_desc'>('recommended');
  const [keywordInput, setKeywordInput] = useState('');
  const [amenityCatalog, setAmenityCatalog] = useState<PublicAmenityItem[]>([]);
  const [selectedAreas, setSelectedAreas] = useState<string[]>([]);
  const [selectedPropertyTypes, setSelectedPropertyTypes] = useState<string[]>([]);
  const [roomCount, setRoomCount] = useState<number>(1);
  const [selectedNearbySpot, setSelectedNearbySpot] = useState<string | null>(null);
  const [nearbyDropdownOpen, setNearbyDropdownOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    fetchHomestayAmenities()
      .then(items => { if (alive) setAmenityCatalog(items); })
      .catch(() => { if (alive) setAmenityCatalog([]); });
    fetchHomestays({ size: 100 })
      .then(res => { if (alive) setAllHomestays(res.content); })
      .catch(() => { if (alive) setAllHomestays([]); });
    return () => { alive = false; };
  }, []);

  const countSource = allHomestays.length > 0 ? allHomestays : homestays;
  const getAmenityCount = (amenity: PublicAmenityItem) => {
    if (typeof amenity.count === 'number') return amenity.count;
    return countSource.filter(hs => hs.amenities?.some(a => a.toLowerCase() === amenity.name.toLowerCase())).length;
  };

  const roomAmenities = amenityCatalog.filter(a => a.scope === 'ROOM');
  const placeAmenities = amenityCatalog.filter(a => a.scope === 'PLACE');
  const quickAmenities = QUICK_AMENITY_ICONS
    .map(([code, Icon]) => ({ item: amenityCatalog.find(a => a.code === code), Icon }))
    .filter((q): q is { item: PublicAmenityItem; Icon: LucideIcon } => q.item !== undefined);

  // Khởi tạo filters từ URL params
  const [filters, setFilters] = useState<HomestayFilterParams>(() => {
    const initialFilters: HomestayFilterParams = {};
    const checkIn = searchParams.get('checkIn');
    const checkOut = searchParams.get('checkOut');
    const minPrice = searchParams.get('minPrice');
    const maxPrice = searchParams.get('maxPrice');
    const amenitiesStr = searchParams.get('amenities');
    const province = searchParams.get('province');
    const district = searchParams.get('district');
    const attractionsStr = searchParams.get('attractions');
    const keywordStr = searchParams.get('keyword');
    const guests = guestsParam(searchParams.get('guests'));

    if (guests) initialFilters.guests = guests;
    if (checkIn) initialFilters.checkIn = checkIn;
    if (checkOut) initialFilters.checkOut = checkOut;
    if (minPrice) initialFilters.minPrice = Number(minPrice);
    if (maxPrice) initialFilters.maxPrice = Number(maxPrice);
    if (amenitiesStr) initialFilters.amenities = amenitiesStr.split(',');
    if (province) initialFilters.province = province;
    if (district) initialFilters.district = district;
    if (attractionsStr) initialFilters.attractions = attractionsStr.split(',');
    if (keywordStr) initialFilters.keyword = keywordStr;

    return initialFilters;
  });

  const [currentPage, setCurrentPage] = useState(() => Number(searchParams.get('page') || '1'));
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);
  // Danh sách homestay yêu thích (lưu tại thiết bị) + chế độ chỉ xem đã lưu (?saved=1)
  const [showSavedOnly, setShowSavedOnly] = useState(() => searchParams.get('saved') === '1');
  const [savedIds, setSavedIds] = useState<string[]>(() => getFavoriteIds());

  useEffect(() => onFavoritesChange(() => setSavedIds(getFavoriteIds())), []);
  useEffect(() => { setShowSavedOnly(searchParams.get('saved') === '1'); }, [searchParams]);

  const [showMap, setShowMap] = useState(false);

  const [totalElements, setTotalElements] = useState(0);
  const [totalPages, setTotalPages] = useState(0);

  const handleFilterChange = (updates: Partial<HomestayFilterParams>) => {
    setFilters(prev => {
      const newFilters = { ...prev, ...updates };
      // Đồng bộ URL params
      const newParams = new URLSearchParams(searchParams);
      if (newFilters.checkIn) newParams.set('checkIn', newFilters.checkIn); else newParams.delete('checkIn');
      if (newFilters.checkOut) newParams.set('checkOut', newFilters.checkOut); else newParams.delete('checkOut');
      if (newFilters.minPrice !== undefined) newParams.set('minPrice', newFilters.minPrice.toString()); else newParams.delete('minPrice');
      if (newFilters.maxPrice !== undefined) newParams.set('maxPrice', newFilters.maxPrice.toString()); else newParams.delete('maxPrice');
      newParams.delete('minRating');
      if (newFilters.amenities && newFilters.amenities.length > 0) newParams.set('amenities', newFilters.amenities.join(',')); else newParams.delete('amenities');
      if (newFilters.province) newParams.set('province', newFilters.province); else newParams.delete('province');
      if (newFilters.district) newParams.set('district', newFilters.district); else newParams.delete('district');
      newParams.delete('ward');
      if (newFilters.attractions && newFilters.attractions.length > 0) newParams.set('attractions', newFilters.attractions.join(',')); else newParams.delete('attractions');
      if (newFilters.keyword) newParams.set('keyword', newFilters.keyword); else newParams.delete('keyword');
      if (newFilters.guests) newParams.set('guests', String(newFilters.guests)); else newParams.delete('guests');
      newParams.delete('guestCount');
      newParams.set('page', '1');

      setSearchParams(newParams, { replace: true });
      return newFilters;
    });
    setCurrentPage(1);
  };

  const handleClearFilters = () => {
    setFilters({});
    setSelectedAreas([]);
    setSelectedPropertyTypes([]);
    setRoomCount(1);
    setSelectedNearbySpot(null);
    setNearbyDropdownOpen(false);
    // Giữ lịch trình đang chọn chỗ ở (không phải bộ lọc).
    const next = new URLSearchParams();
    const forJourney = searchParams.get('forJourney');
    if (forJourney) next.set('forJourney', forJourney);
    setSearchParams(next, { replace: true });
    setCurrentPage(1);
    setError(null);
  };

  const handleSortChange = (value: typeof sortBy) => {
    setSortBy(value);
    setCurrentPage(1);
    const next = new URLSearchParams(searchParams);
    next.set('sort', value);
    next.set('page', '1');
    setSearchParams(next, { replace: true });
  };

  const handlePageChange = (page: number) => {
    const safePage = Math.max(1, Math.min(page, totalPages || 1));
    setCurrentPage(safePage);
    const next = new URLSearchParams(searchParams);
    next.set('page', String(safePage));
    setSearchParams(next, { replace: true });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Đồng bộ lại filters nếu URL thay đổi (nhấn back/forward hoặc từ SearchHub)
  useEffect(() => {
    const checkIn = searchParams.get('checkIn');
    const checkOut = searchParams.get('checkOut');
    const minPrice = searchParams.get('minPrice');
    const maxPrice = searchParams.get('maxPrice');
    const amenitiesStr = searchParams.get('amenities');
    const province = searchParams.get('province');
    const district = searchParams.get('district');
    const attractionsStr = searchParams.get('attractions');
    const keywordStr = searchParams.get('keyword');
    const guests = guestsParam(searchParams.get('guests'));
    const page = Number(searchParams.get('page') || '1');
    const urlSort = searchParams.get('sort') as typeof sortBy | null;

    setFilters({
      checkIn: checkIn || undefined,
      checkOut: checkOut || undefined,
      minPrice: minPrice ? Number(minPrice) : undefined,
      maxPrice: maxPrice ? Number(maxPrice) : undefined,
      amenities: amenitiesStr ? amenitiesStr.split(',') : undefined,
      province: province || undefined,
      district: district || undefined,
      attractions: attractionsStr ? attractionsStr.split(',') : undefined,
      keyword: keywordStr || undefined,
      guests,
    });
    setKeywordInput(keywordStr || '');
    if (Number.isFinite(page) && page > 0) setCurrentPage(page);
    if (urlSort && ['recommended', 'price_asc', 'price_desc'].includes(urlSort)) setSortBy(urlSort);
  }, [searchParams]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchHomestays({ ...filters, page: currentPage - 1, sort: sortBy }).then(data => {
      setHomestays(data.content);
      setTotalElements(data.totalElements);
      setTotalPages(data.totalPages);
    }).catch((err: unknown) => {
      setHomestays([]);
      setTotalElements(0);
      setTotalPages(0);
      setError(err instanceof Error ? err.message : 'Không thể tải danh sách Homestay.');
    }).finally(() => setLoading(false));
  }, [filters, currentPage, sortBy]);

  // Ngày ở + số khách (SearchHub luôn gửi kèm) cũng là bộ lọc thật: danh sách chỉ xếp trước chỗ nghỉ còn phòng, đủ chỗ.
  const hasClientFilters = Boolean(
    selectedAreas.length > 0 || selectedPropertyTypes.length > 0 || roomCount > 1 || selectedNearbySpot
  );
  const hasActiveFilters = Boolean(
    filters.amenities?.length || filters.maxPrice || filters.minPrice || filters.district || (filters.province && filters.province !== 'Lào Cai') || filters.attractions?.length || filters.guests || filters.checkIn || hasClientFilters
  );

  // Mở từ ô "Chỗ ở" của một lịch trình (?forJourney=): dải nhắc, link chi tiết giữ tham số này để đặt xong gắn vào lịch trình.
  const forJourneyParam = searchParams.get('forJourney');
  const journeyContext = useMemo(() => stayContextFor(parseJourneyId(forJourneyParam)), [forJourneyParam]);
  const dismissJourney = () => {
    const next = new URLSearchParams(searchParams);
    next.delete('forJourney');
    setSearchParams(next, { replace: true });
  };

  const baseList = hasClientFilters && allHomestays.length > 0 ? allHomestays : homestays;
  const paginatedHomestays = [...baseList]
    .filter((hs) => !showSavedOnly || savedIds.includes(hs.id))
    .filter((hs) => {
      if (selectedAreas.length > 0) {
        const matched = selectedAreas.some(areaId => {
          const opt = AREA_OPTIONS.find(a => a.id === areaId);
          return opt ? matchesKeywords(hs, opt.keywords) : false;
        });
        if (!matched) return false;
      }
      if (selectedPropertyTypes.length > 0) {
        const matched = selectedPropertyTypes.some(typeId => {
          const opt = PROPERTY_TYPE_OPTIONS.find(t => t.id === typeId);
          return opt ? matchesKeywords(hs, opt.keywords) : false;
        });
        if (!matched) return false;
      }
      if (selectedNearbySpot) {
        const spot = NEARBY_SPOT_OPTIONS.find(s => s.id === selectedNearbySpot);
        if (spot && !matchesKeywords(hs, spot.keywords)) return false;
      }
      return true;
    })
    .sort((a, b) => {
      const score = (item: HomestayDto) =>
        item.operationStatus === 'TEMPORARILY_CLOSED' || item.availableForSelectedDates === false || item.hasOnlineRooms === false ? 1 : 0;
      return score(a) - score(b);
    });
  // Chỉ đánh marker homestay có tọa độ thực từ dữ liệu — không sinh tọa độ giả. useMemo: mảng ổn định giữa các lần vẽ
  // (gõ ô tìm kiếm không làm bản đồ vẽ lại pin / đóng popup).
  const mapMarkers = useMemo(() => homestays
    .filter((hs): hs is HomestayDto & { latitude: number; longitude: number } =>
      typeof hs.latitude === 'number' && typeof hs.longitude === 'number')
    .map(hs => ({
      id: hs.id,
      name: hs.name,
      latitude: hs.latitude,
      longitude: hs.longitude,
      price: hs.price,
      kind: 'HOMESTAY',
      displayMode: 'price' as const,
      coverImageUrl: hs.coverImageUrl,
      district: hs.district,
      url: `/homestays/${hs.id}`,
    })), [homestays]);
  const homestayDetailPath = (id: string) => {
    const query = searchParams.toString();
    return `/homestays/${id}${query ? `?${query}` : ''}`;
  };

  const roomAmenitiesSelectedCount = filters.amenities?.filter(code =>
    roomAmenities.some(ra => ra.code === code)
  ).length || 0;

  const placeAmenitiesSelectedCount = filters.amenities?.filter(code =>
    placeAmenities.some(pa => pa.code === code)
  ).length || 0;

  const renderKeywordSearch = () => (
    <div className="pt-3 mt-3 border-t border-gray-100">
      <h2 className="font-bold text-[var(--color-ink-deep)] mb-3 text-sm flex items-center gap-1.5">
        <Search className="w-4 h-4 text-[var(--color-primary)]" /> Tìm kiếm chỗ nghỉ
      </h2>
      <form
        className="flex flex-col sm:flex-row gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          handleFilterChange({ keyword: keywordInput.trim() || undefined });
        }}
      >
        <div className="relative flex-1">
          <input
            type="text"
            placeholder="Tên, địa chỉ, mô tả..."
            aria-label="Tìm kiếm chỗ nghỉ"
            className="w-full h-11 pl-10 pr-10 text-sm bg-gray-50 border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20 focus:border-[var(--color-primary)] transition-all placeholder-gray-400"
            value={keywordInput}
            onChange={(e) => setKeywordInput(e.target.value)}
          />
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          {keywordInput && (
            <button
              type="button"
              aria-label="Xóa tìm kiếm"
              onClick={() => setKeywordInput('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <Button type="submit" variant="primary" className="h-11 px-5 rounded-md font-bold shrink-0">
          <Search className="w-4 h-4" />
          Tìm kiếm
        </Button>
      </form>
    </div>
  );

  // Bộ lọc mobile mở: Esc đóng panel, khoá cuộn trang nền để overlay phủ toàn màn hình
  useEffect(() => {
    if (!mobileFilterOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileFilterOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = '';
    };
  }, [mobileFilterOpen]);

  const renderFilters = () => (
    <div className="bg-white ring-1 ring-slate-900/[0.06] rounded-2xl overflow-hidden shadow-[0_12px_32px_-18px_rgba(16,40,34,0.25)]">
      <div className="p-4 border-b border-slate-100 bg-gradient-to-r from-emerald-50/80 to-white flex items-center justify-between">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="w-4 h-4 text-[var(--color-primary)]" />
          <h3 className="font-extrabold text-slate-900 text-base">Bộ lọc chỗ nghỉ</h3>
        </div>
        {hasActiveFilters && (
          <button
            onClick={handleClearFilters}
            className="text-xs font-bold text-[var(--color-primary)] hover:text-emerald-800 flex items-center gap-1 transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3 h-3" /> Đặt lại
          </button>
        )}
      </div>

      {/* 0. Tìm kiếm theo tên/địa chỉ */}
      <div className="hidden p-4 border-b border-gray-100 bg-white">
        <h4 className="font-bold text-[var(--color-ink-deep)] mb-3 text-sm flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            <Search className="w-3.5 h-3.5 text-[var(--color-primary)]" /> Tìm kiếm chỗ nghỉ
          </span>
        </h4>
        <div className="relative">
          <input
            type="text"
            placeholder="Tên, địa chỉ, mô tả..."
            className="w-full h-10 pl-9 pr-8 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20 focus:border-[var(--color-primary)] transition-all placeholder-gray-400"
            value={keywordInput}
            onChange={(e) => setKeywordInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleFilterChange({ keyword: keywordInput || undefined });
              }
            }}
          />
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          {keywordInput && (
            <button
              onClick={() => {
                setKeywordInput('');
                handleFilterChange({ keyword: undefined });
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* 0a. Địa điểm / Khu vực */}
      <div className="p-4 border-b border-gray-100">
        <h4 className="font-bold text-[var(--color-ink-deep)] mb-3 text-sm flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5 text-[var(--color-primary)]" /> Địa điểm / Khu vực
          </span>
          {selectedAreas.length > 0 && (
            <span className="text-[10px] bg-[var(--color-primary-50)] text-[var(--color-primary)] px-2 py-0.5 rounded-md font-bold">
              {selectedAreas.length} đã chọn
            </span>
          )}
        </h4>
        <div className="flex flex-col gap-2 max-h-52 overflow-y-auto pr-1">
          {AREA_OPTIONS.map(area => {
            const isChecked = selectedAreas.includes(area.id);
            const count = countSource.filter(hs => matchesKeywords(hs, area.keywords)).length;
            return (
              <label key={area.id} className="flex items-center gap-2.5 cursor-pointer group rounded-lg -mx-1.5 px-1.5 py-1 transition-colors hover:bg-emerald-50/70">
                <input
                  type="checkbox"
                  className="w-4 h-4 rounded-xs border-gray-300 accent-[var(--color-primary)] cursor-pointer"
                  checked={isChecked}
                  onChange={(e) => {
                    setSelectedAreas(prev =>
                      e.target.checked ? [...prev, area.id] : prev.filter(id => id !== area.id)
                    );
                    setCurrentPage(1);
                  }}
                />
                <span className={`text-sm flex-1 transition-colors ${isChecked ? 'font-semibold text-[var(--color-primary)]' : 'text-[var(--color-ink)] group-hover:text-[var(--color-primary)]'}`}>
                  {area.label} <span className="text-xs font-medium text-slate-400">({count})</span>
                </span>
              </label>
            );
          })}
        </div>
      </div>

      {/* 0b. Số khách & Số phòng */}
      <div className="p-4 border-b border-gray-100">
        <h4 className="font-bold text-[var(--color-ink-deep)] mb-3 text-sm flex items-center gap-1.5">
          <Users className="w-3.5 h-3.5 text-[var(--color-primary)]" /> Số khách & Số phòng
        </h4>
        <div className="flex flex-col gap-2.5">
          <Stepper
            label="Số khách"
            value={filters.guests ?? 2}
            min={1}
            max={50}
            onChange={(val) => handleFilterChange({ guests: val > 1 ? val : undefined })}
          />
          <Stepper
            label="Số phòng"
            value={roomCount}
            min={1}
            max={20}
            onChange={(val) => {
              setRoomCount(val);
              setCurrentPage(1);
            }}
          />
        </div>
      </div>

      {/* 0c. Loại hình lưu trú */}
      <div className="p-4 border-b border-gray-100">
        <h4 className="font-bold text-[var(--color-ink-deep)] mb-3 text-sm flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            <Home className="w-3.5 h-3.5 text-[var(--color-primary)]" /> Loại hình lưu trú
          </span>
          {selectedPropertyTypes.length > 0 && (
            <span className="text-[10px] bg-[var(--color-primary-50)] text-[var(--color-primary)] px-2 py-0.5 rounded-md font-bold">
              {selectedPropertyTypes.length} đã chọn
            </span>
          )}
        </h4>
        <div className="flex flex-col gap-2.5">
          {PROPERTY_TYPE_OPTIONS.map(typeOpt => {
            const isChecked = selectedPropertyTypes.includes(typeOpt.id);
            const count = countSource.filter(hs => matchesKeywords(hs, typeOpt.keywords)).length;
            return (
              <label key={typeOpt.id} className="flex items-center gap-2.5 cursor-pointer group rounded-lg -mx-1.5 px-1.5 py-1 transition-colors hover:bg-emerald-50/70">
                <input
                  type="checkbox"
                  className="w-4 h-4 rounded-xs border-gray-300 accent-[var(--color-primary)] cursor-pointer"
                  checked={isChecked}
                  onChange={(e) => {
                    setSelectedPropertyTypes(prev =>
                      e.target.checked ? [...prev, typeOpt.id] : prev.filter(id => id !== typeOpt.id)
                    );
                    setCurrentPage(1);
                  }}
                />
                <span className={`text-sm flex-1 transition-colors ${isChecked ? 'font-semibold text-[var(--color-primary)]' : 'text-[var(--color-ink)] group-hover:text-[var(--color-primary)]'}`}>
                  {typeOpt.label} <span className="text-xs font-medium text-slate-400">({count})</span>
                </span>
              </label>
            );
          })}
        </div>
      </div>

      {/* 1. Tiện nghi phòng ngủ (Room Scope) — chỉ hiện khi có homestay khai báo tiện nghi cấp phòng */}
      {roomAmenities.length > 0 && (
        <div className="p-4 border-b border-gray-100">
          <h4 className="font-bold text-[var(--color-ink-deep)] mb-3 text-sm flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <Wind className="w-3.5 h-3.5 text-[var(--color-primary)]" /> Tiện nghi phòng
            </span>
            {roomAmenitiesSelectedCount > 0 && (
              <span className="text-[10px] bg-[var(--color-primary-50)] text-[var(--color-primary)] px-2 py-0.5 rounded-md font-bold">
                {roomAmenitiesSelectedCount} đã chọn
              </span>
            )}
          </h4>
          <div className="flex flex-col gap-2.5">
            {roomAmenities.map(amenity => {
              const isChecked = filters.amenities?.includes(amenity.code) || false;
              const count = getAmenityCount(amenity);
              return (
                <label key={amenity.code} className="flex items-center gap-2.5 cursor-pointer group rounded-lg -mx-1.5 px-1.5 py-1 transition-colors hover:bg-emerald-50/70">
                  <input
                    type="checkbox"
                    className="w-4 h-4 rounded-xs border-gray-300 accent-[var(--color-primary)] cursor-pointer"
                    checked={isChecked}
                    onChange={(e) => {
                      const currentAmenities = filters.amenities || [];
                      handleFilterChange({
                        amenities: e.target.checked
                          ? [...currentAmenities, amenity.code]
                          : currentAmenities.filter(a => a !== amenity.code)
                      });
                    }}
                  />
                  <span className={`text-sm flex-1 transition-colors ${isChecked ? 'font-semibold text-[var(--color-primary)]' : 'text-[var(--color-ink)] group-hover:text-[var(--color-primary)]'}`}>
                    {amenity.name} <span className="text-xs font-medium text-slate-400">({count})</span>
                  </span>
                  <span className="text-[10px] uppercase font-bold text-[var(--color-muted)] bg-gray-100 px-1.5 py-0.5 rounded">
                    Phòng
                  </span>
                </label>
              );
            })}
          </div>
        </div>
      )}

      {/* 2. Tiện nghi & Dịch vụ Homestay (Place Scope) */}
      <div className="p-4 border-b border-gray-100">
        <h4 className="font-bold text-[var(--color-ink-deep)] mb-3 text-sm flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            <Flame className="w-3.5 h-3.5 text-[var(--color-coral)]" /> Dịch vụ & Cơ sở vật chất
          </span>
          {placeAmenitiesSelectedCount > 0 && (
            <span className="text-[10px] bg-[var(--color-primary-50)] text-[var(--color-primary)] px-2 py-0.5 rounded-md font-bold">
              {placeAmenitiesSelectedCount} đã chọn
            </span>
          )}
        </h4>
        <div className="flex flex-col gap-2.5">
          {placeAmenities.length === 0 && (
            <p className="text-xs text-[var(--color-muted)]">Chưa tải được danh mục tiện ích.</p>
          )}
          {placeAmenities.map(amenity => {
            const isChecked = filters.amenities?.includes(amenity.code) || false;
            const count = getAmenityCount(amenity);
            return (
              <label key={amenity.code} className="flex items-center gap-2.5 cursor-pointer group rounded-lg -mx-1.5 px-1.5 py-1 transition-colors hover:bg-emerald-50/70">
                <input
                  type="checkbox"
                  className="w-4 h-4 rounded-xs border-gray-300 accent-[var(--color-primary)] cursor-pointer"
                  checked={isChecked}
                  onChange={(e) => {
                    const currentAmenities = filters.amenities || [];
                    handleFilterChange({
                      amenities: e.target.checked
                        ? [...currentAmenities, amenity.code]
                        : currentAmenities.filter(a => a !== amenity.code)
                    });
                  }}
                />
                <span className={`text-sm flex-1 transition-colors ${isChecked ? 'font-semibold text-[var(--color-primary)]' : 'text-[var(--color-ink)] group-hover:text-[var(--color-primary)]'}`}>
                  {amenity.name} <span className="text-xs font-medium text-slate-400">({count})</span>
                </span>
              </label>
            );
          })}
        </div>
      </div>

      {/* 3. Ngân sách mỗi đêm */}
      <div className="p-4 bg-gradient-to-b from-white to-gray-50/40">
        <div className="flex items-center justify-between mb-2">
          <h4 className="font-bold text-[var(--color-ink-deep)] text-sm">Ngân sách (mỗi đêm)</h4>
          {(filters.minPrice || filters.maxPrice) && (
            <button
              onClick={() => handleFilterChange({ minPrice: undefined, maxPrice: undefined })}
              className="text-[11px] text-[var(--color-muted)] hover:text-[var(--color-coral)] transition-colors"
            >
              Mặc định
            </button>
          )}
        </div>
        <PriceSlider
          min={200000}
          max={4000000}
          step={100000}
          value={[filters.minPrice ?? 200000, filters.maxPrice ?? 4000000]}
          onChange={() => { }}
          onChangeEnd={([min, max]) => handleFilterChange({
            minPrice: min > 200000 ? min : undefined,
            maxPrice: max < 4000000 ? max : undefined
          })}
        />
      </div>
    </div>
  );

  return (
    <div className="relative isolate w-full flex flex-col min-h-screen overflow-x-clip bg-[linear-gradient(180deg,var(--color-canvas)_0%,#f1faf6_45%,#fbf7ee_100%)]">
      <div aria-hidden="true" className="pointer-events-none absolute right-[-120px] top-[520px] h-[380px] w-[380px] rounded-full bg-emerald-300/20 blur-3xl" />
      <div aria-hidden="true" className="pointer-events-none absolute left-[-140px] top-[1100px] h-[420px] w-[420px] rounded-full bg-amber-200/25 blur-3xl" />
      {/* Họa tiết nét mảnh như trang chủ, phủ phần dưới hero (hero nằm trên lớp này) */}
      <HomeMotifs variant="stay" className="inset-x-0 bottom-0 top-[460px] md:top-[360px]" />
      {/* Hero Section — ảnh thật thị trấn Mù Cang Chải mùa lúa chín (Khoitran1957, CC BY-SA 4.0 — xem /nguon-anh), đóng gói cùng app */}
      <section className="relative w-full min-h-[460px] md:min-h-[360px] flex items-start md:items-center justify-center pt-[calc(106px+var(--safe-top))] md:pt-[calc(86px+var(--safe-top))] pb-8 md:pb-6">
        <div
          className="absolute inset-0 z-0 bg-cover bg-center bg-[#0f2d3c]"
          style={{ backgroundImage: `url(${heroListBg})` }}
        >
          {/* Overlay chàm indigo — sắc vải thổ cẩm Tây Bắc */}
          <div className="absolute inset-0 bg-gradient-to-b from-[#1d2d4f]/85 via-[#16524a]/45 to-transparent"></div>
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(251,191,36,0.22),transparent_55%)]"></div>
        </div>

        <div className="relative z-10 w-full max-w-5xl mx-auto px-4">
          <SearchHub />
        </div>
      </section>

      {/* Main Container */}
      <div className="max-w-[1280px] mx-auto w-full px-4 md:px-8 pt-4 pb-8">
        {/* Tìm kiếm tách riêng khỏi bộ lọc chi tiết */}
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-xs md:text-sm text-[var(--color-muted)] mb-3">
          <Link to="/" className="hover:text-[var(--color-primary)] transition-colors">Trang chủ</Link>
          <span>/</span>
          <span className="text-[var(--color-ink-deep)] font-semibold">Homestay & Chỗ nghỉ</span>
        </div>

        {journeyContext && <JourneyContextBanner context={journeyContext} onDismiss={dismissJourney} className="mb-4" />}

        {/* Tiêu đề trang kiểu editorial — dẫn dắt trước khi vào bộ lọc */}
        <div className="mb-5">
          <h1 className="text-2xl md:text-3xl lg:text-[36px] font-extrabold tracking-tight bg-gradient-to-r from-[#0a2e26] via-[#052620] to-[#d97706] bg-clip-text text-transparent">
            Chốn nghỉ giữa ruộng bậc thang
          </h1>
        </div>

        <div className="hidden" aria-hidden="true">
          <span className="text-[var(--color-ink-deep)] font-semibold">Homestay & Chỗ nghỉ</span>
        </div>

        {firstLoad ? (
          <ToolbarSkeleton {...SKELETON.toolbar} />
        ) : (<>
          {/* BỘ LỌC BÊN TRÊN HIỆN ĐẠI (Top Filter Toolbar & Quick Filter Bar) */}
          <div className="relative overflow-hidden bg-white/90 backdrop-blur-md border border-white ring-1 ring-slate-900/[0.06] rounded-2xl p-4 md:p-5 shadow-[0_12px_32px_-18px_rgba(16,40,34,0.28)] mb-6 transition-shadow duration-500 hover:shadow-[0_18px_40px_-18px_rgba(16,40,34,0.34)]">
            <div aria-hidden="true" className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-emerald-500 via-teal-400 to-amber-400" />
            {/* Row 1: Header + Count + Sort & Map View */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3.5 border-b border-slate-100">
              <div>
                <h2 className="text-base md:text-lg font-extrabold text-slate-900 flex items-center gap-2">
                  Bộ lọc & Sắp xếp
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-gradient-to-r from-emerald-50 to-teal-50 text-emerald-800 border border-emerald-200/60 shadow-2xs">
                    {totalElements} chỗ nghỉ
                  </span>
                </h2>
              </div>

              <div className="flex items-center gap-2.5 shrink-0">
                {/* Sort Selector */}
                <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 hover:border-slate-300 transition-colors">
                  <ArrowUpDown className="w-3.5 h-3.5 text-[var(--color-primary)]" />
                  <span className="text-xs text-slate-500 font-medium hidden md:inline">Sắp xếp:</span>
                  <select
                    value={sortBy}
                    onChange={(e) => handleSortChange(e.target.value as typeof sortBy)}
                    className="bg-transparent text-xs md:text-sm font-bold text-slate-800 focus:outline-none cursor-pointer"
                  >
                    <option value="recommended">Gợi ý hàng đầu</option>
                    <option value="price_asc">Giá: Thấp đến Cao</option>
                    <option value="price_desc">Giá: Cao đến Thấp</option>
                  </select>
                </div>

                {/* Map Button (VietMap) */}
                <button
                  onClick={() => setShowMap(!showMap)}
                  className={`flex items-center gap-1.5 px-3.5 py-2 text-xs md:text-sm font-bold rounded-xl border transition-all shadow-2xs active:scale-95 cursor-pointer ${showMap
                    ? 'border-[#052620] bg-[#052620] text-white shadow-xs'
                    : 'border-emerald-600/30 bg-emerald-50 text-[var(--color-primary)] hover:bg-[var(--color-primary)] hover:text-white'
                    }`}
                  title="Bật/Tắt chế độ xem bản đồ VietMap"
                >
                  <Map className="w-3.5 h-3.5" />
                  <span>{showMap ? 'Ẩn bản đồ' : 'Bản đồ VietMap'}</span>
                </button>
              </div>
            </div>

            {/* Row 2: Thanh lọc nhanh (1-click quick filter buttons) */}
            <div className="flex items-center gap-2 pt-3.5 overflow-x-auto scrollbar-hide pb-1">
              <span className="text-xs font-extrabold text-slate-500 uppercase tracking-wider shrink-0 flex items-center gap-1 mr-1">
                <Sparkles className="w-3.5 h-3.5 text-amber-500" /> Lọc nhanh:
              </span>

              {quickAmenities.map(({ item, Icon }) => {
                const active = filters.amenities?.includes(item.code) ?? false;
                return (
                  <button
                    key={item.code}
                    onClick={() => {
                      const current = filters.amenities || [];
                      handleFilterChange({
                        amenities: active ? current.filter(a => a !== item.code) : [...current, item.code]
                      });
                    }}
                    className={`shrink-0 flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold border transition-all duration-300 active:scale-95 cursor-pointer ${active
                      ? 'bg-gradient-to-r from-emerald-600 to-teal-500 text-white border-transparent shadow-md shadow-emerald-600/25'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:-translate-y-0.5 hover:border-emerald-300 hover:bg-white hover:text-emerald-800 hover:shadow-md'
                      }`}
                  >
                    <Icon className="w-3.5 h-3.5" /> {item.code === 'BBQ_AREA' ? 'Có BBQ' : item.name}
                  </button>
                );
              })}

              {!quickAmenities.some(q => q.item.code === 'BBQ_AREA') && (
                <button
                  onClick={() => {
                    const current = filters.amenities || [];
                    const active = current.includes('BBQ_AREA');
                    handleFilterChange({
                      amenities: active ? current.filter(a => a !== 'BBQ_AREA') : [...current, 'BBQ_AREA']
                    });
                  }}
                  className={`shrink-0 flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold border transition-all duration-300 active:scale-95 cursor-pointer ${filters.amenities?.includes('BBQ_AREA')
                    ? 'bg-gradient-to-r from-emerald-600 to-teal-500 text-white border-transparent shadow-md shadow-emerald-600/25'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:-translate-y-0.5 hover:border-emerald-300 hover:bg-white hover:text-emerald-800 hover:shadow-md'
                    }`}
                >
                  <Flame className="w-3.5 h-3.5" /> Có BBQ
                </button>
              )}

              {/* Quick filter: Gần địa điểm … */}
              <button
                type="button"
                onClick={() => setNearbyDropdownOpen(v => !v)}
                className={`shrink-0 flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold border transition-all duration-300 active:scale-95 cursor-pointer ${selectedNearbySpot
                  ? 'bg-gradient-to-r from-emerald-600 to-teal-500 text-white border-transparent shadow-md shadow-emerald-600/25'
                  : 'bg-slate-50 text-slate-700 border-slate-200 hover:-translate-y-0.5 hover:border-emerald-300 hover:bg-white hover:text-emerald-800 hover:shadow-md'
                  }`}
              >
                <MapPin className="w-3.5 h-3.5" />
                {selectedNearbySpot
                  ? `Gần: ${NEARBY_SPOT_OPTIONS.find(s => s.id === selectedNearbySpot)?.label}`
                  : 'Gần địa điểm …'}
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${nearbyDropdownOpen ? 'rotate-180' : ''}`} />
              </button>

              {/* Quick Budget < 500k */}
              <button
                onClick={() => {
                  const isUnder500k = filters.maxPrice === 500000 && !filters.minPrice;
                  handleFilterChange({
                    minPrice: undefined,
                    maxPrice: isUnder500k ? undefined : 500000
                  });
                }}
                className={`shrink-0 flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold border transition-all duration-300 active:scale-95 cursor-pointer ${filters.maxPrice === 500000 && !filters.minPrice
                  ? 'bg-gradient-to-r from-amber-500 to-orange-400 text-white border-transparent shadow-md shadow-amber-500/25'
                  : 'bg-slate-50 text-slate-700 border-slate-200 hover:-translate-y-0.5 hover:border-amber-300 hover:bg-white hover:text-amber-700 hover:shadow-md'
                  }`}
              >
                Dưới 500k / đêm
              </button>

              {/* Chỉ xem homestay đã lưu trên thiết bị này */}
              {savedIds.length > 0 && (
                <button
                  onClick={() => setShowSavedOnly((v) => !v)}
                  className={`shrink-0 flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold border transition-all duration-300 active:scale-95 cursor-pointer ${showSavedOnly
                    ? 'bg-rose-600 text-white border-rose-600 shadow-2xs'
                    : 'bg-slate-50 text-rose-700 border-rose-200 hover:border-rose-300 hover:bg-white'
                    }`}
                >
                  <Heart className={`w-3.5 h-3.5 ${showSavedOnly ? 'fill-white' : 'fill-rose-600 text-rose-600'}`} />
                  Đã lưu ({savedIds.length})
                </button>
              )}
            </div>

            {nearbyDropdownOpen && (
              <div className="mt-2.5 flex flex-wrap items-center gap-2 rounded-xl bg-emerald-50/70 p-2.5 border border-emerald-200/70">
                <span className="text-xs font-bold text-emerald-900 mr-1 flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 text-[var(--color-primary)]" /> Chọn điểm tham quan gần chỗ nghỉ:
                </span>
                {NEARBY_SPOT_OPTIONS.map(spot => {
                  const active = selectedNearbySpot === spot.id;
                  const count = countSource.filter(hs => matchesKeywords(hs, spot.keywords)).length;
                  return (
                    <button
                      key={spot.id}
                      type="button"
                      onClick={() => {
                        setSelectedNearbySpot(active ? null : spot.id);
                        setNearbyDropdownOpen(false);
                        setCurrentPage(1);
                      }}
                      className={`px-3 py-1 rounded-full text-xs font-bold border transition-all cursor-pointer ${active
                          ? 'bg-[var(--color-primary)] text-white border-transparent shadow-xs'
                          : 'bg-white text-slate-700 border-slate-200 hover:border-emerald-300 hover:text-[var(--color-primary)]'
                        }`}
                    >
                      {spot.label} ({count})
                    </button>
                  );
                })}
                {selectedNearbySpot && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedNearbySpot(null);
                      setNearbyDropdownOpen(false);
                    }}
                    className="px-2.5 py-1 rounded-full text-xs font-semibold text-rose-600 hover:bg-rose-50 cursor-pointer"
                  >
                    Bỏ chọn
                  </button>
                )}
              </div>
            )}

            {/* Thanh tìm kiếm nằm ngay dưới các bộ lọc nhanh */}
            {renderKeywordSearch()}

            {/* Row 3: Active Filters Tags (Khi có bộ lọc đang chạy) */}
            {hasActiveFilters && (
              <div className="flex flex-wrap items-center gap-2 pt-3.5 mt-3 border-t border-slate-100">
                <span className="text-xs font-bold text-slate-500 mr-1">
                  Đang áp dụng:
                </span>

                {filters.province && filters.province !== 'Lào Cai' && (
                  <button
                    onClick={() => handleFilterChange({ province: undefined })}
                    className="shrink-0 flex items-center gap-1.5 px-3 py-1 rounded-full border border-emerald-200 bg-emerald-50 text-emerald-800 text-xs font-bold shadow-2xs transition-all hover:bg-emerald-100 cursor-pointer"
                  >
                    <MapPin className="w-3 h-3 text-[var(--color-primary)]" />
                    Tỉnh: {filters.province} <X className="w-3 h-3 text-[var(--color-primary)]" />
                  </button>
                )}

                {filters.district && (
                  <button
                    onClick={() => handleFilterChange({ district: undefined })}
                    className="shrink-0 flex items-center gap-1.5 px-3 py-1 rounded-full border border-emerald-200 bg-emerald-50 text-emerald-800 text-xs font-bold shadow-2xs transition-all hover:bg-emerald-100 cursor-pointer"
                  >
                    <MapPin className="w-3 h-3 text-[var(--color-primary)]" />
                    Huyện: {filters.district} <X className="w-3 h-3 text-[var(--color-primary)]" />
                  </button>
                )}

                {filters.attractions && filters.attractions.length > 0 && (
                  <button
                    onClick={() => handleFilterChange({ attractions: undefined })}
                    className="shrink-0 flex items-center gap-1.5 px-3 py-1 rounded-full border border-amber-300 bg-amber-50 text-amber-900 text-xs font-bold shadow-2xs transition-all hover:bg-amber-100 cursor-pointer"
                  >
                    <Sparkles className="w-3 h-3 text-amber-500" />
                    {filters.attractions.length} điểm du lịch <X className="w-3 h-3 text-amber-800" />
                  </button>
                )}

                {filters.guests && (
                  <button
                    onClick={() => handleFilterChange({ guests: undefined })}
                    className="shrink-0 flex items-center gap-1.5 px-3 py-1 rounded-full border border-emerald-200 bg-emerald-50 text-emerald-800 text-xs font-bold shadow-2xs transition-all hover:bg-emerald-100 cursor-pointer"
                  >
                    <Users className="w-3 h-3 text-[var(--color-primary)]" />
                    Đủ chỗ {filters.guests} khách <X className="w-3 h-3 text-[var(--color-primary)]" />
                  </button>
                )}

                {/* Bỏ ngày thì bỏ cả ngày đi lẫn ngày về (không để sót một đầu trên đường dẫn sang trang chi tiết) */}
                {filters.checkIn && (
                  <button
                    onClick={() => handleFilterChange({ checkIn: undefined, checkOut: undefined })}
                    className="shrink-0 flex items-center gap-1.5 px-3 py-1 rounded-full border border-teal-200 bg-teal-50 text-teal-800 text-xs font-bold tabular-nums shadow-2xs transition-all hover:bg-teal-100 cursor-pointer"
                  >
                    Ngày ở: {formatVnDate(filters.checkIn)}{filters.checkOut ? ` → ${formatVnDate(filters.checkOut)}` : ''} <X className="w-3 h-3 text-teal-700" />
                  </button>
                )}

                {filters.amenities?.map(amenityCode => {
                  const item = amenityCatalog.find(a => a.code === amenityCode);
                  const name = item ? `${item.name}${item.scope === 'ROOM' ? ' (Phòng)' : ''}` : amenityCode;
                  return (
                    <button
                      key={amenityCode}
                      onClick={() => handleFilterChange({ amenities: filters.amenities?.filter(a => a !== amenityCode) })}
                      className="shrink-0 flex items-center gap-1.5 px-3 py-1 rounded-full border border-emerald-200 bg-emerald-50 text-emerald-800 text-xs font-bold shadow-2xs transition-all hover:bg-emerald-100 cursor-pointer"
                    >
                      {name} <X className="w-3 h-3 text-[var(--color-primary)]" />
                    </button>
                  );
                })}

                {(filters.minPrice || filters.maxPrice) && (
                  <button
                    onClick={() => handleFilterChange({ minPrice: undefined, maxPrice: undefined })}
                    className="shrink-0 flex items-center gap-1.5 px-3 py-1 rounded-full border border-emerald-200 bg-emerald-50 text-emerald-800 text-xs font-bold shadow-2xs transition-all hover:bg-emerald-100 cursor-pointer"
                  >
                    {filters.minPrice ? `Từ ${filters.minPrice.toLocaleString('vi-VN')}đ` : ''}
                    {filters.minPrice && filters.maxPrice ? ' - ' : ''}
                    {filters.maxPrice ? `Đến ${filters.maxPrice.toLocaleString('vi-VN')}đ` : ''}
                    <X className="w-3 h-3 text-[var(--color-primary)]" />
                  </button>
                )}

                <button
                  onClick={handleClearFilters}
                  className="shrink-0 flex items-center gap-1.5 px-3.5 py-1 rounded-full border border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100 text-xs font-bold transition-all shadow-2xs cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" /> Xóa tất cả bộ lọc
                </button>
              </div>
            )}
          </div>

        </>)}
        {/* Main Content Layout with Sidebar */}
        <div className="w-full flex flex-col gap-6 md:flex-row md:items-stretch">
          {/* Mobile Filter Button */}
          <div className="flex md:hidden mb-2">
            <button
              onClick={() => setMobileFilterOpen(true)}
              className="flex w-full items-center justify-center gap-2 bg-white h-11 rounded-xl shadow-xs border border-emerald-600/30 text-sm font-bold text-[var(--color-primary)] active:scale-98 cursor-pointer"
            >
              <SlidersHorizontal className="w-4 h-4" /> Lọc kết quả homestay
            </button>
          </div>

          {/* Mobile Filter Modal — overlay phủ toàn màn hình phía sau panel; bấm vùng trống (ngoài panel) hoặc Esc để đóng */}
          {mobileFilterOpen && createPortal(
            <div
              className="fixed inset-0 z-[99999] bg-black/50 backdrop-blur-xs md:hidden flex justify-end"
              onClick={() => setMobileFilterOpen(false)}
              onKeyDown={(e) => { if (e.key === 'Escape') setMobileFilterOpen(false); }}
              role="presentation"
            >
              <div
                className="w-[85%] max-w-[320px] h-dvh max-h-dvh bg-white flex flex-col shadow-2xl rounded-l-3xl overflow-hidden pt-[var(--safe-top)] pb-[var(--safe-bottom)]"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/80 z-10 shrink-0">
                  <h3 className="font-extrabold text-slate-900 text-base">Lọc homestay</h3>
                  <button onClick={() => setMobileFilterOpen(false)} className="p-2 -mr-1 text-slate-400 hover:text-slate-800 rounded-lg hover:bg-slate-200/50 cursor-pointer">
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <div className="flex-1 min-h-0 overflow-y-auto p-2">
                  {renderFilters()}
                </div>
                <div className="p-4 border-t border-slate-100 bg-white pb-safe shrink-0">
                  <Button variant="primary" className="w-full h-11 rounded-xl font-bold shadow-xs active:scale-95" onClick={() => setMobileFilterOpen(false)}>
                    Xem {totalElements} kết quả
                  </Button>
                </div>
              </div>
            </div>
            , document.body)}

          {/* Sidebar (Desktop) */}
          <aside className="hidden w-[300px] shrink-0 flex-col gap-4 md:flex">
            <div className="sticky top-24">{firstLoad ? <FilterPanelSkeleton {...SKELETON.filter} /> : renderFilters()}</div>
          </aside>

          {/* Main List */}
          <div className="flex min-h-0 flex-1 flex-col gap-4">
            {/* VietMap Interactive Viewer */}
            {showMap && (
              <div className="bg-white rounded-lg border border-gray-200 overflow-hidden shadow-xs mb-2 animate-in fade-in duration-300">
                <div className="px-4 py-2.5 bg-[#edfbf7] border-b border-gray-200 flex items-center justify-between">
                  <span className="text-xs font-bold text-[#052620] flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5" /> Bản đồ vị trí homestay (Nguồn: VietMap)
                  </span>
                  <button
                    onClick={() => setShowMap(false)}
                    className="text-xs text-gray-500 hover:text-gray-800 font-semibold cursor-pointer"
                  >
                    ✕ Đóng bản đồ
                  </button>
                </div>
                <div className="h-[360px] w-full">
                  <VietmapView
                    className="h-full w-full"
                    mapClassName="min-h-0"
                    centerLat={mapMarkers[0]?.latitude ?? 21.85}
                    centerLng={mapMarkers[0]?.longitude ?? 104.08}
                    zoomLevel={12}
                    scrollWheelZoom={false}
                    markers={mapMarkers}
                  />
                </div>
              </div>
            )}

            <div className="relative flex min-h-0 flex-1 flex-col gap-4 md:min-h-full">
              {loading ? (
                <CardSkeleton count={SKELETON.count} layout="compact" />
              ) : error ? (
                <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center">
                  <p className="font-semibold text-red-700">{error}</p>
                  <button
                    type="button"
                    onClick={() => {
                      setError(null);
                      setLoading(true);
                      void fetchHomestays({ ...filters, page: currentPage - 1, sort: sortBy }).then((data) => {
                        setHomestays(data.content);
                        setTotalElements(data.totalElements);
                        setTotalPages(data.totalPages);
                      }).catch((err: unknown) => setError(err instanceof Error ? err.message : 'Không thể tải danh sách Homestay.')).finally(() => setLoading(false));
                    }}
                    className="mt-3 rounded-md cta cta-primary px-4 py-2 text-sm font-bold text-white "
                  >
                    Thử lại
                  </button>
                </div>
              ) : showSavedOnly && paginatedHomestays.length === 0 ? (
                <div className="bg-white p-8 text-center rounded-lg border border-gray-200 shadow-xs">
                  <Heart className="mx-auto mb-2 h-9 w-9 text-rose-300" />
                  <p className="text-gray-500 font-medium">Chưa có homestay nào được lưu trên thiết bị này.</p>
                  <button
                    onClick={() => setShowSavedOnly(false)}
                    className="mt-3 text-xs font-semibold text-[var(--color-primary)] hover:underline cursor-pointer"
                  >
                    Xem tất cả homestay &rarr;
                  </button>
                </div>
              ) : paginatedHomestays.length === 0 ? (
                <div className="bg-white p-8 text-center rounded-lg border border-gray-200 shadow-xs">
                  <p className="text-gray-500 font-medium">Không tìm thấy homestay nào phù hợp với bộ lọc đã chọn.</p>
                  <button
                    onClick={handleClearFilters}
                    className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 bg-[var(--color-primary-50)] text-[var(--color-primary)] font-bold text-xs rounded-md border border-[var(--color-primary)] hover:bg-[var(--color-primary-100)] transition-colors cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" /> Bỏ tất cả bộ lọc
                  </button>
                </div>
              ) : (
                // Điện thoại: lưới 2 cột cuộn dọc; từ md: lưới cạnh bộ lọc.
                <FramerSwipeCardStack gridClassName={COMPACT_GRID_WITH_SIDEBAR_COLS} mobileVerticalClassName="grid grid-cols-2 gap-3" label="Homestay & chỗ nghỉ">
                  {paginatedHomestays.map((hs, index) => {
                    return (
                      <Reveal key={hs.id} delay={(index % 3) * 80} className="h-full" offset={28}>
                        <CompactPlaceCard
                          to={homestayDetailPath(hs.id)}
                          name={hs.name}
                          imageUrl={hs.coverImageUrl}
                          location={hs.district || 'Lào Cai'}
                          price={formatVnd(hs.price, 'Liên hệ')}
                          priceUnit={hs.price ? 'đêm' : null}
                          amenities={hs.amenities ?? []}
                          ctaText="Khám phá ngay"
                          // Khách sắp mở chi tiết: tải trước (ưu tiên thấp) để bấm vào là hiện ngay.
                          onIntent={() => prefetchHomestay(hs.id)}
                          notice={hs.operationStatus === 'TEMPORARILY_CLOSED' ? (
                            <span className="text-[11px] font-bold text-amber-300">Tạm ngừng nhận đặt phòng</span>
                          ) : hs.availableForSelectedDates === false ? (
                            <span className="text-[11px] font-bold text-slate-300">Hết phòng ngày đã chọn</span>
                          ) : undefined}
                        />
                      </Reveal>
                    );
                  })}
                </FramerSwipeCardStack>
              )}

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex justify-center items-center gap-2 mt-6 mb-4">
                  <button
                    disabled={currentPage === 1}
                    onClick={() => handlePageChange(currentPage - 1)}
                    className="w-10 h-10 flex items-center justify-center rounded-xl border border-slate-200 disabled:opacity-40 disabled:cursor-not-allowed hover:border-emerald-300 hover:bg-emerald-50 hover:-translate-y-0.5 hover:shadow-md active:scale-95 transition-all duration-300 bg-white text-xs cursor-pointer"
                  >
                    <ChevronLeft className="w-4 h-4 text-[var(--color-ink-deep)]" />
                  </button>

                  <div className="flex items-center gap-1">
                    {[...Array(totalPages)].map((_, i) => (
                      <button
                        key={i}
                        onClick={() => handlePageChange(i + 1)}
                        className={`w-10 h-10 rounded-xl font-bold text-xs transition-all duration-300 cursor-pointer active:scale-95 ${currentPage === i + 1
                          ? 'bg-gradient-to-br from-emerald-600 to-teal-500 text-white shadow-md shadow-emerald-600/30'
                          : 'text-[var(--color-ink-deep)] hover:bg-emerald-50 hover:border-emerald-300 hover:-translate-y-0.5 bg-white border border-slate-200'
                          }`}
                      >
                        {i + 1}
                      </button>
                    ))}
                  </div>

                  <button
                    disabled={currentPage === totalPages}
                    onClick={() => handlePageChange(currentPage + 1)}
                    className="w-10 h-10 flex items-center justify-center rounded-xl border border-slate-200 disabled:opacity-40 disabled:cursor-not-allowed hover:border-emerald-300 hover:bg-emerald-50 hover:-translate-y-0.5 hover:shadow-md active:scale-95 transition-all duration-300 bg-white text-xs cursor-pointer"
                  >
                    <ChevronRight className="w-4 h-4 text-[var(--color-ink-deep)]" />
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
