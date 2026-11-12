import { useEffect, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArrowRight, BellRing, CalendarDays, Camera, Link2, Loader2, LogIn, Route, Sparkles } from 'lucide-react';
import JourneyView from '@/components/journey/JourneyView';
import MiniRoute from '@/components/journey/MiniRoute';
import { isSightStop, type BookingJourneyView, type JourneyView as Journey } from '@/types/journey';
import { journeyRange, journeyTitle, sortStops } from '@/lib/journey';
import { formatVnDayShort } from '@/lib/roomAvailability';
import { tripPlannerPath } from '@/lib/tripLinks';
import { getApiErrorMessage } from '@/lib/apiError';
import { getCurrentCustomer } from '@/services/authService';
import { fetchJourneyForBooking, linkJourneyBooking, unlinkJourneyBooking } from '@/services/journeyService';
import { ListSkeleton } from '@/components/ui/PageSkeleton';

interface BookingJourneyTabProps {
  booking: {
    bookingCode: string;
    placeId: number;
    checkIn: string;
    checkOut: string;
    status: string;
    guestCount?: number | null;
    placeName?: string | null;
  };
  /** Mở sẵn cẩm nang của điểm này (link nhắc giờ: ?tab=journey&stop=). */
  focusStopId?: number | null;
}

const BENEFITS = [
  { Icon: Sparkles, text: 'Chọn lịch trình gợi ý theo số ngày, ngân sách, sở thích — sửa giờ, thêm điểm từ bản đồ' },
  { Icon: BellRing, text: 'Ngày đi tự bật "Hôm nay": điểm tiếp theo, đếm ngược, nhắc giờ, chỉ đường' },
  { Icon: Camera, text: 'Check-in bằng ảnh và lưu bút để giữ lại kỷ niệm' },
] as const;

/** Hình minh họa: đường mòn chấm uốn lượn từ chỗ nghỉ qua vài điểm — gợi hình lộ trình sẽ có. */
function TrailArt() {
  return (
    <svg viewBox="0 0 320 180" className="h-full w-full" aria-hidden preserveAspectRatio="xMidYMid meet">
      <path d="M 40 150 C 90 150, 80 95, 130 95 S 190 40, 240 45 S 285 70, 285 30" fill="none" stroke="#cdeee3" strokeWidth="16" strokeLinecap="round" />
      <path d="M 40 150 C 90 150, 80 95, 130 95 S 190 40, 240 45 S 285 70, 285 30" fill="none" stroke="#0a7d64" strokeWidth="3" strokeLinecap="round" strokeDasharray="0.5 9" />
      <circle cx="40" cy="150" r="14" fill="#0a7d64" stroke="#fff" strokeWidth="4" />
      <path d="M 34 151 L 40 145 L 46 151 L 46 157 L 34 157 Z" fill="#fff" />
      {[[130, 95, '1', '#fbbf24'], [240, 45, '2', '#38bdf8']].map(([x, y, label, ring]) => (
        <g key={label as string}>
          <circle cx={x as number} cy={y as number} r="17" fill="#fff" stroke={ring as string} strokeWidth="4" />
          <text x={x as number} y={(y as number) + 5} textAnchor="middle" fontSize="14" fontWeight="800" fill="#06604a">{label}</text>
        </g>
      ))}
      <circle cx="285" cy="30" r="12" fill="#fbbf24" stroke="#fff" strokeWidth="4" />
    </svg>
  );
}

