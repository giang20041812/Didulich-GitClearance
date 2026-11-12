import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Calendar,
  Search,
  MapPin,
  Clock,
  CheckCircle2,
  AlertCircle,
  Eye,
  Star,
  ArrowRight,
  Filter,
  Sparkles,
  BedDouble,
  RotateCcw,
  XCircle,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Home,

  Ban
} from 'lucide-react';
import { getCurrentCustomer } from '@/services/authService';
import {
  fetchMyBookings,
  getReviewedBookingCodes,
  markBookingAsReviewed
} from '@/services/bookingService';
import type { BookingResponseDto, BookingStatus } from '@/types/booking';
import { TravelerSessionExpiredError } from '@/lib/travelerSession';
import BookingReviewModal from '@/components/booking/BookingReviewModal';
import BookingCancelModal from '@/components/booking/BookingCancelModal';
import type { ReviewDto } from '@/types/review';
import DateRangePicker from '@/components/ui/DateRangePicker';
import { holdAutoNavigate, noteLocalBookingStatus, onBookingStatusChange } from '@/lib/bookingLive';
import { STAY_LABEL, STAY_TONE, stayStateOf } from '@/lib/bookingStatus';
import { mediaUrl } from '@/lib/mediaUrl';
import { ListSkeleton } from '@/components/ui/PageSkeleton';
/** 4 trạng thái của đơn: Chờ xác nhận · Đã xác nhận (chờ thanh toán) · Đã thanh toán · Đã hủy. */
const STATUS_FILTERS: { key: string; label: string; statuses?: BookingStatus[] }[] = [
  { key: 'ALL', label: 'Tất cả' },
  { key: 'PENDING', label: 'Chờ xác nhận', statuses: ['PENDING'] },
  { key: 'CONFIRMED', label: 'Chờ thanh toán', statuses: ['CONFIRMED'] },
  { key: 'PAID', label: 'Đã thanh toán', statuses: ['PAID'] },
  { key: 'CANCELLED', label: 'Đã hủy', statuses: ['CANCELLED'] },
];
/** Link cũ (?status=CHECKED_OUT / COMPLETED / DONE) mở tab Đã thanh toán. */
const normalizeFilter = (key: string | null) =>
  key === 'CHECKED_OUT' || key === 'COMPLETED' || key === 'DONE' || key === 'CHECKED_IN' ? 'PAID' : key || 'ALL';

const pad2 = (n: number) => String(n).padStart(2, '0');
/** "2026-10-04" → "04/10/2026" (TEST: thống nhất dd/mm/yyyy). */
const vnDate = (iso?: string | null) => (iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : iso ?? '');
/** Giờ + ngày đặt: "08:44 · 30/09/2026". */
const vnDateTime = (iso?: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())} · ${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
};



const ITEMS_PER_PAGE = 6;

