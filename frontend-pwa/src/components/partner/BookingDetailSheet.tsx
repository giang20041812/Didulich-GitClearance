import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, CalendarDays, ExternalLink, Mail, Phone } from 'lucide-react';
import BottomSheet from './BottomSheet';
import BookingDecisionDialog, { type Decision } from './BookingDecisionDialog';
import { partnerBookingService } from '@/services/partnerBookingService';
import { homestayError } from '@/services/partnerHomestayService';
import { BOOKING_ACTION_LABEL, BOOKING_STATUS_LONG_LABEL, BOOKING_STATUS_TONE, STAY_ACTOR_LABEL, STAY_LABEL, STAY_TONE, stayMoment, stayStateOf } from '@/lib/bookingStatus';
import { decisionSummary, runPartnerDecision } from '@/lib/partnerBookingActions';
import { fullDate, weekdayShort } from '@/lib/partnerDates';
import type { BookingAction, PartnerBookingDetailDto } from '@/types/booking';
import GuestJourneyList from '@/components/partner/GuestJourneyList';
import { roomSummary } from '@/lib/roomSelection';

const vnd = (n: number) => new Intl.NumberFormat('vi-VN').format(n) + 'đ';
const stayDay = (d: string, time: string | null, prefix: string) =>
  `${weekdayShort(d.slice(0, 10))} ${fullDate(d.slice(0, 10))}${time ? ` · ${prefix} ${time.slice(0, 5)}` : ''}`;

/** Nút lùi (từ chối / hủy) bên trái, nút tiến (xác nhận / đã thanh toán) bên phải. */
const NEGATIVE: BookingAction[] = ['REJECT', 'CANCEL'];

/**
 * Xem nhanh một đơn ngay trên danh sách (không rời trang): khách, ngày ở, phòng, tiền, yêu cầu đặc biệt.
 * Chân khung có hai nút lớn theo thao tác hợp lệ: chờ xác nhận → Từ chối / Xác nhận; đã xác nhận → Hủy đơn / Đã thanh toán.
 */