/** Khung lời mời (chưa đăng nhập / chưa có lịch trình): minh họa + lợi ích + nút chính. */
function InviteCard({ title, subtitle, children }: { title: string; subtitle: ReactNode; children: ReactNode }) {
  return (
    <section className="overflow-hidden rounded-3xl bg-white shadow-xs ring-1 ring-slate-200 md:grid md:grid-cols-[minmax(0,1fr)_300px]">
      <div
        className="h-36 bg-[#f4fbf8] px-4 py-3 md:order-2 md:h-full md:px-6"
        style={{ backgroundImage: 'radial-gradient(circle at 15% 20%, rgba(10,125,100,0.10) 0, transparent 45%), radial-gradient(circle at 85% 80%, rgba(245,158,11,0.12) 0, transparent 45%)' }}
      >
        <TrailArt />
      </div>
      <div className="p-5 sm:p-6">
        <h2 className="text-xl font-extrabold leading-tight text-slate-900">{title}</h2>
        <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
        <ul className="mt-4 space-y-2.5">
          {BENEFITS.map(({ Icon, text }) => (
            <li key={text} className="flex items-start gap-2.5 text-sm text-slate-700">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#edfbf7] text-[#0a7d64]">
                <Icon className="h-4 w-4" />
              </span>
              <span className="pt-1 leading-snug">{text}</span>
            </li>
          ))}
        </ul>
        <div className="mt-5">{children}</div>
      </div>
    </section>
  );
}

/**
 * Tab "Lịch trình" của đơn: lịch trình gắn với đơn (JourneyView dùng chung với trang /journeys/:id). Chưa gắn: lời mời
 * lên lịch trình gợi ý ở trang /lich-trinh (tỉnh, ngày, số khách theo đơn — lưu xong tự gắn vào đơn) hoặc gắn một lịch
 * trình đã lưu (cùng chỗ nghỉ, hoặc chưa chọn chỗ ở, cùng tỉnh, trùng ngày). "Sửa lịch trình" mở /lich-trinh/:id rồi quay
 * về tab này. Lịch trình miễn phí và không phụ thuộc trạng thái đơn — chế độ "Hôm nay" bật theo ngày đi.
 */
