import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Link, useSearchParams } from 'react-router-dom';
import { fetchTransports, TransportDto, TransportFilterParams } from '@/services/transportService';
import { Button } from '@/components/ui/button';
import { CardSkeleton } from '@/components/ui/CardSkeleton';
import Reveal from '@/components/ui/Reveal';
import HomeMotifs from '@/components/home/HomeMotifs';
import CompactPlaceCard, { CompactCardBadge } from '@/components/ui/CompactPlaceCard';
import { COMPACT_GRID_WITH_SIDEBAR, formatVnd } from '@/lib/compactCard';
import {
  SlidersHorizontal,
  ChevronLeft,
  ChevronRight,
  X,
  ArrowUpDown,
  RotateCcw,
  Sparkles,
  Bus,
  Bike,
  Navigation2
} from 'lucide-react';
import bannerTransport from '@/assets/photos/banner-transport.webp';
import { ToolbarSkeleton, FilterPanelSkeleton, LIST_SKELETON_SPECS } from '@/components/ui/ListPageSkeleton';
import { useFirstLoad } from '@/hooks/useFirstLoad';

const SKELETON = LIST_SKELETON_SPECS.transport;

const CATEGORY_GROUPS = [
  { id: 'LOCAL_MOTO', label: 'Xe ôm bản địa vượt dốc', desc: 'Đồi Móng Ngựa, Mâm Xôi, Rừng Trúc, Ngã 3' },
  { id: 'TOUR_MOTO', label: 'Xe ôm tour & ghép đoàn', desc: 'Thuê xế bản địa trọn gói theo tour cả ngày' },
  { id: 'SELF_DRIVE', label: 'Thuê xe tự lái (Xe máy / Ô tô)', desc: 'Xe số phượt đèo Hùng Nga, Ô tô 2 cầu bán tải' },
  { id: 'INTERCITY_BUS', label: 'Xe khách & Limousine', desc: 'Hà Nội – Mù Cang Chải (Hà Trang, An Bình...)' },
  { id: 'SHARED_CAR', label: 'Xe ghép liên xã & taxi', desc: 'Kết nối Lào Cai, Chế Cu Nha, Nậm Có' },
];

const P400 = '400.000đ';
const P350 = '350.000đ';
const TRANSPORT_SAMPLE_ROWS: { name: string; note?: string; cells: { time?: string; price?: string }[]; route: string }[] = [
  { name: '1. Nhà xe Mỹ đình - MCC', cells: [{ time: '9h15', price: P400 }, { time: '16h30', price: P400 }, { time: '20h30', price: P400 }, { time: '5h30', price: P400 }], route: 'QL32' },
  { name: '2. Nhà xe Mỹ đình - Ngã ba Kim', note: '(cách MCC 18km)', cells: [{ time: '10h', price: P400 }, { time: '17h00', price: P400 }, { time: '20h30', price: P400 }, { time: '5h30', price: P400 }], route: 'QL32' },
  { name: '3. Nhà xe Mỹ đình - MCC', cells: [{ time: '1h00', price: P350 }, { time: '13h00', price: P350 }, { time: '21h30', price: P350 }, { price: '300.000đ' }], route: 'CT Nội Bài - Lào Cai' },
  { name: '4. Nhà xe Mỹ đình - MCC', cells: [{ time: '18h30', price: P350 }, { time: '2h', price: P350 }, { time: '21h', price: P350 }, { time: '4h', price: P350 }], route: 'QL32' },
  { name: '5. Nhà xe đón điểm - MCC', cells: [{ time: 'Đón tại Hà Nội (Lĩnh Nam, Hồ Tùng Mậu, Linh Đàm)', price: P350 }, { time: '5h00', price: P350 }, { time: '20h30', price: P350 }, { time: 'Gà', price: P350 }], route: 'QL32' },
];

