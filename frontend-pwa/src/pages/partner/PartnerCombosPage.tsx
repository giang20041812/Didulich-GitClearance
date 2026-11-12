import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ExternalLink, Loader2, Pause, Pencil, Play, Plus } from 'lucide-react';
import ComboForm from '@/components/combo/ComboForm';
import ComboModal from '@/components/combo/ComboModal';
import ComboRequestsList from '@/components/combo/ComboRequestsList';
import { getApiErrorMessage } from '@/lib/apiError';
import { formatVnd } from '@/lib/serviceGroups';
import { comboApi, comboPartnerApi } from '@/services/portalServicesApi';
import comboImage from '@/assets/fluent/combo.webp';
import { BRAND_NAME } from '@/components/ui/logo';
import type { ComboFormData, ComboRow } from '@/types/combo';
import { ListSkeleton } from '@/components/ui/PageSkeleton';

function statusChips(row: ComboRow) {
  const chips: { label: string; cls: string }[] = [];
  if (row.status === 'PENDING') chips.push({ label: 'Chờ duyệt', cls: 'bg-amber-50 text-amber-800' });
  if (row.status === 'REJECTED') chips.push({ label: 'Bị từ chối', cls: 'bg-rose-50 text-rose-700' });
  if (row.status === 'APPROVED') chips.push(row.publiclyVisible
    ? { label: 'Khách đang thấy', cls: 'bg-emerald-50 text-emerald-700' }
    : { label: 'Khách chưa thấy', cls: 'bg-slate-100 text-slate-600' });
  if (row.pendingEdit) chips.push({ label: 'Có thay đổi chờ duyệt', cls: 'bg-amber-50 text-amber-800' });
  if (row.paused) chips.push({ label: 'Tạm ngừng bán', cls: 'bg-slate-100 text-slate-600' });
  if (!row.visible) chips.push({ label: 'Quản trị viên đã ẩn', cls: 'bg-rose-50 text-rose-700' });
  return chips;
}

/**
 * Combo của NCC: tạo combo (lịch trình, giá, nhà hàng gợi ý) → Chờ duyệt; sửa combo đã duyệt → bản sửa chờ duyệt, khách
 * vẫn thấy bản cũ; tạm ngừng bán / bán lại không cần duyệt. Tab "Yêu cầu đặt" là khách gửi để được gọi lại.
 */
