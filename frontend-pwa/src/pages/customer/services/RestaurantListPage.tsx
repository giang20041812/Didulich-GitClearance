import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Link, useSearchParams } from 'react-router-dom';
import { fetchRestaurants, RestaurantDto, RestaurantFilterParams } from '@/services/restaurantService';
import { PriceSlider } from '@/components/ui/price-slider';
import { Button } from '@/components/ui/button';
import { CardSkeleton } from '@/components/ui/CardSkeleton';
import Reveal from '@/components/ui/Reveal';
import HomeMotifs from '@/components/home/HomeMotifs';
import CompactPlaceCard from '@/components/ui/CompactPlaceCard';
import { COMPACT_GRID_WITH_SIDEBAR, formatVnd } from '@/lib/compactCard';
import {
  SlidersHorizontal,
  ChevronLeft,
  ChevronRight,
  X,
  ArrowUpDown,
  RotateCcw,
  Map,
  Sparkles,
  UtensilsCrossed,
  Wifi,
  Car,
  Home
} from 'lucide-react';
import bannerRestaurants from '@/assets/photos/banner-restaurants.webp';
import { ToolbarSkeleton, FilterPanelSkeleton, LIST_SKELETON_SPECS } from '@/components/ui/ListPageSkeleton';
import { useFirstLoad } from '@/hooks/useFirstLoad';

const SKELETON = LIST_SKELETON_SPECS.restaurants;

const CUISINE_CATEGORIES = [
  'Đặc sản Tây Bắc',
  'Thắng cố & Thịt ngựa',
  'Cơm bản & Lẩu nướng',
  'Ẩm thực nhà sàn Thái',
  'Gà đồi & Lợn bản'
];

const RESTAURANT_AMENITIES = [
  { code: 'PARKING', name: 'Bãi đỗ xe ô tô', icon: Car },
  { code: 'STILT_HOUSE', name: 'Không gian nhà sàn', icon: Home },
  { code: 'WIFI', name: 'Wifi miễn phí', icon: Wifi },
  { code: 'PRIVATE_ROOM', name: 'Phòng tiệc riêng', icon: UtensilsCrossed },
];



