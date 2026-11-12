import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link, useSearchParams, useLocation } from 'react-router-dom';
import {
  ArrowLeft,
  Calendar,
  MapPin,
  Clock,
  CheckCircle2,
  AlertCircle,
  Phone,
  Mail,
  User,
  Star,
  ShieldCheck,
  CreditCard,
  Copy,
  Download,
  MessageCircle,
  BedDouble,
  ExternalLink,
  Info,
  Ban,
  Home,
  Edit3,
  ReceiptText,
  Route,
} from 'lucide-react';
import { getCurrentCustomer } from '@/services/authService';
import { getBookingByCode, fetchBookingReview } from '@/services/bookingService';
import type { BookingResponseDto, BookingStatus } from '@/types/booking';
import type { ReviewDto } from '@/types/review';
import BookingReviewModal from '@/components/booking/BookingReviewModal';
import BookingCancelModal from '@/components/booking/BookingCancelModal';
import BookingEditModal from '@/components/booking/BookingEditModal';
import BookingJourneyTab from '@/components/journey/BookingJourneyTab';
import StayCheckinCard from '@/components/booking/StayCheckinCard';
import ConfirmDialog, { type ConfirmRequest } from '@/components/partner/ConfirmDialog';
import { getHomestayById } from '@/services/homestayService';
import type { HomestayProfileDetail } from '@/types/homestay';
import { vnTodayKey } from '@/lib/journey';
import { ZALO_SUPPORT } from '@/lib/supportContact';
import zaloQrImage from '@/assets/zalo-qr.webp';
import zaloQrFull from '@/assets/QRcode.webp';
import { holdAutoNavigate, noteLocalBookingStatus, onBookingStatusChange } from '@/lib/bookingLive';
import { mediaUrl } from '@/lib/mediaUrl';
import { bookingRooms, roomSummary } from '@/lib/roomSelection';
import { installAxiosBoot } from '@/lib/axiosBoot';
import { DetailSkeleton } from '@/components/ui/PageSkeleton';

// Trang dùng axios (lịch trình — services/journeyService): cài cấu hình (baseURL, hàng đợi / hedge / interceptor)
// trước request đầu tiên.
installAxiosBoot();

