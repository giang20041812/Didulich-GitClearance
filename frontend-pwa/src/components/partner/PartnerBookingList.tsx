import { useEffect, useState, type MouseEvent } from 'react';
import { peekPartnerStale, primePartner } from '@/lib/partnerCache';
import { CheckCircle2, ChevronRight, RefreshCw, Search, X } from 'lucide-react';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { partnerBookingService } from '@/services/partnerBookingService';
import { homestayError } from '@/services/partnerHomestayService';
import { BOOKING_ACTION_LABEL, BOOKING_STATUSES, BOOKING_STATUS_LABEL, BOOKING_STATUS_TONE, STAY_LABEL, STAY_TONE, stayStateOf } from '@/lib/bookingStatus';
import { decisionSummary, runPartnerDecision } from '@/lib/partnerBookingActions';
import type { BookingStatusSummary, PageResponse } from '@/types/admin';
import type { BookingAction, BookingStatus, PartnerBookingRowDto } from '@/types/booking';
import { Tabs } from '@/components/partner/PartnerUI';
import PartnerDateRangePicker from '@/components/partner/PartnerDateRangePicker';
import BookingDetailSheet from '@/components/partner/BookingDetailSheet';
import BookingDecisionDialog, { type Decision } from '@/components/partner/BookingDecisionDialog';
import { dayMonth, fullDate } from '@/lib/partnerDates';

const PAGE_SIZE = 15;
/** Bộ lọc khi mở trang (khớp giá trị khởi tạo bên dưới) — để hiện ngay danh sách đã lưu. */
const DEFAULT_QUERY = { status: 'PENDING', sortBy: 'createdAt', sortDir: 'desc', page: 0, size: PAGE_SIZE } as const;
const SUMMARY_KEY = 'bookings-summary';
const listKey = (query: object) => `bookings:${JSON.stringify(Object.entries(query).filter(([, v]) => v !== undefined).sort())}`;
const vnd = (n?: number | null) => (n == null ? '—' : new Intl.NumberFormat('vi-VN').format(n) + 'đ');
const pad = (n: number) => String(n).padStart(2, '0');
const date = (d?: string | null) => (d ? fullDate(d.slice(0, 10)) : '—');
const dateTime = (d?: string | null) => {
  if (!d) return '—';
  const t = new Date(d);
  return `${pad(t.getHours())}:${pad(t.getMinutes())} ${pad(t.getDate())}/${pad(t.getMonth() + 1)}/${t.getFullYear()}`;
};
/** Nút trên một dòng: không mở khung chi tiết khi bấm. */
const stop = (e: MouseEvent) => e.stopPropagation();
/** Nút lùi (từ chối / hủy đơn) nằm trái, nút tiến (xác nhận / đã thanh toán) nằm phải. */
const NEGATIVE: BookingAction[] = ['REJECT', 'CANCEL'];

/**
 * Danh sách đơn của NCC, mặc định lọc "Chờ xác nhận". Mỗi đơn có nút nhanh theo đúng thao tác hợp lệ (giống cổng Admin):
 * chờ xác nhận → Từ chối / Xác nhận; đã xác nhận → Hủy đơn / Đã thanh toán. Bấm vào đơn để xem chi tiết trong khung trượt.
 */
