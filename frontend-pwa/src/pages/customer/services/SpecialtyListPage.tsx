import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { fetchSpecialties, peekSpecialties, SpecialtyDto } from '@/services/specialtyService';
import { CardSkeleton } from '@/components/ui/CardSkeleton';
import Reveal from '@/components/ui/Reveal';
import HomeMotifs from '@/components/home/HomeMotifs';
import CompactPlaceCard from '@/components/ui/CompactPlaceCard';
import { COMPACT_GRID_FULL } from '@/lib/compactCard';
import {
  ChevronLeft,
  ChevronRight,
  UtensilsCrossed
} from 'lucide-react';
import bannerSpecialties from '@/assets/photos/banner-specialties.webp';

/** Đường dẫn chi tiết đặc sản — thuộc mục "Đặc sản" (header, breadcrumb), không còn đi qua trang Nhà hàng. */
const specialtyPath = (id: string) => `/specialties/${id}`;

export default function SpecialtyListPage() {
  // Quay lại từ trang chi tiết: danh sách hiện ngay từ bộ nhớ, làm mới ở nền.
  const [specialties, setSpecialties] = useState<SpecialtyDto[]>(() => peekSpecialties() ?? []);
  const [loading, setLoading] = useState(() => !peekSpecialties());
  const [currentPage, setCurrentPage] = useState(1);

  const ITEMS_PER_PAGE = 8;

  useEffect(() => {
    let alive = true;
    fetchSpecialties().then(data => {
      if (!alive) return;
      setSpecialties(data);
      setLoading(false);
    });
    return () => { alive = false; };
  }, []);

  const paginatedSpecialties = specialties.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);
  const totalPages = Math.ceil(specialties.length / ITEMS_PER_PAGE);

  return (
    <div className="relative isolate w-full flex flex-col min-h-screen overflow-x-clip bg-[linear-gradient(180deg,var(--color-canvas)_0%,#f1faf6_45%,#fbf7ee_100%)]">
      <div aria-hidden="true" className="pointer-events-none absolute right-[-120px] top-[520px] h-[380px] w-[380px] rounded-full bg-emerald-300/20 blur-3xl" />
      <div aria-hidden="true" className="pointer-events-none absolute left-[-140px] top-[1100px] h-[420px] w-[420px] rounded-full bg-amber-200/25 blur-3xl" />
      {/* Họa tiết nét mảnh như trang chủ, phủ phần dưới hero (hero nằm trên lớp này) */}
      <HomeMotifs variant="gift" className="inset-x-0 bottom-0 top-[360px]" />
      {/* Hero Section */}
      <section className="relative w-full min-h-[360px] md:min-h-[360px] flex items-start md:items-center justify-center pt-[calc(145px+var(--safe-top))] md:pt-[calc(130px+var(--safe-top))] pb-10 md:pb-8">
        <div
          className="absolute inset-0 z-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${bannerSpecialties})` }}
        >
          <div className="absolute inset-0 bg-gradient-to-b from-[#0f2d3c]/85 via-[#0f2d3c]/50 to-transparent"></div>
        </div>

        <div className="relative z-10 w-full max-w-4xl mx-auto px-4 text-center">
          <h1 className="text-3xl md:text-4xl lg:text-5xl font-extrabold font-display text-white tracking-tight drop-shadow-md">
            Đặc Sản Bản Địa
          </h1>
        </div>
      </section>

      {/* Main Container */}
      <div className="max-w-[1280px] mx-auto w-full px-4 md:px-8 pt-3 pb-8">
        {/* Breadcrumbs */}
        <div className="flex items-center gap-2 text-xs md:text-sm text-[var(--color-muted)] mb-3">
          <Link to="/" className="hover:text-[var(--color-primary)] transition-colors">Trang chủ</Link>
          <span>/</span>
          <span className="text-[var(--color-ink-deep)] font-semibold">Đặc sản địa phương</span>
        </div>

        <div className="w-full flex flex-col gap-6">
          <div className="flex-1 flex flex-col gap-4 relative min-h-[350px]">
            {loading ? (
              <CardSkeleton count={ITEMS_PER_PAGE} layout="compact-full" />
            ) : paginatedSpecialties.length === 0 ? (
              <div className="bg-white p-10 text-center rounded-2xl border border-slate-200/80 shadow-xs">
                <p className="text-slate-500 font-medium">Chưa có đặc sản nào được thêm.</p>
              </div>
            ) : (
              <div className={COMPACT_GRID_FULL}>
                {paginatedSpecialties.map((spec) => (
                  <Reveal key={spec.id} className="h-full" offset={28}>
                  <CompactPlaceCard
                    frame="specialty"
                    compact
                    to={specialtyPath(spec.id)}
                    name={spec.name}
                    imageUrl={spec.coverImageUrl}
                    FallbackIcon={UtensilsCrossed}
                    location={spec.district}
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
                      className={`w-9 h-9 rounded-xl font-bold text-xs transition-colors cursor-pointer ${
                        currentPage === i + 1
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
