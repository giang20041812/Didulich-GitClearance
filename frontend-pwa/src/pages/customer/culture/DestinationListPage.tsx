import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Link, useSearchParams } from 'react-router-dom';
import { fetchDestinations, DestinationDto, DestinationFilterParams } from '@/services/destinationService';
import { Button } from '@/components/ui/button';
import { CardSkeleton } from '@/components/ui/CardSkeleton';
import Reveal from '@/components/ui/Reveal';
import HomeMotifs from '@/components/home/HomeMotifs';
import CompactPlaceCard, { CompactCardBadge, GlassBadge } from '@/components/ui/CompactPlaceCard';
import { COMPACT_GRID_WITH_SIDEBAR, formatVnd } from '@/lib/compactCard';
import { SakuraBlossomIcon } from '@/components/ui/SakuraBlossomIcon';
import {
  SlidersHorizontal,
  ChevronLeft,
  ChevronRight,
  X,
  ArrowUpDown,
  RotateCcw,
  Map,
  Sparkles,
  Mountain,
  Ticket
} from 'lucide-react';
import bannerDestinations from '@/assets/photos/banner-destinations.webp';
import { ToolbarSkeleton, FilterPanelSkeleton, LIST_SKELETON_SPECS } from '@/components/ui/ListPageSkeleton';
import { useFirstLoad } from '@/hooks/useFirstLoad';

const SKELETON = LIST_SKELETON_SPECS.destinations;

const formatDayMonth = (dStr?: string) => {
  if (!dStr) return '';
  const parts = dStr.split('-');
  return parts.length === 3 ? `${parts[2]}/${parts[1]}` : dStr;
};

/** Nhãn mùa đẹp trên ảnh thẻ ("Mùa đẹp 15/09–10/10" hoặc "Quanh năm") — đủ ngắn để không bị cắt trên thẻ điện thoại. */
const seasonBadge = (dest: DestinationDto): { text: string; yearRound: boolean } => {
  const start = formatDayMonth(dest.suitableDateStart);
  const end = formatDayMonth(dest.suitableDateEnd);
  if ((!start && !end) || dest.suitableDateStart?.toLowerCase() === 'quanh năm') return { text: 'Quanh năm', yearRound: true };
  if (start && end) return { text: `Mùa đẹp ${start}–${end}`, yearRound: false };
  return { text: end ? `Mùa đẹp đến ${end}` : `Mùa đẹp từ ${start}`, yearRound: false };
};

const SCENIC_TYPES = [
  'Ruộng bậc thang di sản',
  'Thác nước & Suối nguồn',
  'Tứ đại đỉnh đèo & Đỉnh mây',
  'Rừng sinh thái nguyên sinh',
  'Điểm săn mây & Trekking',
  'Thung lũng & Bản làng'
];

