import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { fetchFestivals, FestivalDto } from '@/services/festivalService';
import ImagePlaceholder from '@/components/ui/ImagePlaceholder';
import { CardSkeleton } from '@/components/ui/CardSkeleton';
import Reveal from '@/components/ui/Reveal';
import HomeMotifs from '@/components/home/HomeMotifs';
import CompactPlaceCard, { CompactCardBadge } from '@/components/ui/CompactPlaceCard';
import { COMPACT_GRID_FULL } from '@/lib/compactCard';
import { Calendar, Flame } from 'lucide-react';
import LocalExperiencesSection from '@/components/culture/LocalExperiencesSection';
import bannerCulture from '@/assets/photos/banner-culture.webp';
import { TabsSkeleton } from '@/components/ui/ListPageSkeleton';
import { useFirstLoad } from '@/hooks/useFirstLoad';

export default function CultureFestivalPage() {
  const [festivals, setFestivals] = useState<FestivalDto[]>([]);
  const [loading, setLoading] = useState(true);
  const firstLoad = useFirstLoad(loading);
  const [error, setError] = useState<string | null>(null);
  const [activeSeason, setActiveSeason] = useState<'ALL' | 'CURRENT' | 'SPRING' | 'AUTUMN'>('ALL');

  const hasMonthInRange = (festival: FestivalDto, months: number[]) => {
    if (!festival.suitableDateStart || !festival.suitableDateEnd) {
      return false;
    }

    const startMonth = Number(festival.suitableDateStart.split('-')[1]);
    const endMonth = Number(festival.suitableDateEnd.split('-')[1]);
    return months.some(month => {
      if (startMonth <= endMonth) {
        return month >= startMonth && month <= endMonth;
      }
      return month >= startMonth || month <= endMonth;
    });
  };

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchFestivals()
      .then(data => setFestivals(data))
      .catch(fetchError => {
        console.error('Không thể tải dữ liệu lễ hội:', fetchError);
        setFestivals([]);
        setError('Không thể tải dữ liệu lễ hội lúc này. Vui lòng thử lại.');
      })
      .finally(() => setLoading(false));
  }, []);

  // Các lễ hội thích hợp theo mùa / thời điểm hiện tại
  const currentSeasonFestivals = festivals.filter(f => f.isCurrentSeason);

  // Lọc theo tabs & keyword
  const filteredFestivals = festivals.filter(f => {
    let matchSeason = true;
    if (activeSeason === 'CURRENT') {
      matchSeason = Boolean(f.isCurrentSeason);
    } else if (activeSeason === 'AUTUMN') {
      matchSeason = hasMonthInRange(f, [9, 10, 11]);
    } else if (activeSeason === 'SPRING') {
      matchSeason = hasMonthInRange(f, [12, 1, 2, 3]);
    }

    return matchSeason;
  });

  return (
    <div className="relative isolate w-full flex flex-col min-h-screen overflow-x-clip bg-[linear-gradient(180deg,var(--color-canvas)_0%,#f1faf6_45%,#fbf7ee_100%)]">
      <div aria-hidden="true" className="pointer-events-none absolute right-[-120px] top-[520px] h-[380px] w-[380px] rounded-full bg-emerald-300/20 blur-3xl" />
      <div aria-hidden="true" className="pointer-events-none absolute left-[-140px] top-[1100px] h-[420px] w-[420px] rounded-full bg-amber-200/25 blur-3xl" />
      {/* Họa tiết nét mảnh như trang chủ, phủ phần dưới hero (hero nằm trên lớp này) */}
      <HomeMotifs variant="culture" className="inset-x-0 bottom-0 top-[360px]" />
      {/* Hero Section */}
      <section className="relative w-full min-h-[360px] md:min-h-[360px] flex items-start md:items-center justify-center pt-[calc(145px+var(--safe-top))] md:pt-[calc(130px+var(--safe-top))] pb-10 md:pb-8">
        <div
          className="absolute inset-0 z-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${bannerCulture})` }}
        >
          <div className="absolute inset-0 bg-gradient-to-b from-[#0f2d3c]/85 via-[#0f2d3c]/50 to-transparent"></div>
        </div>

        <div className="relative z-10 w-full max-w-4xl mx-auto px-4 text-center">
          <h1 className="text-3xl md:text-4xl lg:text-5xl font-extrabold font-display text-white tracking-tight drop-shadow-md">
            Trải Nghiệm & Lễ Hội Văn Hóa
          </h1>
        </div>
      </section>

      {/* Main Container */}
      <div className="max-w-[1280px] mx-auto w-full px-4 md:px-8 pt-3 pb-12">
        {/* Breadcrumbs */}
        <div className="flex items-center gap-2 text-xs md:text-sm text-[var(--color-muted)] mb-5">
          <Link to="/" className="hover:text-[var(--color-primary)] transition-colors">Trang chủ</Link>
          <span>/</span>
          <span className="text-[var(--color-ink-deep)] font-semibold">Trải nghiệm & Lễ hội bản địa</span>
        </div>

        {/* Trải nghiệm do nhà cung cấp tổ chức (ẩn khi chưa có) */}
        <LocalExperiencesSection />

        {firstLoad ? (
          <TabsSkeleton count={4} className="mb-6 pb-3.5" />
        ) : (<>
        {/* Filter Tabs by Season */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6 pb-3.5 border-b border-slate-100">
          <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide py-1">
            <button
              onClick={() => setActiveSeason('ALL')}
              className={`px-4 py-2 rounded-full text-xs md:text-sm font-semibold transition-all cursor-pointer ${activeSeason === 'ALL'
                ? 'bg-gradient-to-br from-emerald-600 to-teal-500 text-white shadow-md shadow-emerald-600/30'
                : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
                }`}
            >
              Tất cả lễ hội ({festivals.length})
            </button>
            <button
              onClick={() => setActiveSeason('CURRENT')}
              className={`px-4 py-2 rounded-full text-xs md:text-sm font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${activeSeason === 'CURRENT'
                ? 'bg-amber-600 text-white shadow-xs'
                : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
                }`}
            >
              <Flame className="w-3.5 h-3.5 text-amber-300 fill-amber-300" />
              Đang vào mùa ({currentSeasonFestivals.length})
            </button>
            <button
              onClick={() => setActiveSeason('AUTUMN')}
              className={`px-4 py-2 rounded-full text-xs md:text-sm font-semibold transition-all cursor-pointer ${activeSeason === 'AUTUMN'
                ? 'bg-gradient-to-br from-emerald-600 to-teal-500 text-white shadow-md shadow-emerald-600/30'
                : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
                }`}
            >
              Lễ hội Mùa Thu & Lúa Chín
            </button>
            <button
              onClick={() => setActiveSeason('SPRING')}
              className={`px-4 py-2 rounded-full text-xs md:text-sm font-semibold transition-all cursor-pointer ${activeSeason === 'SPRING'
                ? 'bg-gradient-to-br from-emerald-600 to-teal-500 text-white shadow-md shadow-emerald-600/30'
                : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
                }`}
            >
              Lễ hội Mùa Xuân & Đón Tết
            </button>
          </div>
        </div>

        </>)}
        {/* List of Festivals */}
        {loading ? (
          <>
            <CardSkeleton count={8} layout="compact-full" />
            <div className="hidden flex items-center justify-center p-12 text-[var(--color-primary)] font-bold">
            Đang tải dữ liệu lễ hội văn hóa...
            </div>
          </>
        ) : error ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-6 py-8 text-center text-sm text-amber-900 shadow-xs">
            {error}
          </div>
        ) : filteredFestivals.length === 0 ? (
          <div className="flex flex-col items-center gap-4 rounded-2xl border-2 border-dashed border-slate-200 bg-white px-6 py-12 text-center shadow-xs">
            <div className="h-32 w-56 max-w-full overflow-hidden rounded-xl border border-slate-200">
              <ImagePlaceholder variant="hero" label="Lịch lễ hội đang được cập nhật" />
            </div>
            <div>
              <p className="text-base font-bold text-slate-900">Chưa có lễ hội nào trong mục này</p>
              <p className="mt-1 text-sm font-medium text-slate-500 max-w-md mx-auto">
                Đội ngũ đang thu thập lịch lễ hội Mù Cang Chải – Lào Cai theo mùa. Hãy quay lại gần ngày hội Mùa Vàng (tháng 9–10)!
              </p>
            </div>
            <Link to="/homestays" className="rounded-xl cta cta-primary px-5 py-2.5 text-sm font-bold text-white shadow-xs transition-colors ">
              Xem homestay cho chuyến đi lễ hội →
            </Link>
          </div>
        ) : (
          <div className={COMPACT_GRID_FULL}>
            {filteredFestivals.map((fest) => (
              <Reveal key={fest.id} className="h-full" offset={28}>
              <CompactPlaceCard
                frame="culture"
                compact
                to={`/festivals/${fest.slug}`}
                name={fest.name}
                imageUrl={fest.coverImageUrl}
                location={fest.location || fest.regionName}
                badge={(fest.timeRange || fest.seasonNote) && (
                  <CompactCardBadge className={fest.isCurrentSeason ? 'bg-amber-500' : 'bg-[var(--color-primary)]'}>
                    {fest.isCurrentSeason ? <Flame className="h-3 w-3 shrink-0 fill-white" /> : <Calendar className="h-3 w-3 shrink-0" />}
                    <span className="truncate">{fest.timeRange || fest.seasonNote}</span>
                  </CompactCardBadge>
                )}
              />
              </Reveal>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
