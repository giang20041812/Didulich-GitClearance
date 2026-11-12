import { useEffect, useState } from "react";
import { CheckCircle2, Clock, X } from "lucide-react";
import { fetchMyBookings } from "@/services/bookingService";
import { getCurrentCustomer } from "@/lib/currentCustomer";
import type { BookingResponseDto, BookingStatus } from "@/types/booking";
import { useNavigate, useLocation } from "react-router-dom";

/** Đơn còn cần khách để ý: đang chờ xác nhận / đã xác nhận nhưng chưa thanh toán, hoặc vừa được ghi nhận thanh toán. */
const WAITING: BookingStatus[] = ['PENDING', 'CONFIRMED'];
const CONFIRMED: BookingStatus[] = ['PAID'];
/** Đơn vừa thanh toán hiện "Đã thanh toán" trong vài giây rồi tự ẩn (TEST: không bắt khách bấm dấu X). */
const CONFIRMED_VISIBLE_MS = 8000;
/** Đơn + trạng thái khách đã xem / đã tắt — không ghim lại lần nữa. */
const SEEN_KEY = 'recent_booking_tag_seen';

const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const readSeen = (): Record<string, string> => {
  try { return JSON.parse(localStorage.getItem(SEEN_KEY) ?? '{}') as Record<string, string>; } catch { return {}; }
};
const markSeen = (booking: BookingResponseDto) => {
  try {
    const seen = readSeen();
    seen[booking.bookingCode] = booking.status;
    localStorage.setItem(SEEN_KEY, JSON.stringify(seen));
  } catch { /* bộ nhớ trình duyệt bị chặn — chỉ ẩn trong phiên này */ }
};

/**
 * Chọn đơn để ghim ở đầu trang chủ: ưu tiên đơn đang chờ xác nhận; nếu không có thì đơn vừa được xác nhận mà khách chưa
 * thấy. Hết đơn còn hiệu lực (đã hủy, hết hạn, đã trả phòng...) thì không ghim gì (TEST: không còn đơn vẫn ghim thông báo).
 */
function pickBooking(list: BookingResponseDto[]): BookingResponseDto | null {
  const today = todayIso();
  const seen = readSeen();
  const live = list.filter((b) => (b.checkOut ?? '') >= today && seen[b.bookingCode] !== b.status);
  const newest = (items: BookingResponseDto[]) =>
    [...items].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0] ?? null;
  return newest(live.filter((b) => WAITING.includes(b.status))) ?? newest(live.filter((b) => CONFIRMED.includes(b.status)));
}

export default function RecentBookingTag() {
  const [booking, setBooking] = useState<BookingResponseDto | null>(null);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    let mounted = true;

    const fetchLatest = async () => {
      // Chỉ hiện ở trang chủ
      if (location.pathname !== '/' || !getCurrentCustomer()) {
        if (mounted) setBooking(null);
        return;
      }
      try {
        const data = await fetchMyBookings();
        if (mounted) setBooking(pickBooking(data ?? []));
      } catch (error) {
        console.warn('Cannot fetch recent bookings for tag', error);
        if (mounted) setBooking(null);
      }
    };

    void fetchLatest();

    const handleChange = () => void fetchLatest();
    window.addEventListener('storage', handleChange);
    window.addEventListener('auth_change', handleChange);
    // Chuông thông báo nhận tin mới (VD: chủ nhà vừa xác nhận) → cập nhật trạng thái ghim ngay, không chờ lượt làm mới.
    window.addEventListener('booking_status_change', handleChange);

    // Chỉ làm mới khi đang ở trang chủ và tab đang hiển thị: mỗi lượt là một request /my-bookings tới backend
    // (pool DB trên Supabase chỉ 5 connection). Quay lại tab thì làm mới ngay.
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') void fetchLatest();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    const intervalId = location.pathname === '/'
      ? window.setInterval(() => {
          if (document.visibilityState === 'visible') void fetchLatest();
        }, 30000)
      : undefined;

    return () => {
      mounted = false;
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('storage', handleChange);
      window.removeEventListener('auth_change', handleChange);
      window.removeEventListener('booking_status_change', handleChange);
    };
  }, [location.pathname]);

  // Đơn đã thanh toán: hiện cho khách thấy rồi tự ẩn, và không ghim lại nữa.
  const confirmedCode = booking && CONFIRMED.includes(booking.status) ? booking.bookingCode : null;
  useEffect(() => {
    if (!confirmedCode || !booking) return undefined;
    const timer = window.setTimeout(() => {
      markSeen(booking);
      setBooking(null);
    }, CONFIRMED_VISIBLE_MS);
    return () => window.clearTimeout(timer);
  }, [confirmedCode, booking]);

  if (!booking) return null;

  const confirmed = CONFIRMED.includes(booking.status);
  const label = booking.status === 'CONFIRMED' ? 'Đã xác nhận · chờ thanh toán' : confirmed ? 'Đã thanh toán' : 'Chờ xác nhận';
  const tone = confirmed
    ? 'text-[var(--color-accent)] bg-[var(--color-accent)]/10 border-[var(--color-accent)]/30'
    : 'text-[var(--color-sun)] bg-[var(--color-sun)]/10 border-[var(--color-sun)]/30';

  const dismiss = () => {
    markSeen(booking);
    setBooking(null);
  };

  return (
    <div className="w-full flex justify-center py-1.5 px-3 animate-in slide-in-from-top-2 fade-in duration-300">
      <button
        type="button"
        onClick={() => { if (confirmed) markSeen(booking); navigate(`/bookings/${booking.bookingCode}`); }}
        className="flex items-center gap-2 max-w-full sm:max-w-md px-3 py-1.5 bg-white/95 backdrop-blur-md border border-gray-200/80 shadow-sm rounded-full text-[13px] font-medium cursor-pointer hover:bg-white transition-all hover:shadow-md hover:-translate-y-px active:translate-y-0 group"
      >
        <div className={`flex items-center justify-center shrink-0 w-6 h-6 rounded-full shadow-xs transition-colors ${confirmed ? 'bg-emerald-50 text-emerald-600' : 'bg-[#edfbf7] text-[var(--color-primary)] group-hover:bg-[var(--color-primary)] group-hover:text-white'}`}>
          {confirmed ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Clock className="w-3.5 h-3.5" />}
        </div>
        <div className="flex items-center gap-1.5 truncate">
          <span className="text-gray-500 shrink-0 hidden sm:inline">Đơn đặt:</span>
          <span className="font-bold text-gray-800 truncate" title={booking.placeName}>
            {booking.placeName}
          </span>
        </div>
        <div className={`px-2 py-0.5 rounded-full text-[10px] font-bold border shrink-0 ${tone}`}>
          {label}
        </div>
      </button>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Đóng thẻ theo dõi đơn"
        title="Đóng"
        className="ml-1.5 inline-flex h-8 shrink-0 items-center justify-center gap-1 rounded-full bg-slate-800/90 px-2 text-xs font-bold text-white shadow-md ring-2 ring-white/90 transition-all hover:bg-slate-900 active:scale-95 sm:px-2.5 cursor-pointer"
      >
        <X className="h-4 w-4" strokeWidth={3} />
        <span className="hidden sm:inline">Đóng</span>
      </button>
    </div>
  );
}