export default function DestinationListPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const [destinations, setDestinations] = useState<DestinationDto[]>([]);
  const [loading, setLoading] = useState(true);
  const firstLoad = useFirstLoad(loading);
  const [sortBy, setSortBy] = useState<'recommended' | 'price_asc' | 'price_desc'>('recommended');

  const [filters, setFilters] = useState<DestinationFilterParams>(() => {
    const initial: DestinationFilterParams = {};
    const q = searchParams.get('q');
    const scenics = searchParams.get('scenics');
    const freeOnly = searchParams.get('freeOnly');
    const needs = searchParams.get('needs');

    if (q) initial.keyword = q;
    if (scenics) initial.scenicTypes = scenics.split(',');
    if (freeOnly === 'true') initial.maxPrice = 0;
    if (needs === 'enjoy' || needs === 'adventure') initial.needs = needs;

    return initial;
  });

  const [currentPage, setCurrentPage] = useState(1);
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);

  const ITEMS_PER_PAGE = 9;

  const handleFilterChange = (updates: Partial<DestinationFilterParams>) => {
    setFilters(prev => {
      const newFilters = { ...prev, ...updates };
      const newParams = new URLSearchParams(searchParams);
      if (newFilters.keyword) newParams.set('q', newFilters.keyword); else newParams.delete('q');
      newParams.delete('minRating');
      if (newFilters.maxPrice !== undefined) newParams.set('maxPrice', newFilters.maxPrice.toString()); else newParams.delete('maxPrice');
      if (newFilters.scenicTypes && newFilters.scenicTypes.length > 0) newParams.set('scenics', newFilters.scenicTypes.join(',')); else newParams.delete('scenics');
      if (newFilters.needs) newParams.set('needs', newFilters.needs); else newParams.delete('needs');

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

  useEffect(() => {
    const q = searchParams.get('q');
    const scenics = searchParams.get('scenics');
    const maxPrice = searchParams.get('maxPrice');
    const needs = searchParams.get('needs');

    setFilters({
      keyword: q || undefined,
      maxPrice: maxPrice ? Number(maxPrice) : undefined,
      scenicTypes: scenics ? scenics.split(',') : undefined,
      needs: needs === 'enjoy' || needs === 'adventure' ? needs : undefined,
    });
  }, [searchParams]);

  useEffect(() => {
    setLoading(true);
    fetchDestinations(filters).then(data => {
      setDestinations(data);
      setLoading(false);
    }).catch(err => {
      console.error(err);
      setLoading(false);
    });
  }, [filters]);

  const hasActiveFilters = Boolean(
    filters.keyword || filters.scenicTypes?.length || filters.maxPrice !== undefined || filters.needs
  );

  const sortedDestinations = [...destinations].sort((a, b) => {
    if (sortBy === 'price_asc') return a.ticketPrice - b.ticketPrice;
    if (sortBy === 'price_desc') return b.ticketPrice - a.ticketPrice;

    // Default sorting: seasonal items ("Mùa đẹp") first
    const aHasSeason = a.suitableDateStart && a.suitableDateStart.toLowerCase() !== 'quanh năm' && /\d/.test(a.suitableDateStart);
    const bHasSeason = b.suitableDateStart && b.suitableDateStart.toLowerCase() !== 'quanh năm' && /\d/.test(b.suitableDateStart);
    if (aHasSeason && !bHasSeason) return -1;
    if (!aHasSeason && bHasSeason) return 1;

    return 0;
  });

  const paginatedDestinations = sortedDestinations.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);
  const totalPages = Math.ceil(sortedDestinations.length / ITEMS_PER_PAGE);

  const renderFilters = () => (
    <div className="bg-white ring-1 ring-slate-900/[0.06] rounded-2xl overflow-hidden shadow-[0_12px_32px_-18px_rgba(16,40,34,0.25)]">
      <div className="p-4 border-b border-slate-100 bg-slate-50/60 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="w-4 h-4 text-[var(--color-primary)]" />
          <h3 className="font-bold text-slate-900 text-sm sm:text-base">Bộ lọc điểm đến</h3>
        </div>
        {hasActiveFilters && (
          <button
            onClick={handleClearFilters}
            className="text-xs font-bold text-[var(--color-primary)] hover:text-[var(--color-coral)] hover:underline flex items-center gap-1 transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3 h-3" /> Đặt lại
          </button>
        )}
      </div>

      {/* Loại hình danh thắng */}
      <div className="p-4 sm:p-5 border-b border-slate-100">
        <h4 className="font-bold text-slate-900 mb-3 text-xs uppercase tracking-wider text-slate-500">Nhu cầu trải nghiệm</h4>
        <div className="flex flex-col gap-2.5">
          {([{ value: 'enjoy', label: 'Tận hưởng & thư giãn' }, { value: 'adventure', label: 'Khám phá & phiêu lưu' }] as const).map((option) => (
            <label key={option.value} className="flex items-center gap-2.5 cursor-pointer group">
              <input type="radio" name="destination-needs" className="w-4 h-4 accent-[var(--color-primary)] cursor-pointer" checked={filters.needs === option.value} onChange={() => handleFilterChange({ needs: filters.needs === option.value ? undefined : option.value })} />
              <span className={`text-sm flex-1 ${filters.needs === option.value ? 'font-bold text-[var(--color-primary)]' : 'text-slate-700 group-hover:text-[var(--color-primary)]'}`}>{option.label}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="p-4 sm:p-5 border-b border-slate-100">
        <h4 className="font-bold text-slate-900 mb-3 text-xs uppercase tracking-wider text-slate-500 flex items-center justify-between">
          <span>Loại hình cảnh quan</span>
          {filters.scenicTypes?.length ? (
            <span className="text-[10px] bg-emerald-50 text-[var(--color-primary)] px-2.5 py-0.5 rounded-full font-bold border border-emerald-100">
              {filters.scenicTypes.length} đã chọn
            </span>
          ) : null}
        </h4>
        <div className="flex flex-col gap-2.5">
          {SCENIC_TYPES.map(scenic => {
            const isChecked = filters.scenicTypes?.includes(scenic) || false;
            return (
              <label key={scenic} className="flex items-center gap-2.5 cursor-pointer group">
                <input
                  type="checkbox"
                  className="w-4 h-4 rounded-sm border-slate-300 accent-[var(--color-primary)] cursor-pointer"
                  checked={isChecked}
                  onChange={(e) => {
                    const current = filters.scenicTypes || [];
                    handleFilterChange({
                      scenicTypes: e.target.checked
                        ? [...current, scenic]
                        : current.filter(c => c !== scenic)
                    });
                  }}
                />
                <span className={`text-sm flex-1 transition-colors ${isChecked ? 'font-bold text-[var(--color-primary)]' : 'text-slate-700 group-hover:text-[var(--color-primary)]'}`}>
                  {scenic}
                </span>
              </label>
            );
          })}
        </div>
      </div>

      {/* Vé tham quan */}
      <div className="p-4 sm:p-5">
        <h4 className="font-bold text-slate-900 mb-3 text-xs uppercase tracking-wider text-slate-500">Giá vé tham quan</h4>
        <div className="flex flex-col gap-2.5">
          <label className="flex items-center gap-2.5 cursor-pointer group">
            <input
              type="checkbox"
              className="w-4 h-4 rounded-sm border-slate-300 accent-[var(--color-primary)] cursor-pointer"
              checked={filters.maxPrice === 0}
              onChange={(e) => handleFilterChange({ maxPrice: e.target.checked ? 0 : undefined })}
            />
            <span className={`text-sm flex-1 transition-colors ${filters.maxPrice === 0 ? 'font-bold text-[var(--color-primary)]' : 'text-slate-700 group-hover:text-[var(--color-primary)]'}`}>
              Miễn phí tham quan (0đ)
            </span>
          </label>
        </div>
      </div>
    </div>
  );

  return (
    <div className="relative isolate w-full flex flex-col min-h-screen overflow-x-clip bg-[linear-gradient(180deg,var(--color-canvas)_0%,#f1faf6_45%,#fbf7ee_100%)]">
      <div aria-hidden="true" className="pointer-events-none absolute right-[-120px] top-[520px] h-[380px] w-[380px] rounded-full bg-emerald-300/20 blur-3xl" />
      <div aria-hidden="true" className="pointer-events-none absolute left-[-140px] top-[1100px] h-[420px] w-[420px] rounded-full bg-amber-200/25 blur-3xl" />
      {/* Họa tiết nét mảnh như trang chủ, phủ phần dưới hero (hero nằm trên lớp này) */}
      <HomeMotifs variant="explore" className="inset-x-0 bottom-0 top-[360px]" />
      {/* Hero Section */}
      <section className="relative w-full min-h-[360px] md:min-h-[360px] flex items-start md:items-center justify-center pt-[calc(145px+var(--safe-top))] md:pt-[calc(130px+var(--safe-top))] pb-10 md:pb-8">
        <div
          className="absolute inset-0 z-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${bannerDestinations})` }}
        >
          <div className="absolute inset-0 bg-gradient-to-b from-[#0f2d3c]/85 via-[#0f2d3c]/50 to-transparent"></div>
        </div>

        <div className="relative z-10 w-full max-w-4xl mx-auto px-4 text-center">
          <h1 className="text-3xl md:text-4xl lg:text-5xl font-extrabold font-display text-white tracking-tight drop-shadow-md">
            Điểm Đến & Thắng Cảnh
          </h1>
        </div>
      </section>

      {/* Main Container */}
      <div className="max-w-[1280px] mx-auto w-full px-4 md:px-8 pt-3 pb-8">

        {/* Breadcrumbs */}
        <div className="flex items-center gap-2 text-xs md:text-sm text-[var(--color-muted)] mb-3">
          <Link to="/" className="hover:text-[var(--color-primary)] transition-colors">Trang chủ</Link>
          <span>/</span>
          <span className="text-[var(--color-ink-deep)] font-semibold">Danh thắng & Điểm tham quan</span>
        </div>

        {firstLoad ? (
          <ToolbarSkeleton {...SKELETON.toolbar} />
        ) : (<>
          {/* Top Filter Toolbar */}
          <div className="relative overflow-hidden bg-white/90 backdrop-blur-md ring-1 ring-slate-900/[0.06] rounded-2xl p-4 md:p-5 shadow-[0_12px_32px_-18px_rgba(16,40,34,0.28)] mb-6 transition-shadow duration-500 hover:shadow-[0_18px_40px_-18px_rgba(16,40,34,0.34)]">
            <div aria-hidden="true" className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-emerald-500 via-teal-400 to-amber-400" />
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3.5 border-b border-slate-100">
              <div>
                <h2 className="text-base md:text-lg font-bold text-[var(--color-ink-deep)] flex items-center gap-2">
                  Danh thắng Mù Cang Chải
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-[var(--color-primary-50)] text-[var(--color-primary)] border border-[var(--color-primary-100)]">
                    {destinations.length} địa điểm
                  </span>
                </h2>
                <p className="text-xs text-[var(--color-muted)] mt-0.5">
                  Các tuyệt tác thiên nhiên nguyên bản, tọa độ GPS dẫn đường và thông tin vé tham quan
                </p>
              </div>

              <div className="flex items-center gap-2.5 shrink-0">
                <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 hover:border-slate-300 transition-colors">
                  <ArrowUpDown className="w-3.5 h-3.5 text-[var(--color-primary)]" />
                  <span className="text-xs text-slate-500 font-medium hidden md:inline">Sắp xếp:</span>
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as any)}
                    className="bg-transparent text-xs md:text-sm font-semibold text-[var(--color-ink-deep)] focus:outline-none cursor-pointer"
                  >
                    <option value="recommended">Gợi ý hàng đầu</option>
                    <option value="price_asc">Vé: Thấp đến Cao</option>
                  </select>
                </div>

                <Link
                  to="/map"
                  className="flex items-center gap-1.5 px-3.5 py-2 text-xs md:text-sm font-semibold rounded-xl border border-[var(--color-primary)] bg-[var(--color-primary-50)] text-[var(--color-primary)] hover:bg-[var(--color-primary)] hover:text-white transition-all shadow-xs active:scale-98"
                >
                  <Map className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Xem</span> Bản đồ
                </Link>
              </div>
            </div>

            {/* Quick Filters */}
            <div className="flex items-center gap-2 pt-3.5 overflow-x-auto scrollbar-hide pb-1">
              <span className="text-xs font-bold text-[var(--color-muted)] uppercase tracking-wider shrink-0 flex items-center gap-1 mr-1">
                <Sparkles className="w-3.5 h-3.5 text-amber-500" /> Lọc nhanh:
              </span>

              {/* Quick Mâm xôi & Ruộng bậc thang */}
              <button
                onClick={() => {
                  const current = filters.scenicTypes || [];
                  const target = 'Ruộng bậc thang di sản';
                  const has = current.includes(target);
                  handleFilterChange({
                    scenicTypes: has ? current.filter(s => s !== target) : [...current, target]
                  });
                }}
                className={`shrink-0 flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-all ${filters.scenicTypes?.includes('Ruộng bậc thang di sản')
                  ? 'bg-[var(--color-primary)] text-white border-[var(--color-primary)] shadow-xs'
                  : 'bg-slate-50 text-[var(--color-ink)] border-slate-200 hover:border-slate-300 hover:bg-white'
                  }`}
              >
                <Mountain className="w-3 h-3" /> Ruộng bậc thang
              </button>

              {/* Quick Thác & Suối */}
              <button
                onClick={() => {
                  const current = filters.scenicTypes || [];
                  const target = 'Thác nước & Suối nguồn';
                  const has = current.includes(target);
                  handleFilterChange({
                    scenicTypes: has ? current.filter(s => s !== target) : [...current, target]
                  });
                }}
                className={`shrink-0 flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-all ${filters.scenicTypes?.includes('Thác nước & Suối nguồn')
                  ? 'bg-[var(--color-primary)] text-white border-[var(--color-primary)] shadow-xs'
                  : 'bg-slate-50 text-[var(--color-ink)] border-slate-200 hover:border-slate-300 hover:bg-white'
                  }`}
              >
                Thác Pú Nhu & Thác Mơ
              </button>

              {/* Quick Free Ticket */}
              <button
                onClick={() => handleFilterChange({ maxPrice: filters.maxPrice === 0 ? undefined : 0 })}
                className={`shrink-0 flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-all ${filters.maxPrice === 0
                  ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
                  : 'bg-slate-50 text-[var(--color-ink)] border-slate-200 hover:border-slate-300 hover:bg-white'
                  }`}
              >
                <Ticket className="w-3 h-3" /> Miễn phí vé vào
              </button>
            </div>

            {/* Active Filters */}
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

                {filters.scenicTypes?.map(s => (
                  <button
                    key={s}
                    onClick={() => handleFilterChange({ scenicTypes: filters.scenicTypes?.filter(item => item !== s) })}
                    className="shrink-0 flex items-center gap-1.5 px-3 py-1 rounded-full border border-[var(--color-primary)] bg-[var(--color-primary-50)] text-[var(--color-primary-700)] text-xs font-semibold shadow-xs transition-all hover:bg-[var(--color-primary-100)]"
                  >
                    {s} <X className="w-3 h-3 text-[var(--color-primary)]" />
                  </button>
                ))}

                {filters.maxPrice === 0 && (
                  <button
                    onClick={() => handleFilterChange({ maxPrice: undefined })}
                    className="shrink-0 flex items-center gap-1.5 px-3 py-1 rounded-full border border-[var(--color-primary)] bg-[var(--color-primary-50)] text-[var(--color-primary-700)] text-xs font-semibold shadow-xs transition-all hover:bg-[var(--color-primary-100)]"
                  >
                    Miễn phí vé <X className="w-3 h-3 text-[var(--color-primary)]" />
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
          <div className="flex md:hidden mb-2">
            <button
              onClick={() => setMobileFilterOpen(true)}
              className="flex w-full items-center justify-center gap-2 bg-white p-3.5 rounded-xl shadow-xs border border-slate-200 text-sm font-bold text-[var(--color-primary)] hover:border-[var(--color-primary)] transition-colors"
            >
              <SlidersHorizontal className="w-4 h-4" /> Lọc cảnh quan
            </button>
          </div>

          {mobileFilterOpen && createPortal(
            <div className="fixed inset-0 z-[99999] bg-black/50 md:hidden flex justify-end transition-opacity backdrop-blur-xs">
              <div className="w-[85%] max-w-[340px] h-full bg-white overflow-y-auto flex flex-col shadow-2xl rounded-l-3xl">
                <div className="p-4 pt-[calc(1rem+var(--safe-top))] border-b border-slate-100 flex justify-between items-center sticky top-0 bg-white/95 backdrop-blur-md z-10">
                  <h3 className="font-bold text-[var(--color-ink-deep)] text-base">Lọc điểm đến</h3>
                  <button onClick={() => setMobileFilterOpen(false)} className="p-2 -mr-2 text-slate-400 hover:text-slate-700 rounded-lg">
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <div className="flex-1">
                  {renderFilters()}
                </div>
                <div className="p-4 border-t border-slate-100 sticky bottom-0 bg-white/95 backdrop-blur-md">
                  <Button variant="primary" className="w-full h-11 rounded-xl font-bold" onClick={() => setMobileFilterOpen(false)}>
                    Xem {destinations.length} kết quả
                  </Button>
                </div>
              </div>
            </div>
            , document.body)}

          <aside className="hidden md:flex flex-col w-[300px] shrink-0 gap-4">
            <div className="sticky top-24">{firstLoad ? <FilterPanelSkeleton {...SKELETON.filter} /> : renderFilters()}</div>
          </aside>

          <div className="flex-1 flex flex-col gap-4 relative min-h-[350px]">
            {loading ? (
              <CardSkeleton count={SKELETON.count} layout="compact" />
            ) : paginatedDestinations.length === 0 ? (
              <div className="bg-white p-10 text-center rounded-2xl border border-slate-200/80 shadow-xs">
                <p className="text-slate-500 font-medium">Không tìm thấy địa điểm nào phù hợp.</p>
                <button
                  onClick={handleClearFilters}
                  className="mt-3 text-sm font-bold text-[var(--color-primary)] hover:underline inline-flex items-center gap-1 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" /> Bỏ bộ lọc để xem tất cả
                </button>
              </div>
            ) : (
              <div className={COMPACT_GRID_WITH_SIDEBAR}>
                {paginatedDestinations.map((dest) => {
                  const season = seasonBadge(dest);
                  return (
                    <Reveal key={dest.id} className="h-full" offset={28}>
                      <CompactPlaceCard
                        to={`/destinations/${dest.id}`}
                        name={dest.name}
                        imageUrl={dest.coverImageUrl}
                        location={dest.address || dest.district || 'Lào Cai'}
                        description={dest.description}
                        price={dest.ticketPrice > 0 ? formatVnd(dest.ticketPrice) : 'Miễn phí'}
                        priceUnit={dest.ticketPrice > 0 ? 'lượt' : null}
                        ctaText="Khám phá ngay"
                        badge={
                          <CompactCardBadge className={season.yearRound ? 'bg-gradient-to-r from-teal-500 to-emerald-600' : 'bg-gradient-to-r from-pink-500 via-rose-500 to-orange-500'}>
                            <SakuraBlossomIcon className="h-3 w-3 shrink-0" />
                            <span className="truncate">{season.text}</span>
                          </CompactCardBadge>
                        }
                        secondaryBadge={
                          dest.scenicType ? (
                            <GlassBadge>
                              <Mountain className="w-2.5 h-2.5 text-emerald-300 shrink-0" />
                              <span className="truncate max-w-[90px]">{(dest.scenicType.split('&')[0] || '').trim()}</span>
                            </GlassBadge>
                          ) : undefined
                        }
                      />
                    </Reveal>
                  );
                })}
              </div>
            )}

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
        </div>
      </div>
    </div>
  );
}
