import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import { AlertCircle, BedDouble, CalendarDays, CheckCircle2, Clock, CreditCard, DoorOpen, Home, Loader2, LogIn, MapPin, PartyPopper, ReceiptText, Route } from 'lucide-react';
import ImagePlaceholder from '@/components/ui/ImagePlaceholder';
import { getCurrentCustomer } from '@/services/authService';
import { checkInStay, fetchMyStaysAt, fetchQrPlace } from '@/services/stayService';
import { BOOKING_STATUS_LONG_LABEL, stayMoment } from '@/lib/bookingStatus';
import { onBookingStatusChange } from '@/lib/bookingLive';
import { getApiErrorMessage } from '@/lib/apiError';
import { mediaUrl } from '@/lib/mediaUrl';
import type { QrPlaceView, StayView } from '@/types/booking';

const dayMonth = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

/**
 * Trang mở ra khi khách quét mã QR dán tại homestay: tên / ảnh homestay, rồi các đơn của khách ở đó với nút
 * "Nhận phòng" lớn (một chạm). Chưa đăng nhập thì mời đăng nhập rồi quay lại đúng trang này. Đơn chưa thanh toán không
 * nhận phòng được: nút "Thanh toán ngay" mở bước thanh toán của đơn; chủ nhà ghi nhận đã thanh toán thì trang tự tải lại
 * và hiện nút "Nhận phòng". Trả phòng tự động khi hết giờ trả phòng — trang chỉ báo mốc đó.
 */
