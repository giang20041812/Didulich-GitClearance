import { useEffect, useState } from 'react';
import { CalendarDays, Phone, UserRound, Users } from 'lucide-react';
import { getApiErrorMessage } from '@/lib/apiError';
import { comboApi, type ComboScope } from '@/services/portalServicesApi';
import type { ComboRequestRow, ComboRequestStatus } from '@/types/combo';
import { ListSkeleton } from '@/components/ui/PageSkeleton';

const STATUS: { value: ComboRequestStatus; label: string; cls: string }[] = [
  { value: 'NEW', label: 'Mới', cls: 'bg-amber-50 text-amber-800 border-amber-200' },
  { value: 'CONTACTED', label: 'Đã liên hệ', cls: 'bg-sky-50 text-sky-800 border-sky-200' },
  { value: 'CLOSED', label: 'Đã xong', cls: 'bg-slate-100 text-slate-600 border-slate-200' },
];

const fmtDate = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('vi-VN', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' });
const fmtDateTime = (d: string | null) => (d ? new Date(d).toLocaleString('vi-VN') : '');

/**
 * Yêu cầu đặt combo của khách (Admin: mọi combo; NCC: combo của mình). Khách chưa trả tiền qua hệ thống — người nhận gọi
 * lại theo số điện thoại rồi đánh dấu "Đã liên hệ" / "Đã xong".
 */
export default function ComboRequestsList({ scope, comboId }: { scope: ComboScope; comboId?: number }) {
  const [status, setStatus] = useState<ComboRequestStatus | ''>('NEW');
  /** Kết quả gắn với bộ lọc đã tải — đổi bộ lọc thì hiện "Đang tải" cho tới khi có kết quả mới. */
  const [result, setResult] = useState<{ status: ComboRequestStatus | ''; rows: ComboRequestRow[] } | null>(null);
  const rows = result && result.status === status ? result.rows : null;
  const setRows = (update: (list: ComboRequestRow[] | null) => ComboRequestRow[]) =>
    setResult((r) => (r ? { status: r.status, rows: update(r.rows) } : r));
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    comboApi(scope).requests({ comboId, status: status || undefined, page: 0, size: 50 })
      .then((page) => { if (alive) { setResult({ status, rows: page.content }); setError(''); } })
      .catch((err: unknown) => { if (alive) setError(getApiErrorMessage(err, 'Không tải được yêu cầu đặt combo.')); });
    return () => { alive = false; };
  }, [scope, comboId, status]);

  const change = async (row: ComboRequestRow, next: ComboRequestStatus) => {
    setBusyId(row.id);
    try {
      const updated = await comboApi(scope).setRequestStatus(row.id, next);
      setRows((list) => (list ?? []).map((r) => (r.id === row.id ? updated : r)).filter((r) => !status || r.status === status));
    } catch (err) {
      setError(getApiErrorMessage(err, 'Không cập nhật được yêu cầu.'));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div role="tablist" aria-label="Trạng thái yêu cầu" className="flex flex-wrap gap-1.5">
        {[{ value: '' as const, label: 'Tất cả' }, ...STATUS].map((s) => (
          <button key={s.value || 'all'} type="button" role="tab" aria-selected={status === s.value} onClick={() => setStatus(s.value)}
            className={`min-h-9 rounded-full border px-3.5 text-xs font-semibold transition-colors ${status === s.value ? 'border-primary bg-primary text-white' : 'border-border bg-white text-ink hover:bg-hover'}`}>
            {s.label}
          </button>
        ))}
      </div>
      {error && <p role="alert" className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
      {!rows ? (
        !error && <ListSkeleton rows={3} />
      ) : rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted">Không có yêu cầu nào.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((row) => {
            const st = STATUS.find((s) => s.value === row.status) ?? STATUS[0];
            return (
              <li key={row.id} className="rounded-lg border border-border bg-white p-3 text-xs">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-ink-deep">{row.comboTitle}</p>
                    <p className="text-muted">Gửi lúc {fmtDateTime(row.createdAt)}{row.fromAccount ? ' · khách có tài khoản' : ''}</p>
                  </div>
                  <span className={`rounded border px-2 py-0.5 font-semibold ${st?.cls ?? ''}`}>{st?.label}</span>
                </div>
                <dl className="mt-2 grid gap-1.5 sm:grid-cols-2">
                  <div className="flex items-center gap-1.5"><UserRound className="h-3.5 w-3.5 text-primary" /><dt className="sr-only">Khách</dt><dd className="font-semibold text-ink">{row.contactName}</dd></div>
                  <div className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5 text-primary" /><dt className="sr-only">Số điện thoại</dt><dd><a href={`tel:${row.contactPhone}`} className="font-semibold text-primary hover:underline">{row.contactPhone}</a></dd></div>
                  <div className="flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5 text-primary" /><dt className="sr-only">Ngày đi</dt><dd>Đi ngày {fmtDate(row.startDate)}</dd></div>
                  <div className="flex items-center gap-1.5"><Users className="h-3.5 w-3.5 text-primary" /><dt className="sr-only">Số khách</dt><dd>{row.guests} khách</dd></div>
                </dl>
                {row.note && <p className="mt-2 whitespace-pre-line rounded-md bg-canvas/60 px-2.5 py-1.5 text-ink">{row.note}</p>}
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[11px] text-muted">{row.handledAt ? `Cập nhật ${fmtDateTime(row.handledAt)}${row.handledByName ? ` bởi ${row.handledByName}` : ''}` : ''}</span>
                  <label className="flex items-center gap-1.5">
                    <span className="text-muted">Trạng thái</span>
                    <select value={row.status} disabled={busyId === row.id} onChange={(e) => { void change(row, e.target.value as ComboRequestStatus); }}
                      className="rounded-md border border-border bg-white px-2 py-1.5 text-xs font-semibold">
                      {STATUS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                    </select>
                  </label>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
