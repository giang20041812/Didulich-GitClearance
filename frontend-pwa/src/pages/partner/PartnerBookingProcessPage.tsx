import { useEffect, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ChevronLeft, Mail, Phone } from 'lucide-react';
import { partnerBookingService } from '@/services/partnerBookingService';
import { homestayError } from '@/services/partnerHomestayService';
import { BOOKING_ACTION_LABEL, BOOKING_STATUS_LONG_LABEL, BOOKING_STATUS_TONE, STAY_ACTOR_LABEL, STAY_LABEL, STAY_TONE, historyTitle, stayMoment as stayAt, stayStateOf } from '@/lib/bookingStatus';
import { decisionSummary, runPartnerDecision } from '@/lib/partnerBookingActions';
import BookingDecisionDialog, { type Decision } from '@/components/partner/BookingDecisionDialog';
import { Alert } from '@/components/partner/PartnerUI';
import { ui } from '@/lib/partnerUi';
import type { BookingAction, PartnerBookingDetailDto } from '@/types/booking';
import { dayMonth, fullDate, weekdayShort } from '@/lib/partnerDates';
import GuestJourneyList from '@/components/partner/GuestJourneyList';
import { roomSummary } from '@/lib/roomSelection';
import { DetailSkeleton } from '@/components/ui/PageSkeleton';

const vnd = (n?: number | null) => (n == null ? '—' : new Intl.NumberFormat('vi-VN').format(n) + 'đ');
const pad = (n: number) => String(n).padStart(2, '0');
/** Ngày dạng dd/mm/yyyy (TEST: thống nhất ngày/tháng/năm). */
const date = (d?: string | null) => (d ? fullDate(d.slice(0, 10)) : '—');
/** "01/10" — dùng cho khoảng ngày ngắn "01/10 → 02/10". */
const shortDate = (d: string) => dayMonth(d.slice(0, 10));
/** "08:44 30/09/2026" */
const dateTime = (d?: string | null) => {
  if (!d) return '—';
  const t = new Date(d);
  return `${pad(t.getHours())}:${pad(t.getMinutes())} ${pad(t.getDate())}/${pad(t.getMonth() + 1)}/${t.getFullYear()}`;
};
/** "14:00 · T5 01/10/2026" — giờ nhận/trả phòng của Homestay kèm ngày (TEST: ghi rõ giờ trong thời gian nhận và trả phòng). */
const stayMoment = (d: string, time: string | null, prefix: string) =>
  `${time ? `${prefix} ${time.slice(0, 5)} · ` : ''}${weekdayShort(d.slice(0, 10))} ${fullDate(d.slice(0, 10))}`;
const pill = (cls: string) => `inline-block whitespace-nowrap rounded-sm border px-2 py-0.5 text-[11px] font-bold ${cls}`;
const ACTOR_LABEL = { CUSTOMER: 'Khách hàng', PROVIDER: 'Nhà cung cấp', ADMIN: 'Quản trị viên', SYSTEM: 'Hệ thống' } as const;
/** Nút lùi (từ chối / hủy) bên trái, nút tiến (xác nhận / đã thanh toán) bên phải. */
const NEGATIVE: BookingAction[] = ['REJECT', 'CANCEL'];

/**
 * Xử lý một đơn trên một trang: xem yêu cầu, giá đã chốt và lịch sử, rồi thao tác đúng như cổng Admin — chờ xác nhận:
 * Từ chối / Xác nhận; đã xác nhận: Hủy đơn / Đã thanh toán. Máy tính: thông tin bên trái, khung xử lý bên phải (ghim khi cuộn).
 */
