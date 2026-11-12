import { useState } from 'react';
import { partnerRoomService } from '@/services/partnerRoomService';
import { homestayError } from '@/services/partnerHomestayService';
import ConfirmDialog, { type ConfirmRequest } from '@/components/partner/ConfirmDialog';

const field = 'w-full rounded-md border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none';
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const nextDay = (value: string) => { const d = new Date(`${value}T00:00:00`); d.setDate(d.getDate() + 1); return iso(d); };

/** FR-NCC-09: ngừng / mở phục vụ cả Homestay (mọi loại phòng) trong một khoảng ngày, kèm lý do. */
export default function HomestayClosurePanel({ placeId, onChanged }: { placeId: number; onChanged?: () => void }) {
  const today = iso(new Date());
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);

  async function run(stopSell: boolean) {
    setBusy(true); setError(''); setMessage('');
    try {
      const { bookedDays } = await partnerRoomService.blockHomestay(placeId, { startDate: from, endDate: nextDay(to), stopSell, reason: stopSell ? reason.trim() : undefined });
      setMessage(stopSell
        ? `Đã ngừng nhận khách từ ${from} đến ${to}.${bookedDays > 0 ? ` Có ${bookedDays} ngày-loại phòng đã có đơn — các đơn hiện hữu vẫn được giữ nguyên.` : ''}`
        : `Đã mở lại nhận khách từ ${from} đến ${to}.`);
      if (stopSell) setReason('');
      onChanged?.();
    } catch (e: unknown) { setError(homestayError(e)); }
    finally { setBusy(false); }
  }

  const invalid = to < from;
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted">Dùng khi cả Homestay không phục vụ (nghỉ lễ, sửa chữa, việc gia đình...). Khách không đặt mới được trong các ngày này; đơn đã có vẫn giữ nguyên. Để khai báo từng phòng hỏng, dùng lịch phòng trong trang Phòng.</p>
      {error && <p role="alert" className="rounded-md border border-danger/30 bg-danger/5 p-2.5 text-sm text-danger">{error}</p>}
      {message && <p role="status" className="rounded-md bg-primary-50 p-2.5 text-sm text-primary">{message}</p>}
      <fieldset disabled={busy} className="flex flex-col gap-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-xs font-semibold text-muted">Từ ngày<input className={field} type="date" min={today} value={from} onChange={(e) => setFrom(e.target.value)} /></label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-muted">Đến hết ngày<input className={field} type="date" min={from} value={to} onChange={(e) => setTo(e.target.value)} /></label>
        </div>
        <label className="flex flex-col gap-1 text-xs font-semibold text-muted">Lý do ngừng phục vụ
          <input className={field} maxLength={255} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="VD: Nghỉ Tết, sửa chữa mái nhà..." />
        </label>
        {invalid && <p className="text-xs text-danger">Ngày kết thúc phải bằng hoặc sau ngày bắt đầu.</p>}
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={invalid || !reason.trim()}
            onClick={() => setConfirm({ title: 'Ngừng phục vụ cả Homestay?', confirmLabel: 'Ngừng phục vụ', tone: 'danger',
              body: <>Từ <b>{from}</b> đến hết <b>{to}</b>, mọi loại phòng ngừng nhận đặt mới; các đơn hiện hữu vẫn được giữ nguyên.<br />Lý do: “{reason.trim()}”</>, onConfirm: () => void run(true) })}
            className="rounded-md border border-danger px-4 py-2 text-sm font-semibold text-danger transition-colors duration-200 hover:bg-danger/5 disabled:opacity-50">
            Ngừng phục vụ các ngày này
          </button>
          <button type="button" disabled={invalid}
            onClick={() => setConfirm({ title: 'Mở lại nhận khách?', confirmLabel: 'Mở lại', body: <>Từ <b>{from}</b> đến hết <b>{to}</b>, mọi loại phòng nhận đặt lại (số phòng hỏng đã khai báo vẫn giữ).</>, onConfirm: () => void run(false) })}
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors duration-200 hover:bg-primary-700 disabled:opacity-50">
            Mở lại nhận khách
          </button>
        </div>
      </fieldset>
      <ConfirmDialog request={confirm} onClose={() => setConfirm(null)} />
    </div>
  );
}
