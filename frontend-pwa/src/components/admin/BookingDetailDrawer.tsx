import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { AlertTriangle, Check, ClipboardCheck, Copy, FileText, Mail, Phone, SearchCheck, Send, ShieldAlert, StickyNote, X } from 'lucide-react';
import { adminService } from '@/services/adminService';
import { getApiErrorMessage } from '@/lib/apiError';
import { BOOKING_ACTION_LABEL, BOOKING_STATUS_LONG_LABEL, STAY_ACTOR_LABEL, STAY_LABEL, historyTitle, stayStateOf } from '@/lib/bookingStatus';
import AdminBookingDecisionDialog, { type Decision } from './AdminBookingDecisionDialog';
import { useAdminPermission } from '@/hooks/useAdminPermission';
import type {
  AdminBookingDetailDto,
  AdminBookingDto,
  BookingAction,
  BookingNoteDto,
  BookingNoteKind,
  BookingNoteOutcome,
} from '@/types/admin';
import { StatusBadge } from './StatusBadge';
import Avatar from './Avatar';
import { SegmentedTabs } from './AdminFilters';
import {
  OUTCOME_LABEL,
  OUTCOME_TONE,
  STATUS_TONE,
  fmtDate,
  fmtDateTime,
  isPendingStatus,
  vnd,
} from './bookingMeta';
import OverlayPortal from './OverlayPortal';

interface BookingDetailDrawerProps {
  booking: AdminBookingDto;
  onClose: () => void;
  /** Gọi sau khi có thay đổi (xử lý đơn, thêm ghi nhận) để danh sách làm mới. */
  onChanged?: () => void;
}

const MAX_NOTE = 2000;
/** Nút lùi (từ chối / hủy) bên trái, nút tiến (xác nhận / đã thanh toán) bên phải. */
const NEGATIVE: BookingAction[] = ['REJECT', 'CANCEL'];
const ACTOR_LABEL: Record<string, string> = { CUSTOMER: 'Khách hàng', PROVIDER: 'Nhà cung cấp', ADMIN: 'Quản trị viên', SYSTEM: 'Hệ thống' };

/**
 * Ngăn chi tiết đơn của Admin: thông tin khách, lưu trú, thanh toán, lịch sử, ghi nhận giám sát — và xử lý đơn như NCC
 * (Xác nhận / Từ chối khi chờ xác nhận; Đã thanh toán / Hủy đơn khi đã xác nhận). Nút lấy từ {@code actions} máy chủ trả.
 */