export default function RestaurantListPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const [restaurants, setRestaurants] = useState<RestaurantDto[]>([]);
  const [loading, setLoading] = useState(true);
  const firstLoad = useFirstLoad(loading);
  const [sortBy, setSortBy] = useState<'recommended' | 'price_asc' | 'price_desc'>('recommended');

  // Khởi tạo filters từ URL params
  const [filters, setFilters] = useState<RestaurantFilterParams>(() => {
    const initialFilters: RestaurantFilterParams = {};
    const q = searchParams.get('q');
    const minPrice = searchParams.get('minPrice');
    const maxPrice = searchParams.get('maxPrice');
    const cuisinesStr = searchParams.get('cuisines');
    const amenitiesStr = searchParams.get('amenities');

    if (q) initialFilters.keyword = q;
    if (minPrice) initialFilters.minPrice = Number(minPrice);
    if (maxPrice) initialFilters.maxPrice = Number(maxPrice);
    if (cuisinesStr) initialFilters.cuisineTypes = cuisinesStr.split(',');
    if (amenitiesStr) initialFilters.amenities = amenitiesStr.split(',');

    return initialFilters;
  });

  const [currentPage, setCurrentPage] = useState(1);
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);

  const ITEMS_PER_PAGE = 8;

  const handleFilterChange = (updates: Partial<RestaurantFilterParams>) => {
    setFilters(prev => {
      const newFilters = { ...prev, ...updates };
      // Đồng bộ URL params
      const newParams = new URLSearchParams(searchParams);
      if (newFilters.keyword) newParams.set('q', newFilters.keyword); else newParams.delete('q');
      if (newFilters.minPrice !== undefined) newParams.set('minPrice', newFilters.minPrice.toString()); else newParams.delete('minPrice');
      if (newFilters.maxPrice !== undefined) newParams.set('maxPrice', newFilters.maxPrice.toString()); else newParams.delete('maxPrice');
      newParams.delete('minRating');
      if (newFilters.cuisineTypes && newFilters.cuisineTypes.length > 0) newParams.set('cuisines', newFilters.cuisineTypes.join(',')); else newParams.delete('cuisines');
      if (newFilters.amenities && newFilters.amenities.length > 0) newParams.set('amenities', newFilters.amenities.join(',')); else newParams.delete('amenities');

      setSearchParams(newParams, { replace: true });
      return newFilters;
    });
    setCurrentPage(1);
  };

  const handleClearFilters = () => {
    setFilters({});
    setSearchParams(new URLSearchParams(), { replace: true });
    setCurrentPage(1);
  };

  // Đồng bộ lại filters nếu URL thay đổi (nhấn back/forward)
  useEffect(() => {
    const q = searchParams.get('q');
    const minPrice = searchParams.get('minPrice');
    const maxPrice = searchParams.get('maxPrice');
    const cuisinesStr = searchParams.get('cuisines');
    const amenitiesStr = searchParams.get('amenities');

    setFilters({
      keyword: q || undefined,
      minPrice: minPrice ? Number(minPrice) : undefined,
      maxPrice: maxPrice ? Number(maxPrice) : undefined,
      cuisineTypes: cuisinesStr ? cuisinesStr.split(',') : undefined,
      amenities: amenitiesStr ? amenitiesStr.split(',') : undefined,
    });
  }, [searchParams]);

  useEffect(() => {
    setLoading(true);
    fetchRestaurants(filters).then(data => {
      setRestaurants(data);
      setLoading(false);
    }).catch(err => {
      console.error(err);
      setLoading(false);
    });
  }, [filters]);

  const hasActiveFilters = Boolean(
    filters.keyword || filters.cuisineTypes?.length || filters.amenities?.length || filters.maxPrice || filters.minPrice
  );

  // Sorting
  const sortedRestaurants = [...restaurants].sort((a, b) => {
    if (sortBy === 'price_asc') return (a.priceMin || 0) - (b.priceMin || 0);
    if (sortBy === 'price_desc') return (b.priceMin || 0) - (a.priceMin || 0);
    return 0;
  });

  const paginatedRestaurants = sortedRestaurants.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);
  const totalPages = Math.ceil(sortedRestaurants.length / ITEMS_PER_PAGE);

  const renderFilters = () => (
    <div className="bg-white ring-1 ring-slate-900/[0.06] rounded-2xl overflow-hidden shadow-[0_12px_32px_-18px_rgba(16,40,34,0.25)]">
      <div className="p-4 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white flex items-center justify-between">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="w-4 h-4 text-[var(--color-primary)]" />
          <h3 className="font-bold text-[var(--color-ink-deep)] text-base">Bộ lọc ẩm thực</h3>
        </div>
        {hasActiveFilters && (
          <button
            onClick={handleClearFilters}
            className="text-xs font-semibold text-[var(--color-primary)] hover:text-amber-600 hover:underline flex items-center gap-1 transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3 h-3" /> Đặt lại
          </button>
        )}
      </div>

      {/* Loại hình món ăn / Đặc sản */}
      <div className="p-4 border-b border-slate-100">
        <h4 className="font-bold text-[var(--color-ink-deep)] mb-3 text-sm flex items-center justify-between">
          <span>Đặc sản & Món ăn</span>
          {filters.cuisineTypes?.length ? (
            <span className="text-[10px] bg-[var(--color-primary-50)] text-[var(--color-primary)] px-2.5 py-0.5 rounded-full font-bold">
              {filters.cuisineTypes.length} đã chọn
            </span>
          ) : null}
        </h4>
        <div className="flex flex-col gap-2.5">
          {CUISINE_CATEGORIES.map(category => {
            const isChecked = filters.cuisineTypes?.includes(category) || false;
            return (
              <label key={category} className="flex items-center gap-2.5 cursor-pointer group">
                <input
                  type="checkbox"
                  className="w-4 h-4 rounded-md border-slate-300 accent-[var(--color-primary)] cursor-pointer"
                  checked={isChecked}
                  onChange={(e) => {
                    const current = filters.cuisineTypes || [];
                    handleFilterChange({
                      cuisineTypes: e.target.checked
                        ? [...current, category]
                        : current.filter(c => c !== category)
                    });
                  }}
                />
                <span className={`text-sm flex-1 transition-colors ${isChecked ? 'font-semibold text-[var(--color-primary)]' : 'text-slate-700 group-hover:text-[var(--color-primary)]'}`}>
                  {category}
                </span>
              </label>
            );
          })}
        </div>
      </div>

      {/* Tiện ích quán ăn */}
      <div className="p-4 border-b border-slate-100">
        <h4 className="font-bold text-[var(--color-ink-deep)] mb-3 text-sm">Không gian & Tiện ích</h4>
        <div className="flex flex-col gap-2.5">
          {RESTAURANT_AMENITIES.map(amenity => {
            const isChecked = filters.amenities?.includes(amenity.code) || false;
            return (
              <label key={amenity.code} className="flex items-center gap-2.5 cursor-pointer group">
                <input
                  type="checkbox"
                  className="w-4 h-4 rounded-md border-slate-300 accent-[var(--color-primary)] cursor-pointer"
                  checked={isChecked}
                  onChange={(e) => {
                    const current = filters.amenities || [];
                    handleFilterChange({
                      amenities: e.target.checked
                        ? [...current, amenity.code]
                        : current.filter(a => a !== amenity.code)
                    });
                  }}
                />
                <span className={`text-sm flex-1 transition-colors ${isChecked ? 'font-semibold text-[var(--color-primary)]' : 'text-slate-700 group-hover:text-[var(--color-primary)]'}`}>
                  {amenity.name}
                </span>
              </label>
            );
          })}
        </div>
      </div>

      {/* Ngân sách tham khảo */}
      <div className="p-4 bg-gradient-to-b from-white to-slate-50/40">
        <div className="flex items-center justify-between mb-2">
          <h4 className="font-bold text-[var(--color-ink-deep)] text-sm">Mức giá tham khảo (/người)</h4>
          {(filters.minPrice || filters.maxPrice) && (
            <button
              onClick={() => handleFilterChange({ minPrice: undefined, maxPrice: undefined })}
              className="text-[11px] text-[var(--color-muted)] hover:text-amber-600 transition-colors cursor-pointer"
            >
              Mặc định
            </button>
          )}
        </div>

        <PriceSlider
          min={30000}
          max={500000}
          step={20000}
          value={[filters.minPrice ?? 30000, filters.maxPrice ?? 500000]}
          onChange={() => { }}
          onChangeEnd={([min, max]) => handleFilterChange({
            minPrice: min > 30000 ? min : undefined,
            maxPrice: max < 500000 ? max : undefined
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
      <HomeMotifs variant="restaurant" className="inset-x-0 bottom-0 top-[360px]" />
      {/* Hero Section */}
      <section className="relative w-full min-h-[360px] md:min-h-[360px] flex items-start md:items-center justify-center pt-[calc(145px+var(--safe-top))] md:pt-[calc(130px+var(--safe-top))] pb-10 md:pb-8">
        <div
          className="absolute inset-0 z-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${bannerRestaurants})` }}
        >
          {/* Overlay gradient */}
          <div className="absolute inset-0 bg-gradient-to-b from-[#0f2d3c]/85 via-[#0f2d3c]/50 to-transparent"></div>
        </div>

        <div className="relative z-10 w-full max-w-4xl mx-auto px-4 text-center">
          <h1 className="text-3xl md:text-4xl lg:text-5xl font-extrabold font-display text-white tracking-tight drop-shadow-md">
            Hương Vị Tây Bắc Nguyên Bản
          </h1>
        </div>
      </section>

      {/* Main Container */}
      <div className="max-w-[1280px] mx-auto w-full px-4 md:px-8 pt-3 pb-8">

        {/* Breadcrumbs */}
        <div className="flex items-center gap-2 text-xs md:text-sm text-[var(--color-muted)] mb-3">
          <Link to="/" className="hover:text-[var(--color-primary)] transition-colors">Trang chủ</Link>
          <span>/</span>
          <span className="text-[var(--color-ink-deep)] font-semibold">Nhà hàng & Ẩm thực</span>
        </div>

        {firstLoad ? (
          <ToolbarSkeleton {...SKELETON.toolbar} />
        ) : (<>
        {/* BỘ LỌC BÊN TRÊN HIỆN ĐẠI (Top Filter Toolbar & Quick Filter Bar) */}
        <div className="relative overflow-hidden bg-white/90 backdrop-blur-md ring-1 ring-slate-900/[0.06] rounded-2xl p-4 md:p-5 shadow-[0_12px_32px_-18px_rgba(16,40,34,0.28)] mb-6 transition-shadow duration-500 hover:shadow-[0_18px_40px_-18px_rgba(16,40,34,0.34)]">
          <div aria-hidden="true" className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-emerald-500 via-teal-400 to-amber-400" />

          {/* Row 1: Header + Count + Sort & Map View */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3.5 border-b border-slate-100">
            <div>
              <h2 className="text-base md:text-lg font-bold text-[var(--color-ink-deep)] flex items-center gap-2">
                Quán ăn & Nhà hàng đặc sản
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-[var(--color-primary-50)] text-[var(--color-primary)] border border-[var(--color-primary-100)]">
                  {restaurants.length} địa điểm
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
                  onChange={(e) => setSortBy(e.target.value as any)}
                  className="bg-transparent text-xs md:text-sm font-semibold text-[var(--color-ink-deep)] focus:outline-none cursor-pointer"
                >
                  <option value="recommended">Gợi ý hàng đầu</option>
                  <option value="price_asc">Giá: Thấp đến Cao</option>
                  <option value="price_desc">Giá: Cao đến Thấp</option>
                </select>
              </div>

              {/* Map Button */}
              <Link
                to="/map"
                className="flex items-center gap-1.5 px-3.5 py-2 text-xs md:text-sm font-semibold rounded-xl border border-[var(--color-primary)] bg-[var(--color-primary-50)] text-[var(--color-primary)] hover:bg-[var(--color-primary)] hover:text-white transition-all shadow-xs active:scale-98"
              >
                <Map className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Xem</span> Bản đồ
              </Link>
            </div>
          </div>

          {/* Row 2: Thanh lọc nhanh */}
          <div className="flex items-center gap-2 pt-3.5 overflow-x-auto scrollbar-hide pb-1">
            <span className="text-xs font-bold text-[var(--color-muted)] uppercase tracking-wider shrink-0 flex items-center gap-1 mr-1">
              <Sparkles className="w-3.5 h-3.5 text-amber-500" /> Lọc nhanh:
            </span>

            {/* Quick Thắng cố & Thịt ngựa */}
            <button
              onClick={() => {
                const current = filters.cuisineTypes || [];
                const target = 'Thắng cố & Thịt ngựa';
                const hasType = current.includes(target);
                handleFilterChange({
                  cuisineTypes: hasType ? current.filter(c => c !== target) : [...current, target]
                });
              }}
              className={`shrink-0 flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-all ${filters.cuisineTypes?.includes('Thắng cố & Thịt ngựa')
                ? 'bg-[var(--color-primary)] text-white border-[var(--color-primary)] shadow-xs'
                : 'bg-slate-50 text-[var(--color-ink)] border-slate-200 hover:border-slate-300 hover:bg-white'
                }`}
            >
              <UtensilsCrossed className="w-3 h-3" /> Thắng cố & Ngựa
            </button>

            {/* Quick Không gian nhà sàn */}
            <button
              onClick={() => {
                const current = filters.amenities || [];
                const hasStilt = current.includes('STILT_HOUSE');
                handleFilterChange({
                  amenities: hasStilt ? current.filter(a => a !== 'STILT_HOUSE') : [...current, 'STILT_HOUSE']
                });
              }}
              className={`shrink-0 flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-all ${filters.amenities?.includes('STILT_HOUSE')
                ? 'bg-[var(--color-primary)] text-white border-[var(--color-primary)] shadow-xs'
                : 'bg-slate-50 text-[var(--color-ink)] border-slate-200 hover:border-slate-300 hover:bg-white'
                }`}
            >
              <Home className="w-3 h-3" /> Quán nhà sàn
            </button>

            {/* Quick Bãi đỗ xe */}
            <button
              onClick={() => {
                const current = filters.amenities || [];
                const hasParking = current.includes('PARKING');
                handleFilterChange({
                  amenities: hasParking ? current.filter(a => a !== 'PARKING') : [...current, 'PARKING']
                });
              }}
              className={`shrink-0 flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-all ${filters.amenities?.includes('PARKING')
                ? 'bg-[var(--color-primary)] text-white border-[var(--color-primary)] shadow-xs'
                : 'bg-slate-50 text-[var(--color-ink)] border-slate-200 hover:border-slate-300 hover:bg-white'
                }`}
            >
              <Car className="w-3 h-3" /> Chỗ đỗ ô tô
            </button>
          </div>

          {/* Row 3: Active Filters Tags */}
          {hasActiveFilters && (
            <div className="flex flex-wrap items-center gap-2 pt-3 mt-3 border-t border-dashed border-slate-200">
              <span className="text-xs font-semibold text-[var(--color-muted)] mr-1">
                Đang áp dụng:
              </span>

              {filters.keyword && (
                <button
                  onClick={() => {
                    handleFilterChange({ keyword: undefined });
                  }}
                  className="shrink-0 flex items-center gap-1.5 px-3 py-1 rounded-full border border-[var(--color-primary)] bg-[var(--color-primary-50)] text-[var(--color-primary-700)] text-xs font-semibold shadow-xs transition-all hover:bg-[var(--color-primary-100)]"
                >
                  Từ khóa: "{filters.keyword}" <X className="w-3 h-3 text-[var(--color-primary)]" />
                </button>
              )}

              {filters.cuisineTypes?.map(category => (
                <button
                  key={category}
                  onClick={() => handleFilterChange({ cuisineTypes: filters.cuisineTypes?.filter(c => c !== category) })}
                  className="shrink-0 flex items-center gap-1.5 px-3 py-1 rounded-full border border-[var(--color-primary)] bg-[var(--color-primary-50)] text-[var(--color-primary-700)] text-xs font-semibold shadow-xs transition-all hover:bg-[var(--color-primary-100)]"
                >
                  {category} <X className="w-3 h-3 text-[var(--color-primary)]" />
                </button>
              ))}

              {filters.amenities?.map(amenityCode => {
                const name = RESTAURANT_AMENITIES.find(a => a.code === amenityCode)?.name || amenityCode;
                return (
                  <button
                    key={amenityCode}
                    onClick={() => handleFilterChange({ amenities: filters.amenities?.filter(a => a !== amenityCode) })}
                    className="shrink-0 flex items-center gap-1.5 px-3 py-1 rounded-full border border-[var(--color-primary)] bg-[var(--color-primary-50)] text-[var(--color-primary-700)] text-xs font-semibold shadow-xs transition-all hover:bg-[var(--color-primary-100)]"
                  >
                    {name} <X className="w-3 h-3 text-[var(--color-primary)]" />
                  </button>
                );
              })}

              {(filters.minPrice || filters.maxPrice) && (
                <button
                  onClick={() => handleFilterChange({ minPrice: undefined, maxPrice: undefined })}
                  className="shrink-0 flex items-center gap-1.5 px-3 py-1 rounded-full border border-[var(--color-primary)] bg-[var(--color-primary-50)] text-[var(--color-primary-700)] text-xs font-semibold shadow-xs transition-all hover:bg-[var(--color-primary-100)]"
                >
                  {filters.minPrice ? `Từ ${filters.minPrice.toLocaleString('vi-VN')}đ` : ''}
                  {filters.minPrice && filters.maxPrice ? ' - ' : ''}
                  {filters.maxPrice ? `Đến ${filters.maxPrice.toLocaleString('vi-VN')}đ` : ''}
                  <X className="w-3 h-3 text-[var(--color-primary)]" />
                </button>
              )}

              <button
                onClick={handleClearFilters}
                className="shrink-0 flex items-center gap-1 px-3.5 py-1 rounded-full border border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100 hover:border-rose-300 text-xs font-bold transition-all shadow-xs"
              >
                <RotateCcw className="w-3 h-3" /> Xóa tất cả bộ lọc
              </button>
            </div>
          )}
        </div>

        </>)}
        <div className="w-full flex flex-col md:flex-row gap-6">

          {/* Mobile Filter Button */}
          <div className="flex md:hidden mb-2">
            <button
              onClick={() => setMobileFilterOpen(true)}
              className="flex w-full items-center justify-center gap-2 bg-white p-3.5 rounded-xl shadow-xs border border-slate-200 text-sm font-bold text-[var(--color-primary)] hover:border-[var(--color-primary)] transition-colors"
            >
              <SlidersHorizontal className="w-4 h-4" /> Lọc kết quả ẩm thực
            </button>
          </div>

          {/* Mobile Filter Modal */}
          {mobileFilterOpen && createPortal(
            <div className="fixed inset-0 z-[99999] bg-black/50 md:hidden flex justify-end transition-opacity backdrop-blur-xs">
              <div className="w-[85%] max-w-[340px] h-full bg-white overflow-y-auto flex flex-col shadow-2xl rounded-l-3xl">
                <div className="p-4 pt-[calc(1rem+var(--safe-top))] border-b border-slate-100 flex justify-between items-center sticky top-0 bg-white/95 backdrop-blur-md z-10">
                  <h3 className="font-bold text-[var(--color-ink-deep)] text-base">Lọc quán ăn</h3>
                  <button onClick={() => setMobileFilterOpen(false)} className="p-2 -mr-2 text-slate-400 hover:text-slate-700 rounded-lg">
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <div className="flex-1">
                  {renderFilters()}
                </div>
                <div className="p-4 border-t border-slate-100 sticky bottom-0 bg-white/95 backdrop-blur-md">
                  <Button variant="primary" className="w-full h-11 rounded-xl font-bold" onClick={() => setMobileFilterOpen(false)}>
                    Xem {restaurants.length} kết quả
                  </Button>
                </div>
              </div>
            </div>
          , document.body)}

          {/* Sidebar (Desktop) */}
          <aside className="hidden md:flex flex-col w-[300px] shrink-0 gap-4">
            <div className="sticky top-24">{firstLoad ? <FilterPanelSkeleton {...SKELETON.filter} /> : renderFilters()}</div>
          </aside>

          {/* Main Content */}
          <div className="flex-1 flex flex-col gap-4">

            {/* List */}
            {loading ? (
              <CardSkeleton count={SKELETON.count} layout="compact" />
            ) : (
              <div>
                {paginatedRestaurants.length === 0 ? (
                  <div className="bg-white p-10 text-center rounded-2xl border border-slate-200/80 shadow-xs">
                    <p className="text-slate-500 font-medium">Không tìm thấy quán ăn nào phù hợp với bộ lọc.</p>
                    <button
                      onClick={handleClearFilters}
                      className="mt-3 text-sm font-bold text-[var(--color-primary)] hover:underline inline-flex items-center gap-1 cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" /> Bỏ bộ lọc để xem tất cả
                    </button>
                  </div>
                ) : (
                  <div className={COMPACT_GRID_WITH_SIDEBAR}>
                    {paginatedRestaurants.map((res) => (
                      <Reveal key={res.id} className="h-full" offset={28}>
                      <CompactPlaceCard
                        frame="food"
                        compact
                        to={`/restaurants/${res.id}`}
                        name={res.name}
                        imageUrl={res.coverImageUrl}
                        FallbackIcon={UtensilsCrossed}
                        location={res.address || res.district}
                        price={formatVnd(res.priceMin)}
                        priceUnit={res.priceUnitNote || 'người'}
                      />
                      </Reveal>
                    ))}
                  </div>
                )}

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex justify-center items-center gap-2 mt-8 mb-4">
                    <button
                      disabled={currentPage === 1}
                      onClick={() => {
                        setCurrentPage(prev => Math.max(1, prev - 1));
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                      className="w-9 h-9 flex items-center justify-center rounded-xl border border-slate-200 disabled:opacity-40 disabled:cursor-not-allowed hover:border-emerald-300 hover:bg-emerald-50 hover:-translate-y-0.5 hover:shadow-md active:scale-95 transition-all duration-300 bg-white cursor-pointer"
                    >
                      <ChevronLeft className="w-4 h-4 text-slate-700" />
                    </button>

                    <div className="flex items-center gap-1.5">
                      {[...Array(totalPages)].map((_, i) => (
                        <button
                          key={i}
                          onClick={() => {
                            setCurrentPage(i + 1);
                            window.scrollTo({ top: 0, behavior: 'smooth' });
                          }}
                          className={`w-9 h-9 rounded-xl font-bold text-xs transition-all duration-300 cursor-pointer active:scale-95 ${currentPage === i + 1
                            ? 'bg-gradient-to-br from-emerald-600 to-teal-500 text-white shadow-md shadow-emerald-600/30'
                            : 'text-slate-700 hover:bg-emerald-50 hover:border-emerald-300 hover:-translate-y-0.5 bg-white border border-slate-200'
                            }`}
                        >
                          {i + 1}
                        </button>
                      ))}
                    </div>

                    <button
                      disabled={currentPage === totalPages}
                      onClick={() => {
                        setCurrentPage(prev => Math.min(totalPages, prev + 1));
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                      className="w-9 h-9 flex items-center justify-center rounded-xl border border-slate-200 disabled:opacity-40 disabled:cursor-not-allowed hover:border-emerald-300 hover:bg-emerald-50 hover:-translate-y-0.5 hover:shadow-md active:scale-95 transition-all duration-300 bg-white cursor-pointer"
                    >
                      <ChevronRight className="w-4 h-4 text-slate-700" />
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
