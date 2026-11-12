import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, BadgeCheck, CheckCircle2, X, XCircle } from 'lucide-react';
import { fetchMyBookingStatuses } from '@/services/bookingService';
import { emitBookingStatusChange, isAutoNavigateHeld, onLocalBookingStatus, type BookingStatusChange } from '@/lib/bookingLive';
import type { BookingStatus } from '@/types/booking';

/** Còn đơn chờ xác nhận: hỏi 4 giây một lần (chỉ khi tab đang mở) để màn hình đổi gần như ngay khi được xác nhận. */
const FAST_MS = 4000;
/** Đang xem chi tiết một đơn đã xác nhận (chờ ghi nhận thanh toán), hoặc đang ở trang quét mã QR nhận phòng. */
const WATCH_MS = 12000;
const TOAST_MS = 9000;
/** Trang có thể đang nhập dở dữ liệu — không tự chuyển trang, chỉ báo kèm nút "Xem đơn". */
const HOLD_PATHS = ['/profile'];

interface LiveToast {
  id: number;
  change: BookingStatusChange;
  /** Khách đang (hoặc vừa được chuyển tới) ở trang chi tiết đơn này — không cần nút "Xem đơn". */
  onDetail: boolean;
}

const hasTravelerToken = () => {
  try { return !!localStorage.getItem('traveler_token'); } catch { return false; }
};

const detailCodeOf = (pathname: string) => {
  const m = pathname.match(/^\/bookings\/([^/]+)\/?$/);
  return m?.[1] ? decodeURIComponent(m[1]) : null;
};

/**
 * Theo dõi trạng thái đơn của khách du lịch đang đăng nhập (gắn một lần ở CustomerRoute):
 * Admin / NCC xác nhận đơn → màn hình của khách tự chuyển tới chi tiết đơn đó (bước thanh toán qua Zalo).
 * Dùng hỏi định kỳ endpoint 2 cột thay cho SSE / WebSocket vì backend chạy nhiều container trên Vercel.
 */