export default function PartnerBookingProcessPage() {
  const { id } = useParams<{ id: string }>();
  const bookingId = Number(id);
  const validId = Number.isSafeInteger(bookingId) && bookingId > 0;
  const [booking, setBooking] = useState<PartnerBookingDetailDto | null>(null);
  const [loading, setLoading] = useState(validId);
  const [loadError, setLoadError] = useState(validId ? '' : 'Mã đơn đặt phòng không hợp lệ.');
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (!validId) return;
    let active = true;
    partnerBookingService.getDetail(bookingId)
      .then((data) => { if (active) { setBooking(data); setLoadError(''); } })
      .catch((error: unknown) => { if (active) setLoadError(homestayError(error)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [bookingId, validId, retry]);

  const reload = () => setRetry((n) => n + 1);

  if (loading) return <DetailSkeleton label="Đang tải đơn đặt phòng" />;
  if (loadError || !booking) {
    return (
      <Alert tone="error" action={<Link to="/partner/bookings" className={ui.btnGhost}>Quay lại</Link>}>
        {loadError || 'Không tìm thấy đơn đặt phòng.'}
        {validId && <button type="button" onClick={() => { setLoading(true); reload(); }} className="ml-3 font-semibold underline">Thử lại</button>}
      </Alert>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 pb-10">
      <div className="flex flex-col gap-3">
        <Link to="/partner/bookings" className="group inline-flex w-fit items-center gap-1 text-sm font-semibold text-muted hover:text-primary">
          <ChevronLeft className="h-4 w-4 transition-transform duration-200 group-hover:-translate-x-0.5" /> Yêu cầu Booking
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="flex flex-wrap items-center gap-3 text-2xl font-bold text-ink-deep">
            <span>Booking {booking.bookingCode}</span>
            <span className={pill(BOOKING_STATUS_TONE[booking.status])}>{BOOKING_STATUS_LONG_LABEL[booking.status]}</span>
            {stayStateOf(booking) && <span className={pill(STAY_TONE[stayStateOf(booking)!])}>{STAY_LABEL[stayStateOf(booking)!]}</span>}
          </h1>
        </div>
        <p className="text-xs text-muted">{booking.placeName} · Khách gửi lúc {dateTime(booking.createdAt)}</p>
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_400px]">
      <div className="flex min-w-0 flex-col gap-5">
      <Section title="Thông tin yêu cầu" hint="Xem và kiểm tra">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <p className="text-sm font-bold text-ink-deep">{booking.guestName}</p>
            <p className="flex items-center gap-2 text-sm text-ink"><Phone className="h-3.5 w-3.5 text-muted" /> {booking.guestPhone}</p>
            <p className="flex items-center gap-2 text-sm text-ink"><Mail className="h-3.5 w-3.5 text-muted" /> {booking.guestEmail || 'Không có email'}</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Row k="Nhận phòng" v={stayMoment(booking.checkIn, booking.checkInFrom, 'Từ')} />
            <Row k="Trả phòng" v={stayMoment(booking.checkOut, booking.checkOutUntil, 'Trước')} />
            <Row k="Lưu trú" v={`${booking.nights} đêm · ${booking.roomCount} phòng · ${booking.guestCount} khách`} />
            <Row k="Loại phòng" v={booking.rooms?.length ? roomSummary(booking.rooms) : booking.roomTypeName} />
            {booking.checkedInAt && <Row k="Đã nhận phòng" v={`${stayAt(booking.checkedInAt)}${booking.checkedInBy ? ` · ${STAY_ACTOR_LABEL[booking.checkedInBy]}` : ''}`} />}
            {booking.checkedOutAt && <Row k="Đã trả phòng" v={`${stayAt(booking.checkedOutAt)}${booking.checkedOutBy ? ` · ${STAY_ACTOR_LABEL[booking.checkedOutBy]}` : ''}`} />}
            <Link to={`/partner?homestay=${booking.placeId}&room=${booking.roomTypeId}&date=${booking.checkIn.slice(0, 10)}`}
              className="w-fit self-end text-sm font-semibold text-primary underline">Xem phòng trên lịch</Link>
          </div>
        </div>
        {booking.guestNote ? (
          <div className="flex flex-col gap-1.5 rounded-md bg-primary-50/60 p-3 text-sm">
            <p className="font-semibold text-ink-deep">Yêu cầu đặc biệt</p>
            <p className="whitespace-pre-wrap text-ink">{booking.guestNote}</p>
          </div>
        ) : <p className="text-sm text-muted">Khách không có yêu cầu đặc biệt.</p>}
      </Section>

      {booking.guestJourney && (
        <Section title="Lịch trình của khách" hint="Chỉ xem">
          <GuestJourneyList journey={booking.guestJourney} />
        </Section>
      )}

      <PriceSection booking={booking} />

      {booking.history.length > 0 && (
        <Section title="Lịch sử xử lý">
          <ol className="flex flex-col gap-3 border-l border-border pl-4">
            {booking.history.map((h, i) => (
              <li key={`${h.createdAt}-${i}`} className="text-sm">
                <p className="font-semibold text-ink-deep">{historyTitle(h.fromStatus, h.toStatus)}</p>
                <p className="text-xs text-muted">{ACTOR_LABEL[h.actor]} · {dateTime(h.createdAt)}</p>
                {h.reason && <p className="mt-1 whitespace-pre-wrap text-ink">{h.reason}</p>}
              </li>
            ))}
          </ol>
        </Section>
      )}
      </div>

      {/* Điện thoại: khung xử lý lên đầu để thao tác ngay; máy tính: cột phải, ghim khi cuộn. */}
      <div className="order-first flex min-w-0 flex-col gap-5 lg:order-none lg:sticky lg:top-6">
        <ActionPanel booking={booking} onDone={setBooking} />
      </div>
      </div>
    </div>
  );
}

function PriceSection({ booking }: { booking: PartnerBookingDetailDto }) {
  const policy = booking.policySnapshot;
  const text = (key: string) => (typeof policy[key] === 'string' || typeof policy[key] === 'number' ? String(policy[key]) : null);
  // Đơn nhiều loại phòng: mỗi đêm một dòng cho từng loại phòng.
  const multiRoom = new Set(booking.nightPrices.map((n) => n.roomTypeId)).size > 1;
  return (
    <Section title="Giá và chính sách đã chốt">
      <ul className="flex flex-col gap-1.5 text-sm">
        {booking.nightPrices.map((n) => (
          <li key={`${n.stayDate}-${n.roomTypeId}`} className="flex justify-between gap-3">
            <span className="text-ink">{date(n.stayDate)} · {multiRoom ? `${n.roomTypeName} · ` : ''}{n.roomCount} phòng</span>
            <span className="tabular-nums text-ink">{vnd(n.unitPrice * n.roomCount)}</span>
          </li>
        ))}
      </ul>
      <div className="flex items-center justify-between border-t border-border pt-3">
        <span className="font-semibold text-ink-deep">Tổng giá Booking</span>
        <span className="text-lg font-bold tabular-nums text-ink-deep">{vnd(booking.totalAmount)}</span>
      </div>
      {Object.keys(policy).length > 0 ? (
        <div className="flex flex-col gap-1 rounded-md bg-primary-50/60 p-3 text-sm">
          <p className="font-semibold text-ink-deep">{text('policyName') ?? 'Chính sách hủy'} · Bản tại thời điểm khách gửi</p>
          {text('freeCancelCutoffHours') && <p className="text-ink">Miễn phí hủy trước {text('freeCancelCutoffHours')} giờ so với giờ nhận phòng; hủy muộn {text('refundType') === 'FULL_REFUND' ? 'được hoàn toàn bộ' : 'không được hoàn tiền'}.</p>}
          {text('description') && <p className="whitespace-pre-wrap text-muted">{text('description')}</p>}
        </div>
      ) : <p className="text-sm text-muted">Đơn không kèm chính sách hủy.</p>}
      <p className="text-xs text-muted">Giá và chính sách của Booking đang chờ không tự thay đổi khi bạn sửa giá phòng.</p>
    </Section>
  );
}

/**
 * Khung xử lý: tóm tắt đơn, kết quả (xác nhận lúc / kết thúc lúc / lý do hủy) và hai nút lớn theo thao tác hợp lệ —
 * cùng hộp xác nhận với danh sách đơn và cổng Admin.
 */
function ActionPanel({ booking, onDone }: { booking: PartnerBookingDetailDto; onDone: (b: PartnerBookingDetailDto) => void }) {
  const [decision, setDecision] = useState<Decision | null>(null);
  const [notice, setNotice] = useState('');
  const actions = [...booking.actions].sort((x, y) => Number(!NEGATIVE.includes(x)) - Number(!NEGATIVE.includes(y)));

  return (
    <Section title="Xử lý đơn">
      <div className="flex flex-col gap-1.5 rounded-md border border-border p-3 text-sm">
        <Row k="Khách chọn" v={`${booking.roomCount} phòng · ${shortDate(booking.checkIn)} → ${shortDate(booking.checkOut)}`} />
        <Row k="Giá đã chốt" v={vnd(booking.totalAmount)} strong />
        {booking.confirmedAt && <Row k="Xác nhận lúc" v={dateTime(booking.confirmedAt)} />}
        {booking.status === 'PAID' && booking.closedAt && <Row k="Thanh toán lúc" v={dateTime(booking.closedAt)} />}
        {booking.status === 'CANCELLED' && booking.closedAt && <Row k="Hủy lúc" v={dateTime(booking.closedAt)} />}
      </div>
      {booking.status === 'CANCELLED' && booking.closeReason && (
        <p className="whitespace-pre-wrap rounded-md bg-canvas p-2.5 text-sm text-ink">{booking.closeReason}</p>
      )}
      {booking.status === 'CONFIRMED' && <Alert tone="info">Đơn đã xác nhận, đang chờ khách thanh toán. Khi nhận được tiền, bấm “Đã thanh toán”.</Alert>}
      {booking.status === 'PAID' && <Alert tone="success">Đơn đã thanh toán — hoàn tất.</Alert>}
      {notice && <Alert tone="success">{notice}</Alert>}

      {actions.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {actions.map((action) => (
            <button key={action} type="button" onClick={() => { setNotice(''); setDecision({ action, id: booking.id, summary: decisionSummary(booking) }); }}
              className={NEGATIVE.includes(action)
                ? 'h-14 rounded-md border-2 border-danger/60 bg-white text-lg font-black text-red-700 transition-colors duration-200 hover:bg-danger/10'
                : `h-14 rounded-md text-lg font-black text-white transition-colors duration-200 ${action === 'PAY' ? 'bg-accent hover:bg-emerald-600' : 'bg-primary hover:bg-primary-700'}`}>
              {BOOKING_ACTION_LABEL[action]}
            </button>
          ))}
        </div>
      )}

      <BookingDecisionDialog decision={decision} onClose={() => setDecision(null)}
        run={async (d, note) => { onDone(await runPartnerDecision(d, note)); }} onDone={setNotice} />
    </Section>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className={`${ui.card} flex flex-col gap-3 p-5`}>
      <h2 className="flex flex-wrap items-baseline gap-2 font-semibold text-primary">{title}{hint && <span className="text-xs font-normal text-muted">{hint}</span>}</h2>
      {children}
    </section>
  );
}

function Row({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 text-sm">
      <span className="text-muted">{k}</span>
      <span className={`text-right ${strong ? 'font-bold text-ink-deep' : 'text-ink'}`}>{v}</span>
    </div>
  );
}