export default function QrCheckinPage() {
  const { code = '' } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const customer = getCurrentCustomer();
  const traveler = customer?.role === 'TRAVELER' ? customer : null;
  const travelerEmail = traveler?.email ?? null;

  const [place, setPlace] = useState<QrPlaceView | null>(null);
  const [placeError, setPlaceError] = useState('');
  const [stays, setStays] = useState<StayView[] | null>(null);
  const [staysError, setStaysError] = useState('');
  const [busyCode, setBusyCode] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');
  const [justCheckedIn, setJustCheckedIn] = useState<string | null>(null);
  /** Tăng lên khi một đơn đổi trạng thái (vd. chủ nhà vừa ghi nhận thanh toán) — tải lại danh sách đơn. */
  const [reloadKey, setReloadKey] = useState(0);

  const login = useCallback(() => {
    navigate('/login', { state: { returnUrl: `/qr/${code}`, message: 'Đăng nhập tài khoản đã đặt phòng để nhận phòng.' } });
  }, [code, navigate]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        if (travelerEmail) {
          const data = await fetchMyStaysAt(code);
          if (!alive) return;
          setPlace(data.place);
          setStays(data.stays);
        } else {
          const data = await fetchQrPlace(code);
          if (alive) setPlace(data);
        }
      } catch (err) {
        if (!alive) return;
        if (axios.isAxiosError(err) && err.response?.status === 401) {
          // Phiên khách hết hiệu lực: vẫn hiện homestay, mời đăng nhập lại.
          fetchQrPlace(code).then((p) => { if (alive) setPlace(p); }).catch(() => {});
          setStaysError('Phiên đăng nhập đã hết — vui lòng đăng nhập lại để nhận phòng.');
          return;
        }
        const message = getApiErrorMessage(err, 'Không tải được thông tin. Vui lòng thử lại.');
        if (axios.isAxiosError(err) && err.response?.status === 404) setPlaceError(message);
        else setStaysError(message);
      }
    })();
    return () => { alive = false; };
  }, [code, travelerEmail, reloadKey]);

  // Admin / NCC đổi trạng thái một đơn đang hiện (BookingStatusWatcher báo): tải lại để nút "Nhận phòng" hiện ngay.
  const stayCodes = stays?.map((s) => s.bookingCode).join('|') ?? '';
  useEffect(() => onBookingStatusChange((change) => {
    if (stayCodes.split('|').includes(change.bookingCode)) setReloadKey((k) => k + 1);
  }), [stayCodes]);

  const checkIn = async (stay: StayView) => {
    setBusyCode(stay.bookingCode);
    setActionError('');
    try {
      const updated = await checkInStay(code, stay.bookingCode);
      setStays((list) => list?.map((s) => (s.bookingCode === updated.bookingCode ? updated : s)) ?? null);
      setJustCheckedIn(updated.bookingCode);
    } catch (err) {
      setActionError(getApiErrorMessage(err, 'Chưa nhận phòng được. Vui lòng thử lại.'));
    } finally {
      setBusyCode(null);
    }
  };

  if (placeError) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-4 pt-6 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-50 text-rose-600"><AlertCircle className="h-7 w-7" /></span>
        <h1 className="mt-4 text-xl font-extrabold text-slate-900">Mã QR không dùng được</h1>
        <p className="mt-2 text-sm text-slate-600">{placeError} Hãy báo chủ nhà, hoặc mở đơn đặt phòng để nhận phòng bằng mã in dưới QR.</p>
        <Link to="/bookings" className="mt-5 inline-flex h-11 items-center gap-2 rounded-xl bg-[#052620] px-5 text-sm font-bold text-white">
          <ReceiptText className="h-4 w-4" /> Đơn đặt phòng của tôi
        </Link>
      </div>
    );
  }

  const cover = place?.coverImageUrl ? mediaUrl(place.coverImageUrl) : null;
  const active = stays?.find((s) => s.checkedInAt && !s.checkedOutAt);

  return (
    <div className="min-h-dvh bg-gradient-to-b from-[#f0fdf9]/40 via-slate-50 to-slate-50 pb-16 pt-6">
      <div className="mx-auto w-full max-w-lg px-4">
        {/* Homestay của mã QR */}
        <section className="overflow-hidden rounded-3xl bg-white shadow-xl shadow-slate-200/50 border border-slate-200/80">
          <div className="relative aspect-[16/7] bg-slate-100">
            {cover ? <img src={cover} alt={place?.placeName ?? ''} className="h-full w-full object-cover" /> : <ImagePlaceholder Icon={Home} variant="hero" />}
          </div>
          <div className="px-5 pt-4">
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--color-primary)]">Nhận phòng tại</p>
            <h1 className="text-2xl font-bold leading-tight text-slate-900">{place?.placeName ?? 'Đang tải…'}</h1>
          </div>
          {place && (
            <div className="flex flex-wrap gap-x-4 gap-y-1.5 px-5 pb-4 pt-2 text-xs text-slate-600">
              {place.address && <span className="inline-flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5 text-[var(--color-primary)]" />{place.address}</span>}
              <span className="inline-flex items-center gap-1.5"><Clock className="h-3.5 w-3.5 text-[var(--color-primary)]" />Nhận từ {place.checkInFrom ?? '14:00'} · Trả trước {place.checkOutUntil ?? '12:00'}</span>
            </div>
          )}
        </section>

        {/* Chưa đăng nhập: mời đăng nhập rồi quay lại trang này */}
        {(!traveler || staysError.startsWith('Phiên')) && place && (
          <section className="mt-4 rounded-3xl bg-white p-6 text-center shadow-lg shadow-slate-200/40 border border-slate-200/80">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-teal-50 border border-teal-100 text-[var(--color-primary)]">
              <DoorOpen className="h-7 w-7" />
            </div>
            <h2 className="mt-3 text-lg font-bold text-slate-900">Đăng nhập để nhận phòng</h2>
            <p className="mt-1 text-xs text-slate-500 leading-relaxed">
              {customer && !traveler
                ? 'Bạn đang dùng tài khoản quản trị / đối tác. Hãy đăng nhập bằng tài khoản khách đã đặt phòng.'
                : staysError || 'Dùng tài khoản bạn đã đặt phòng — chỉ một chạm là xong.'}
            </p>
            <button type="button" onClick={login} className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl cta cta-primary text-sm font-bold text-white shadow-md shadow-teal-900/10 transition-all cursor-pointer">
              <LogIn className="h-4 w-4" /> Đăng nhập
            </button>
            <Link to={`/homestays/${place.placeId}`} className="mt-3.5 inline-block text-xs font-semibold text-[var(--color-primary)] hover:underline">Chưa đặt phòng? Xem phòng trống</Link>
          </section>
        )}

        {traveler && staysError && !staysError.startsWith('Phiên') && (
          <p role="alert" className="mt-4 rounded-2xl bg-rose-50/80 p-3.5 text-xs font-medium text-rose-700 border border-rose-200">{staysError}</p>
        )}

        {traveler && stays === null && !staysError && (
          <p role="status" className="mt-8 flex items-center justify-center gap-2 text-xs text-slate-500"><Loader2 className="h-4 w-4 animate-spin text-[var(--color-primary)]" /> Đang tìm đơn của bạn…</p>
        )}

        {traveler && stays && stays.length === 0 && place && (
          <section className="mt-4 rounded-3xl bg-white p-6 text-center shadow-lg shadow-slate-200/40 border border-slate-200/80">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
              <BedDouble className="h-7 w-7" />
            </div>
            <h2 className="mt-3 text-lg font-bold text-slate-900">Chưa có đơn nào ở đây</h2>
            <p className="mt-1 text-xs text-slate-500 leading-relaxed">
              Tài khoản <strong>{traveler.email}</strong> chưa có đơn còn hiệu lực tại {place.placeName}. Nếu bạn đặt bằng tài khoản khác, hãy đăng nhập lại.
            </p>
            <div className="mt-5 grid grid-cols-2 gap-2.5">
              <Link to={`/homestays/${place.placeId}`} className="inline-flex h-11 items-center justify-center rounded-xl cta cta-primary text-xs font-bold text-white shadow-sm transition-colors">Đặt phòng</Link>
              <button type="button" onClick={login} className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer">Tài khoản khác</button>
            </div>
          </section>
        )}

        {actionError && <p role="alert" className="mt-4 rounded-2xl bg-rose-50/80 p-3.5 text-xs font-medium text-rose-700 border border-rose-200">{actionError}</p>}

        {traveler && stays && stays.length > 0 && (
          <ul className="mt-4 flex flex-col gap-3.5">
            {stays.map((stay) => {
              const inHouse = !!stay.checkedInAt && !stay.checkedOutAt;
              const celebrated = justCheckedIn === stay.bookingCode;
              return (
                <li key={stay.bookingCode} className={`overflow-hidden rounded-3xl bg-white shadow-sm border ${inHouse ? 'border-teal-400 shadow-md shadow-teal-900/5' : 'border-slate-200/80'}`}>
                  {celebrated && (
                    <div className="rise-in flex items-center gap-2 bg-[var(--color-primary)] px-4 py-3 text-xs font-bold text-white" role="status">
                      <PartyPopper className="h-4 w-4 shrink-0 text-amber-200" /> Nhận phòng thành công — chúc bạn kỳ nghỉ thật vui!
                    </div>
                  )}
                  <div className="p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-mono text-xs font-bold text-[var(--color-primary)]">#{stay.bookingCode}</p>
                        <p className="mt-0.5 truncate text-base font-bold text-slate-900">{stay.roomTypeName ?? 'Phòng'} · {stay.roomCount} phòng</p>
                        <p className="mt-1 inline-flex items-center gap-1.5 text-xs text-slate-500">
                          <CalendarDays className="h-3.5 w-3.5 text-[var(--color-primary)]" /> {dayMonth(stay.checkIn)} → {dayMonth(stay.checkOut)}{stay.nights ? ` · ${stay.nights} đêm` : ''} · {stay.guestCount} khách
                        </p>
                      </div>
                      <span className="shrink-0 rounded-full bg-slate-100 border border-slate-200/60 px-2.5 py-1 text-[11px] font-semibold text-slate-600">{BOOKING_STATUS_LONG_LABEL[stay.status]}</span>
                    </div>

                    {stay.canCheckIn ? (
                      <button type="button" onClick={() => { void checkIn(stay); }} disabled={busyCode !== null}
                        className="mt-4 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl cta cta-primary text-sm font-bold text-white shadow-md shadow-teal-900/10 transition-all active:scale-[0.99] disabled:opacity-60 cursor-pointer">
                        {busyCode === stay.bookingCode ? <Loader2 className="h-4 w-4 animate-spin" /> : <DoorOpen className="h-5 w-5" />}
                        {busyCode === stay.bookingCode ? 'Đang nhận phòng…' : 'Nhận phòng'}
                      </button>
                    ) : inHouse ? (
                      <div className="mt-4 rounded-2xl bg-teal-50/70 border border-teal-100 p-3 text-xs text-teal-950">
                        <p className="flex items-center gap-1.5 font-bold"><CheckCircle2 className="h-4 w-4 text-[var(--color-primary)]" /> Đã nhận phòng lúc {stayMoment(stay.checkedInAt)}</p>
                        {stay.checkoutDeadline && <p className="mt-1 text-[11px] text-teal-700">Tự trả phòng lúc {stayMoment(stay.checkoutDeadline)} — bạn không cần làm gì thêm.</p>}
                      </div>
                    ) : stay.checkedOutAt ? (
                      <p className="mt-4 rounded-2xl bg-slate-50 border border-slate-200/60 p-3 text-xs font-medium text-slate-600">Đã trả phòng lúc {stayMoment(stay.checkedOutAt)}. Cảm ơn bạn đã ghé!</p>
                    ) : (
                      stay.blockReason && (
                        <div className="mt-4 rounded-2xl bg-amber-50/80 border border-amber-200 p-3">
                          <p className="flex items-start gap-1.5 text-xs font-semibold text-amber-900"><AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{stay.blockReason}</p>
                          {/* Đơn chưa thanh toán: tới bước thanh toán của đơn (trang đơn cuộn tới và làm nổi bật mục thanh toán) */}
                          {stay.status === 'CONFIRMED' && (
                            <Link to={`/bookings/${encodeURIComponent(stay.bookingCode)}?tab=detail`} state={{ liveStatus: 'CONFIRMED' }}
                              className="mt-3 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-amber-500 text-sm font-bold text-white shadow-sm transition-colors hover:bg-amber-600">
                              <CreditCard className="h-4 w-4" /> Thanh toán ngay
                            </Link>
                          )}
                        </div>
                      )
                    )}

                    <div className="mt-3.5 flex gap-2">
                      <Link to={`/bookings/${encodeURIComponent(stay.bookingCode)}?tab=journey`} className="inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl bg-[#edfbf7] text-xs font-bold text-[var(--color-primary)] border border-teal-200/80 hover:bg-teal-50 transition-colors">
                        <Route className="h-3.5 w-3.5" /> Lịch trình
                      </Link>
                      <Link to={`/bookings/${encodeURIComponent(stay.bookingCode)}?tab=detail`} className="inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl text-xs font-semibold text-slate-700 border border-slate-200 hover:bg-slate-50 transition-colors">
                        <ReceiptText className="h-3.5 w-3.5" /> Chi tiết đơn
                      </Link>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {active && !justCheckedIn && (
          <p className="mt-4 text-center text-xs text-slate-500">Bạn đang ở {place?.placeName}. Chúc một kỳ nghỉ tuyệt vời!</p>
        )}
      </div>
    </div>
  );
}