export default function TransportListPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const [transports, setTransports] = useState<TransportDto[]>([]);
  const [loading, setLoading] = useState(true);
  const firstLoad = useFirstLoad(loading);
  const [sortBy, setSortBy] = useState<'recommended' | 'price_asc' | 'price_desc'>('recommended');

  const [filters, setFilters] = useState<TransportFilterParams>(() => {
    const initial: TransportFilterParams = {};
    const q = searchParams.get('q');
    const groups = searchParams.get('groups');
    if (q) initial.keyword = q;
    if (groups) initial.categoryGroups = groups.split(',');
    return initial;
  });

  const [currentPage, setCurrentPage] = useState(1);
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);

  const ITEMS_PER_PAGE = 8;

  const handleFilterChange = (updates: Partial<TransportFilterParams>) => {
    setFilters(prev => {
      const newFilters = { ...prev, ...updates };
      const newParams = new URLSearchParams(searchParams);
      if (newFilters.keyword) newParams.set('q', newFilters.keyword); else newParams.delete('q');
      if (newFilters.categoryGroups && newFilters.categoryGroups.length > 0) newParams.set('groups', newFilters.categoryGroups.join(',')); else newParams.delete('groups');
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
    const groups = searchParams.get('groups');
    setFilters({
      keyword: q || undefined,
      categoryGroups: groups ? groups.split(',') : undefined,
    });
  }, [searchParams]);

  useEffect(() => {
    setLoading(true);
    fetchTransports(filters).then(data => {
      setTransports(data);
      setLoading(false);
    }).catch(err => {
      console.error(err);
      setLoading(false);
    });
  }, [filters]);

  const hasActiveFilters = Boolean(filters.keyword || filters.categoryGroups?.length);

  const sortedTransports = [...transports].sort((a, b) => {
    if (sortBy === 'price_asc') return a.priceRef - b.priceRef;
    if (sortBy === 'price_desc') return b.priceRef - a.priceRef;
    return 0;
  });

  const paginatedTransports = sortedTransports.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);
  const totalPages = Math.ceil(sortedTransports.length / ITEMS_PER_PAGE);

  const renderFilters = () => (
    <div className="bg-white ring-1 ring-slate-900/[0.06] rounded-2xl overflow-hidden shadow-[0_12px_32px_-18px_rgba(16,40,34,0.25)]">
      <div className="p-4 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white flex items-center justify-between">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="w-4 h-4 text-[var(--color-primary)]" />
          <h3 className="font-bold text-[var(--color-ink-deep)] text-base">Phân loại di chuyển</h3>
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

      <div className="p-4">
        <h4 className="font-bold text-[var(--color-ink-deep)] mb-3 text-sm">Hình thức vận chuyển</h4>
        <div className="flex flex-col gap-3">
          {CATEGORY_GROUPS.map(cg => {
            const isChecked = filters.categoryGroups?.includes(cg.id) || false;
            return (
              <label key={cg.id} className="flex items-start gap-2.5 cursor-pointer group">
                <input
                  type="checkbox"
                  className="w-4 h-4 mt-0.5 rounded-md border-slate-300 accent-[var(--color-primary)] cursor-pointer"
                  checked={isChecked}
                  onChange={(e) => {
                    const current = filters.categoryGroups || [];
                    handleFilterChange({
                      categoryGroups: e.target.checked
                        ? [...current, cg.id]
                        : current.filter(c => c !== cg.id)
                    });
                  }}
                />
                <div className="flex flex-col">
                  <span className={`text-sm leading-tight transition-colors ${isChecked ? 'font-bold text-[var(--color-primary)]' : 'font-medium text-slate-700 group-hover:text-[var(--color-primary)]'}`}>
                    {cg.label}
                  </span>
                  <span className="text-[11px] text-slate-400 mt-0.5 leading-snug">
                    {cg.desc}
                  </span>
                </div>
              </label>
            );
          })}
        </div>
      </div>
    </div>
  );

  return (
    <div className="relative isolate w-full flex flex-col min-h-screen overflow-x-clip bg-[linear-gradient(180deg,var(--color-canvas)_0%,#f1faf6_45%,#fbf7ee_100%)]">
      <div aria-hidden="true" className="pointer-events-none absolute right-[-120px] top-[520px] h-[380px] w-[380px] rounded-full bg-emerald-300/20 blur-3xl" />
      <div aria-hidden="true" className="pointer-events-none absolute left-[-140px] top-[1100px] h-[420px] w-[420px] rounded-full bg-amber-200/25 blur-3xl" />
      {/* Họa tiết nét mảnh như trang chủ, phủ phần dưới hero (hero nằm trên lớp này) */}
      <HomeMotifs variant="transport" className="inset-x-0 bottom-0 top-[360px]" />
      {/* Hero Section */}
      <section className="relative w-full min-h-[360px] md:min-h-[360px] flex items-start md:items-center justify-center pt-[calc(145px+var(--safe-top))] md:pt-[calc(130px+var(--safe-top))] pb-10 md:pb-8">
        <div
          className="absolute inset-0 z-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${bannerTransport})` }}
        >
          <div className="absolute inset-0 bg-gradient-to-b from-[#0f2d3c]/85 via-[#0f2d3c]/60 to-transparent"></div>
        </div>

        <div className="relative z-10 w-full max-w-4xl mx-auto px-4 text-center">
          <h1 className="text-3xl md:text-4xl lg:text-5xl font-extrabold font-display text-white tracking-tight drop-shadow-md">
            Dịch Vụ Di Chuyển & Xe Ôm Vượt Dốc
          </h1>
        </div>
      </section>

      {/* Main Container */}
      <div className="max-w-[1280px] mx-auto w-full px-4 md:px-8 pt-3 pb-8">
        <div className="flex items-center gap-2 text-xs md:text-sm text-[var(--color-muted)] mb-3">
          <Link to="/" className="hover:text-[var(--color-primary)] transition-colors">Trang chủ</Link>
          <span>/</span>
          <span className="text-[var(--color-ink-deep)] font-semibold">Dịch vụ di chuyển</span>
        </div>

        <section className="mb-6 overflow-hidden rounded-2xl bg-white ring-1 ring-slate-900/[0.06] shadow-[0_12px_32px_-18px_rgba(16,40,34,0.28)]">
          <div className="relative flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3.5 md:px-5">
            <div aria-hidden="true" className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-emerald-500 via-teal-400 to-amber-400" />
            <div className="pt-1">
              <h2 className="text-base md:text-lg font-bold text-[var(--color-ink-deep)]">Lịch trình xe Hà Nội – MCC (khứ hồi)</h2>
              <p className="text-xs text-[var(--color-muted)]">Bảng mẫu tham khảo · giá vé một chiều/người</p>
            </div>
            <span className="mt-1 inline-flex items-center rounded-full border border-[var(--color-primary-100)] bg-[var(--color-primary-50)] px-3 py-1 text-xs font-bold text-[var(--color-primary)]">
              An toàn • Đúng giờ • Thoải mái
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[780px] table-fixed border-collapse text-sm">
              <colgroup>
                <col className="w-[22%]" />
                <col className="w-[14%]" /><col className="w-[14%]" /><col className="w-[14%]" /><col className="w-[14%]" />
                <col className="w-[22%]" />
              </colgroup>
              <thead>
                <tr className="text-[11px] font-bold uppercase tracking-wider">
                  <th rowSpan={2} className="sticky left-0 z-10 bg-slate-50 px-4 py-3 text-left text-slate-500 border-b border-slate-200">Nhà xe</th>
                  <th colSpan={2} className="bg-emerald-50 px-3 py-2 text-center text-emerald-800 border-b border-emerald-100 border-l border-slate-200">Chiều đi · Hà Nội → MCC</th>
                  <th colSpan={2} className="bg-amber-50 px-3 py-2 text-center text-amber-800 border-b border-amber-100 border-l border-slate-200">Chiều về · MCC → Hà Nội</th>
                  <th rowSpan={2} className="bg-slate-50 px-4 py-3 text-center text-slate-500 border-b border-slate-200 border-l border-slate-200">Tuyến</th>
                </tr>
                <tr className="text-center">
                  {[['A', 'XB Mỹ Đình', 'emerald'], ['B', 'Đến MCC', 'emerald'], ['C', 'XB MCC', 'amber'], ['D', 'Đến Mỹ Đình', 'amber']].map(([k, label, tone], i) => (
                    <th key={k} className={`px-3 py-2 border-b border-slate-200 ${tone === 'emerald' ? 'bg-emerald-50/60' : 'bg-amber-50/60'} ${i % 2 === 0 ? 'border-l border-slate-200' : ''}`}>
                      <span className={`mr-1.5 inline-flex h-5 w-5 items-center justify-center rounded-md text-[11px] font-extrabold text-white ${tone === 'emerald' ? 'bg-emerald-600' : 'bg-amber-500'}`}>{k}</span>
                      <span className="text-xs font-semibold text-slate-600">{label}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {TRANSPORT_SAMPLE_ROWS.map((r, ri) => {
                  const m = r.name.match(/^(\d+)\.\s*(.*)$/);
                  const bg = ri % 2 ? 'bg-slate-50/60' : 'bg-white';
                  return (
                    <tr key={r.name} className={`${bg} transition-colors hover:bg-emerald-50/50 group`}>
                      <td className={`sticky left-0 z-10 ${bg} group-hover:bg-emerald-50 px-4 py-3 text-left border-b border-slate-100`}>
                        <div className="flex items-start gap-2.5">
                          {m && <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary-50)] text-xs font-bold text-[var(--color-primary)]">{m[1]}</span>}
                          <div className="min-w-0">
                            <div className="font-semibold leading-snug text-[var(--color-ink-deep)]">{m ? m[2] : r.name}</div>
                            {r.note && <div className="text-xs text-slate-500">{r.note}</div>}
                          </div>
                        </div>
                      </td>
                      {r.cells.map((c, i) => (
                        <td key={i} className={`px-3 py-3 text-center align-middle border-b border-slate-100 ${i % 2 === 0 ? 'border-l border-slate-200' : ''}`}>
                          <div className="flex flex-col items-center gap-1.5">
                            {c.time && <div className={`${c.time.length > 10 ? 'text-xs font-medium leading-snug text-slate-600' : 'text-base font-bold tabular-nums text-slate-800'}`}>{c.time}</div>}
                            {c.price && <span className="inline-block rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold tabular-nums text-amber-800 ring-1 ring-amber-200">{c.price}</span>}
                          </div>
                        </td>
                      ))}
                      <td className="px-4 py-3 text-center border-b border-slate-100 border-l border-slate-200">
                        <span className="inline-block rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-800 ring-1 ring-emerald-100">{r.route}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="border-t border-slate-100 bg-slate-50/60 px-4 py-2.5 text-xs italic text-slate-500">Đặt xe ngay – Đồng hành cùng bạn trên mọi hành trình!</p>
        </section>

        {firstLoad ? (
          <ToolbarSkeleton {...SKELETON.toolbar} />
        ) : (<>
        <div className="relative overflow-hidden bg-white/90 backdrop-blur-md ring-1 ring-slate-900/[0.06] rounded-2xl p-4 md:p-5 shadow-[0_12px_32px_-18px_rgba(16,40,34,0.28)] mb-6 transition-shadow duration-500 hover:shadow-[0_18px_40px_-18px_rgba(16,40,34,0.34)]">
          <div aria-hidden="true" className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-emerald-500 via-teal-400 to-amber-400" />
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3.5 border-b border-slate-100">
            <div>
              <h2 className="text-base md:text-lg font-bold text-[var(--color-ink-deep)] flex items-center gap-2">
                Các phương án di chuyển
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-[var(--color-primary-50)] text-[var(--color-primary)] border border-[var(--color-primary-100)]">
                  {transports.length} dịch vụ
                </span>
              </h2>
            </div>

            <div className="flex items-center gap-2.5 shrink-0">
              <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 hover:border-slate-300 transition-colors">
                <ArrowUpDown className="w-3.5 h-3.5 text-[var(--color-primary)]" />
                <span className="text-xs text-slate-500 font-medium hidden md:inline">Sắp xếp:</span>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as 'recommended' | 'price_asc' | 'price_desc')}
                  className="bg-transparent text-xs md:text-sm font-semibold text-[var(--color-ink-deep)] focus:outline-none cursor-pointer"
                >
                  <option value="recommended">Gợi ý hàng đầu</option>
                  <option value="price_asc">Giá: Thấp đến Cao</option>
                  <option value="price_desc">Giá: Cao đến Thấp</option>
                </select>
              </div>
            </div>
          </div>

          {/* Quick filter chips theo nhóm phân loại */}
          <div className="flex items-center gap-2 pt-3.5 overflow-x-auto scrollbar-hide pb-1">
            <span className="text-xs font-bold text-[var(--color-muted)] uppercase tracking-wider shrink-0 flex items-center gap-1 mr-1">
              <Sparkles className="w-3.5 h-3.5 text-amber-500" /> Lọc nhanh:
            </span>

            <button
              onClick={() => handleFilterChange({ categoryGroups: undefined })}
              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${!filters.categoryGroups || filters.categoryGroups.length === 0
                ? 'bg-gradient-to-br from-emerald-600 to-teal-500 text-white shadow-md shadow-emerald-600/30'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
            >
              Tất cả ({transports.length})
            </button>

            {CATEGORY_GROUPS.map(cg => {
              const isSelected = filters.categoryGroups?.includes(cg.id);
              return (
                <button
                  key={cg.id}
                  onClick={() => {
                    const current = filters.categoryGroups || [];
                    handleFilterChange({
                      categoryGroups: isSelected
                        ? current.filter(c => c !== cg.id)
                        : [cg.id]
                    });
                  }}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1.5 cursor-pointer ${isSelected
                    ? 'bg-gradient-to-br from-emerald-600 to-teal-500 text-white shadow-md shadow-emerald-600/30'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                >
                  {cg.id === 'LOCAL_MOTO' && <Bike className="w-3.5 h-3.5 text-amber-500" />}
                  {cg.id === 'TOUR_MOTO' && <Navigation2 className="w-3.5 h-3.5 text-emerald-500" />}
                  {cg.id === 'INTERCITY_BUS' && <Bus className="w-3.5 h-3.5 text-cyan-500" />}
                  <span>{cg.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        </>)}
        {/* Layout with Sidebar */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Desktop Filter Sidebar */}
          <div className="hidden lg:block lg:col-span-1">
            <div className="sticky top-24">{firstLoad ? <FilterPanelSkeleton {...SKELETON.filter} /> : renderFilters()}</div>
          </div>

          {/* Mobile Filter Button */}
          <div className="lg:hidden mb-2">
            <Button
              variant="outline"
              className="w-full flex items-center justify-center gap-2 rounded-xl font-bold py-3 text-sm bg-white border-slate-200 shadow-xs"
              onClick={() => setMobileFilterOpen(true)}
            >
              <SlidersHorizontal className="w-4 h-4 text-[var(--color-primary)]" />
              Bộ Lọc Phân Loại ({hasActiveFilters ? 'Đang lọc' : 'Mặc định'})
            </Button>
          </div>

          {/* Mobile Filter Modal */}
          {mobileFilterOpen && createPortal(
            <div className="fixed inset-0 z-[99999] bg-black/50 flex justify-end backdrop-blur-xs">
              <div className="bg-white w-full max-w-xs h-full p-5 pt-[calc(1rem+var(--safe-top))] pb-[calc(1rem+var(--safe-bottom))] overflow-y-auto flex flex-col justify-between shadow-2xl rounded-l-3xl">
                <div>
                  <div className="flex items-center justify-between pb-3.5 border-b border-slate-100 mb-4">
                    <h3 className="font-bold text-base text-[var(--color-ink-deep)]">Bộ lọc</h3>
                    <button
                      onClick={() => setMobileFilterOpen(false)}
                      className="p-1 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                  {renderFilters()}
                </div>
                <div className="pt-4 border-t border-slate-100 flex gap-2">
                  <Button
                    variant="outline"
                    className="flex-1 rounded-xl text-xs font-bold border-slate-200"
                    onClick={handleClearFilters}
                  >
                    Xoá lọc
                  </Button>
                  <Button
                    variant="primary"
                    className="flex-1 rounded-xl text-xs font-bold bg-[var(--color-primary)] text-white"
                    onClick={() => setMobileFilterOpen(false)}
                  >
                    Áp dụng
                  </Button>
                </div>
              </div>
            </div>
          , document.body)}

          {/* List Area */}
          <div className="lg:col-span-3">
            {loading ? (
              <CardSkeleton count={SKELETON.count} layout="compact" />
            ) : (
              <div>
                {paginatedTransports.length === 0 ? (
                  <div className="bg-white p-10 text-center rounded-2xl border border-slate-200/80 shadow-xs">
                    <Bike className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                    <p className="text-slate-500 font-medium">Không tìm thấy dịch vụ di chuyển nào phù hợp.</p>
                    <button
                      onClick={handleClearFilters}
                      className="mt-3 px-4 py-2 cta cta-primary text-white text-xs font-bold rounded-xl cursor-pointer transition-colors"
                    >
                      Xem tất cả dịch vụ
                    </button>
                  </div>
                ) : (
                  <div className={COMPACT_GRID_WITH_SIDEBAR}>
                    {paginatedTransports.map((t) => (
                      <Reveal key={t.id} className="h-full" offset={28}>
                      <CompactPlaceCard
                        frame="transport"
                        compact
                        to={`/transport/${t.id}`}
                        name={t.name}
                        imageUrl={t.coverImageUrl}
                        FallbackIcon={Bus}
                        location={t.hasServiceProfile && t.routeType ? t.routeType : t.address || t.routeType}
                        price={formatVnd(t.priceRef)}
                        priceUnit={t.priceUnitNote || 'lượt'}
                        badge={t.categoryGroupName ? (
                          <CompactCardBadge className={
                            t.categoryGroup === 'LOCAL_MOTO' ? 'bg-amber-600' :
                              t.categoryGroup === 'TOUR_MOTO' ? 'bg-emerald-700' :
                                t.categoryGroup === 'SELF_DRIVE' ? 'bg-indigo-600' :
                                  'bg-[var(--color-primary)]'
                          }>
                            <span className="truncate">{t.categoryGroupName}</span>
                          </CompactCardBadge>
                        ) : undefined}
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
    </div>
  );
}
