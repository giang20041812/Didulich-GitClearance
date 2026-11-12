import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { AlertCircle, ArrowLeft, PartyPopper, X } from 'lucide-react';
import JourneyView from '@/components/journey/JourneyView';
import type { JourneyView as Journey } from '@/types/journey';
import { deleteJourney, fetchJourney } from '@/services/journeyService';
import { getApiErrorMessage } from '@/lib/apiError';
import { installAxiosBoot } from '@/lib/axiosBoot';

// Trang dùng axios: cài cấu hình (hàng đợi / hedge / interceptor) trước request đầu tiên.
installAxiosBoot();

/**
 * Trang một lịch trình (/journeys/:id) — link nhắc giờ mở kèm ?stop= để hiện sẵn cẩm nang của điểm. Vừa lưu lịch trình ở
 * /lich-trinh/tao (?new=1): dải chúc mừng + cuộn tới ô "Chỗ ở" (bước tiếp theo: đặt homestay cho chuyến).
 */
export default function JourneyDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const [journey, setJourney] = useState<Journey | null>(null);
  const [error, setError] = useState('');
  const focusStopId = Number(searchParams.get('stop')) || null;
  const journeyId = Number(id) || null;
  const justSaved = searchParams.get('new') === '1';

  useEffect(() => {
    if (!journeyId) return undefined;
    let alive = true;
    fetchJourney(journeyId)
      .then((data) => { if (alive) setJourney(data); })
      .catch((err: unknown) => {
        if (!alive) return;
        setError(axios.isAxiosError(err) && err.response?.status === 404 ? 'Không tìm thấy lịch trình.' : getApiErrorMessage(err, 'Không tải được lịch trình.'));
      });
    return () => { alive = false; };
  }, [journeyId]);

  // Vừa lưu: đưa ô "Chỗ ở" vào tầm mắt khi lịch trình đã vẽ xong.
  const loaded = !!journey;
  useEffect(() => {
    if (!justSaved || !loaded) return undefined;
    const timer = window.setTimeout(() => document.getElementById('stay-slot')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 450);
    return () => window.clearTimeout(timer);
  }, [justSaved, loaded]);

  const dismissSaved = () => setSearchParams((current) => {
    const next = new URLSearchParams(current);
    next.delete('new');
    return next;
  }, { replace: true });

  return (
    <div className="min-h-screen bg-[var(--color-canvas)] pb-20">
      <div className="mx-auto max-w-5xl px-4 pt-4 sm:px-6">
        <Link
          to="/lich-trinh?tab=cua-toi"
          onClick={(e) => {
            if (!justSaved && ((window.history.state as { idx?: number } | null)?.idx ?? 0) > 0) {
              e.preventDefault();
              navigate(-1);
            }
          }}
          className="inline-flex min-h-10 items-center gap-1.5 rounded-full pr-2 text-sm font-semibold text-slate-600 hover:text-[#052620]"
        >
          <ArrowLeft className="h-4 w-4" /> Lịch trình của tôi
        </Link>
        {justSaved && journey && (
          <div role="status" className="step-in mt-3 flex items-start gap-3 rounded-2xl bg-[var(--color-ink-deep)] p-3.5 text-white shadow-md sm:items-center">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/10 text-amber-300">
              <PartyPopper className="h-5 w-5" aria-hidden />
            </span>
            <p className="min-w-0 flex-1 text-sm leading-snug">
              <strong className="font-extrabold">Đã lưu lịch trình!</strong>{' '}
              <span className="text-white/80">
                {journey.bookingCode ? 'Lịch trình đã gắn với đơn đặt phòng của bạn.' : 'Bước tiếp theo: chọn homestay để điền vào ô “Chỗ ở”.'}
              </span>
            </p>
            <button type="button" onClick={dismissSaved} aria-label="Đóng" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white/70 hover:bg-white/10 hover:text-white cursor-pointer">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
        <div className="mt-3">
          {error || !journeyId ? (
            <div className="mx-auto max-w-md rounded-3xl border border-slate-200 bg-white p-6 text-center">
              <AlertCircle className="mx-auto mb-2 h-6 w-6 text-rose-500" />
              <p className="text-sm font-semibold text-slate-700">{error || 'Không tìm thấy lịch trình.'}</p>
              <Link to="/lich-trinh?tab=cua-toi" className="mt-3 inline-block text-sm font-bold text-[#052620] hover:underline">Về lịch trình của tôi</Link>
            </div>
          ) : !journey ? (
            <div className="space-y-4" role="status" aria-label="Đang tải lịch trình">
              <div className="h-48 animate-pulse rounded-3xl bg-white ring-1 ring-slate-200" />
              <div className="h-96 animate-pulse rounded-2xl bg-[#eaf5f0]" />
            </div>
          ) : (
            <JourneyView
              journey={journey}
              onChange={setJourney}
              focusStopId={focusStopId}
              context="page"
              highlightStay={justSaved}
              onDelete={async () => {
                await deleteJourney(journey.id);
                navigate('/lich-trinh?tab=cua-toi', { replace: true });
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