export default function BookingStatusWatcher() {
  const navigate = useNavigate();
  const location = useLocation();
  const [loggedIn, setLoggedIn] = useState(hasTravelerToken);
  const [liveStatuses, setLiveStatuses] = useState<Map<string, BookingStatus>>(() => new Map());
  const [toast, setToast] = useState<LiveToast | null>(null);
  const baseline = useRef<Map<string, BookingStatus> | null>(null);
  const inFlight = useRef(false);
  const lastPollAt = useRef(0);
  const pathRef = useRef(location.pathname);

  useEffect(() => { pathRef.current = location.pathname; }, [location.pathname]);

  const handleChange = useCallback((change: BookingStatusChange) => {
    emitBookingStatusChange(change);
    // Chuông thông báo tải lại ngay (rồi tự báo ghim đơn ở trang chủ).
    window.dispatchEvent(new Event('notification_change'));
    const path = pathRef.current;
    const onDetail = detailCodeOf(path) === change.bookingCode;
    let navigated = false;
    if (change.to === 'CONFIRMED' && !onDetail && !isAutoNavigateHeld() && !HOLD_PATHS.includes(path)) {
      navigate(`/bookings/${encodeURIComponent(change.bookingCode)}`, { state: { liveStatus: 'CONFIRMED' } });
      navigated = true;
    }
    setToast({ id: Date.now(), change, onDetail: onDetail || navigated });
  }, [navigate]);

  const poll = useCallback(async (force = false) => {
    if (!hasTravelerToken() || inFlight.current) return;
    if (!force && Date.now() - lastPollAt.current < 1500) return;
    inFlight.current = true;
    lastPollAt.current = Date.now();
    try {
      const rows = await fetchMyBookingStatuses();
      if (!rows) return;
      const previous = baseline.current;
      const next = new Map(rows.map((r) => [r.bookingCode, r.status] as const));
      // Đơn vừa tạo trên thiết bị này có thể chưa có trong kết quả của lượt hỏi đang chạy: giữ lại trong mốc.
      previous?.forEach((status, code) => { if (!next.has(code)) next.set(code, status); });
      baseline.current = next;
      setLiveStatuses(next);
      // Lượt đầu chỉ lấy mốc: đơn đã được xác nhận từ trước không làm trang tự chuyển.
      if (!previous) return;
      for (const row of rows) {
        const from = previous.get(row.bookingCode);
        if (from && from !== row.status) handleChange({ bookingCode: row.bookingCode, from, to: row.status });
      }
    } finally {
      inFlight.current = false;
    }
  }, [handleChange]);

  // Đăng nhập / đăng xuất (kể cả ở tab khác): lấy lại mốc.
  useEffect(() => {
    const sync = () => {
      const now = hasTravelerToken();
      setLoggedIn(now);
      if (!now) { baseline.current = null; setLiveStatuses(new Map()); }
    };
    window.addEventListener('auth_change', sync);
    window.addEventListener('storage', sync);
    return () => { window.removeEventListener('auth_change', sync); window.removeEventListener('storage', sync); };
  }, []);

  useEffect(() => {
    if (!loggedIn) return;
    baseline.current = null;
    void poll(true);
  }, [loggedIn, poll]);

  // Khách tự tạo / hủy / sửa đơn trên thiết bị này: cập nhật mốc, không hiện thông báo.
  useEffect(() => onLocalBookingStatus((code, status) => {
    const map = new Map(baseline.current ?? []);
    map.set(code, status);
    baseline.current = map;
    setLiveStatuses(map);
  }), []);

  // Có tin mới ở chuông thông báo, hoặc quay lại tab: hỏi ngay.
  useEffect(() => {
    if (!loggedIn) return;
    const now = () => void poll();
    const onVisible = () => { if (document.visibilityState === 'visible') void poll(); };
    window.addEventListener('booking_status_change', now);
    window.addEventListener('focus', now);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('booking_status_change', now);
      window.removeEventListener('focus', now);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [loggedIn, poll]);

  const hasPending = [...liveStatuses.values()].includes('PENDING');
  const viewingCode = detailCodeOf(location.pathname);
  // Khách đứng ở homestay (trang quét mã QR) mà đơn chưa thanh toán: chủ nhà ghi nhận thanh toán là nút "Nhận phòng" hiện.
  const atQrUnpaid = location.pathname.startsWith('/qr/') && [...liveStatuses.values()].includes('CONFIRMED');
  const intervalMs = hasPending ? FAST_MS
    : (viewingCode && liveStatuses.get(viewingCode) === 'CONFIRMED') || atQrUnpaid ? WATCH_MS : null;

  // Hỏi định kỳ chỉ khi tab đang hiển thị (tab ẩn không tốn request / thời gian chạy container backend).
  useEffect(() => {
    if (!loggedIn || !intervalMs) return;
    let timer: number | undefined;
    const start = () => { if (timer === undefined) timer = window.setInterval(() => void poll(true), intervalMs); };
    const stop = () => { window.clearInterval(timer); timer = undefined; };
    const onVisibility = () => (document.visibilityState === 'visible' ? start() : stop());
    if (document.visibilityState === 'visible') start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => { stop(); document.removeEventListener('visibilitychange', onVisibility); };
  }, [loggedIn, intervalMs, poll]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast((t) => (t?.id === toast.id ? null : t)), TOAST_MS);
    return () => window.clearTimeout(timer);
  }, [toast]);

  if (!toast) return null;
  const { change } = toast;
  const rejected = change.to === 'CANCELLED' && change.from === 'PENDING';
  const view = change.to === 'CONFIRMED'
    ? { Icon: BadgeCheck, tone: 'border-emerald-200', iconTone: 'bg-emerald-50 text-emerald-600', title: `Đơn #${change.bookingCode} đã được xác nhận`, text: 'Thanh toán qua Zalo để hoàn tất đặt phòng.' }
    : change.to === 'PAID'
      ? { Icon: CheckCircle2, tone: 'border-emerald-200', iconTone: 'bg-emerald-50 text-emerald-600', title: `Đơn #${change.bookingCode} đã thanh toán`, text: 'Chỗ nghỉ đã sẵn sàng đón bạn.' }
      : { Icon: XCircle, tone: 'border-rose-200', iconTone: 'bg-rose-50 text-rose-600', title: `Đơn #${change.bookingCode} ${rejected ? 'bị từ chối' : 'đã bị hủy'}`, text: 'Phòng đã được nhả lại. Xem chi tiết đơn để biết lý do.' };

  return (
    <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-3 top-[calc(var(--app-header-offset,72px)+10px)] z-[9990] flex justify-center">
      <div key={toast.id} className={`pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-xl border bg-white p-3.5 shadow-lg rise-in ${view.tone}`}>
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${view.iconTone}`}>
          <view.Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-slate-900">{view.title}</p>
          <p className="mt-0.5 text-xs text-slate-600">{view.text}</p>
          {!toast.onDetail && (
            <button
              type="button"
              onClick={() => { setToast(null); navigate(`/bookings/${encodeURIComponent(change.bookingCode)}`, { state: { liveStatus: change.to } }); }}
              className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-[var(--color-primary)] hover:underline cursor-pointer"
            >
              Xem đơn <ArrowRight className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <button type="button" onClick={() => setToast(null)} aria-label="Đóng thông báo" title="Đóng" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-700 ring-1 ring-slate-300 transition-colors hover:bg-slate-200 hover:text-slate-900 cursor-pointer">
          <X className="h-4 w-4" strokeWidth={2.75} />
        </button>
      </div>
    </div>
  );
}
