import { useState, type ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Phone } from 'lucide-react';
import { BOOKING_ACTION_CONFIRM, BOOKING_ACTION_LABEL, BOOKING_CANCEL_REASONS, bookingActionDone } from '@/lib/bookingStatus';
import { dayMonth } from '@/lib/partnerDates';
import type { BookingAction } from '@/types/booking';

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

const vnd = (n?: number | null) => (n == null ? '—' : new Intl.NumberFormat('vi-VN').format(n) + 'đ');

/**
 * Hộp xác nhận thao tác trên đơn — dùng chung cho cổng Admin và cổng NCC: xác nhận / từ chối / đã thanh toán / hủy.
 * Từ chối / hủy có lý do chọn một chạm hoặc tự gõ, KHÔNG bắt buộc. Trượt lên từ đáy trên điện thoại, giữa màn hình từ
 * 640px. Lớp z 10010 để nổi trên khung / ngăn chi tiết đơn.
 * {@code run}: gọi API của cổng tương ứng; lỗi ném ra được hiển thị ngay trong hộp.
 */
export default function BookingDecisionDialog({ decision, onClose, run, onDone }: {
  decision: Decision | null;
  onClose: () => void;
  run: (decision: Decision, note?: string) => Promise<void>;
  onDone: (message: string) => void;
}) {
  return (
    <Dialog.Root open={decision !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fade-in-overlay fixed inset-0 z-[10010] bg-ink-deep/50" />
        <div className="pointer-events-none fixed inset-0 z-[10010] flex items-end justify-center pt-[calc(var(--safe-top)+0.5rem)] sm:items-center sm:p-4">
          <Dialog.Content aria-describedby={undefined}
            className="sheet-in pointer-events-auto flex max-h-[min(92dvh,100%)] w-full flex-col gap-4 overflow-y-auto rounded-t-lg bg-white px-5 pb-[max(20px,var(--safe-bottom))] pt-5 shadow-[var(--shadow-lg)] sm:max-w-md sm:rounded-lg sm:pb-5">
            {decision && <Body key={`${decision.action}-${decision.id}`} decision={decision} onClose={onClose} run={run} onDone={onDone} />}
          </Dialog.Content>
        </div>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Body({ decision, onClose, run, onDone }: {
  decision: Decision;
  onClose: () => void;
  run: (decision: Decision, note?: string) => Promise<void>;
  onDone: (message: string) => void;
}) {
  const copy = BOOKING_ACTION_CONFIRM[decision.action];
  const [reason, setReason] = useState('');
  const [other, setOther] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const s = decision.summary;
  const special = !!s.guestNote?.trim();

  async function submit() {
    setBusy(true); setError('');
    try {
      await run(decision, copy.askReason ? (other.trim() || reason || undefined) : undefined);
      onDone(bookingActionDone(decision.action, s.bookingCode));
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error && e.message ? e.message : 'Không thực hiện được. Vui lòng thử lại.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="flex flex-col gap-1">
        <Dialog.Title className="text-xl font-black text-ink-deep">{copy.title}</Dialog.Title>
        <p className="text-sm font-semibold text-muted">Mã đơn {s.bookingCode}</p>
      </div>

      <div className="flex flex-col gap-1.5 rounded-md border-2 border-border p-3 text-base">
        <p className="font-black text-ink-deep">{s.guestName}</p>
        <a href={`tel:${s.guestPhone}`} className="flex w-fit items-center gap-1.5 font-semibold text-primary"><Phone className="h-4 w-4" />{s.guestPhone}</a>
        <p className="text-ink">{s.roomTypeName} · {s.roomCount} phòng · {s.guestCount} khách</p>
        <p className="text-ink">{dayMonth(s.checkIn.slice(0, 10))} → {dayMonth(s.checkOut.slice(0, 10))}{s.nights ? ` · ${s.nights} đêm` : ''}</p>
        <p className="font-black text-ink-deep">{vnd(s.totalAmount)}</p>
      </div>

      <p className="text-sm text-ink">{copy.body}</p>

      {decision.action === 'CONFIRM' && special && (
        <div className="flex flex-col gap-1.5 rounded-md border-2 border-sun bg-sun-light/50 p-3">
          <p className="text-sm font-bold text-ink-deep">Khách có yêu cầu:</p>
          {s.guestNote && <p className="whitespace-pre-wrap text-base text-ink">{s.guestNote}</p>}
        </div>
      )}

      {copy.askReason && (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-bold text-ink-deep">Lý do (không bắt buộc, khách sẽ thấy)</p>
          <div className="flex flex-col gap-2">
            {BOOKING_CANCEL_REASONS.map((r) => (
              <Choice key={r} active={!other.trim() && reason === r} onClick={() => { setReason(reason === r ? '' : r); setOther(''); }}>{r}</Choice>
            ))}
          </div>
          <input value={other} onChange={(e) => setOther(e.target.value)} maxLength={500} placeholder="Hoặc ghi lý do khác..."
            className="h-12 rounded-md border-2 border-border px-3 text-base text-ink focus:border-primary focus:outline-none" />
        </div>
      )}

      {error && <p role="alert" className="rounded-md bg-danger/10 px-3 py-2 text-sm font-semibold text-red-700">{error}</p>}

      <div className="grid grid-cols-2 gap-2">
        <Dialog.Close disabled={busy} className="h-14 rounded-md border-2 border-border text-lg font-black text-ink-deep hover:bg-canvas disabled:opacity-50">Không</Dialog.Close>
        <button type="button" disabled={busy} onClick={() => void submit()}
          className={`h-14 rounded-md text-lg font-black text-white transition-colors duration-200 disabled:opacity-50 ${copy.danger ? 'bg-danger hover:opacity-90' : 'bg-primary hover:bg-primary-700'}`}>
          {busy ? 'Đang lưu...' : BOOKING_ACTION_LABEL[decision.action]}
        </button>
      </div>
    </>
  );
}

function Choice({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" aria-pressed={active} onClick={onClick}
      className={`min-h-12 rounded-md border-2 px-3 text-left text-base font-bold transition-colors duration-200 ${active ? 'border-primary bg-primary text-white' : 'border-border bg-white text-ink-deep hover:border-primary/60'}`}>
      {children}
    </button>
  );
}