export default function UserBookingListPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [bookings, setBookings] = useState<BookingResponseDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState(searchParams.get('q') || '');
  const [selectedFilter, setSelectedFilter] = useState(() => normalizeFilter(searchParams.get('status')));

  // Filter ngày tháng
  const [dateFilterType, setDateFilterType] = useState<'checkIn' | 'createdAt'>('checkIn');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);

  // Modal Đánh giá
  const [reviewBooking, setReviewBooking] = useState<BookingResponseDto | null>(null);
  const [reviewedCodes, setReviewedCodes] = useState<Set<string>>(new Set());

  // Modal Hủy đơn
  const [cancelModalBooking, setCancelModalBooking] = useState<BookingResponseDto | null>(null);

  // Toast thông báo
  const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'info'; text: string } | null>(null);

  const currentUser = getCurrentCustomer();

  useEffect(() => {
    if (currentUser?.role === 'ADMIN' || currentUser?.role === 'PROVIDER') {
      navigate(currentUser.role === 'ADMIN' ? '/admin' : '/partner', { replace: true });
    }
  }, [currentUser, navigate]);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      // Dọn dẹp key mock data cũ trong browser
      if (typeof window !== 'undefined') {
        localStorage.removeItem('user_recent_bookings');
      }

      // Backend lấy danh tính từ phiên đăng nhập của khách (JWT), không nhận email/SĐT từ trình duyệt.
      const serverBookings = await fetchMyBookings();

      const sorted = [...serverBookings].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );

      setBookings(sorted);
      setReviewedCodes(getReviewedBookingCodes());
    } catch (err) {
      if (err instanceof TravelerSessionExpiredError) {
        // Phiên hết hạn: đưa về đăng nhập (rồi quay lại đây) thay vì hiện "chưa có đơn" như thể đơn đã mất.
        navigate('/login', { replace: true, state: { returnUrl: '/bookings', message: err.message } });
        return;
      }
      console.error('Lỗi nạp danh sách đặt phòng:', err);
      setBookings([]);
      setLoadError('Không tải được danh sách đơn đặt phòng. Vui lòng kiểm tra kết nối rồi thử lại.');
    } finally {
      setIsLoading(false);
    }
  }, [navigate]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Tự động ẩn Toast sau 4 giây
  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => setToastMessage(null), 4000);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [toastMessage]);

  // Reset về trang 1 khi lọc thay đổi
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedFilter, startDate, endDate, dateFilterType]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchTerm.trim()) {
      setSearchParams({ q: searchTerm.trim(), status: selectedFilter });
    } else {
      setSearchParams({ status: selectedFilter });
    }
  };

  // Logic lọc dữ liệu
  const filteredBookings = useMemo(() => {
    return bookings.filter((b) => {
      // 1. Lọc theo tab trạng thái
      const tab = STATUS_FILTERS.find((t) => t.key === selectedFilter);
      if (tab?.statuses && !tab.statuses.includes(b.status)) return false;

      // 2. Lọc theo từ khóa tìm kiếm
      if (searchTerm.trim()) {
        const term = searchTerm.trim().toLowerCase();
        const matchCode = b.bookingCode?.toLowerCase().includes(term);
        const matchPlace = b.placeName?.toLowerCase().includes(term);
        const matchPhone = b.guestPhone?.includes(term);
        const matchRoom = b.roomTypeName?.toLowerCase().includes(term);
        if (!matchCode && !matchPlace && !matchPhone && !matchRoom) return false;
      }

      // 3. Lọc theo khoảng ngày (startDate - endDate)
      const targetDateStr = dateFilterType === 'checkIn' ? b.checkIn : b.createdAt?.slice(0, 10);
      if (targetDateStr) {
        if (startDate && targetDateStr < startDate) return false;
        if (endDate && targetDateStr > endDate) return false;
      }

      return true;
    });
  }, [bookings, selectedFilter, searchTerm, startDate, endDate, dateFilterType]);

  // Tính toán phân trang
  const totalItems = filteredBookings.length;
  const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE) || 1;
  const paginatedBookings = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredBookings.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [filteredBookings, currentPage]);

  // Đếm số lượng booking theo từng trạng thái để hiển thị trên tabs
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const tab of STATUS_FILTERS) {
      counts[tab.key] = tab.statuses ? bookings.filter((b) => tab.statuses?.includes(b.status)).length : bookings.length;
    }
    return counts;
  }, [bookings]);

  const getStatusBadge = (status: BookingStatus) => {
    switch (status) {
      case 'PENDING':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded-sm bg-amber-50 text-amber-700 border border-amber-200">
            <Clock className="w-3.5 h-3.5 text-amber-600" /> Chờ xác nhận
          </span>
        );
      case 'CONFIRMED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded-sm bg-sky-50 text-sky-700 border border-sky-200">
            <CheckCircle2 className="w-3.5 h-3.5 text-sky-600" /> Đã xác nhận · chờ thanh toán
          </span>
        );
      case 'PAID':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded-sm bg-emerald-50 text-emerald-700 border border-emerald-200">
            <Sparkles className="w-3.5 h-3.5 text-emerald-600" /> Đã thanh toán
          </span>
        );

      case 'CANCELLED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded-sm bg-rose-50 text-rose-700 border border-rose-200">
            <XCircle className="w-3.5 h-3.5 text-rose-600" /> Đã hủy
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded-sm bg-gray-100 text-gray-700">
            {status}
          </span>
        );
    }
  };

  // Admin / NCC đổi trạng thái một đơn (BookingStatusWatcher báo): cập nhật danh sách tại chỗ, không hiện màn hình chờ.
  useEffect(() => onBookingStatusChange(() => {
    fetchMyBookings()
      .then((list) => setBookings([...list].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())))
      .catch(() => {});
  }), []);

  // Đang mở hộp hủy / đánh giá: đơn được xác nhận thì chỉ báo, không tự chuyển trang.
  useEffect(() => (cancelModalBooking || reviewBooking ? holdAutoNavigate() : undefined), [cancelModalBooking, reviewBooking]);

  const handleCancelSuccess = (updated: BookingResponseDto) => {
    noteLocalBookingStatus(updated.bookingCode, updated.status);
    setBookings((prev) =>
      prev.map((b) => (b.bookingCode === updated.bookingCode ? updated : b))
    );
    setToastMessage({
      type: 'success',
      text: `Đã hủy đơn #${updated.bookingCode} thành công.`,
    });
  };

  const handleReviewSuccess = (_newReview: ReviewDto) => {
    if (reviewBooking) {
      markBookingAsReviewed(reviewBooking.bookingCode);
      setReviewedCodes((prev) => new Set([...prev, reviewBooking.bookingCode]));
      setToastMessage({
        type: 'success',
        text: `Đã gửi đánh giá cho homestay "${reviewBooking.placeName}" thành công! Cảm ơn bạn đã đóng góp cho cộng đồng.`,
      });
      setReviewBooking(null);
    }
  };

  return (
    <div className="min-h-screen bg-[#F6FAF8] pt-14 sm:pt-16 pb-16">
      {/* Toast thông báo nổi */}
      {toastMessage && (
        <div className="fixed top-32 right-4 z-[9999] max-w-md animate-in slide-in-from-top duration-300">
          <div className="flex items-center gap-2.5 p-3.5 rounded-md bg-white border border-emerald-200 shadow-xl text-emerald-800 text-xs font-semibold">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span className="flex-1">{toastMessage.text}</span>
            <button
              type="button"
              onClick={() => setToastMessage(null)}
              className="text-gray-400 hover:text-gray-700 cursor-pointer p-1"
            >
              <XCircle className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Header trang tinh tế (thay thế khối banner xanh to) */}
      <div className="bg-white border-b border-gray-200/80 pt-6 pb-6 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-[var(--color-primary)] text-xs font-bold uppercase tracking-wider mb-1">
              <Calendar className="w-3.5 h-3.5" />
              <span>Của tôi</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-slate-800 tracking-tight">
              Đơn đặt phòng
            </h1>
            <p className="text-xs sm:text-sm text-gray-500 mt-1">
              Theo dõi tình trạng đơn, tra cứu mã đơn, hủy đơn hoặc gửi đánh giá trải nghiệm.
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={loadData}
              title="Cập nhật lại danh sách mới nhất"
              className="flex items-center gap-1.5 px-3 py-2 rounded-md bg-gray-50 hover:bg-gray-100 border border-gray-200 text-slate-700 text-xs font-bold transition-all cursor-pointer shadow-xs active:scale-95"
            >
              <RotateCcw className="w-3.5 h-3.5 text-gray-500" />
              <span>Làm mới</span>
            </button>
            <button
              type="button"
              onClick={() => navigate('/homestays')}
              className="flex items-center gap-1.5 px-4 py-2 rounded-md bg-[var(--color-primary)] hover:bg-[#03705C] text-white text-xs font-bold transition-all shadow-xs active:scale-95 cursor-pointer"
            >
              <BedDouble className="w-3.5 h-3.5" />
              <span>Đặt phòng mới</span>
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 mt-6">
        {/* Khối Tìm kiếm & Bộ lọc nâng cao */}
        <div className="bg-white rounded-lg border border-gray-200/90 shadow-xs p-4 sm:p-5 mb-6 space-y-4">
          {/* Hàng 1: Tìm kiếm từ khóa */}
          <form onSubmit={handleSearchSubmit} className="flex flex-col sm:flex-row gap-2.5">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Tìm theo mã đơn (VD: VJ-782910), tên homestay, hạng phòng, số điện thoại..."
                className="w-full pl-10 pr-3.5 py-2 text-xs sm:text-sm rounded-md border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] focus:border-transparent placeholder:text-gray-400"
              />
            </div>
            <button
              type="submit"
              className="px-5 py-2 rounded-md bg-[var(--color-primary)] hover:bg-[#03705C] text-white text-xs sm:text-sm font-bold transition-all shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Search className="w-3.5 h-3.5" />
              <span>Tìm kiếm</span>
            </button>
          </form>

          {/* Hàng 2: Bộ lọc ngày tháng (Date Filter chuẩn style Homestay Detail) */}
          <div className="p-3 bg-[#F6FAF8] border border-gray-200/90 rounded-md flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 text-xs min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1.5 text-slate-700 font-bold shrink-0">
                <Calendar className="w-4 h-4 text-[var(--color-primary)]" />
                <span>Lọc theo:</span>
              </div>
              <div className="inline-flex rounded-md border border-gray-300 bg-white p-0.5 shadow-2xs">
                <button
                  type="button"
                  onClick={() => setDateFilterType('checkIn')}
                  className={`px-3 py-1.5 text-xs font-bold rounded-sm transition-all cursor-pointer ${
                    dateFilterType === 'checkIn'
                      ? 'bg-[var(--color-primary)] text-white shadow-xs'
                      : 'text-gray-600 hover:text-slate-800'
                  }`}
                >
                  Ngày nhận phòng
                </button>
                <button
                  type="button"
                  onClick={() => setDateFilterType('createdAt')}
                  className={`px-3 py-1.5 text-xs font-bold rounded-sm transition-all cursor-pointer ${
                    dateFilterType === 'createdAt'
                      ? 'bg-[var(--color-primary)] text-white shadow-xs'
                      : 'text-gray-600 hover:text-slate-800'
                  }`}
                >
                  Ngày đặt đơn
                </button>
              </div>
            </div>

            {/* Khung chọn khoảng ngày trực tiếp giống RoomBookingCard & Homestay Detail */}
            <div className="flex min-w-0 flex-wrap items-center gap-2 [&>div]:w-full md:[&>div]:w-auto [&>div>button]:w-full">
              <DateRangePicker 
                checkInFrom={startDate}
                checkInTo={endDate}
                onChange={(from, to) => {
                  setStartDate(from);
                  setEndDate(to);
                }}
              />
            </div>
          </div>

          {/* Hàng 3: Tabs bộ lọc trạng thái */}
          <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide pt-1.5 border-t border-slate-100">
            <div className="flex items-center gap-1 text-xs text-slate-400 pr-1 shrink-0 font-bold">
              <Filter className="w-3.5 h-3.5" />
              <span>Trạng thái:</span>
            </div>
            {STATUS_FILTERS.map((tab) => {
              const active = selectedFilter === tab.key;
              const count = statusCounts[tab.key] || 0;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => {
                    setSelectedFilter(tab.key);
                    setSearchParams({ status: tab.key, ...(searchTerm ? { q: searchTerm } : {}) });
                  }}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all cursor-pointer flex items-center gap-1.5 ${
                    active
                      ? 'bg-[var(--color-primary)] text-white shadow-2xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200/80'
                  }`}
                >
                  <span>{tab.label}</span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                      active ? 'bg-white/25 text-white' : 'bg-slate-200 text-slate-600'
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Danh sách các booking */}
        {isLoading ? (
          <ListSkeleton label="Đang tải lịch sử đặt phòng" rows={4} />
        ) : loadError ? (
          <div role="alert" className="bg-white rounded-2xl border border-rose-200 p-10 text-center shadow-xs">
            <AlertCircle className="w-7 h-7 text-rose-500 mx-auto mb-3" />
            <p className="text-sm font-semibold text-slate-800">{loadError}</p>
            <button
              type="button"
              onClick={() => void loadData()}
              className="mt-4 px-4 py-2 text-xs font-bold text-white cta cta-primary rounded-xl cursor-pointer inline-flex items-center gap-1.5 shadow-xs transition-all active:scale-95"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Thử lại</span>
            </button>
          </div>
        ) : filteredBookings.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200/80 p-10 sm:p-14 text-center shadow-xs">
            <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-[var(--color-primary)] flex items-center justify-center mx-auto mb-4 border border-emerald-100/60 shadow-xs">
              <Calendar className="w-7 h-7" />
            </div>
            <h3 className="text-base sm:text-lg font-bold text-slate-800">
              {searchTerm || startDate || endDate || selectedFilter !== 'ALL'
                ? 'Không tìm thấy đơn đặt phòng phù hợp với bộ lọc'
                : 'Chưa có đơn đặt phòng nào trong danh sách'}
            </h3>
            <p className="text-xs sm:text-sm text-slate-500 max-w-md mx-auto mt-1.5 leading-relaxed">
              {searchTerm || startDate || endDate || selectedFilter !== 'ALL'
                ? 'Hãy thử điều chỉnh lại từ khóa tìm kiếm, khoảng ngày hoặc chọn tab trạng thái "Tất cả".'
                : 'Khám phá các homestay cộng đồng độc đáo trên cung đường Tây Bắc và lên kế hoạch trải nghiệm ngay hôm nay!'}
            </p>
            <div className="mt-5 flex items-center justify-center gap-3">
              {(searchTerm || startDate || endDate || selectedFilter !== 'ALL') && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchTerm('');
                    setSelectedFilter('ALL');
                    setStartDate('');
                    setEndDate('');
                    setSearchParams({});
                  }}
                  className="px-4 py-2 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 active:scale-95"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Xóa tất cả bộ lọc</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => navigate('/homestays')}
                className="px-5 py-2 text-xs font-bold text-white cta cta-coral rounded-xl transition-all shadow-md shadow-orange-500/20 cursor-pointer flex items-center gap-1.5 active:scale-95"
              >
                <BedDouble className="w-3.5 h-3.5" />
                <span>Khám phá Homestay</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="grid auto-rows-max items-start grid-cols-1 gap-4 md:grid-cols-2">
            {paginatedBookings.map((b) => {
              // Đánh giá mở khi đơn đã thanh toán và đã tới ngày trả phòng (máy chủ tính canReview).
              const isCompleted = b.canReview;
              const canCancel = b.canCancel;
              const hasReviewed = reviewedCodes.has(b.bookingCode);

              return (
                <div
                  key={b.bookingCode}
                  className="bg-white rounded-2xl border border-slate-200/80 hover:border-[var(--color-primary)] hover:shadow-xl hover:shadow-slate-200/40 transition-all duration-300 overflow-hidden flex flex-col justify-between group"
                >
                  <div className="p-4 sm:p-5 flex flex-col gap-3.5">
                    {/* Hàng Header Card: Mã đơn + Trạng thái & Tổng tiền */}
                    <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-100">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs font-bold text-[var(--color-primary)] bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-100/80">
                          #{b.bookingCode}
                        </span>
                        {getStatusBadge(b.status)}
                        {stayStateOf(b) && (
                          <span className={`inline-flex items-center px-2.5 py-0.5 text-xs font-bold rounded-full border ${STAY_TONE[stayStateOf(b)!]}`}>{STAY_LABEL[stayStateOf(b)!]}</span>
                        )}
                        {b.canCheckIn && (
                          <span className="inline-flex items-center px-2.5 py-0.5 text-xs font-extrabold rounded-full bg-[var(--color-primary)] text-white shadow-xs">Nhận phòng hôm nay</span>
                        )}
                      </div>
                      <div className="text-right">
                        <span className="text-base sm:text-lg font-black text-[var(--color-coral)]">
                          {Number(b.totalAmount || 0).toLocaleString('vi-VN')} đ
                        </span>
                      </div>
                    </div>

                    {/* Khối giữa: Ảnh nhỏ + Thông tin Homestay */}
                    <div className="flex gap-3.5">
                      <div className="w-24 h-24 sm:w-28 sm:h-24 rounded-xl overflow-hidden bg-slate-100 shrink-0 relative shadow-xs">
                        {b.coverImageUrl ? (
                          <img
                            src={mediaUrl(b.coverImageUrl)}
                            alt={b.placeName}
                            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                          />
                        ) : (
                          <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 p-2">
                            <Home className="w-6 h-6 opacity-30 mb-0.5" />
                            <span className="text-[10px]">Chưa có ảnh</span>
                          </div>
                        )}
                      </div>

                      <div className="flex-1 min-w-0 flex flex-col justify-between">
                        <div>
                          <h3 
                            onClick={() => navigate(`/bookings/${b.bookingCode}`)}
                            className="text-sm sm:text-base font-bold text-slate-900 group-hover:text-[var(--color-primary)] transition-colors line-clamp-1 cursor-pointer"
                            title={b.placeName}
                          >
                            {b.placeName}
                          </h3>
                          <div className="flex items-center gap-1.5 text-xs text-slate-500 mt-1">
                            <MapPin className="w-3.5 h-3.5 text-[var(--color-secondary)] shrink-0" />
                            <span className="line-clamp-1">{b.placeAddress}</span>
                          </div>
                        </div>

                        <div className="text-[11px] text-slate-500">
                          <span className="text-slate-400">Đặt lúc:</span> {vnDateTime(b.createdAt)}
                        </div>
                      </div>
                    </div>

                    {/* Chi tiết lịch trình lưu trú (Grid 2 cột) */}
                    <div className="p-3 rounded-xl bg-slate-50/80 border border-slate-100 grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">Hạng phòng</span>
                        <span className="font-semibold text-slate-800 truncate block text-[11px]" title={b.roomTypeName}>
                          {b.roomTypeName}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">Quy mô</span>
                        <span className="font-semibold text-slate-800 block text-[11px]">
                          {b.nights} đêm • {b.roomCount} phòng
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">Nhận phòng</span>
                        <span className="font-semibold text-slate-800 block text-[11px]">{vnDate(b.checkIn)}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">Trả phòng</span>
                        <span className="font-semibold text-slate-800 block text-[11px]">{vnDate(b.checkOut)}</span>
                      </div>
                    </div>

                    {/* Ghi chú hoàn tiền / hủy nếu có */}
                    {Boolean(b.policySnapshot?.cancelReason) && (
                      <div className="p-2.5 bg-amber-50/80 border border-amber-200/70 rounded-xl text-xs text-amber-900">
                        <strong>Lý do hủy:</strong> {String(b.policySnapshot.cancelReason)}
                        {Boolean(b.policySnapshot.refundAmount) && (
                          <span className="ml-1.5 font-bold text-emerald-700">
                            (Đã hoàn {Number(b.policySnapshot.refundAmount).toLocaleString('vi-VN')} đ)
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Nút hành động ở đáy card */}
                  <div className="px-4 sm:px-5 py-3 bg-slate-50/60 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="text-xs text-slate-600 truncate max-w-[160px]">
                      Khách: <span className="font-semibold text-slate-800">{b.guestName}</span>
                    </div>

                    <div className="flex items-center gap-2 ml-auto">
                      {/* Nút Hủy đơn */}
                      {canCancel && (
                        <button
                          type="button"
                          onClick={() => setCancelModalBooking(b)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-rose-200 bg-white hover:bg-rose-50 text-rose-600 hover:text-rose-700 text-xs font-bold transition-all shadow-2xs active:scale-95 cursor-pointer"
                          title="Hủy đơn"
                        >
                          <Ban className="w-3.5 h-3.5" />
                          <span>Hủy đơn</span>
                        </button>
                      )}

                      {/* Nút Đánh giá */}
                      {isCompleted && (
                        <button
                          type="button"
                          onClick={() => setReviewBooking(b)}
                          disabled={hasReviewed}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all shadow-2xs cursor-pointer ${
                            hasReviewed
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 cursor-default'
                              : 'cta cta-sun text-white active:scale-95 shadow-xs'
                          }`}
                        >
                          <Star className="w-3.5 h-3.5 fill-current" />
                          <span>{hasReviewed ? 'Đã đánh giá' : 'Đánh giá'}</span>
                        </button>
                      )}

                      {/* Nút Chi tiết */}
                      <button
                        type="button"
                        onClick={() => navigate(`/bookings/${b.bookingCode}`)}
                        className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl cta cta-primary text-white text-xs font-bold transition-all shadow-xs active:scale-95 cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Chi tiết</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Phân trang (Pagination) */}
            {totalPages > 1 && (
              <div className="bg-white rounded-2xl border border-slate-200/80 p-4 mt-6 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-xs">
                <div className="text-xs text-slate-500">
                  Hiển thị <span className="font-bold text-slate-800">{(currentPage - 1) * ITEMS_PER_PAGE + 1}</span> -{' '}
                  <span className="font-bold text-slate-800">
                    {Math.min(currentPage * ITEMS_PER_PAGE, totalItems)}
                  </span>{' '}
                  trên tổng số <span className="font-bold text-slate-800">{totalItems}</span> đơn đặt phòng
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="p-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-transparent transition-colors cursor-pointer"
                    aria-label="Trang trước"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>

                  {Array.from({ length: totalPages }).map((_, idx) => {
                    const pageNum = idx + 1;
                    const isActive = pageNum === currentPage;
                    return (
                      <button
                        key={pageNum}
                        type="button"
                        onClick={() => setCurrentPage(pageNum)}
                        className={`w-8 h-8 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                          isActive
                            ? 'bg-[var(--color-primary)] text-white shadow-xs'
                            : 'border border-slate-200 text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        {pageNum}
                      </button>
                    );
                  })}

                  <button
                    type="button"
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="p-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-transparent transition-colors cursor-pointer"
                    aria-label="Trang tiếp theo"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modal gửi đánh giá */}
      {reviewBooking && (
        <BookingReviewModal
          isOpen={Boolean(reviewBooking)}
          onClose={() => setReviewBooking(null)}
          bookingCode={reviewBooking.bookingCode}
          placeName={reviewBooking.placeName}
          roomTypeName={reviewBooking.roomTypeName}
          onSuccess={handleReviewSuccess}
        />
      )}

      {/* Modal hủy đơn */}
      {cancelModalBooking && (
        <BookingCancelModal
          isOpen={Boolean(cancelModalBooking)}
          onClose={() => setCancelModalBooking(null)}
          booking={cancelModalBooking}
          onSuccess={handleCancelSuccess}
        />
      )}
    </div>
  );
}
