import { useCallback, useEffect, useState } from 'react';
import { ExternalLink, Plus } from 'lucide-react';
import { useAdminPermission } from '@/hooks/useAdminPermission';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { getApiErrorMessage } from '@/lib/apiError';
import { formatVnd } from '@/lib/serviceGroups';
import { BRAND_NAME } from '@/components/ui/logo';
import ComboForm from '@/components/combo/ComboForm';
import ComboInputPreview from '@/components/combo/ComboInputPreview';
import ComboModal from '@/components/combo/ComboModal';
import ComboRequestsList from '@/components/combo/ComboRequestsList';
import { comboAdminApi, comboApi, type ComboAdminFilter, type ComboSourceFilter } from '@/services/portalServicesApi';
import type { PageResponse } from '@/types/admin';
import type { ComboFormData, ComboRow } from '@/types/combo';
import { CompactSelect, FilterSearch, ReasonDialog, RefreshButton, TableFooter } from './AdminFilters';
import { StatusBadge, type StatusTone } from './StatusBadge';
import { actionButtonClass } from './statusStyles';

const PAGE_SIZE = 15;
const STATUS_OPTIONS = [
  { value: '' as const, label: 'Tất cả' },
  { value: 'PENDING' as const, label: 'Chờ duyệt' },
  { value: 'APPROVED' as const, label: 'Đã duyệt' },
  { value: 'REJECTED' as const, label: 'Bị từ chối' },
  { value: 'HIDDEN' as const, label: 'Đang ẩn' },
];
const SOURCE_OPTIONS = [
  { value: '' as const, label: 'Tất cả' },
  { value: 'OFFICIAL' as const, label: 'Admin tạo' },
  { value: 'PROVIDER' as const, label: 'Nhà cung cấp' },
];
const STATUS_BADGE: Record<ComboRow['status'], { label: string; tone: StatusTone }> = {
  PENDING: { label: 'Chờ duyệt', tone: 'warning' },
  APPROVED: { label: 'Đã duyệt', tone: 'success' },
  REJECTED: { label: 'Bị từ chối', tone: 'danger' },
};

type Dialog =
  | { kind: 'reject' | 'rejectEdit' | 'delete' | 'hide'; combo: ComboRow | ComboFormData };

/**
 * Admin — Combo: tạo combo (hiển thị ngay), sửa, duyệt / từ chối combo NCC và bản sửa của NCC, ẩn / hiện, xóa combo chưa
 * có yêu cầu đặt; tab "Yêu cầu đặt" là khách gửi để được gọi lại. Cấp 3 chỉ xem.
 */