export default function BookingJourneyTab({ booking, focusStopId }: BookingJourneyTabProps) {
  const location = useLocation();
  const loggedIn = getCurrentCustomer()?.role === 'TRAVELER';
  const [data, setData] = useState<BookingJourneyView | null>(null);
  const [error, setError] = useState('');
  const [linking, setLinking] = useState<number | null>(null);
  const [linkError, setLinkError] = useState('');
  const stay = `${formatVnDayShort(booking.checkIn)} → ${formatVnDayShort(booking.checkOut)}${booking.placeName ? ` · ${booking.placeName}` : ''}`;

  useEffect(() => {
    if (!loggedIn) return undefined;
    let alive = true;
    fetchJourneyForBooking(booking.bookingCode)
      .then((result) => { if (alive) setData(result); })
      .catch((err: unknown) => { if (alive) setError(getApiErrorMessage(err, 'Không tải được lịch trình của đơn.')); });
    return () => { alive = false; };
  }, [loggedIn, booking.bookingCode]);

  if (!loggedIn) {
    return (
      <InviteCard title="Tạo lịch trình cho chuyến đi này" subtitle={stay}>
        <Link
          to="/login"
          state={{ returnUrl: `${location.pathname}?tab=journey`, message: 'Đăng nhập để lên lịch trình cho chuyến đi.' }}
          className="inline-flex h-11 items-center gap-1.5 rounded-xl bg-[#0a7d64] px-5 text-sm font-bold text-white shadow-sm hover:bg-[#06604a]"
        >
          <LogIn className="h-4 w-4" /> Đăng nhập để bắt đầu
        </Link>
      </InviteCard>
    );
  }
  if (error) return <p className="rounded-2xl bg-rose-50 p-4 text-sm font-semibold text-rose-700 ring-1 ring-rose-200">{error}</p>;
  if (!data) {
    return (
      <ListSkeleton label="Đang tải lịch trình" rows={2} />
    );
  }

  if (data.linked) {
    const linked = data.linked;
    return (
      <JourneyView
        journey={linked}
        onChange={(journey) => setData((current) => current && { ...current, linked: journey })}
        focusStopId={focusStopId}
        context="booking"
        onUnlink={async () => {
          const unlinked = await unlinkJourneyBooking(linked.id);
          setData((current) => current && { ...current, linked: null, candidates: [unlinked, ...current.candidates] });
        }}
      />
    );
  }

  const link = async (journey: Journey) => {
    setLinking(journey.id);
    setLinkError('');
    try {
      const linked = await linkJourneyBooking(journey.id, booking.bookingCode);
      setData((current) => current && { ...current, linked, candidates: current.candidates.filter((c) => c.id !== journey.id) });
    } catch (err) {
      setLinkError(getApiErrorMessage(err, 'Chưa gắn được lịch trình.'));
    } finally {
      setLinking(null);
    }
  };

  const cancelled = booking.status === 'CANCELLED';
  const plannerPath = tripPlannerPath(cancelled
    ? { province: data.province }
    : {
      province: data.province,
      checkIn: booking.checkIn,
      checkOut: booking.checkOut,
      guests: booking.guestCount,
      stay: booking.placeId,
      forBooking: booking.bookingCode,
    });

  return (
    <div className="space-y-5">
      <InviteCard title="Chưa có lịch trình cho chuyến đi này" subtitle={stay}>
        {cancelled ? (
          <div className="space-y-3">
            <p className="rounded-xl bg-slate-50 p-3 text-sm font-semibold text-slate-600">
              Đơn đã hủy nên không gắn được lịch trình — bạn vẫn lên lịch trình tự do cho chuyến khác.
            </p>
            <Link to={plannerPath} className="inline-flex items-center gap-1.5 text-sm font-extrabold text-[#0a7d64] hover:underline">
              Lên lịch trình <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <Link
              to={plannerPath}
              className="inline-flex h-11 items-center gap-1.5 rounded-xl bg-[#0a7d64] px-5 text-sm font-extrabold text-white shadow-sm transition-colors hover:bg-[#06604a]"
            >
              <Sparkles className="h-4 w-4" /> Lên lịch trình gợi ý
            </Link>
            <span className="text-xs text-slate-500">Miễn phí · tự gắn vào đơn này khi lưu</span>
          </div>
        )}
      </InviteCard>

      {!cancelled && data.candidates.length > 0 && (
        <section aria-label="Lịch trình đã lưu">
          <h3 className="mb-3 px-1 text-sm font-extrabold text-slate-900">Hoặc gắn lịch trình bạn đã lưu</h3>
          <ul className="grid gap-3 sm:grid-cols-2">
            {data.candidates.map((journey) => {
              const { first, last } = journeyRange(journey);
              const sights = sortStops(journey.stops.filter(isSightStop));
              return (
                <li key={journey.id} className="flex flex-col rounded-2xl bg-white p-4 shadow-xs ring-1 ring-slate-200">
                  <p className="truncate text-sm font-extrabold text-slate-900">{journeyTitle(journey)}</p>
                  <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-500">
                    <CalendarDays className="h-3.5 w-3.5" />
                    {first && last ? `${formatVnDayShort(first)} → ${formatVnDayShort(last)}` : 'Chưa chọn ngày — lấy theo đơn'} · {journey.stops.length} mục
                  </p>
                  {sights.length > 0 ? (
                    <MiniRoute className="mt-3" stops={sights.map((s) => ({ key: s.id, imageUrl: s.coverImageUrl, session: s.session, done: !!s.checkin }))} />
                  ) : (
                    <p className="mt-3 flex items-center gap-1.5 text-xs text-slate-400"><Route className="h-3.5 w-3.5" /> Chưa có điểm tham quan</p>
                  )}
                  <button
                    type="button"
                    onClick={() => { void link(journey); }}
                    disabled={linking !== null}
                    className="mt-3 inline-flex h-10 items-center justify-center gap-1.5 rounded-xl bg-white text-sm font-bold text-[#0a7d64] ring-2 ring-[#0a7d64] transition-colors hover:bg-[#0a7d64] hover:text-white disabled:opacity-50 cursor-pointer"
                  >
                    {linking === journey.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />} Gắn vào đơn này
                  </button>
                </li>
              );
            })}
          </ul>
          {linkError && <p role="alert" className="mt-2 text-xs font-semibold text-rose-600">{linkError}</p>}
        </section>
      )}
    </div>
  );
}
