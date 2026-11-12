import { useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, Phone } from 'lucide-react';
import { BOOKING_ACTION_CONFIRM, BOOKING_ACTION_LABEL, BOOKING_CANCEL_REASONS, bookingActionDone } from '@/lib/bookingStatus';
import type { BookingAction } from '@/types/admin';
import { DialogShell, dialogBtn } from './AdminFilters';
import { fmtDate, vnd } from './bookingMeta';

/** Thông tin đơn hiển thị trong hộp xác nhận (lấy từ dòng danh sách hoặc chi tiết đơn). */
export interface DecisionSummary {
  bookingCode: string;
  guestName: string;
  guestPhone: string;
  roomTypeName: string;
  roomCount: number;
  guestCount: number;
  checkIn: string;
  checkOut: string;
  nights?: number | null;
  totalAmount?: number | null;
  guestNote?: string | null;
}

export interface Decision {
  action: BookingAction;
  id: number;
  summary: DecisionSummary;
}

/** Thao tác cần lý do (khách thấy). Ghi nhận thanh toán cần chứng từ. Backend kiểm lại (AdminBookingMonitorService). */
const NEEDS_REASON: BookingAction[] = ['REJECT', 'CANCEL'];
const PAY_METHODS = ['Chuyển khoản', 'Tiền mặt', 'Ví điện tử', 'Khác'];
/** Bằng giới hạn lý do / chứng từ ở backend. */
const MAX_NOTE = 500;

const chip = (active: boolean) =>
  `min-h-9 rounded-md border px-3 py-1.5 text-left text-xs font-semibold transition-colors ${
    active ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-white text-ink hover:bg-hover'
  }`;
const field =
  'w-full rounded-md border border-border px-3 py-2 text-base focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 sm:text-xs';

/**
 * Hộp xác nhận thao tác trên đơn của cổng Admin (xác nhận / từ chối / ghi nhận thanh toán / hủy / nhận phòng).
 * Khác hộp của NCC: từ chối và hủy bắt buộc lý do; ghi nhận thanh toán bắt buộc chứng từ (cách thanh toán + mã giao
 * dịch), vì Admin xử lý thay NCC và mọi quyết định phải truy được. {@code run} ném lỗi thì hiện ngay trong hộp.
 */
export default function AdminBookingDecisionDialog({ decision, onClose, run, onDone }: {
  decision: Decision | null;
  onClose: () => void;
  run: (decision: Decision, note?: string) => Promise<void>;
  onDone: (message: string) => void;
}) {
  if (!decision) return null;
  return <Body key={`${decision.action}-${decision.id}`} decision={decision} onClose={onClose} run={run} onDone={onDone} />;
}