const WEEKDAY_SHORT = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
const pad2 = (n: number) => String(n).padStart(2, '0');
/** "2026-10-04" → "CN, 04/10/2026" (TEST: thống nhất ngày/tháng/năm). */
const vnDay = (iso?: string | null) => {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return iso ?? '';
  const weekday = WEEKDAY_SHORT[new Date(`${iso.slice(0, 10)}T12:00:00`).getDay()] ?? '';
  return `${weekday}, ${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
};
/** Thời điểm: "08:44 · 30/09/2026". */
const vnMoment = (iso?: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())} · ${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
};

export default function UserBookingDetailPage() {
  const { bookingCode } = useParams<{ bookingCode: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  // Vừa được chuyển tới vì đơn được xác nhận (BookingStatusWatcher): cuộn tới bước thanh toán Zalo và làm nổi bật.
  const [highlightPayment, setHighlightPayment] = useState(
    () => (location.state as { liveStatus?: string } | null)?.liveStatus === 'CONFIRMED',
  );

  const currentUser = getCurrentCustomer();
  useEffect(() => {
    if (currentUser?.role === 'ADMIN' || currentUser?.role === 'PROVIDER') {
      navigate(currentUser.role === 'ADMIN' ? '/admin' : '/partner', { replace: true });
    }
  }, [currentUser, navigate]);

  const [booking, setBooking] = useState<BookingResponseDto | null>(null);
  const [existingReview, setExistingReview] = useState<ReviewDto | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [searchParams, setSearchParams] = useSearchParams();
  const phoneParam = searchParams.get('phone') || '';
  const tabParam = searchParams.get('tab');
  /** Điểm cần mở sẵn cẩm nang (link trong thông báo nhắc giờ). */
  const focusStopId = Number(searchParams.get('stop')) || null;

  // Modal đánh giá
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
  const [confirmDeleteReview, setConfirmDeleteReview] = useState<ConfirmRequest | null>(null);
  const [reviewActionError, setReviewActionError] = useState('');
  // Modal hủy đơn
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  // Modal thay đổi chi tiết booking
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  /** Giờ nhận / trả phòng thật của Homestay (thay cho "14:00 / 12:00" viết cứng). */
  const [profile, setProfile] = useState<HomestayProfileDetail | null>(null);
  const [codeCopied, setCodeCopied] = useState(false);
  const copyBookingCode = (code: string) => {
    void navigator.clipboard?.writeText(code).then(() => {
      setCodeCopied(true);
      window.setTimeout(() => setCodeCopied(false), 2000);
    }).catch(() => {});
  };

  /** silent: tải lại tại chỗ khi trạng thái đổi (không hiện màn hình chờ, không tải lại dữ liệu Homestay). */
  const loadBookingData = useCallback(async (phoneToUse?: string, silent = false) => {
    if (!bookingCode) return;
    if (!silent) {
      setIsLoading(true);
      setErrorMsg(null);
    }
    try {
      const data = await getBookingByCode(bookingCode, phoneToUse || undefined);
      setBooking(data);

      // Giờ nhận / trả phòng của Homestay
      if (!silent && data.placeId) {
        getHomestayById(String(data.placeId)).then((detail) => setProfile(detail?.homestayProfile ?? null)).catch(() => {});
      }

      // Đơn đã thanh toán mới có đánh giá (máy chủ quyết định được viết hay chưa qua canReview).
      if (data.status === 'PAID') {
        try {
          const rev = await fetchBookingReview(bookingCode);
          setExistingReview(rev);
        } catch {
          // ignore review check error
        }
      }
    } catch (err: unknown) {
      if (!silent) {
        const msg = err instanceof Error ? err.message : 'Không thể tải thông tin đặt phòng.';
        setErrorMsg(msg);
      }
    } finally {
      if (!silent) setIsLoading(false);
    }
  }, [bookingCode]);

  useEffect(() => {
    loadBookingData(phoneParam || undefined);
  }, [loadBookingData, phoneParam]);

  // Admin / NCC đổi trạng thái đơn đang xem: tải lại tại chỗ; vừa được xác nhận thì đưa khách tới bước thanh toán.
  useEffect(() => onBookingStatusChange((change) => {
    if (change.bookingCode !== bookingCode) return;
    void loadBookingData(phoneParam || undefined, true).then(() => {
      if (change.to === 'CONFIRMED') setHighlightPayment(true);
    });
  }), [bookingCode, loadBookingData, phoneParam]);

  // Bỏ cờ "vừa xác nhận" khỏi lịch sử trình duyệt để tải lại trang không lặp lại hiệu ứng.
  useEffect(() => {
    if ((location.state as { liveStatus?: string } | null)?.liveStatus) {
      navigate(`${location.pathname}${location.search}`, { replace: true, state: null });
    }
  }, [location.state, location.pathname, location.search, navigate]);

  useEffect(() => {
    if (!highlightPayment || booking?.status !== 'CONFIRMED') return;
    const frame = window.requestAnimationFrame(() => {
      document.getElementById('thanh-toan-zalo')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    const timer = window.setTimeout(() => setHighlightPayment(false), 4500);
    return () => { window.cancelAnimationFrame(frame); window.clearTimeout(timer); };
  }, [highlightPayment, booking?.status]);

  // Đang mở hộp sửa / hủy / đánh giá: đơn khác được xác nhận thì chỉ báo, không tự chuyển trang.
  useEffect(
    () => (isEditModalOpen || isCancelModalOpen || isReviewModalOpen ? holdAutoNavigate() : undefined),
    [isEditModalOpen, isCancelModalOpen, isReviewModalOpen],
  );

  const getStatusBadge = (status: BookingStatus) => {
    switch (status) {
      case 'PENDING':
        return (
          <div className="flex items-start sm:items-center gap-3.5 p-4 sm:p-5 bg-amber-50/90 border border-amber-200/80 rounded-2xl text-amber-950 text-xs sm:text-sm font-medium shadow-xs">
            <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <span className="font-bold text-slate-900 text-sm sm:text-base">Đang chờ xác nhận</span>
              <p className="text-xs text-amber-900/80 font-normal mt-0.5 leading-relaxed">
                Chỗ nghỉ / ban quản trị sẽ xác nhận đơn của bạn sớm nhất — trang này tự cập nhật ngay khi đơn được xác nhận. Trong lúc chờ, bạn vẫn có thể thay đổi hoặc hủy đơn.
              </p>
            </div>
          </div>
        );
      case 'CONFIRMED':
        return (
          <div className="flex items-start sm:items-center gap-3.5 p-4 sm:p-5 bg-sky-50/90 border border-sky-200/80 rounded-2xl text-sky-950 text-xs sm:text-sm font-medium shadow-xs">
            <div className="w-10 h-10 rounded-xl bg-sky-100 text-sky-700 flex items-center justify-center shrink-0">
              <CreditCard className="w-5 h-5" />
            </div>
            <div>
              <span className="font-bold text-slate-900 text-sm sm:text-base">Đã xác nhận — chờ thanh toán</span>
              <p className="text-xs text-sky-900/80 font-normal mt-0.5 leading-relaxed">
                Vui lòng thanh toán <strong className="text-sky-950 font-bold">{Number(booking?.totalAmount || 0).toLocaleString('vi-VN')} đ</strong> qua Zalo theo hướng dẫn bên dưới.
                Đơn hoàn tất khi được ghi nhận đã thanh toán. Bạn vẫn có thể hủy đơn trước khi thanh toán.
              </p>
            </div>
          </div>
        );
      case 'PAID':
        return (
          <div className="flex items-start sm:items-center gap-3.5 p-4 sm:p-5 bg-emerald-50/90 border border-emerald-200/80 rounded-2xl text-emerald-950 text-xs sm:text-sm font-medium shadow-xs">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
              <span className="font-bold text-slate-900 text-sm sm:text-base">Đã thanh toán — đặt phòng hoàn tất</span>
              <p className="text-xs text-emerald-900/80 font-normal mt-0.5 leading-relaxed">
                Chỗ nghỉ đã sẵn sàng đón bạn. Chúc bạn có kỳ nghỉ tuyệt vời và nhiều trải nghiệm đáng nhớ!
              </p>
            </div>
          </div>
        );
      case 'CANCELLED':
        return (
          <div className="flex items-start sm:items-center gap-3.5 p-4 sm:p-5 bg-rose-50/90 border border-rose-200/80 rounded-2xl text-rose-950 text-xs sm:text-sm font-medium shadow-xs">
            <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center shrink-0">
              <AlertCircle className="w-5 h-5" />
            </div>
            <div>
              <span className="font-bold text-slate-900 text-sm sm:text-base">{booking?.confirmedAt ? 'Đơn đặt phòng đã bị hủy' : 'Đơn đặt phòng đã bị hủy / từ chối'}</span>
              <p className="text-xs text-rose-900/80 font-normal mt-0.5 leading-relaxed">
                {booking?.closeReason ? <>Lý do: {booking.closeReason}. </> : null}
                Phòng đã được nhả lại trên hệ thống. Nếu có thắc mắc, vui lòng liên hệ bộ phận hỗ trợ.
              </p>
            </div>
          </div>
        );
      default:
        return (
          <div className="flex items-center gap-3 p-4 bg-slate-100 border border-slate-200 rounded-2xl text-slate-700 text-xs sm:text-sm">
            <Info className="w-5 h-5 shrink-0 text-slate-500" />
            <span>Trạng thái đơn: <strong>{status}</strong></span>
          </div>
        );
    }
  };



  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#F6FAF8]"><DetailSkeleton label="Đang tải chi tiết đơn đặt phòng" /></div>
    );
  }

  if (errorMsg || !booking) {
    return (
      <div className="min-h-screen bg-[#F6FAF8] flex items-center justify-center p-6">
        <div className="bg-white rounded-lg border border-gray-200 p-8 max-w-md w-full text-center space-y-4 shadow-sm">
          <div className="w-12 h-12 rounded-md bg-rose-50 text-rose-600 flex items-center justify-center mx-auto">
            <AlertCircle className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-bold text-slate-800">Không tìm thấy đơn đặt phòng</h2>
          <p className="text-xs text-gray-500">{errorMsg || 'Mã đơn không tồn tại hoặc đã bị xóa.'}</p>
          <div className="pt-2">
            <button
              type="button"
              onClick={() => navigate('/bookings')}
              className="px-4 py-2 text-xs font-bold text-white cta cta-primary rounded-md transition-colors shadow-xs cursor-pointer inline-flex items-center gap-1.5"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Quay lại danh sách đơn</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Không còn bước nhận / trả phòng: đánh giá gắn với đơn đã thanh toán, mở từ ngày trả phòng trong 14 ngày.
  const isCompleted = booking.status === 'PAID';
  const reviewDeadline = new Date(`${booking.checkOut}T23:59:59`);
  reviewDeadline.setDate(reviewDeadline.getDate() + 14);
  const reviewDeadlineValid = !Number.isNaN(reviewDeadline.getTime());
  const reviewExpired = isCompleted && !existingReview && reviewDeadlineValid && new Date() > reviewDeadline;
  const reviewNotYet = isCompleted && !existingReview && !booking.canReview && !reviewExpired;

  // Tab mặc định: đơn đã thanh toán và chuyến chưa qua → Lịch trình; còn lại (chờ xác nhận, chờ thanh toán...) → Chi tiết.
  const tab: 'journey' | 'detail' = tabParam === 'journey' || tabParam === 'detail'
    ? tabParam
    : booking.status === 'PAID' && booking.checkOut >= vnTodayKey() && !highlightPayment ? 'journey' : 'detail';
  const switchTab = (next: 'journey' | 'detail') => {
    const params = new URLSearchParams(searchParams);
    params.set('tab', next);
    params.delete('stop');
    setSearchParams(params, { replace: true });
  };
  const tabClass = (active: boolean) =>
    `relative inline-flex h-10 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-3 text-sm font-bold transition-all duration-200 cursor-pointer ${active ? 'bg-[var(--color-primary)] text-white shadow-[0_4px_12px_-4px_rgba(10,125,100,0.55)]' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`;
  // Đang trong ngày ở: nhãn "Hôm nay" trên tab Lịch trình (theo ngày đơn, không cần tải lịch trình).
  const tripToday = booking.status !== 'CANCELLED' && booking.checkIn <= vnTodayKey() && vnTodayKey() <= booking.checkOut;

  return (
    <div className="min-h-screen bg-[#F6FAF8] pb-20">
      {/* Top Navigation Bar - ghim ngay dưới Header khi scroll */}
      <div className="bg-white/90 backdrop-blur-md border-b border-slate-200/80 sticky top-[var(--app-header-offset,104px)] z-30 shadow-xs">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <button
            type="button"
            onClick={() => {
              if (((window.history.state as { idx?: number } | null)?.idx ?? 0) > 0) {
                navigate(-1);
              } else {
                navigate('/bookings');
              }
            }}
            className="flex items-center gap-2 text-xs sm:text-sm font-bold text-slate-600 hover:text-[var(--color-primary)] transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Quay về</span>
          </button>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">Mã booking:</span>
            <span className="font-mono text-xs sm:text-sm font-bold text-[var(--color-primary)] bg-emerald-50 px-3 py-1 rounded-full border border-emerald-100">
              #{booking.bookingCode}
            </span>
          </div>
        </div>
      </div>

      {/* Nhận / trả phòng: hiện ở cả hai tab (ngày nhận phòng khách thường đang xem Lịch trình) */}
      {(booking.canCheckIn || booking.checkedInAt) && (
        <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-4">
          <StayCheckinCard booking={booking} checkOutUntil={profile?.checkOutUntil} onCheckedIn={() => { void loadBookingData(phoneParam || undefined, true); }} />
        </div>
      )}

      <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-4">
        <div className="flex gap-1 rounded-full bg-white p-1.5 shadow-xs ring-1 ring-slate-200 sm:max-w-sm" role="tablist" aria-label="Đơn đặt phòng">
          <button type="button" role="tab" aria-selected={tab === 'journey'} onClick={() => switchTab('journey')} className={tabClass(tab === 'journey')}>
            <Route className="h-4 w-4" /> Lịch trình
            {tripToday && (
              <span className={`rounded-full px-1.5 py-px text-[10px] font-extrabold ${tab === 'journey' ? 'bg-amber-300 text-amber-950' : 'bg-amber-100 text-amber-800'}`}>Hôm nay</span>
            )}
          </button>
          <button type="button" role="tab" aria-selected={tab === 'detail'} onClick={() => switchTab('detail')} className={tabClass(tab === 'detail')}>
            <ReceiptText className="h-4 w-4" /> Chi tiết đơn
          </button>
        </div>
      </div>

      {tab === 'journey' ? (
        <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-4">
          <BookingJourneyTab
            booking={{ bookingCode: booking.bookingCode, placeId: booking.placeId, placeName: booking.placeName, checkIn: booking.checkIn, checkOut: booking.checkOut, status: booking.status, guestCount: booking.guestCount }}
            focusStopId={focusStopId}
          />
        </div>
      ) : (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-4 space-y-6">
        {/* Banner trạng thái booking */}
        {getStatusBadge(booking.status)}

        {/* Thanh toán qua Zalo (trung gian): mã QR danh thiếp + liên kết mở thẳng ứng dụng Zalo */}
        {booking.status === 'CONFIRMED' && (
          <section
            id="thanh-toan-zalo"
            aria-labelledby="zalo-pay-title"
            className={`scroll-mt-40 overflow-hidden rounded-2xl border bg-white shadow-xs transition-shadow duration-700 ${
              highlightPayment ? 'border-emerald-300 ring-4 ring-emerald-200/80' : 'border-sky-200'
            }`}
          >
            <div className="flex flex-col gap-5 p-5 md:flex-row md:items-center md:gap-8 md:p-6">
              <div className="order-2 mx-auto w-full max-w-[220px] shrink-0 md:order-1 md:mx-0 md:max-w-[240px]">
                <img
                  src={zaloQrImage}
                  alt={`Mã QR Zalo ${ZALO_SUPPORT.name}`}
                  width={600}
                  height={619}
                  loading="lazy"
                  decoding="async"
                  className="h-auto w-full rounded-2xl shadow-sm ring-1 ring-black/5"
                />
                {/* Điện thoại không tự quét được màn hình của chính nó: lưu ảnh rồi quét từ thư viện ảnh trong Zalo */}
                <a
                  href={zaloQrFull}
                  download="zalo-nhung-doan-booking.jpg"
                  className="mt-2.5 flex items-center justify-center gap-1.5 text-xs font-bold text-sky-700 hover:underline"
                >
                  <Download className="h-3.5 w-3.5" />
                  Lưu ảnh mã QR
                </a>
              </div>

              <div className="order-1 min-w-0 flex-1 md:order-2">
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-sky-700">Bước tiếp theo</p>
                <h3 id="zalo-pay-title" className="mt-1 text-lg font-bold text-slate-900 md:text-xl">Thanh toán qua Zalo</h3>
                <p className="mt-1 text-sm leading-relaxed text-slate-600">
                  Nhắn Zalo cho <strong className="text-slate-800">{ZALO_SUPPORT.name}</strong> — bạn sẽ được hướng dẫn thanh toán an toàn.
                </p>

                <ol className="mt-3 space-y-2 text-sm text-slate-700">
                  <li className="flex gap-2.5">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-sky-100 text-[11px] font-bold text-sky-700">1</span>
                    <span>Bấm <strong>Mở Zalo</strong> (hoặc quét mã QR bằng điện thoại khác).</span>
                  </li>
                  <li className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-sky-100 text-[11px] font-bold text-sky-700">2</span>
                    <span>Gửi mã đơn</span>
                    <button
                      type="button"
                      onClick={() => copyBookingCode(booking.bookingCode)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-sky-200 bg-sky-50 px-2.5 py-0.5 font-mono text-xs font-bold text-sky-900 transition-colors hover:bg-sky-100 cursor-pointer"
                      title="Sao chép mã đơn"
                    >
                      {booking.bookingCode}
                      {codeCopied ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5 text-sky-600" />}
                    </button>
                    {codeCopied && <span className="text-xs font-semibold text-emerald-600">Đã chép</span>}
                  </li>
                  <li className="flex gap-2.5">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-sky-100 text-[11px] font-bold text-sky-700">3</span>
                    <span>
                      Thanh toán <strong className="text-rose-600">{Number(booking.totalAmount || 0).toLocaleString('vi-VN')} đ</strong> theo hướng dẫn — đơn tự chuyển sang "Đã thanh toán".
                    </span>
                  </li>
                </ol>

                <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
                  <a
                    href={ZALO_SUPPORT.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#0068ff] px-5 text-sm font-bold text-white shadow-sm transition-all hover:bg-[#0055d4] active:scale-95"
                  >
                    <MessageCircle className="h-4 w-4" />
                   Liên hệ Zalo để thanh toán
                  </a>
                  {'display' in ZALO_SUPPORT && typeof ZALO_SUPPORT.display === 'string' && (
                    <a href={ZALO_SUPPORT.url} target="_blank" rel="noopener noreferrer" className="text-center text-xs font-semibold text-sky-700 hover:underline sm:text-left">
                      {ZALO_SUPPORT.display}
                    </a>
                  )}
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Khối đánh giá nếu hoàn thành */}
        {isCompleted && (
          <div className="bg-white rounded-2xl border border-slate-200/80 p-5 sm:p-6 shadow-xs">
            {existingReview?.providerReply && (
              <div className="mb-4 flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3.5 text-emerald-800">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                <div className="text-xs leading-relaxed">
                  <p className="font-bold">Nhà cung cấp đã phản hồi đánh giá của bạn</p>
                  <p className="mt-1">{existingReview.providerReply}</p>
                  {existingReview.providerReplyAt && <p className="mt-1 text-[11px] text-emerald-700">{vnMoment(existingReview.providerReplyAt)}</p>}
                </div>
              </div>
            )}
            {reviewNotYet && (
              <div className="mb-4 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-amber-900">
                <Clock className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                <div className="text-xs leading-relaxed">
                  <p className="font-bold">Đánh giá sẽ mở từ ngày trả phòng</p>
                  <p className="mt-1">Bạn có thể chia sẻ cảm nhận từ ngày {vnDay(booking.checkOut)}, trong vòng 14 ngày sau đó.</p>
                </div>
              </div>
            )}
            {reviewExpired && (
              <div className="mb-4 flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-rose-800">
                <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" />
                <div className="text-xs leading-relaxed">
                  <p className="font-bold">Đã quá thời hạn đánh giá</p>
                  <p className="mt-1">Bạn chỉ có thể gửi đánh giá trong vòng 14 ngày sau ngày trả phòng. Hạn cuối: {reviewDeadline.toLocaleDateString('vi-VN')}.</p>
                </div>
              </div>
            )}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <Star className="w-5 h-5 text-[var(--color-sun)] fill-[var(--color-sun)]" />
                  <h3 className="text-base font-bold text-slate-800">
                    {existingReview ? 'Đánh giá của bạn về chuyến đi' : 'Bạn thấy chuyến đi thế nào?'}
                  </h3>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  {existingReview
                    ? 'Cảm ơn bạn đã để lại phản hồi quý giá giúp hoàn thiện hệ thống du lịch bản địa.'
                    : 'Hãy chia sẻ cảm nhận về dịch vụ và không gian homestay để các du khách khác tham khảo.'}
                </p>
              </div>

              {!existingReview && booking.canReview ? (
                <button
                  type="button"
                  onClick={() => setIsReviewModalOpen(true)}
                  className="px-5 py-2.5 rounded-xl cta cta-sun text-white text-xs sm:text-sm font-bold transition-all shadow-md shadow-amber-500/20 active:scale-95 cursor-pointer shrink-0 flex items-center justify-center gap-2"
                >
                  <Star className="w-4 h-4 fill-current" />
                  <span>Viết đánh giá ngay</span>
                </button>
              ) : null}
            </div>

            {/* Hiển thị nội dung review đã gửi */}
            {existingReview && (
              <div className="mt-4 pt-4 border-t border-slate-100 bg-[#F6FAF8] p-4 rounded-xl space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    {[1, 2, 3, 4, 5].map((s) => (
                      <Star
                        key={s}
                        className={`w-4 h-4 ${
                          s <= existingReview.rating
                            ? 'text-[var(--color-sun)] fill-[var(--color-sun)]'
                            : 'text-slate-300'
                        }`}
                      />
                    ))}
                    <span className="text-xs font-bold text-slate-700 ml-1.5">
                      {existingReview.rating}/5 sao
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-[11px] text-slate-400">
                      {new Date(existingReview.createdAt).toLocaleDateString('vi-VN')}
                    </span>
                    {/* Kiểm tra thời hạn 14 ngày */}
                    {(!existingReview.editableUntil || new Date(existingReview.editableUntil).getTime() > Date.now()) && (
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setIsReviewModalOpen(true)}
                          className="px-3 py-1 text-xs font-semibold text-[var(--color-primary)] hover:bg-emerald-50 rounded-lg border border-emerald-200 transition-colors cursor-pointer"
                        >
                          Sửa đánh giá
                        </button>
                        <button
                          type="button"
                          onClick={() => { setReviewActionError(''); setConfirmDeleteReview({
                            title: 'Xóa đánh giá này?',
                            body: <>Đánh giá của bạn về chỗ nghỉ này sẽ bị gỡ. Thao tác không thể hoàn tác.</>,
                            confirmLabel: 'Xóa đánh giá',
                            tone: 'danger',
                            onConfirm: () => void (async () => {
                              try {
                                const { deleteBookingReview } = await import('@/services/bookingService');
                                await deleteBookingReview(booking.bookingCode);
                                setExistingReview(null);
                              } catch (err) {
                                setReviewActionError(err instanceof Error ? err.message : 'Không thể xóa đánh giá. Vui lòng thử lại.');
                              }
                            })(),
                          }); }}
                          className="px-3 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50 rounded-lg border border-rose-200 transition-colors cursor-pointer"
                        >
                          Xóa
                        </button>
                        {reviewActionError && (
                          <p role="alert" className="text-xs font-medium text-rose-600">{reviewActionError}</p>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <p className="text-xs sm:text-sm text-slate-700 italic leading-relaxed">
                  "{existingReview.content}"
                </p>

                {/* Danh sách ảnh trong review nếu có */}
                {existingReview.images && existingReview.images.length > 0 && (
                  <div className="pt-2">
                    <div className="text-[11px] font-semibold text-slate-500 mb-1.5">Hình ảnh chuyến đi:</div>
                    <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                      {existingReview.images.map((imgUrl, i) => (
                        <a
                          key={i}
                          href={imgUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-xl overflow-hidden aspect-video border border-slate-200 bg-slate-100 block group"
                        >
                          <img
                            src={imgUrl}
                            alt={`Ảnh đánh giá ${i + 1}`}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                          />
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Cột trái 2 phần: Thông tin Homestay & Chi tiết đặt phòng */}
          <div className="lg:col-span-2 space-y-6">
            {/* Card Homestay */}
            <div className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden shadow-xs">
              <div className="p-5 flex flex-col sm:flex-row gap-4">
                <div className="w-full sm:w-44 h-36 rounded-xl overflow-hidden bg-slate-100 shrink-0 flex items-center justify-center">
                  {booking.coverImageUrl ? (
                    <img
                      src={mediaUrl(booking.coverImageUrl)}
                      alt={booking.placeName}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center text-slate-400 p-2">
                      <Home className="w-8 h-8 opacity-30 mb-1" />
                      <span className="text-[10px]">Chưa có ảnh</span>
                    </div>
                  )}
                </div>
                <div className="flex-1 space-y-2">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-[var(--color-primary)]">
                    Chỗ nghỉ homestay
                  </div>
                  <h2 className="text-lg sm:text-xl font-bold text-slate-800">
                    {booking.placeName}
                  </h2>
                  <div className="flex items-start gap-1.5 text-xs text-slate-500">
                    <MapPin className="w-4 h-4 text-[var(--color-secondary)] shrink-0 mt-0.5" />
                    <span>{booking.placeAddress}</span>
                  </div>
                  <div className="pt-2">
                    <Link
                      to={`/homestays/${booking.placeId}`}
                      className="inline-flex items-center gap-1.5 text-xs font-bold text-[var(--color-primary)] hover:underline"
                    >
                      <span>Xem trang giới thiệu homestay</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                </div>
              </div>
            </div>

            {/* Thông tin phòng & ngày lưu trú */}
            <div className="bg-white rounded-2xl border border-slate-200/80 p-5 sm:p-6 space-y-4 shadow-xs">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                  <BedDouble className="w-4 h-4 text-[var(--color-primary)]" />
                  Thông tin lưu trú
                </h3>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-3.5 bg-slate-50/80 rounded-xl border border-slate-100">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Nhận phòng (Check-in)</span>
                  <div className="text-sm font-bold text-slate-800 mt-1 flex items-center gap-1.5">
                    <Calendar className="w-4 h-4 text-[var(--color-primary)]" />
                    <span>{vnDay(booking.checkIn)}</span>
                  </div>
                  <span className="text-[11px] text-slate-500 mt-0.5 block">Từ {profile?.checkInFrom?.slice(0, 5) || '14:00'}</span>
                </div>

                <div className="p-3.5 bg-slate-50/80 rounded-xl border border-slate-100">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Trả phòng (Check-out)</span>
                  <div className="text-sm font-bold text-slate-800 mt-1 flex items-center gap-1.5">
                    <Calendar className="w-4 h-4 text-[var(--color-coral)]" />
                    <span>{vnDay(booking.checkOut)}</span>
                  </div>
                  <span className="text-[11px] text-slate-500 mt-0.5 block">Trước {profile?.checkOutUntil?.slice(0, 5) || '12:00'}</span>
                </div>
              </div>

              <div className="pt-2 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div>
                  <span className="text-slate-400 block text-[11px]">Đặt lúc:</span>
                  <span className="font-bold text-slate-800 text-sm mt-0.5 block">{vnMoment(booking.createdAt)}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">{bookingRooms(booking).length > 1 ? 'Các loại phòng:' : 'Hạng phòng:'}</span>
                  <span className="font-bold text-slate-800 text-sm mt-0.5 block">
                    {bookingRooms(booking).length > 1 ? roomSummary(bookingRooms(booking)) : booking.roomTypeName}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">Thời gian ở:</span>
                  <span className="font-bold text-slate-800 text-sm mt-0.5 block">{booking.nights} đêm</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">Số lượng & Khách:</span>
                  <span className="font-bold text-slate-800 text-sm mt-0.5 block">
                    {booking.roomCount} phòng • {booking.guestCount} người
                  </span>
                </div>
              </div>

            </div>

            {/* Thông tin khách hàng & Ghi chú */}
            <div className="bg-white rounded-2xl border border-slate-200/80 p-5 sm:p-6 space-y-4 shadow-xs">
              <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2 border-b border-slate-100 pb-3">
                <User className="w-4 h-4 text-[var(--color-primary)]" />
                Thông tin người liên hệ
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div className="space-y-1">
                  <span className="text-slate-400 block">Họ và tên khách:</span>
                  <div className="font-bold text-slate-800 text-sm">{booking.guestName}</div>
                </div>
                <div className="space-y-1">
                  <span className="text-slate-400 block">Số điện thoại:</span>
                  <div className="font-bold text-slate-800 text-sm flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5 text-slate-400" />
                    <span>{booking.guestPhone}</span>
                  </div>
                </div>
                <div className="space-y-1">
                  <span className="text-slate-400 block">Email:</span>
                  <div className="font-bold text-slate-800 text-sm flex items-center gap-1.5 truncate">
                    <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span className="truncate">{booking.guestEmail || 'Chưa cung cấp'}</span>
                  </div>
                </div>
              </div>

              {booking.guestNote && (
                <div className="pt-3 border-t border-slate-100">
                  <span className="text-xs font-semibold text-slate-500 block mb-1">Yêu cầu đặc biệt:</span>
                  <p className="text-xs text-slate-700 bg-slate-50 p-3 rounded-xl border border-slate-200/70 italic">
                    "{booking.guestNote}"
                  </p>
                </div>
              )}

            </div>

          </div>

          {/* Cột phải: Chi tiết chi phí & Chính sách */}
          <div className="space-y-6">
            {/* Hóa đơn thanh toán */}
            <div className="bg-white rounded-2xl border border-slate-200/80 p-5 sm:p-6 space-y-4 shadow-xs">
              <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2 border-b border-slate-100 pb-3">
                <CreditCard className="w-4 h-4 text-[var(--color-primary)]" />
                Tóm tắt chi phí
              </h3>

              <div className="space-y-2.5 text-xs text-slate-600">
                <div className="flex justify-between">
                  <span>Đơn giá phòng / đêm</span>
                  <span className="font-semibold text-slate-800">
                    {Number(booking.unitPrice || 0).toLocaleString('vi-VN')} đ
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Số đêm lưu trú</span>
                  <span className="font-semibold text-slate-800">{booking.nights} đêm</span>
                </div>
                <div className="flex justify-between">
                  <span>Số lượng phòng</span>
                  <span className="font-semibold text-slate-800">{booking.roomCount} phòng</span>
                </div>

                <div className="pt-3 border-t border-dashed border-slate-200 flex justify-between items-baseline">
                  <span className="text-xs font-bold text-slate-800">Tổng thanh toán:</span>
                  <span className="text-xl font-black text-[var(--color-coral)]">
                    {Number(booking.totalAmount || 0).toLocaleString('vi-VN')} đ
                  </span>
                </div>
              </div>

              <div className="p-3 bg-emerald-50/80 border border-emerald-200/70 rounded-xl text-xs text-emerald-900 flex items-center gap-2.5">
                <ShieldCheck className="w-4 h-4 text-[var(--color-accent)] shrink-0" />
                <span>Giá đã gồm thuế và phí dịch vụ, không phụ thu ẩn.</span>
              </div>
            </div>

            {/* Thao tác với đơn: sửa (khi còn chờ xác nhận) / hủy (trước khi thanh toán) */}
            {(booking.canEdit || booking.canCancel) && (
              <div className="bg-white rounded-2xl border border-slate-200/80 p-5 space-y-2.5 shadow-xs">
                {booking.canEdit && (
                  <button
                    type="button"
                    onClick={() => setIsEditModalOpen(true)}
                    className="w-full h-11 px-4 text-xs sm:text-sm font-bold text-[var(--color-primary)] bg-emerald-50 hover:bg-[var(--color-primary)] hover:text-white rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-95"
                  >
                    <Edit3 className="w-4 h-4" />
                    <span>Thay đổi thông tin đặt phòng</span>
                  </button>
                )}
                {booking.canCancel && (
                  <button
                    type="button"
                    onClick={() => setIsCancelModalOpen(true)}
                    className="w-full h-11 px-4 text-xs sm:text-sm font-bold text-rose-600 bg-white hover:bg-rose-50 border border-rose-200 rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-95"
                  >
                    <Ban className="w-4 h-4" />
                    <span>Hủy đơn</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
      )}

      {/* Modal gửi đánh giá */}
      {isReviewModalOpen && booking && (
        <BookingReviewModal
          isOpen={isReviewModalOpen}
          onClose={() => setIsReviewModalOpen(false)}
          bookingCode={booking.bookingCode}
          placeName={booking.placeName}
          roomTypeName={booking.roomTypeName}
          existingReview={existingReview}
          onSuccess={(newReview) => {
            setExistingReview(newReview);
            setIsReviewModalOpen(false);
          }}
        />
      )}

      {/* Modal hủy đơn */}
      {isCancelModalOpen && booking && (
        <BookingCancelModal
          isOpen={isCancelModalOpen}
          onClose={() => setIsCancelModalOpen(false)}
          booking={booking}
          onSuccess={(updated) => {
            setBooking(updated);
            noteLocalBookingStatus(updated.bookingCode, updated.status);
            setIsCancelModalOpen(false);
          }}
        />
      )}

      {/* Modal chỉnh sửa chi tiết booking (chỉ khi đơn còn chờ xác nhận) */}
      {isEditModalOpen && booking && (
        <BookingEditModal
          isOpen={isEditModalOpen}
          onClose={() => setIsEditModalOpen(false)}
          booking={booking}
          onSuccess={(updated) => {
            setBooking(updated);
            noteLocalBookingStatus(updated.bookingCode, updated.status);
            setIsEditModalOpen(false);
          }}
        />
      )}

      {/* Xác nhận xóa đánh giá — dialog giao diện hệ thống thay confirm() của trình duyệt */}
      <ConfirmDialog request={confirmDeleteReview} onClose={() => setConfirmDeleteReview(null)} />
    </div>
  );
}