export default function PartnerCombosPage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'yeu-cau' ? 'requests' : 'combos';
  const [rows, setRows] = useState<ComboRow[] | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [reload, setReload] = useState(0);
  const [editing, setEditingState] = useState<ComboFormData | 'new' | null>(() => (params.get('moi') ? 'new' : null));
  const setEditing = (value: ComboFormData | 'new' | null) => {
    setEditingState(value);
    if (!value && params.get('moi')) setParams({}, { replace: true });
  };
  const [busyId, setBusyId] = useState<number | null>(null);
  const api = comboApi('partner');

  useEffect(() => {
    if (tab !== 'combos') return undefined;
    let alive = true;
    comboPartnerApi.list()
      .then((page) => { if (alive) { setRows(page.content); setError(''); } })
      .catch((err: unknown) => { if (alive) setError(getApiErrorMessage(err, 'Không tải được danh sách combo.')); });
    return () => { alive = false; };
  }, [tab, reload]);

  const open = async (id: number) => {
    setBusyId(id);
    try { setEditing(await api.get(id)); } catch (err) { setError(getApiErrorMessage(err, 'Không mở được combo.')); } finally { setBusyId(null); }
  };

  const togglePause = async (row: ComboRow) => {
    setBusyId(row.id);
    try {
      await comboPartnerApi.pause(row.id, !row.paused);
      setNotice(row.paused ? 'Đã mở bán lại combo.' : 'Đã tạm ngừng bán combo — khách không còn thấy combo này.');
      setReload((r) => r + 1);
    } catch (err) {
      setError(getApiErrorMessage(err, 'Không đổi được trạng thái bán.'));
    } finally {
      setBusyId(null);
    }
  };

  const newRequests = (rows ?? []).reduce((sum, r) => sum + r.newRequests, 0);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <img src={comboImage} alt="" aria-hidden width={44} height={44} className="h-11 w-11 shrink-0 object-contain" />
          <div>
            <h1 className="text-lg font-bold text-ink-deep">Combo</h1>
            <p className="text-sm text-muted">Gói trọn lịch trình, địa điểm, giờ đi và giá (không gồm ăn uống). Combo mới và thay đổi cần quản trị viên duyệt.</p>
          </div>
        </div>
        {tab === 'combos' && (
          <button type="button" onClick={() => setEditing('new')} className="inline-flex min-h-11 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-semibold text-white hover:bg-primary-600">
            <Plus className="h-4 w-4" /> Tạo combo
          </button>
        )}
      </div>

      <div role="tablist" className="flex gap-1 border-b border-border">
        {[{ id: 'combos', label: 'Combo của tôi' }, { id: 'requests', label: `Yêu cầu đặt${newRequests ? ` (${newRequests} mới)` : ''}` }].map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id}
            onClick={() => setParams(t.id === 'requests' ? { tab: 'yeu-cau' } : {}, { replace: true })}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-semibold ${tab === t.id ? 'border-primary text-primary' : 'border-transparent text-muted hover:text-ink'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {notice && <p role="status" className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{notice}</p>}
      {error && <p role="alert" className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

      {tab === 'requests' ? (
        <ComboRequestsList scope="partner" />
      ) : !rows ? (
        !error && <ListSkeleton rows={3} />
      ) : rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted">
          Bạn chưa có combo nào. Combo có thể ghép dịch vụ của bạn với homestay, điểm tham quan và nhà xe khác trên {BRAND_NAME}.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((row) => (
            <li key={row.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-white p-3">
              <span className="h-16 w-24 shrink-0 overflow-hidden rounded-md bg-canvas">
                {row.coverImageUrl ? <img src={row.coverImageUrl} alt="" className="h-full w-full object-cover" /> : <img src={comboImage} alt="" className="m-auto mt-3 h-10 w-10 object-contain opacity-60" />}
              </span>
              <div className="min-w-0 flex-1 text-xs">
                <p className="break-words text-sm font-bold text-ink-deep">{row.title}</p>
                <p className="text-muted">{row.durationText} · từ {formatVnd(row.priceFrom)}/khách</p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {statusChips(row).map((c) => <span key={c.label} className={`rounded px-1.5 py-0.5 font-semibold ${c.cls}`}>{c.label}</span>)}
                  {row.newRequests > 0 && (
                    <button type="button" onClick={() => setParams({ tab: 'yeu-cau' }, { replace: true })} className="rounded bg-primary-50 px-1.5 py-0.5 font-semibold text-primary hover:underline">
                      {row.newRequests} yêu cầu mới
                    </button>
                  )}
                </div>
                {row.status === 'REJECTED' && row.rejectReason && <p className="mt-1 text-rose-700">Lý do: {row.rejectReason}</p>}
              </div>
              <div className="flex shrink-0 flex-wrap gap-1.5">
                {row.publiclyVisible && (
                  <Link to={`/combo/${row.slug}`} target="_blank" className="inline-flex min-h-10 items-center gap-1 rounded-md border border-border px-3 text-sm font-semibold hover:bg-hover">
                    <ExternalLink className="h-4 w-4" /> Xem
                  </Link>
                )}
                {row.status === 'APPROVED' && (
                  <button type="button" disabled={busyId === row.id} onClick={() => { void togglePause(row); }}
                    className="inline-flex min-h-10 items-center gap-1 rounded-md border border-border px-3 text-sm font-semibold hover:bg-hover">
                    {row.paused ? <><Play className="h-4 w-4" /> Bán lại</> : <><Pause className="h-4 w-4" /> Tạm ngừng</>}
                  </button>
                )}
                <button type="button" disabled={busyId === row.id} onClick={() => { void open(row.id); }}
                  className="inline-flex min-h-10 items-center gap-1 rounded-md border border-border px-3 text-sm font-semibold hover:bg-hover">
                  {busyId === row.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pencil className="h-4 w-4" />} Sửa
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <ComboModal
          title={editing === 'new' ? 'Tạo combo' : 'Sửa combo'}
          onClose={() => setEditing(null)}
          note={editing !== 'new' && editing.status === 'APPROVED' ? (
            <p className="mx-4 mt-3 rounded-md bg-sky-50 px-3 py-2 text-xs text-sky-800">
              Thay đổi sẽ được gửi quản trị viên duyệt. Trong lúc chờ, khách vẫn thấy combo hiện tại.
              {editing.pendingChanges && ' Bạn đang có một bản thay đổi chờ duyệt — gửi lần này sẽ thay bản đó.'}
            </p>
          ) : undefined}
        >
          <ComboForm
            scope="partner"
            initial={editing === 'new' ? null : editing}
            editPending={editing !== 'new' && Boolean(editing.pendingChanges)}
            submitLabel="Gửi duyệt"
            onCancel={() => setEditing(null)}
            onSubmit={async (input) => {
              if (editing === 'new') await api.create(input);
              else await api.update(editing.id, input);
              setEditing(null);
              setNotice('Đã gửi. Quản trị viên sẽ duyệt và bạn sẽ nhận thông báo kết quả.');
              setReload((r) => r + 1);
            }}
          />
        </ComboModal>
      )}
    </div>
  );
}