function Body({ decision, onClose, run, onDone }: {
  decision: Decision;
  onClose: () => void;
  run: (decision: Decision, note?: string) => Promise<void>;
  onDone: (message: string) => void;
}) {
  const copy = BOOKING_ACTION_CONFIRM[decision.action];
  const needsReason = NEEDS_REASON.includes(decision.action);
  const isPay = decision.action === 'PAY';
  const s = decision.summary;

  const [preset, setPreset] = useState('');
  const [text, setText] = useState('');
  const [method, setMethod] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  /** Ghi chú gửi lên; null = còn thiếu thông tin bắt buộc. */
  const note = (): string | undefined | null => {
    if (needsReason) return text.trim() || preset || null;
    if (isPay) return method && text.trim() ? `${method}: ${text.trim()}` : null;
    return undefined;
  };

  const dismiss = () => {
    if (!busyRef.current) onClose();
  };

  async function submit() {
    if (busyRef.current) return;
    const value = note();
    if (value === null) {
      setError(needsReason ? 'Vui lòng chọn hoặc nhập lý do.' : 'Vui lòng chọn cách thanh toán và nhập mã giao dịch / chứng từ.');
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setError('');
    try {
      await run(decision, value);
      onDone(bookingActionDone(decision.action, s.bookingCode));
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error && e.message ? e.message : 'Không thực hiện được. Vui lòng thử lại.');
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  const ToneIcon = copy.danger ? AlertTriangle : CheckCircle2;

  return (
    <DialogShell label={copy.title} onDismiss={dismiss}>
      <div className="flex shrink-0 items-start gap-3">
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md ${copy.danger ? 'bg-danger/10 text-danger' : 'bg-accent/15 text-primary'}`}>
          <ToneIcon className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <h3 className="font-display text-base font-bold text-ink-deep">{copy.title}</h3>
          <p className="text-xs text-muted">Mã đơn <span className="font-mono font-semibold text-ink">{s.bookingCode}</span></p>
        </div>
      </div>

      <div className="flex shrink-0 flex-col gap-1 rounded-md border border-border bg-canvas/60 p-3 text-xs">
        <p className="font-semibold text-ink-deep">{s.guestName}</p>
        <a href={`tel:${s.guestPhone}`} className="flex w-fit items-center gap-1.5 font-medium text-primary">
          <Phone className="h-3.5 w-3.5" aria-hidden />
          {s.guestPhone}
        </a>
        <p className="text-ink">{s.roomTypeName} · {s.roomCount} phòng · {s.guestCount} khách</p>
        <p className="text-ink">{fmtDate(s.checkIn)} → {fmtDate(s.checkOut)}{s.nights ? ` · ${s.nights} đêm` : ''}</p>
        <p className="font-semibold tabular-nums text-ink-deep">{vnd(s.totalAmount)}</p>
      </div>

      <p className="shrink-0 break-words text-sm leading-relaxed text-muted sm:text-xs">{copy.body}</p>

      {decision.action === 'CONFIRM' && s.guestNote?.trim() && (
        <div className="shrink-0 rounded-md border border-sun bg-sun-light/50 p-3 text-xs">
          <p className="font-semibold text-ink-deep">Khách có yêu cầu:</p>
          <p className="whitespace-pre-wrap text-ink">{s.guestNote}</p>
        </div>
      )}

      {needsReason && (
        <fieldset className="flex shrink-0 flex-col gap-2">
          <legend className="mb-1 text-xs font-semibold text-ink-deep">
            Lý do <span className="text-danger">*</span> <span className="font-normal text-muted">· khách sẽ thấy lý do này</span>
          </legend>
          <div className="flex flex-col gap-1.5">
            {BOOKING_CANCEL_REASONS.map((r) => (
              <button key={r} type="button" aria-pressed={!text.trim() && preset === r} className={chip(!text.trim() && preset === r)}
                onClick={() => { setPreset(preset === r ? '' : r); setText(''); setError(''); }}>
                {r}
              </button>
            ))}
          </div>
          <label htmlFor="admin-decision-reason" className="sr-only">Lý do khác</label>
          <textarea id="admin-decision-reason" rows={2} maxLength={MAX_NOTE} value={text} placeholder="Hoặc ghi lý do khác..."
            onChange={(e) => { setText(e.target.value); setError(''); }} className={`${field} resize-y`} />
        </fieldset>
      )}

      {isPay && (
        <fieldset className="flex shrink-0 flex-col gap-2">
          <legend className="mb-1 text-xs font-semibold text-ink-deep">
            Chứng từ thanh toán <span className="text-danger">*</span>
          </legend>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Cách thanh toán">
            {PAY_METHODS.map((m) => (
              <button key={m} type="button" aria-pressed={method === m} className={chip(method === m)}
                onClick={() => { setMethod(method === m ? '' : m); setError(''); }}>
                {m}
              </button>
            ))}
          </div>
          <label htmlFor="admin-decision-proof" className="text-xs text-muted">Mã giao dịch / số biên nhận / người nhận tiền</label>
          <input id="admin-decision-proof" value={text} maxLength={MAX_NOTE - 20} placeholder="VD: FT26101300123"
            onChange={(e) => { setText(e.target.value); setError(''); }} className={`${field} h-10`} />
          <p className="text-[11px] text-muted">Được lưu vào lịch sử đơn và nhật ký hoạt động để đối soát.</p>
        </fieldset>
      )}

      {error && <p role="alert" className="shrink-0 break-words rounded-md bg-danger/5 px-3 py-2 text-xs text-danger">{error}</p>}

      <div className="flex shrink-0 flex-wrap gap-2 pt-1 sm:justify-end">
        <button type="button" disabled={busy} onClick={dismiss} className={`${dialogBtn} min-w-0 flex-1 text-muted hover:bg-hover sm:flex-none`}>
          Quay lại
        </button>
        <button type="button" disabled={busy} aria-busy={busy} onClick={() => void submit()}
          className={`${dialogBtn} min-w-0 flex-1 text-white sm:flex-none ${copy.danger ? 'bg-danger hover:opacity-90' : 'bg-primary hover:bg-primary-600'}`}>
          {busy ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden /> : <ToneIcon className="h-4 w-4 shrink-0" aria-hidden />}
          <span className="min-w-0 break-words">{busy ? 'Đang xử lý…' : BOOKING_ACTION_LABEL[decision.action]}</span>
        </button>
      </div>
    </DialogShell>
  );
}