export default function BookingDetailDrawer({ booking, onClose, onChanged }: BookingDetailDrawerProps) {
  const [detail, setDetail] = useState<AdminBookingDetailDto | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'info' | 'monitor'>('info');
  const [copied, setCopied] = useState(false);
  // Xử lý đơn từ cấp 2; cấp 3 chỉ xem và ghi nhận giám sát (backend vẫn kiểm quyền).
  const canOperate = useAdminPermission().can('operate');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setDetail(await adminService.getBookingDetail(booking.id));
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, 'Không tải được chi tiết đơn. Vui lòng thử lại.'));
    } finally {
      setLoading(false);
    }
  }, [booking.id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const [decision, setDecision] = useState<Decision | null>(null);
  const [actionMsg, setActionMsg] = useState('');

  const b = detail?.booking ?? booking;
  const actions = canOperate
    ? [...(detail?.actions ?? [])].sort((x, y) => Number(!NEGATIVE.includes(x)) - Number(!NEGATIVE.includes(y)))
    : [];

  const runDecision = async (d: Decision, note?: string) => {
    try {
      setDetail(await adminService.bookingAction(d.id, d.action, note));
    } catch (err: unknown) {
      throw new Error(getApiErrorMessage(err, 'Không xử lý được đơn. Vui lòng tải lại và thử lại.'));
    }
  };

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(b.bookingCode);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Trình duyệt chặn clipboard: bỏ qua, người dùng vẫn chọn và copy thủ công được.
    }
  };

  const handleNoteAdded = (note: BookingNoteDto) => {
    setDetail((d) => (d ? { ...d, notes: [note, ...d.notes] } : d));
    onChanged?.();
  };

  return (
    <OverlayPortal>
    <div className="admin-overlay-shell fade-in-overlay z-[9998] flex justify-end bg-ink-deep/40 backdrop-blur-[2px]" onClick={onClose}>
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={`Chi tiết đơn ${b.bookingCode}`}
        onClick={(e) => e.stopPropagation()}
        className="admin-drawer panel-slide-in flex h-full min-h-0 w-full min-w-0 max-w-xl flex-col bg-white shadow-xl"
      >
        {/* Đầu ngăn: mã đơn + trạng thái + tóm tắt nhanh */}
        <header className="shrink-0 border-b border-border px-4 pt-3 sm:px-5 sm:pt-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">Mã đặt phòng</p>
              <div className="flex items-center gap-2">
                <h3 className="min-w-0 break-all font-mono text-lg font-bold text-primary">{b.bookingCode}</h3>
                <button type="button" onClick={copyCode} aria-label="Sao chép mã đặt phòng" title="Sao chép" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-hover hover:text-primary">
                  {copied ? <Check className="h-3.5 w-3.5 text-accent" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <StatusBadge tone={STATUS_TONE[b.status]} pulse={isPendingStatus(b.status)}>
                  {BOOKING_STATUS_LONG_LABEL[b.status]}
                </StatusBadge>
                {stayStateOf(b) && <StatusBadge tone={stayStateOf(b) === 'IN_HOUSE' ? 'brand' : 'neutral'}>{STAY_LABEL[stayStateOf(b)!]}</StatusBadge>}
              </div>
            </div>
            <button type="button" onClick={onClose} aria-label="Đóng" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-hover hover:text-ink">
              <X className="h-5 w-5" />
            </button>
          </div>

          <dl className="mt-4 grid grid-cols-3 divide-x divide-border rounded-md border border-border bg-canvas/60">
            <Stat label="Tổng tiền" value={vnd(b.totalAmount)} strong />
            <Stat label="Lưu trú" value={`${b.nights} đêm`} sub={`${fmtDate(b.checkIn)} → ${fmtDate(b.checkOut)}`} />
            <Stat label="Khách" value={`${b.guestCount} khách`} sub={`${b.roomCount} phòng`} />
          </dl>

          <div className="mt-3 pb-3">
              <SegmentedTabs
                ariaLabel="Nội dung chi tiết"
                stretch
                value={view}
                onChange={setView}
                options={[
                  { value: 'info', label: 'Thông tin đơn', icon: FileText, tone: 'brand' },
                  { value: 'monitor', label: 'Giám sát & ghi nhận', icon: ShieldAlert, tone: 'warning', count: detail ? detail.notes.length : null },
                ]}
              />
          </div>
        </header>

        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain break-words px-4 py-4 sm:px-5">
          {error && (
            <div role="alert" className="mb-4 flex items-center justify-between gap-2 rounded-md border border-danger/30 bg-danger/5 p-3 text-xs text-danger">
              <span className="flex items-center gap-2"><AlertTriangle className="h-4 w-4" /> {error}</span>
              <button type="button" onClick={() => void load()} className="font-semibold underline">Thử lại</button>
            </div>
          )}

          {view === 'info' && (
            <div className="rise-in flex flex-col">
              <Section title="Khách hàng" first>
                <div className="flex items-center gap-3">
                  <Avatar name={b.guestName || '?'} />
                  <div className="min-w-0">
                    <p className="break-words text-sm font-semibold text-ink-deep">{b.guestName}</p>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs">
                      <a href={`tel:${b.guestPhone}`} className="inline-flex items-center gap-1 text-ink hover:text-primary">
                        <Phone className="h-3 w-3 text-muted" /> {b.guestPhone}
                      </a>
                      {b.guestEmail && (
                        <a href={`mailto:${b.guestEmail}`} className="inline-flex min-w-0 items-center gap-1 text-ink hover:text-primary">
                          <Mail className="h-3 w-3 shrink-0 text-muted" /> <span className="break-all">{b.guestEmail}</span>
                        </a>
                      )}
                    </div>
                  </div>
                </div>
                {b.guestNote && (
                  <p className="mt-3 flex items-start gap-2 rounded-md border-l-2 border-sun bg-sun/10 px-3 py-2 text-xs text-ink">
                    <StickyNote className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-700" /> {b.guestNote}
                  </p>
                )}
              </Section>

              <Section title="Lưu trú">
                <Grid>
                  <Row k="Homestay" v={b.placeName} wide />
                  <Row k="Loại phòng" v={b.roomTypeName} wide />
                  <Row k="Nhà cung cấp" v={b.providerName} wide />
                  <Row k="Nhận phòng" v={fmtDate(b.checkIn)} />
                  <Row k="Trả phòng" v={fmtDate(b.checkOut)} />
                  {b.checkedInAt && <Row k="Đã nhận phòng lúc" v={`${fmtDateTime(b.checkedInAt)}${b.checkedInBy ? ` · ${STAY_ACTOR_LABEL[b.checkedInBy]}` : ''}`} wide />}
                  {b.checkedOutAt && <Row k="Đã trả phòng lúc" v={`${fmtDateTime(b.checkedOutAt)}${b.checkedOutBy ? ` · ${STAY_ACTOR_LABEL[b.checkedOutBy]}` : ''}`} wide />}
                </Grid>
              </Section>

              <Section title="Thanh toán & mốc thời gian">
                <Grid>
                  <Row k="Ngày đặt" v={fmtDateTime(b.createdAt)} />
                  <Row k="Ngày xác nhận" v={fmtDateTime(b.confirmedAt)} />
                  {b.closedAt && <Row k={b.status === 'PAID' ? 'Thanh toán lúc' : 'Hủy lúc'} v={fmtDateTime(b.closedAt)} />}
                  {detail?.closedByActor && <Row k={b.status === 'PAID' ? 'Ghi nhận bởi' : 'Hủy bởi'} v={ACTOR_LABEL[detail.closedByActor] ?? detail.closedByActor} />}
                  {b.status === 'CANCELLED' && b.closeReason && <Row k="Lý do hủy" v={b.closeReason} wide />}
                </Grid>
              </Section>

              {loading && !detail && (
                <div className="mt-4 flex flex-col gap-2" aria-busy="true">
                  <div className="h-3 w-28 animate-pulse rounded-sm bg-canvas" />
                  <div className="h-14 animate-pulse rounded-md bg-canvas" />
                </div>
              )}

              {detail && (
                <>
                  <Section title={`Giao dịch thanh toán · ${detail.payments.length}`}>
                    {detail.payments.length === 0 ? (
                      <p className="text-xs text-muted">Chưa có giao dịch thanh toán.</p>
                    ) : (
                      <ul className="divide-y divide-border rounded-md border border-border">
                        {detail.payments.map((p) => (
                          <li key={p.id} className="flex items-center justify-between gap-3 px-3 py-2.5 text-xs">
                            <div className="min-w-0">
                              <div className="font-semibold text-ink-deep">{p.gateway}</div>
                              <div className="truncate font-mono text-[11px] text-muted">{p.externalTxnId || '—'}</div>
                              <div className="text-[11px] text-muted">
                                {p.paidAt ? `Thanh toán ${fmtDateTime(p.paidAt)}` : `Khởi tạo ${fmtDateTime(p.initiatedAt)}`}
                              </div>
                            </div>
                            <div className="flex shrink-0 flex-col items-end gap-1">
                              <span className="font-bold tabular-nums text-ink-deep">{vnd(p.amount)}</span>
                              <StatusBadge tone={p.status === 'SUCCESS' ? 'success' : p.status === 'INITIATED' ? 'warning' : 'danger'}>
                                {PAYMENT_LABEL[p.status] ?? p.status}
                              </StatusBadge>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </Section>

                  <Section title="Lịch sử trạng thái">
                    {detail.history.length === 0 ? (
                      <p className="text-xs text-muted">Chưa có lịch sử thay đổi trạng thái.</p>
                    ) : (
                      <ol className="relative flex flex-col">
                        {detail.history.map((h, i) => (
                          <li key={`${h.createdAt}-${i}`} className="relative flex gap-3 pb-3 text-xs last:pb-0">
                            {i < detail.history.length - 1 && <span aria-hidden className="absolute left-[5px] top-3 h-full w-px bg-border" />}
                            <span className="relative mt-1 h-[11px] w-[11px] shrink-0 rounded-full bg-primary ring-2 ring-white" />
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <StatusBadge tone={STATUS_TONE[h.toStatus]}>{historyTitle(h.fromStatus, h.toStatus)}</StatusBadge>
                              </div>
                              <div className="mt-0.5 text-[11px] text-muted">
                                {fmtDateTime(h.createdAt)} · {h.actor ? ACTOR_LABEL[h.actor] ?? h.actor : 'Hệ thống'}
                                {h.reason ? ` · ${h.reason}` : ''}
                              </div>
                            </div>
                          </li>
                        ))}
                      </ol>
                    )}
                  </Section>
                </>
              )}
            </div>
          )}

          {view === 'monitor' && (
            <div className="rise-in">
              {detail ? (
                <MonitorSection bookingId={b.id} notes={detail.notes} onAdded={handleNoteAdded} />
              ) : (
                <p className="text-xs text-muted">{loading ? 'Đang tải...' : 'Chưa tải được dữ liệu giám sát.'}</p>
              )}
            </div>
          )}
        </div>
        {(actions.length > 0 || actionMsg) && (
          <footer className="shrink-0 border-t border-border bg-canvas/60 px-4 py-3 sm:px-5">
            {actionMsg && (
              <p role="status" className="mb-2.5 rounded-md border border-accent/40 bg-accent/10 px-3 py-2 text-xs font-medium text-primary-700">
                {actionMsg}
              </p>
            )}
            {actions.length > 0 && (
              <div className="grid grid-cols-2 gap-2">
                {actions.map((action) => (
                  <button
                    key={action}
                    type="button"
                    onClick={() => { setActionMsg(''); setDecision({ action, id: b.id, summary: { ...b, roomTypeName: b.roomTypeName ?? '' } }); }}
                    className={NEGATIVE.includes(action)
                      ? 'flex min-h-11 items-center justify-center rounded-md border border-danger/40 bg-white px-3 py-2 text-sm font-semibold text-danger transition-colors hover:bg-danger/5'
                      : `flex min-h-11 items-center justify-center rounded-md px-3 py-2 text-sm font-semibold text-white shadow-xs transition-colors ${action === 'PAY' ? 'bg-accent hover:bg-accent-600' : 'bg-primary hover:bg-primary-600'}`}
                  >
                    {BOOKING_ACTION_LABEL[action]}
                  </button>
                ))}
              </div>
            )}
          </footer>
        )}
      </aside>
    </div>
    <AdminBookingDecisionDialog decision={decision} onClose={() => setDecision(null)} run={runDecision}
      onDone={(message) => { setActionMsg(message); onChanged?.(); }} />
    </OverlayPortal>
  );
}

const PAYMENT_LABEL: Record<string, string> = {
  INITIATED: 'Đang chờ',
  SUCCESS: 'Thành công',
  FAILED: 'Thất bại',
  CANCELLED: 'Đã hủy',
  EXPIRED: 'Hết hạn',
};

function Stat({ label, value, sub, strong }: { label: string; value: string; sub?: string; strong?: boolean }) {
  return (
    <div className="min-w-0 px-3 py-2.5">
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted">{label}</dt>
      <dd className={`break-words tabular-nums ${strong ? 'font-display text-base font-bold text-primary' : 'text-sm font-semibold text-ink-deep'}`}>{value}</dd>
      {sub && <dd className="break-words text-[11px] text-muted">{sub}</dd>}
    </div>
  );
}

function Grid({ children }: { children: ReactNode }) {
  return <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5">{children}</dl>;
}

function MonitorSection({
  bookingId,
  notes,
  onAdded,
}: {
  bookingId: number;
  notes: BookingNoteDto[];
  onAdded: (note: BookingNoteDto) => void;
}) {
  const [kind, setKind] = useState<BookingNoteKind>('VERIFICATION');
  const [outcome, setOutcome] = useState<BookingNoteOutcome>('NO_ISSUE');
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) {
      setError('Vui lòng nhập nội dung ghi nhận.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const note = await adminService.addBookingNote(bookingId, {
        kind,
        outcome: kind === 'OUTCOME' ? outcome : undefined,
        content: content.trim(),
      });
      setContent('');
      onAdded(note);
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, 'Không lưu được ghi nhận. Vui lòng thử lại.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Section title="Giám sát & ghi nhận" first>
      <form onSubmit={submit} className="flex flex-col gap-2">
        <SegmentedTabs
          ariaLabel="Loại ghi nhận"
          stretch
          value={kind}
          onChange={setKind}
          options={[
            { value: 'VERIFICATION', label: 'Thông tin xác minh', icon: SearchCheck, tone: 'info' },
            { value: 'OUTCOME', label: 'Kết quả & hướng xử lý', icon: ClipboardCheck, tone: 'success' },
          ]}
        />
        {kind === 'OUTCOME' && (
          <select
            value={outcome}
            onChange={(e) => setOutcome(e.target.value as BookingNoteOutcome)}
            aria-label="Hướng xử lý"
            className="h-9 rounded-md border border-border bg-white px-2 text-xs text-ink focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          >
            {(Object.keys(OUTCOME_LABEL) as BookingNoteOutcome[]).map((o) => (
              <option key={o} value={o}>{OUTCOME_LABEL[o]}</option>
            ))}
          </select>
        )}
        <textarea
          rows={3}
          maxLength={MAX_NOTE}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder={
            kind === 'VERIFICATION'
              ? 'Ghi lại thông tin đã làm rõ: đã liên hệ ai, nội dung xác nhận...'
              : 'Ghi lại kết quả kiểm tra và hướng xử lý / hỗ trợ...'
          }
          className="w-full rounded-md border border-border px-3 py-2 text-xs focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-[11px] text-muted">{content.length}/{MAX_NOTE} · Chỉ ghi nhận, không đổi trạng thái đơn.</span>
          <button
            type="submit"
            disabled={saving}
            className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-primary-600 disabled:opacity-60"
          >
            <Send className="h-3.5 w-3.5" /> {saving ? 'Đang lưu...' : 'Lưu ghi nhận'}
          </button>
        </div>
        {error && <p role="alert" className="text-xs text-danger">{error}</p>}
      </form>

      <div className="mt-1 flex flex-col gap-2">
        {notes.length === 0 ? (
          <p className="text-xs text-muted">Chưa có ghi nhận nào cho đơn này.</p>
        ) : (
          notes.map((n) => (
            <div key={n.id} className="rounded-md border border-border bg-canvas/60 p-2.5 text-xs">
              <div className="mb-1 flex flex-wrap items-center gap-1.5">
                <StatusBadge tone={n.kind === 'OUTCOME' ? 'success' : 'info'}>
                  <ClipboardCheck className="h-3 w-3" />
                  {n.kind === 'OUTCOME' ? 'Kết quả' : 'Xác minh'}
                </StatusBadge>
                {n.outcome && <StatusBadge tone={OUTCOME_TONE[n.outcome]}>{OUTCOME_LABEL[n.outcome]}</StatusBadge>}
              </div>
              <p className="whitespace-pre-wrap break-words text-ink">{n.content}</p>
              <p className="mt-1 text-[11px] text-muted">{n.adminName || 'Quản trị viên'} · {fmtDateTime(n.createdAt)}</p>
            </div>
          ))
        )}
      </div>
    </Section>
  );
}

function Section({ title, children, first }: { title: string; children: ReactNode; first?: boolean }) {
  return (
    <section className={first ? '' : 'mt-4 border-t border-border pt-4'}>
      <h4 className="mb-2.5 text-[10px] font-bold uppercase tracking-wider text-muted">{title}</h4>
      {children}
    </section>
  );
}

function Row({ k, v, wide }: { k: string; v: string; wide?: boolean }) {
  return (
    <div className={`min-w-0 ${wide ? 'col-span-2' : ''}`}>
      <dt className="text-[11px] text-muted">{k}</dt>
      <dd className="break-words text-xs font-medium text-ink" title={v}>{v}</dd>
    </div>
  );
}
