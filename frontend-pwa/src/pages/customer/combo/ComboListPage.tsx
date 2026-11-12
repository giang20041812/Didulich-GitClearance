import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, MapPin, Utensils } from 'lucide-react';
import { BRAND_NAME } from '@/components/ui/logo';
import { mediaUrl } from '@/lib/mediaUrl';
import { formatVnd } from '@/lib/serviceGroups';
import { publicComboApi } from '@/services/publicServicesApi';
import comboImage from '@/assets/fluent/combo.webp';
import type { ComboCard } from '@/types/combo';

type DurationFilter = 'all' | 'day' | 'short' | 'long';
const FILTERS: { id: DurationFilter; label: string; match: (c: ComboCard) => boolean }[] = [
  { id: 'all', label: 'Tất cả', match: () => true },
  { id: 'day', label: 'Đi trong ngày', match: (c) => c.days === 1 },
  { id: 'short', label: '2–3 ngày', match: (c) => c.days >= 2 && c.days <= 3 },
  { id: 'long', label: 'Từ 4 ngày', match: (c) => c.days >= 4 },
];

/** Danh sách combo: trọn lịch trình, địa điểm, giờ đi và giá "từ" mỗi khách (không gồm ăn uống). */
export default function ComboListPage() {
  const [combos, setCombos] = useState<ComboCard[] | null>(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<DurationFilter>('all');

  useEffect(() => {
    let alive = true;
    publicComboApi.list()
      .then((list) => { if (alive) setCombos(list); })
      .catch((err: unknown) => { if (alive) setError(err instanceof Error ? err.message : 'Không tải được danh sách combo.'); });
    return () => { alive = false; };
  }, []);

  const shown = useMemo(() => (combos ?? []).filter((FILTERS.find((f) => f.id === filter) ?? FILTERS[0]!).match), [combos, filter]);

  return (
    <div className="mx-auto w-full max-w-[1280px] px-4 pb-12 pt-6 md:px-8">
      <header className="flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex items-start gap-3">
          <img src={comboImage} alt="" aria-hidden width={52} height={52} className="h-[52px] w-[52px] shrink-0 object-contain" />
          <div>
            <h1 className="font-display text-2xl font-extrabold text-ink-deep sm:text-3xl">Combo du lịch</h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-600">
              Trọn lịch trình, địa điểm, giờ đi và giá. Giá không gồm ăn uống — mỗi combo có gợi ý nhà hàng quanh lộ trình.
            </p>
          </div>
        </div>
        <div role="tablist" aria-label="Thời lượng" className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <button key={f.id} type="button" role="tab" aria-selected={filter === f.id} onClick={() => setFilter(f.id)}
              className={`min-h-9 rounded-full border px-3.5 text-xs font-semibold transition-colors ${filter === f.id ? 'border-ink-deep bg-ink-deep text-white' : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'}`}>
              {f.label}
            </button>
          ))}
        </div>
      </header>

      {error && <p role="alert" className="mt-6 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</p>}

      {!combos && !error ? (
        <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true">
          {[0, 1, 2].map((i) => <div key={i} className="h-80 animate-pulse rounded-2xl bg-white" />)}
        </div>
      ) : combos && shown.length === 0 ? (
        <div className="mt-10 flex flex-col items-center gap-2 text-center text-sm text-slate-500">
          <img src={comboImage} alt="" aria-hidden className="h-16 w-16 object-contain opacity-70" />
          <p>{combos.length === 0 ? 'Chưa có combo nào đang mở bán.' : 'Không có combo nào với thời lượng này.'}</p>
        </div>
      ) : (
        <ul className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((combo) => (
            <li key={combo.id}>
              <Link to={`/combo/${combo.slug}`} className="group flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[var(--shadow-sm)] transition-shadow hover:shadow-[var(--shadow-md)]">
                <div className="relative aspect-[4/3] overflow-hidden bg-canvas">
                  {combo.coverImageUrl
                    ? <img src={mediaUrl(combo.coverImageUrl, 640)} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-500" />
                    : <img src={comboImage} alt="" className="m-auto h-full w-24 object-contain opacity-60" />}
                  <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-white/95 px-2.5 py-1 text-xs font-bold text-ink-deep">
                    <CalendarDays className="h-3.5 w-3.5 text-primary" /> {combo.durationText}
                  </span>
                </div>
                <div className="flex flex-1 flex-col gap-2 p-4">
                  <h2 className="text-base font-bold leading-snug text-ink-deep group-hover:text-primary">{combo.title}</h2>
                  <p className="line-clamp-2 text-sm text-slate-600">{combo.summary}</p>
                  {combo.highlights.length > 0 && (
                    <p className="flex items-start gap-1.5 text-xs text-slate-500">
                      <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                      <span className="line-clamp-2">{combo.highlights.join(' · ')}</span>
                    </p>
                  )}
                  <div className="mt-auto flex items-end justify-between gap-2 border-t border-slate-100 pt-3">
                    <div>
                      <p className="text-[11px] text-slate-500">Từ</p>
                      <p className="text-lg font-extrabold text-ink-deep">{formatVnd(combo.priceFrom)}<span className="text-xs font-semibold text-slate-500"> / khách</span></p>
                    </div>
                    <span className="flex items-center gap-1 text-[11px] text-slate-500"><Utensils className="h-3.5 w-3.5" /> Chưa gồm ăn uống</span>
                  </div>
                  <p className="text-[11px] text-slate-400">Tổ chức: {combo.providerName ?? BRAND_NAME}</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
