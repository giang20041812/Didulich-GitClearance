import { useEffect, useState } from 'react';
import { Compass, Route } from 'lucide-react';
import JourneyCard from '@/components/journey/JourneyCard';
import { MyJourneysSkeleton } from '@/components/experience/FeedCardSkeleton';
import type { JourneyView } from '@/types/journey';
import { journeyPhase, journeyRange } from '@/lib/journey';
import { fetchMyJourneys } from '@/services/journeyService';
import { getApiErrorMessage } from '@/lib/apiError';

const GROUPS = [
  { phase: 'today', title: 'Đang đi' },
  { phase: 'upcoming', title: 'Sắp đi' },
  { phase: 'undated', title: 'Chưa chọn ngày' },
  { phase: 'past', title: 'Đã đi' },
] as const;

/**
 * "Của tôi" (trang Lịch trình): lịch trình của khách theo giai đoạn (đang đi → sắp đi → chưa chọn ngày → đã đi). Nút tạo
 * lịch trình nằm ở đầu trang Lịch trình — danh sách không lặp lại; trạng thái trống chỉ gợi ý sang mục Khám phá.
 */
export default function MyJourneysList({ onExplore }: { onExplore?: () => void }) {
  const [journeys, setJourneys] = useState<JourneyView[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    fetchMyJourneys()
      .then((list) => { if (alive) setJourneys(list); })
      .catch((err: unknown) => { if (alive) setError(getApiErrorMessage(err, 'Không tải được lịch trình.')); });
    return () => { alive = false; };
  }, []);

  if (error) return <p className="rounded-2xl bg-rose-50 p-4 text-sm font-semibold text-rose-700 ring-1 ring-rose-200">{error}</p>;
  if (!journeys) return <MyJourneysSkeleton />;
  if (journeys.length === 0) {
    return (
      <div className="rounded-2xl bg-white px-6 py-10 text-center ring-1 ring-slate-200">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-[#edfbf7] text-[#0a7d64]">
          <Route className="h-6 w-6" aria-hidden />
        </span>
        <p className="mt-3 text-base font-extrabold text-slate-900">Chưa có lịch trình nào</p>
        <p className="mx-auto mt-1 max-w-sm text-sm leading-relaxed text-slate-600">
          Lịch trình bạn tạo hoặc áp dụng từ du khách khác sẽ nằm ở đây — kèm nhắc giờ, check-in và ô Chỗ ở.
        </p>
        {onExplore && (
          <button type="button" onClick={onExplore} className="mt-4 inline-flex min-h-11 items-center gap-1.5 rounded-xl px-4 text-sm font-bold text-[#06604a] ring-1 ring-[#cfe3d8] hover:ring-[#0a7d64] cursor-pointer">
            <Compass className="h-4 w-4" aria-hidden /> Xem lịch trình du khách
          </button>
        )}
      </div>
    );
  }

  const sortKey = (j: JourneyView) => journeyRange(j).first ?? '';
  return (
    <div className="space-y-7">
      {GROUPS.map(({ phase, title }) => {
        const list = journeys.filter((j) => journeyPhase(j) === phase);
        if (list.length === 0) return null;
        // Sắp đi: gần nhất trước; đã đi: mới nhất trước.
        const sorted = phase === 'upcoming' ? [...list].sort((a, b) => sortKey(a).localeCompare(sortKey(b)))
          : phase === 'past' ? [...list].sort((a, b) => sortKey(b).localeCompare(sortKey(a))) : list;
        return (
          <section key={phase} aria-label={title}>
            <h2 className="mb-3 flex items-center gap-2 text-sm font-extrabold text-slate-900">
              {phase === 'today' && <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" aria-hidden />}
              {title}
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-500">{list.length}</span>
            </h2>
            {/* Nhóm chỉ một chuyến: thẻ nằm ngang chiếm cả hàng thay vì để trống nửa hàng */}
            <div className="grid gap-4 sm:grid-cols-2">
              {sorted.map((j) => <JourneyCard key={j.id} journey={j} wide={sorted.length === 1} />)}
            </div>
          </section>
        );
      })}
    </div>
  );
}
