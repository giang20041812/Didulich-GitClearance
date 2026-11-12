import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { fetchUtilityServices, UtilityServiceDto, UtilityFilterParams } from '@/services/utilityService';
import { CardSkeleton } from '@/components/ui/CardSkeleton';
import Reveal from '@/components/ui/Reveal';
import HomeMotifs from '@/components/home/HomeMotifs';
import CompactPlaceCard, { CompactCardBadge } from '@/components/ui/CompactPlaceCard';
import { COMPACT_GRID_FULL, formatVnd } from '@/lib/compactCard';
import {
  ChevronLeft,
  ChevronRight,
  X,
  ArrowUpDown,
  RotateCcw,
  Map,
  Camera,
  Bike
} from 'lucide-react';
import bannerUtilities from '@/assets/photos/banner-utilities.webp';
import { ToolbarSkeleton, LIST_SKELETON_SPECS } from '@/components/ui/ListPageSkeleton';
import { useFirstLoad } from '@/hooks/useFirstLoad';

const SKELETON = LIST_SKELETON_SPECS.services;

export default function UtilityListPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const [services, setServices] = useState<UtilityServiceDto[]>([]);
  const [loading, setLoading] = useState(true);
  const firstLoad = useFirstLoad(loading);
  const [sortBy, setSortBy] = useState<'recommended' | 'price_asc' | 'price_desc'>('recommended');

  const [activeTab, setActiveTab] = useState<'ALL' | 'PHOTO' | 'RENTAL'>(() => {
    const tab = searchParams.get('tab');
    if (tab === 'photo') return 'PHOTO';
    if (tab === 'rental') return 'RENTAL';
    return 'ALL';
  });

  const [filters, setFilters] = useState<UtilityFilterParams>(() => {
    const initial: UtilityFilterParams = {};
    const q = searchParams.get('q');
    if (q) initial.keyword = q;
    initial.kind = activeTab;
    return initial;
  });

  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 8;

  const handleTabChange = (newTab: 'ALL' | 'PHOTO' | 'RENTAL') => {
    setActiveTab(newTab);
    const newParams = new URLSearchParams(searchParams);
    if (newTab === 'PHOTO') newParams.set('tab', 'photo');
    else if (newTab === 'RENTAL') newParams.set('tab', 'rental');
    else newParams.delete('tab');
    setSearchParams(newParams, { replace: true });

    setFilters(prev => ({ ...prev, kind: newTab }));
    setCurrentPage(1);
  };

  const handleFilterChange = (updates: Partial<UtilityFilterParams>) => {
    setFilters(prev => {
      const newFilters = { ...prev, ...updates };
      const newParams = new URLSearchParams(searchParams);
      if (newFilters.keyword) newParams.set('q', newFilters.keyword); else newParams.delete('q');
      setSearchParams(newParams, { replace: true });
      return newFilters;
    });
    setCurrentPage(1);
  };

  const handleClearFilters = () => {
    handleTabChange('ALL');
    setFilters({ kind: 'ALL' });
    setSearchParams(new URLSearchParams(), { replace: true });
    setCurrentPage(1);
  };

  useEffect(() => {
    const q = searchParams.get('q');
    const tab = searchParams.get('tab');
    const tabKind = tab === 'photo' ? 'PHOTO' : tab === 'rental' ? 'RENTAL' : 'ALL';
    setActiveTab(tabKind);
    setFilters({
      keyword: q || undefined,
      kind: tabKind,
    });
  }, [searchParams]);

  useEffect(() => {
    setLoading(true);
    fetchUtilityServices(filters).then(data => {
      setServices(data);
      setLoading(false);
    }).catch(err => {
      console.error(err);
      setLoading(false);
    });
  }, [filters]);

  const hasActiveFilters = Boolean(filters.keyword || activeTab !== 'ALL');

  const sortedServices = [...services].sort((a, b) => {
    if (sortBy === 'price_asc') return a.priceRef - b.priceRef;
    if (sortBy === 'price_desc') return b.priceRef - a.priceRef;
    return 0;
  });

  const paginatedServices = sortedServices.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);
  const totalPages = Math.ceil(sortedServices.length / ITEMS_PER_PAGE);

  return (
    <div className="relative isolate w-full flex flex-col min-h-screen overflow-x-clip bg-[linear-gradient(180deg,var(--color-canvas)_0%,#f1faf6_45%,#fbf7ee_100%)]">
      <div aria-hidden="true" className="pointer-events-none absolute right-[-120px] top-[520px] h-[380px] w-[380px] rounded-full bg-emerald-300/20 blur-3xl" />
      <div aria-hidden="true" className="pointer-events-none absolute left-[-140px] top-[1100px] h-[420px] w-[420px] rounded-full bg-amber-200/25 blur-3xl" />
      {/* Họa tiết nét mảnh như trang chủ, phủ phần dưới hero (hero nằm trên lớp này) */}
      <HomeMotifs variant="utility" className="inset-x-0 bottom-0 top-[360px]" />
      {/* Hero Section */}
      <section className="relative w-full min-h-[360px] md:min-h-[360px] flex items-start md:items-center justify-center pt-[calc(145px+var(--safe-top))] md:pt-[calc(130px+var(--safe-top))] pb-10 md:pb-8">
        <div
          className="absolute inset-0 z-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${bannerUtilities})` }}
        >
          <div className="absolute inset-0 bg-gradient-to-b from-[#0f2d3c]/85 via-[#0f2d3c]/50 to-transparent"></div>
        </div>

        <div className="relative z-10 w-full max-w-4xl mx-auto px-4 text-center">
          <h1 className="text-3xl md:text-4xl lg:text-5xl font-extrabold font-display text-white tracking-tight drop-shadow-md">
            Dịch Vụ & Tiện Ích Du Lịch
          </h1>
        </div>
      </section>

      {/* Main Container */}
      <div className="max-w-[1280px] mx-auto w-full px-4 md:px-8 pt-3 pb-8">
        <div className="flex items-center gap-2 text-xs md:text-sm text-[var(--color-muted)] mb-3">
          <Link to="/" className="hover:text-[var(--color-primary)] transition-colors">Trang chủ</Link>
          <span>/</span>
          <span className="text-[var(--color-ink-deep)] font-semibold">Dịch vụ & Tiện ích</span>
        </div>

        {/* Category Tabs: Photo & Rental */}
        <div className="flex items-center gap-2 mb-5 p-1.5 bg-white border border-slate-200 rounded-2xl shadow-xs max-w-lg">
          <button
            onClick={() => handleTabChange('ALL')}
            className={`flex-1 py-2.5 px-3 text-xs md:text-sm font-bold rounded-xl transition-all cursor-pointer ${activeTab === 'ALL'
                ? 'bg-gradient-to-br from-emerald-600 to-teal-500 text-white shadow-md shadow-emerald-600/30'
                : 'text-slate-600 hover:text-[var(--color-primary)]'
              }`}
          >
            Tất cả dịch vụ
          </button>
          <button
            onClick={() => handleTabChange('PHOTO')}
            className={`flex-1 py-2.5 px-3 text-xs md:text-sm font-bold rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer ${activeTab === 'PHOTO'
                ? 'bg-gradient-to-br from-emerald-600 to-teal-500 text-white shadow-md shadow-emerald-600/30'
                : 'text-slate-600 hover:text-[var(--color-primary)]'
              }`}
          >
            <Camera className="w-4 h-4" />
            Chụp ảnh & Trang phục
          </button>
          <button
            onClick={() => handleTabChange('RENTAL')}
            className={`flex-1 py-2.5 px-3 text-xs md:text-sm font-bold rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer ${activeTab === 'RENTAL'
                ? 'bg-gradient-to-br from-emerald-600 to-teal-500 text-white shadow-md shadow-emerald-600/30'
                : 'text-slate-600 hover:text-[var(--color-primary)]'
              }`}
          >
            <Bike className="w-4 h-4" />
            Thuê xe & Lều trại
          </button>
        </div>

        {firstLoad ? (
          <ToolbarSkeleton {...SKELETON.toolbar} />
        ) : (<>
        {/* Top Filter Bar */}
        <div className="relative overflow-hidden bg-white/90 backdrop-blur-md ring-1 ring-slate-900/[0.06] rounded-2xl p-4 md:p-5 shadow-[0_12px_32px_-18px_rgba(16,40,34,0.28)] mb-6 transition-shadow duration-500 hover:shadow-[0_18px_40px_-18px_rgba(16,40,34,0.34)]">
          <div aria-hidden="true" className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-emerald-500 via-teal-400 to-amber-400" />
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3.5 border-b border-slate-100">
            <div>
              <h2 className="text-base md:text-lg font-bold text-[var(--color-ink-deep)] flex items-center gap-2">
                {activeTab === 'PHOTO' ? 'Dịch vụ Chụp ảnh & Trang phục' : activeTab === 'RENTAL' ? 'Dịch vụ Thuê xe máy & Lều dã ngoại' : 'Dịch vụ & Tiện ích bản địa'}
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-[var(--color-primary-50)] text-[var(--color-primary)] border border-[var(--color-primary-100)]">
                  {services.length} điểm cung cấp
                </span>
              </h2>
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
                  <option value="price_asc">Giá: Thấp đến Cao</option>
                  <option value="price_desc">Giá: Cao đến Thấp</option>
                </select>
              </div>

              <Link
                to="/map"
                className="flex items-center gap-1.5 px-3.5 py-2 text-xs md:text-sm font-semibold rounded-xl border border-[var(--color-primary)] bg-[var(--color-primary-50)] text-[var(--color-primary)] hover:bg-[var(--color-primary)] hover:text-white transition-all shadow-xs"
              >
                <Map className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Xem</span> Bản đồ
              </Link>
            </div>
          </div>

          {hasActiveFilters && (
            <div className="flex flex-wrap items-center gap-2 pt-3 mt-3 border-t border-dashed border-slate-200">
              <span className="text-xs font-semibold text-[var(--color-muted)] mr-1">Đang áp dụng:</span>
              {filters.keyword && (
                <button
                  onClick={() => { handleFilterChange({ keyword: undefined }); }}
                  className="shrink-0 flex items-center gap-1.5 px-3 py-1 rounded-full border border-[var(--color-primary)] bg-[var(--color-primary-50)] text-[var(--color-primary-700)] text-xs font-semibold shadow-xs"
                >
                  Từ khóa: "{filters.keyword}" <X className="w-3 h-3" />
                </button>
              )}
              {activeTab !== 'ALL' && (
                <button
                  onClick={() => handleTabChange('ALL')}
                  className="shrink-0 flex items-center gap-1.5 px-3 py-1 rounded-full border border-[var(--color-primary)] bg-[var(--color-primary-50)] text-[var(--color-primary-700)] text-xs font-semibold shadow-xs"
                >
                  {activeTab === 'PHOTO' ? 'Chụp ảnh & Trang phục' : 'Thuê xe & Lều trại'} <X className="w-3 h-3" />
                </button>
              )}
              <button
                onClick={handleClearFilters}
                className="shrink-0 flex items-center gap-1 px-3.5 py-1 rounded-full border border-rose-200 bg-rose-50 text-rose-600 text-xs font-bold shadow-xs hover:bg-rose-100 transition-colors"
              >
                <RotateCcw className="w-3 h-3" /> Xóa bộ lọc
              </button>
            </div>
          )}
        </div>

        </>)}
        {/* Content List */}
        <div>
          {loading ? (
            <CardSkeleton count={SKELETON.count} layout="compact-full" />
          ) : (
            <div>
              {paginatedServices.length === 0 ? (
                <div className="bg-white p-10 text-center rounded-2xl border border-slate-200/80 shadow-xs">
                  <p className="text-slate-500 font-medium">Không tìm thấy dịch vụ nào phù hợp.</p>
                </div>
              ) : (
                <div className={COMPACT_GRID_FULL}>
                  {paginatedServices.map((srv) => (
                    <Reveal key={srv.id} className="h-full" offset={28}>
                    <CompactPlaceCard
                      frame="service"
                      compact
                      to={`/services/${srv.id}`}
                      name={srv.name}
                      imageUrl={srv.coverImageUrl}
                      FallbackIcon={srv.kind === 'PHOTO' ? Camera : Bike}
                      location={srv.address || 'Mù Cang Chải'}
                      price={formatVnd(srv.priceRef)}
                      priceUnit={srv.priceUnitNote || 'ngày'}
                      badge={srv.categoryBadge ? <CompactCardBadge><span className="truncate">{srv.categoryBadge}</span></CompactCardBadge> : undefined}
                    />
                    </Reveal>
                  ))}
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
                        className={`w-9 h-9 rounded-xl font-bold text-xs transition-all duration-300 cursor-pointer active:scale-95 ${currentPage === i + 1 ? 'bg-[var(--color-primary)] text-white shadow-xs' : 'text-slate-700 bg-white hover:bg-slate-100 border border-slate-200'
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
  );
}
