import { useEffect, useState } from 'react';
import { Camera, EyeOff, RotateCcw } from 'lucide-react';
import { adminService } from '@/services/adminService';
import { getApiErrorMessage } from '@/lib/apiError';
import { mediaUrl } from '@/lib/mediaUrl';
import type { PageResponse } from '@/types/admin';
import type { AdminCheckinView } from '@/types/journey';
import { ReasonDialog, RefreshButton, TableFooter } from './AdminFilters';
import { StatusBadge } from './StatusBadge';
import { ListSkeleton } from '@/components/ui/PageSkeleton';

const PAGE_SIZE = 12;
type Filter = 'VISIBLE' | 'HIDDEN' | 'ALL';
const FILTERS: { value: Filter; label: string }[] = [
  { value: 'VISIBLE', label: 'Đang hiện' },
  { value: 'HIDDEN', label: 'Đã ẩn' },
  { value: 'ALL', label: 'Tất cả' },
];

/**
 * Kiểm duyệt ảnh + lưu bút check-in địa điểm của khách (lịch trình). Ẩn: nội dung không còn trên trang chia sẻ công khai,
 * chủ lịch trình vẫn thấy kèm lý do; bỏ ẩn được.
 */
export default function JourneyCheckinsPanel({ notify }: { notify: (type: 'success' | 'error', text: string) => void }) {
  const [filter, setFilter] = useState<Filter>('VISIBLE');
  const [page, setPage] = useState(0);
  const [data, setData] = useState<PageResponse<AdminCheckinView> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [hiding, setHiding] = useState<AdminCheckinView | null>(null);
  const [dialogError, setDialogError] = useState('');
  const [busyId, setBusyId] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    const hidden = filter === 'ALL' ? undefined : filter === 'HIDDEN';
    setLoading(true);
    adminService.getJourneyCheckins({ hidden, page, size: PAGE_SIZE })
      .then((result) => { if (alive) { setData(result); setError(''); } })
      .catch((err: unknown) => { if (alive) setError(getApiErrorMessage(err, 'Không tải được danh sách check-in.')); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [filter, page, reload]);

  const replace = (row: AdminCheckinView) =>
    setData((current) => current && { ...current, content: current.content.map((c) => (c.id === row.id ? row : c)) });

  const unhide = async (row: AdminCheckinView) => {
    setBusyId(row.id);
    try {
      replace(await adminService.unhideJourneyCheckin(row.id));
      notify('success', 'Đã bỏ ẩn check-in.');
    } catch (err) {
      notify('error', getApiErrorMessage(err, 'Không bỏ ẩn được check-in.'));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 pt-4">
        <div>
          <h2 className="flex items-center gap-2 font-display text-base font-bold text-ink-deep"><Camera className="h-4 w-4 text-primary" /> Ảnh &amp; lưu bút check-in</h2>
          <p className="text-xs text-muted">Khách check-in các điểm trong lịch trình. Ẩn nội dung không phù hợp khỏi trang chia sẻ công khai.</p>
        </div>
        <div className="flex items-center gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => { setFilter(f.value); setPage(0); }}
              className={`rounded-md border px-3 py-1.5 text-xs font-semibold ${filter === f.value ? 'border-primary bg-primary text-white' : 'border-border text-ink hover:bg-hover'}`}
            >
              {f.label}
            </button>
          ))}
          <RefreshButton onClick={() => setReload((r) => r + 1)} loading={loading} />
        </div>
      </div>

      {error && <p role="alert" className="px-4 text-sm text-danger">{error}</p>}
      {!data && loading ? (
        <ListSkeleton className="px-4 pb-4" rows={4} />
      ) : data && data.content.length === 0 ? (
        <p className="px-4 pb-4 text-sm text-muted">Không có check-in nào.</p>
      ) : (
        <ul className="grid gap-3 px-4 pb-2 sm:grid-cols-2 xl:grid-cols-3">
          {data?.content.map((row) => (
            <li key={row.id} className="flex flex-col overflow-hidden rounded-lg border border-border bg-white">
              {row.photoUrl && (
                <a href={mediaUrl(row.photoUrl)} target="_blank" rel="noreferrer" className="block aspect-video bg-canvas">
                  <img src={mediaUrl(row.photoUrl)} alt={`Ảnh check-in ${row.placeName}`} loading="lazy" className="h-full w-full object-cover" />
                </a>
              )}
              <div className="flex flex-1 flex-col gap-1.5 p-3 text-xs">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-bold text-ink-deep">{row.placeName}</p>
                  {row.hiddenAt ? <StatusBadge tone="warning">Đã ẩn</StatusBadge> : <StatusBadge tone="success">Đang hiện</StatusBadge>}
                </div>
                <p className="text-muted">{row.travelerName || 'Khách'}{row.travelerEmail ? ` · ${row.travelerEmail}` : ''} · {new Date(row.createdAt).toLocaleString('vi-VN')}</p>
                {row.note && <p className="whitespace-pre-line break-words italic text-ink">“{row.note}”</p>}
                {row.hiddenAt && row.hiddenReason && <p className="text-amber-700">Lý do ẩn: {row.hiddenReason}</p>}
                <div className="mt-auto pt-1">
                  {row.hiddenAt ? (
                    <button type="button" disabled={busyId === row.id} onClick={() => { void unhide(row); }} className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 font-semibold text-ink hover:bg-hover disabled:opacity-50">
                      <RotateCcw className="h-3.5 w-3.5" /> Bỏ ẩn
                    </button>
                  ) : (
                    <button type="button" onClick={() => { setDialogError(''); setHiding(row); }} className="inline-flex items-center gap-1 rounded-md border border-danger/40 px-2.5 py-1 font-semibold text-danger hover:bg-danger/5">
                      <EyeOff className="h-3.5 w-3.5" /> Ẩn
                    </button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      {data && data.totalPages > 1 && (
        <TableFooter total={data.totalElements} activeCount={0} onClear={() => {}} page={page} totalPages={data.totalPages} onPage={setPage} />
      )}

      {hiding && (
        <ReasonDialog
          title="Ẩn ảnh / lưu bút check-in"
          description={`Nội dung check-in tại ${hiding.placeName} không còn hiện trên trang chia sẻ công khai; chủ lịch trình vẫn thấy kèm lý do. Có thể bỏ ẩn sau.`}
          confirmLabel="Ẩn check-in"
          reasonRequired
          error={dialogError}
          onCancel={() => setHiding(null)}
          onConfirm={async (reason) => {
            try {
              replace(await adminService.hideJourneyCheckin(hiding.id, reason));
              notify('success', 'Đã ẩn check-in.');
              setHiding(null);
            } catch (err) {
              setDialogError(getApiErrorMessage(err, 'Không ẩn được check-in.'));
            }
          }}
        />
      )}
    </div>
  );
}