export default function BookingDetailSheet({ bookingId, onClose, onChanged }: {
  bookingId: number | null;
  onClose: () => void;
  onChanged: (message: string) => void;
}) {
  const [detail, setDetail] = useState<PartnerBookingDetailDto | null>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [decision, setDecision] = useState<Decision | null>(null);

  useEffect(() => {
    if (bookingId === null) return;
    // Mỗi đơn một bản (danh sách gắn key theo mã đơn), nên không cần xóa dữ liệu của đơn trước.
    let active = true;
    partnerBookingService.getDetail(bookingId)
      .then((d) => { if (active) { setDetail(d); setError(''); } })
      .catch((e: unknown) => { if (active) setError(homestayError(e)); });
    return () => { active = false; };
  }, [bookingId, retry]);

  const actions = detail ? [...detail.actions].sort((x, y) => Number(!NEGATIVE.includes(x)) - Number(!NEGATIVE.includes(y))) : [];
  const footer = detail && actions.length > 0 ? (
    <div className="grid grid-cols-2 gap-2">
      {actions.map((action) => (
        <button key={action} type="button" onClick={() => setDecision({ action, id: detail.id, summary: decisionSummary(detail) })}
          className={NEGATIVE.includes(action)
            ? 'h-14 rounded-md border-2 border-danger/60 bg-white text-lg font-black text-red-700 transition-colors duration-200 hover:bg-danger/10'
            : `h-14 rounded-md text-lg font-black text-white transition-colors duration-200 ${action === 'PAY' ? 'bg-accent hover:bg-emerald-600' : 'bg-primary hover:bg-primary-700'}`}>
          {BOOKING_ACTION_LABEL[action]}
        </button>
      ))}
    </div>
  ) : undefined;

  return (
    <>
      <BottomSheet open={bookingId !== null} onClose={onClose}
        title={detail ? `Đơn ${detail.bookingCode}` : 'Chi tiết đơn'}
        subtitle={detail && (
          <span className="flex flex-wrap items-center gap-2">
            <span className={`rounded-sm border px-2 py-0.5 text-xs font-bold ${BOOKING_STATUS_TONE[detail.status]}`}>{BOOKING_STATUS_LONG_LABEL[detail.status]}</span>
            {stayStateOf(detail) && <span className={`rounded-sm border px-2 py-0.5 text-xs font-bold ${STAY_TONE[stayStateOf(detail)!]}`}>{STAY_LABEL[stayStateOf(detail)!]}</span>}
            <span>{detail.placeName}</span>
          </span>
        )}
        footer={footer}>
        {error && (
          <div role="alert" className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-md border-2 border-danger/40 bg-danger/10 p-3">
            <p className="flex items-start gap-2 text-base font-semibold text-red-800"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />{error}</p>
            {!detail && <button type="button" onClick={() => setRetry((n) => n + 1)} className="h-10 rounded-md bg-primary px-4 text-sm font-bold text-white">Thử lại</button>}
          </div>
        )}
        {!detail && !error && <p role="status" className="py-10 text-center text-base text-muted">Đang tải đơn...</p>}
        {detail && (
          <div className="flex flex-col gap-4 text-base">
            <Block title="Khách">
              <p className="font-black text-ink-deep">{detail.guestName}</p>
              <a href={`tel:${detail.guestPhone}`} className="flex w-fit items-center gap-2 font-semibold text-primary"><Phone className="h-4 w-4" />{detail.guestPhone}</a>
              {detail.guestEmail && <a href={`mailto:${detail.guestEmail}`} className="flex w-fit items-center gap-2 break-all text-ink"><Mail className="h-4 w-4 shrink-0 text-muted" />{detail.guestEmail}</a>}
            </Block>

            <Block title="Lưu trú">
              <Row k="Nhận phòng" v={stayDay(detail.checkIn, detail.checkInFrom, 'từ')} />
              <Row k="Trả phòng" v={stayDay(detail.checkOut, detail.checkOutUntil, 'trước')} />
              <Row k="Phòng" v={detail.rooms?.length ? roomSummary(detail.rooms) : `${detail.roomTypeName} · ${detail.roomCount} phòng`} />
              <Row k="Số khách" v={`${detail.guestCount} khách · ${detail.nights} đêm`} />
              <Row k="Tổng tiền" v={vnd(detail.totalAmount)} strong />
              {detail.checkedInAt && <Row k="Đã nhận phòng" v={`${stayMoment(detail.checkedInAt)}${detail.checkedInBy ? ` · ${STAY_ACTOR_LABEL[detail.checkedInBy]}` : ''}`} />}
              {detail.checkedOutAt && <Row k="Đã trả phòng" v={`${stayMoment(detail.checkedOutAt)}${detail.checkedOutBy ? ` · ${STAY_ACTOR_LABEL[detail.checkedOutBy]}` : ''}`} />}
            </Block>

            {detail.guestNote && (
              <Block title="Yêu cầu của khách" tone="sun">
                <p className="whitespace-pre-wrap text-ink">{detail.guestNote}</p>
              </Block>
            )}

            {detail.guestJourney && (
              <Block title="Lịch trình của khách">
                <GuestJourneyList journey={detail.guestJourney} />
              </Block>
            )}

            {detail.status === 'CANCELLED' && detail.closeReason && <Block title="Lý do hủy"><p className="whitespace-pre-wrap text-ink">{detail.closeReason}</p></Block>}

            <Link to={`/partner?homestay=${detail.placeId}&room=${detail.roomTypeId}&date=${detail.checkIn.slice(0, 10)}`}
              className="flex h-12 items-center justify-center gap-2 rounded-md border-2 border-primary/40 text-base font-bold text-primary transition-colors duration-200 hover:bg-primary-50">
              <CalendarDays className="h-5 w-5" /> Xem phòng trên lịch
            </Link>
            <Link to={`/partner/bookings/${detail.id}`} className="flex w-fit items-center gap-1.5 text-sm font-semibold text-muted hover:text-primary">
              <ExternalLink className="h-4 w-4" /> Xem đầy đủ (giá từng đêm, lịch sử xử lý)
            </Link>
          </div>
        )}
      </BottomSheet>
      <BookingDecisionDialog decision={decision} onClose={() => setDecision(null)}
        run={async (d, note) => { setDetail(await runPartnerDecision(d, note)); }} onDone={onChanged} />
    </>
  );
}

function Block({ title, tone, children }: { title: string; tone?: 'sun'; children: ReactNode }) {
  return (
    <section className={`flex flex-col gap-1.5 rounded-md border-2 p-3 ${tone === 'sun' ? 'border-sun bg-sun-light/40' : 'border-border'}`}>
      <h3 className="text-xs font-bold uppercase tracking-wide text-muted">{title}</h3>
      {children}
    </section>
  );
}

function Row({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="shrink-0 text-muted">{k}</span>
      <span className={`text-right ${strong ? 'font-black text-ink-deep' : 'text-ink'}`}>{v}</span>
    </div>
  );
}