export default function CombosPanel({ notify }: { notify: (type: 'success' | 'error', text: string) => void }) {
  const canOperate = useAdminPermission().can('operate');
  const [view, setView] = useState<'combos' | 'requests'>('combos');
  const [status, setStatus] = useState<ComboAdminFilter | ''>('');
  const [source, setSource] = useState<ComboSourceFilter | ''>('');
  const [keyword, setKeyword] = useState('');
  const debouncedKeyword = useDebouncedValue(keyword);
  const [page, setPage] = useState(0);
  const [data, setData] = useState<PageResponse<ComboRow> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [viewing, setViewing] = useState<ComboFormData | null>(null);
  const [editing, setEditing] = useState<ComboFormData | 'new' | null>(null);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [dialogError, setDialogError] = useState('');
  const api = comboApi('admin');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setData(await comboAdminApi.list({ status: status || undefined, source: source || undefined, keyword: debouncedKeyword.trim() || undefined, page, size: PAGE_SIZE }));
    } catch (err) {
      setError(getApiErrorMessage(err, 'Không tải được danh sách combo.'));
    } finally {
      setLoading(false);
    }
  }, [status, source, debouncedKeyword, page]);

  useEffect(() => { if (view === 'combos') void load(); }, [load, reload, view]);

  const refresh = (updated?: ComboFormData) => {
    if (updated && viewing && viewing.id === updated.id) setViewing(updated);
    setReload((r) => r + 1);
  };

  const run = async (label: string, action: () => Promise<ComboFormData | void>) => {
    try {
      const updated = await action();
      notify('success', label);
      refresh(updated ?? undefined);
    } catch (err) {
      notify('error', getApiErrorMessage(err, 'Không thực hiện được thao tác.'));
    }
  };

  const openView = async (id: number) => {
    try { setViewing(await api.get(id)); } catch (err) { notify('error', getApiErrorMessage(err, 'Không mở được combo.')); }
  };
  const openEdit = async (id: number) => {
    try { setEditing(await api.get(id)); } catch (err) { notify('error', getApiErrorMessage(err, 'Không mở được combo.')); }
  };

  const confirmDialog = async (reason: string) => {
    if (!dialog) return;
    const id = dialog.combo.id;
    try {
      if (dialog.kind === 'reject') { const u = await comboAdminApi.reject(id, reason); notify('success', 'Đã từ chối combo, nhà cung cấp được báo lý do.'); refresh(u); }
      if (dialog.kind === 'rejectEdit') { const u = await comboAdminApi.rejectEdit(id, reason); notify('success', 'Đã từ chối bản sửa, combo đang hiển thị giữ nguyên.'); refresh(u); }
      if (dialog.kind === 'hide') { const u = await comboAdminApi.setVisible(id, false); notify('success', 'Đã ẩn combo với khách.'); refresh(u); }
      if (dialog.kind === 'delete') { await comboAdminApi.remove(id); notify('success', 'Đã xóa combo.'); setViewing(null); refresh(); }
      setDialog(null);
      setDialogError('');
    } catch (err) {
      setDialogError(getApiErrorMessage(err, 'Không thực hiện được thao tác.'));
    }
  };

  const rows = data?.content ?? [];
  const th = 'px-4 py-2.5';

  return (
    <section className="rounded-lg border border-border bg-white shadow-sm">
      <div className="flex gap-1 border-b border-border px-4 pt-2">
        {[{ id: 'combos' as const, label: 'Combo' }, { id: 'requests' as const, label: 'Yêu cầu đặt combo' }].map((t) => (
          <button key={t.id} type="button" onClick={() => setView(t.id)}
            className={`-mb-px border-b-2 px-3 py-2 text-xs font-semibold ${view === t.id ? 'border-primary text-primary' : 'border-transparent text-muted hover:text-ink'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {view === 'requests' ? (
        <div className="p-4"><ComboRequestsList scope="admin" /></div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2.5">
            <FilterSearch value={keyword} onChange={(v) => { setKeyword(v); setPage(0); }} placeholder="Tìm theo tên combo..." />
            <CompactSelect label="Trạng thái" value={status} options={STATUS_OPTIONS} onChange={(v) => { setStatus(v); setPage(0); }} />
            <CompactSelect label="Nguồn" value={source} options={SOURCE_OPTIONS} onChange={(v) => { setSource(v); setPage(0); }} />
            <RefreshButton loading={loading} onClick={() => setReload((r) => r + 1)} />
            {canOperate && (
              <button type="button" onClick={() => setEditing('new')}
                className="ml-auto flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-semibold text-white shadow-xs hover:bg-primary-600">
                <Plus className="h-4 w-4" /> Tạo combo
              </button>
            )}
          </div>
          {error && <div role="alert" className="border-b border-danger/20 bg-danger/5 px-4 py-2.5 text-xs text-danger">{error}</div>}
          <div className={`overflow-x-auto transition-opacity ${loading ? 'opacity-60' : ''}`}>
            <table className="admin-stack w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-border bg-canvas/60 text-[11px] font-semibold uppercase tracking-wide text-muted">
                  <th className={th}>Combo</th>
                  <th className={th}>Người tạo</th>
                  <th className={th}>Giá từ</th>
                  <th className={th}>Trạng thái</th>
                  <th className={`${th} text-right`}>Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/70">
                {rows.map((row) => {
                  const st = STATUS_BADGE[row.status];
                  return (
                    <tr key={row.id} onClick={() => { void openView(row.id); }} className="cursor-pointer hover:bg-canvas">
                      <td className={th}>
                        <div className="flex items-center gap-2.5">
                          <span className="h-10 w-14 shrink-0 overflow-hidden rounded bg-canvas">{row.coverImageUrl && <img src={row.coverImageUrl} alt="" className="h-full w-full object-cover" />}</span>
                          <div className="min-w-0">
                            <div className="max-w-[280px] truncate font-semibold text-ink-deep" title={row.title}>{row.title}</div>
                            <div className="text-[11px] text-muted">#{row.id} · {row.durationText}{row.newRequests ? ` · ${row.newRequests} yêu cầu mới` : ''}</div>
                          </div>
                        </div>
                      </td>
                      <td className={th}>{row.providerName ?? BRAND_NAME}</td>
                      <td className={`${th} whitespace-nowrap font-semibold text-ink`}>{formatVnd(row.priceFrom)}</td>
                      <td className={th}>
                        <div className="flex flex-wrap gap-1">
                          <StatusBadge tone={st.tone} pulse={row.status === 'PENDING'}>{st.label}</StatusBadge>
                          {row.pendingEdit && <StatusBadge tone="warning">Có bản sửa</StatusBadge>}
                          {!row.visible && <StatusBadge tone="neutral">Đang ẩn</StatusBadge>}
                          {row.paused && <StatusBadge tone="neutral">NCC tạm ngừng</StatusBadge>}
                        </div>
                      </td>
                      <td className={`${th} text-right`} onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-end gap-1">
                          <button type="button" onClick={() => { void openView(row.id); }} className={actionButtonClass('brand')}>Xem</button>
                          {canOperate && <button type="button" onClick={() => { void openEdit(row.id); }} className={actionButtonClass('brand')}>Sửa</button>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!loading && rows.length === 0 && !error && <div className="py-12 text-center text-xs text-muted">Chưa có combo nào khớp bộ lọc.</div>}
          </div>
          <TableFooter total={data?.totalElements ?? 0} activeCount={[status, source, keyword.trim()].filter(Boolean).length}
            onClear={() => { setStatus(''); setSource(''); setKeyword(''); setPage(0); }} page={page} totalPages={data?.totalPages ?? 0} onPage={setPage} />
        </>
      )}

      {viewing && (
        <ComboModal title={viewing.content.title} onClose={() => setViewing(null)}>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-5">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <StatusBadge tone={STATUS_BADGE[viewing.status].tone}>{STATUS_BADGE[viewing.status].label}</StatusBadge>
              <span className="text-muted">{viewing.providerName ? `Nhà cung cấp: ${viewing.providerName}` : `Do ${BRAND_NAME} tạo`}</span>
              {viewing.publiclyVisible && (
                <a href={`/combo/${viewing.slug}`} target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center gap-1 font-semibold text-primary hover:underline">
                  <ExternalLink className="h-3.5 w-3.5" /> Trang khách
                </a>
              )}
            </div>
            {viewing.pendingChanges && (
              <div className="rounded-md border border-amber-200 bg-amber-50/70 p-3">
                <p className="mb-2 text-xs font-semibold text-amber-900">
                  Bản sửa chờ duyệt (gửi {viewing.pendingSubmittedAt ? new Date(viewing.pendingSubmittedAt).toLocaleString('vi-VN') : ''}) — khách vẫn thấy bản hiện tại bên dưới.
                </p>
                <ComboInputPreview input={viewing.pendingChanges} places={viewing.places} />
                {canOperate && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" onClick={() => { void run('Đã duyệt bản sửa — khách thấy nội dung mới.', () => comboAdminApi.approveEdit(viewing.id)); }} className={actionButtonClass('success')}>Duyệt bản sửa</button>
                    <button type="button" onClick={() => { setDialogError(''); setDialog({ kind: 'rejectEdit', combo: viewing }); }} className={actionButtonClass('danger')}>Từ chối bản sửa</button>
                  </div>
                )}
                <p className="mt-3 border-t border-amber-200 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted">Bản đang hiển thị</p>
              </div>
            )}
            <ComboInputPreview input={viewing.content} places={viewing.places} />
          </div>
          {canOperate && (
            <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-border px-4 py-3 sm:px-5">
              {viewing.status === 'PENDING' && (
                <>
                  <button type="button" onClick={() => { setDialogError(''); setDialog({ kind: 'reject', combo: viewing }); }} className={actionButtonClass('danger')}>Từ chối</button>
                  <button type="button" onClick={() => { void run('Đã duyệt combo — khách đã thấy combo.', () => comboAdminApi.approve(viewing.id)); }} className={actionButtonClass('success')}>Duyệt</button>
                </>
              )}
              {viewing.status === 'APPROVED' && (viewing.visible
                ? <button type="button" onClick={() => { setDialogError(''); setDialog({ kind: 'hide', combo: viewing }); }} className={actionButtonClass('warning')}>Ẩn với khách</button>
                : <button type="button" onClick={() => { void run('Đã hiển thị lại combo.', () => comboAdminApi.setVisible(viewing.id, true)); }} className={actionButtonClass('success')}>Hiển thị lại</button>)}
              <button type="button" onClick={() => { setEditing(viewing); setViewing(null); }} className={actionButtonClass('brand')}>Sửa</button>
              <button type="button" onClick={() => { setDialogError(''); setDialog({ kind: 'delete', combo: viewing }); }} className={actionButtonClass('danger')}>Xóa</button>
            </div>
          )}
        </ComboModal>
      )}

      {editing && (
        <ComboModal title={editing === 'new' ? 'Tạo combo' : 'Sửa combo'} onClose={() => setEditing(null)}
          note={editing !== 'new' && editing.providerId ? (
            <p className="mx-4 mt-3 rounded-md bg-sky-50 px-3 py-2 text-xs text-sky-800">Combo của nhà cung cấp {editing.providerName}: Admin sửa được áp dụng ngay, thao tác được ghi nhật ký.</p>
          ) : undefined}>
          <ComboForm scope="admin" initial={editing === 'new' ? null : editing} submitLabel={editing === 'new' ? 'Tạo combo' : 'Lưu'}
            onCancel={() => setEditing(null)}
            onSubmit={async (input) => {
              if (editing === 'new') await api.create(input);
              else await api.update(editing.id, input);
              setEditing(null);
              notify('success', editing === 'new' ? 'Đã tạo combo — khách đã thấy combo.' : 'Đã lưu combo.');
              refresh();
            }} />
        </ComboModal>
      )}

      {dialog && (
        <ReasonDialog
          title={{ reject: 'Từ chối combo', rejectEdit: 'Từ chối bản sửa', hide: 'Ẩn combo với khách', delete: 'Xóa combo' }[dialog.kind]}
          description={{
            reject: 'Nhà cung cấp được báo lý do và có thể sửa rồi gửi lại.',
            rejectEdit: 'Combo đang hiển thị giữ nguyên; nhà cung cấp được báo lý do.',
            hide: 'Khách không còn thấy combo; nhà cung cấp được thông báo.',
            delete: 'Xóa hẳn combo chưa có yêu cầu đặt nào. Combo đã có yêu cầu đặt chỉ ẩn được.',
          }[dialog.kind]}
          confirmLabel={{ reject: 'Từ chối', rejectEdit: 'Từ chối bản sửa', hide: 'Ẩn combo', delete: 'Xóa combo' }[dialog.kind]}
          reasonRequired={dialog.kind === 'reject' || dialog.kind === 'rejectEdit'}
          reasonRequiredMessage="Vui lòng nhập lý do (10–500 ký tự)"
          hideReason={dialog.kind === 'hide' || dialog.kind === 'delete'}
          tone="danger"
          error={dialogError}
          onCancel={() => setDialog(null)}
          onConfirm={confirmDialog}
        />
      )}
    </section>
  );
}