export default function PartnerBookingList() {
  const [keyword, setKeyword] = useState('');
  const [status, setStatus] = useState<BookingStatus | ''>('PENDING');
  const [checkInFrom, setCheckInFrom] = useState('');
  const [checkInTo, setCheckInTo] = useState('');
  const [page, setPage] = useState(0);
  const [reload, setReload] = useState(0);
  // Lỗi / kết quả thao tác nhanh hiển thị inline trên bảng (thay alert hệ thống)
  const [actionError, setActionError] = useState('');
  const [notice, setNotice] = useState('');
  // Mở lại trang (bộ lọc mặc định): hiện ngay danh sách lần trước trong tab, rồi làm mới ngầm.
  const [data, setData] = useState<PageResponse<PartnerBookingRowDto> | null>(() => peekPartnerStale<PageResponse<PartnerBookingRowDto>>(listKey(DEFAULT_QUERY)) ?? null);
  const [summary, setSummary] = useState<BookingStatusSummary | null>(() => peekPartnerStale(SUMMARY_KEY) ?? null);
  const [loading, setLoading] = useState(() => !peekPartnerStale(listKey(DEFAULT_QUERY)));
  const [error, setError] = useState('');
  const [openId, setOpenId] = useState<number | null>(null);
  const [decision, setDecision] = useState<Decision | null>(null);
  const debounced = useDebouncedValue(keyword);

  useEffect(() => {
    let active = true;
    const query = {
      keyword: debounced.trim() || undefined,
      status: status || undefined,
      checkInFrom: checkInFrom || undefined,
      checkInTo: checkInTo || undefined,
      sortBy: 'createdAt', sortDir: 'desc', page, size: PAGE_SIZE
    } as const;
    partnerBookingService.getBookings(query)
      .then((list) => { if (active) { setData(list); setError(''); primePartner(listKey(query), list); } })
      .catch((e: unknown) => { if (active) setError(homestayError(e)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [debounced, status, checkInFrom, checkInTo, page, reload]);

  // Số đơn theo trạng thái không phụ thuộc bộ lọc / trang: chỉ tải khi mở và sau khi xử lý đơn (reload), ưu tiên
  // thấp sau danh sách. Trước đây tải lại cùng danh sách ở mỗi lần gõ tìm kiếm / chuyển trang.
  useEffect(() => {
    let active = true;
    partnerBookingService.getSummary('low')
      .then((counts) => { if (active) { setSummary(counts); primePartner(SUMMARY_KEY, counts); } })
      .catch(() => undefined); // chỉ là số trên chip; lỗi thì giữ số cũ
    return () => { active = false; };
  }, [reload]);

  const refresh = (change: () => void) => { setLoading(true); change(); };
  const changed = (message: string) => { setActionError(''); setNotice(message); refresh(() => setReload((n) => n + 1)); };

  const rows = data?.content ?? [];
  const th = 'px-3 py-3';
  const quick = (b: PartnerBookingRowDto, size: 'row' | 'card') => {
    if (!b.actions?.length) return null;
    const h = size === 'card' ? 'h-12 flex-1 text-base' : 'h-10 px-4 text-sm';
    const ordered = [...b.actions].sort((x, y) => Number(!NEGATIVE.includes(x)) - Number(!NEGATIVE.includes(y)));
    return ordered.map((action) => (
      <button key={action} type="button" onClick={(e) => { stop(e); setDecision({ action, id: b.id, summary: decisionSummary(b) }); }}
        className={NEGATIVE.includes(action)
          ? `${h} rounded-md border-2 border-danger/50 bg-white font-bold text-red-700 transition-colors duration-200 hover:bg-danger/10`
          : `${h} rounded-md font-bold text-white transition-colors duration-200 ${action === 'PAY' ? 'bg-accent hover:bg-emerald-600' : 'bg-primary hover:bg-primary-700'}`}>
        {BOOKING_ACTION_LABEL[action]}
      </button>
    ));
  };

  return (
    <div className="flex min-w-0 flex-col gap-4 rounded-lg border border-border bg-white p-3 shadow-[var(--shadow-card)] sm:p-5">
      {actionError && (
        <div role="alert" className="flex items-start gap-2 rounded-md border border-danger/30 bg-danger/5 px-3 py-2.5 text-sm font-medium text-danger">
          <span className="flex-1">{actionError}</span>
          <button type="button" onClick={() => setActionError('')} aria-label="Đóng thông báo" className="shrink-0 opacity-60 transition-opacity hover:opacity-100"><X className="h-4 w-4" /></button>
        </div>
      )}
      {notice && (
        <div role="status" className="flex items-start gap-2 rounded-md border border-accent/30 bg-accent-50 px-3 py-2.5 text-sm font-semibold text-accent-700">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="flex-1">{notice}</span>
          <button type="button" onClick={() => setNotice('')} aria-label="Đóng thông báo" className="shrink-0 opacity-60 transition-opacity hover:opacity-100"><X className="h-4 w-4" /></button>
        </div>
      )}

      {/* Bộ lọc: điện thoại mỗi ô một hàng, máy tính dồn một hàng. */}
      <div className="flex flex-col gap-2 md:flex-row md:flex-wrap md:items-center md:gap-3">
        <label className="relative min-w-0 md:min-w-[260px] md:flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input className="h-11 w-full rounded-md border border-border bg-white pl-9 pr-3 text-base focus:border-primary focus:outline-none md:text-sm" placeholder="Tìm mã đặt, tên / SĐT khách..."
            value={keyword} onChange={(e) => refresh(() => { setKeyword(e.target.value); setPage(0); })} />
        </label>

        <div className="flex min-w-0 items-center gap-2">
          <PartnerDateRangePicker
            checkInFrom={checkInFrom}
            checkInTo={checkInTo}
            onChange={(from, to) => refresh(() => { setCheckInFrom(from); setCheckInTo(to); setPage(0); })}
          />
          <button type="button" onClick={() => refresh(() => setReload((n) => n + 1))} aria-label="Tải lại" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-border text-muted hover:text-primary">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="-mx-1 min-w-0 px-1">
        <Tabs<BookingStatus | ''>
          value={status}
          onChange={(s) => refresh(() => { setStatus(s); setPage(0); setReload(n => n + 1); })}
          tabs={[
            { id: '', label: 'Tất cả', badge: summary ? Object.values(summary).reduce((a, b) => a + b, 0) : undefined },
            ...BOOKING_STATUSES.map(s => ({ id: s, label: BOOKING_STATUS_LABEL[s], badge: summary?.[s] }))
          ]}
        />
      </div>

      {error && <p role="alert" className="rounded-md border border-danger/30 bg-danger/5 p-3 text-sm text-danger">{error}</p>}

      {/* Điện thoại: mỗi đơn một thẻ, bấm vào thẻ để xem chi tiết; nút thao tác ở chân thẻ. */}
      <ul className={`flex flex-col gap-3 md:hidden transition-opacity ${loading ? 'opacity-60' : ''}`}>
        {rows.map((b) => (
          <li key={b.id} className="rounded-lg border-2 border-border bg-white">
            <button type="button" onClick={() => setOpenId(b.id)} className="flex w-full flex-col gap-2 p-3.5 text-left">
              <div className="flex w-full items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-base font-black text-ink-deep">{b.guestName}</p>
                  <p className="truncate text-sm text-muted">{b.placeName} · {b.roomTypeName}</p>
                </div>
                <span className="flex shrink-0 flex-col items-end gap-1">
                  <span className={`whitespace-nowrap rounded-sm border px-2 py-0.5 text-xs font-bold ${BOOKING_STATUS_TONE[b.status]}`}>{BOOKING_STATUS_LABEL[b.status]}</span>
                  {stayStateOf(b) && <span className={`whitespace-nowrap rounded-sm border px-2 py-0.5 text-xs font-bold ${STAY_TONE[stayStateOf(b)!]}`}>{STAY_LABEL[stayStateOf(b)!]}</span>}
                </span>
              </div>
              {b.status === 'CONFIRMED' && (
                <p className="w-full rounded-md bg-sky-50 px-2.5 py-1.5 text-sm font-bold text-sky-700">Chờ khách thanh toán</p>
              )}
              <div className="flex w-full items-center justify-between gap-2 text-sm text-ink">
                <span>{dayMonth(b.checkIn.slice(0, 10))} → {dayMonth(b.checkOut.slice(0, 10))} · {b.nights} đêm · {b.roomCount} phòng</span>
                <span className="font-black text-ink-deep">{vnd(b.totalAmount)}</span>
              </div>
              <span className="flex items-center gap-0.5 text-sm font-semibold text-primary">Xem chi tiết <ChevronRight className="h-4 w-4" /></span>
            </button>
            {quick(b, 'card') && <div className="flex gap-2 border-t border-border p-3">{quick(b, 'card')}</div>}
          </li>
        ))}
        {!loading && rows.length === 0 && !error && <li className="py-10 text-center text-sm text-muted">Không có đơn phù hợp.</li>}
      </ul>

      {/* Máy tính: bấm vào dòng để xem chi tiết; nút nhanh ở cột cuối. */}
      <div className={`hidden overflow-x-auto rounded-md border border-border transition-opacity md:block ${loading ? 'opacity-60' : ''}`}>
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-border bg-canvas text-xs font-bold uppercase tracking-wide text-muted">
              <th className={th}>Mã đặt</th><th className={th}>Khách hàng</th><th className={th}>Homestay / Phòng</th>
              <th className={th}>Lưu trú</th><th className={`${th} text-right`}>Tổng tiền</th><th className={th}>Trạng thái</th>
              <th className={`${th} text-right`}>Thao tác</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((b) => (
              <tr key={b.id} onClick={() => setOpenId(b.id)} className="cursor-pointer transition-colors hover:bg-primary-50/40">
                <td className={th}>
                  <button type="button" onClick={(e) => { stop(e); setOpenId(b.id); }} className="whitespace-nowrap font-mono font-semibold text-primary hover:underline">{b.bookingCode}</button>
                  <div className="whitespace-nowrap text-xs text-muted">{dateTime(b.createdAt)}</div>
                </td>
                <td className={th}><div className="font-semibold text-ink-deep">{b.guestName}</div><div className="text-xs text-muted">{b.guestPhone}</div></td>
                <td className={th}><div className="font-medium text-ink">{b.placeName}</div><div className="text-xs text-muted">{b.roomTypeName}</div></td>
                <td className={`${th} text-ink`}><div className="whitespace-nowrap">{date(b.checkIn)} → {date(b.checkOut)}</div><div className="text-xs text-muted">{b.nights} đêm · {b.roomCount} phòng · {b.guestCount} khách</div></td>
                <td className={`${th} whitespace-nowrap text-right font-bold text-ink-deep`}>{vnd(b.totalAmount)}</td>
                <td className={th}>
                  <span className={`inline-block whitespace-nowrap rounded-sm border px-2 py-0.5 text-xs font-bold ${BOOKING_STATUS_TONE[b.status]}`}>{BOOKING_STATUS_LABEL[b.status]}</span>
                  {stayStateOf(b) && <span className={`mt-1 block w-fit whitespace-nowrap rounded-sm border px-2 py-0.5 text-xs font-bold ${STAY_TONE[stayStateOf(b)!]}`}>{STAY_LABEL[stayStateOf(b)!]}</span>}
                </td>
                <td className={`${th} text-right`}>
                  <div className="flex items-center justify-end gap-2 whitespace-nowrap">
                    {quick(b, 'row') ?? (
                      <button type="button" onClick={(e) => { stop(e); setOpenId(b.id); }} className="h-10 rounded-md border border-border px-4 text-sm font-semibold text-ink transition-colors hover:border-primary hover:text-primary">Xem</button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && rows.length === 0 && !error && <div className="py-10 text-center text-sm text-muted">Không có đơn phù hợp.</div>}
      </div>

      {(data?.totalPages ?? 0) > 1 && (
        <div className="flex items-center justify-end gap-2 text-sm">
          <button type="button" disabled={page === 0} onClick={() => refresh(() => setPage((p) => p - 1))} className="h-10 rounded-md border border-border px-4 disabled:opacity-40">Trước</button>
          <span className="text-muted">Trang {page + 1} / {data?.totalPages}</span>
          <button type="button" disabled={page + 1 >= (data?.totalPages ?? 0)} onClick={() => refresh(() => setPage((p) => p + 1))} className="h-10 rounded-md border border-border px-4 disabled:opacity-40">Sau</button>
        </div>
      )}

      <BookingDetailSheet key={openId ?? 'none'} bookingId={openId} onClose={() => setOpenId(null)} onChanged={changed} />
      <BookingDecisionDialog decision={decision} onClose={() => setDecision(null)}
        run={async (d, note) => { await runPartnerDecision(d, note); }} onDone={changed} />
    </div>
  );
}
