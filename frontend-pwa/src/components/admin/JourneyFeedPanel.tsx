import { useEffect, useState } from 'react';
import { EyeOff, ExternalLink, Footprints, Loader2, MapPin, RotateCcw } from 'lucide-react';
import { getApiErrorMessage } from '@/lib/apiError';
import { fetchAdminJourneyFeed, hideFeedJourney, unhideFeedJourney } from '@/services/journeyService';
import type { PageResponse } from '@/types/admin';
import type { AdminFeedItem } from '@/types/journey';
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

const postTitle = (row: AdminFeedItem) => row.title?.trim() || `Lịch trình của ${row.travelerName || 'khách'}`;

/**
 * Kiểm duyệt bài trên trang "Trải nghiệm" (hành trình khách tự đăng công khai). Ẩn: bài biến khỏi bảng tin, chủ lịch
 * trình vẫn thấy kèm lý do; bỏ ẩn được. "Xem bài" mở trang chia sẻ /j/{token} ở tab mới.
 */
export default function JourneyFeedPanel({ notify }: { notify: (type: 'success' | 'error', text: string) => void }) {
  const [filter, setFilter] = useState<Filter>('VISIBLE');
  const [page, setPage] = useState(0);
  const [data, setData] = useState<PageResponse<AdminFeedItem> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [hiding, setHiding] = useState<AdminFeedItem | null>(null);
  const [dialogError, setDialogError] = useState('');
  const [busyId, setBusyId] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    const hidden = filter === 'ALL' ? undefined : filter === 'HIDDEN';
    setLoading(true);
    fetchAdminJourneyFeed({ hidden, page, size: PAGE_SIZE })
      .then((result) => { if (alive) { setData(result); setError(''); } })
      .catch((err: unknown) => { if (alive) setError(getApiErrorMessage(err, 'Không tải được danh sách bài Trải nghiệm.')); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [filter, page, reload]);

  const replace = (row: AdminFeedItem) =>
    setData((current) => current && { ...current, content: current.content.map((c) => (c.id === row.id ? row : c)) });

  const unhide = async (row: AdminFeedItem) => {
    setBusyId(row.id);
    try {
      replace(await unhideFeedJourney(row.id));
      notify('success', 'Đã hiện lại bài trên Trải nghiệm.');
    } catch (err) {
      notify('error', getApiErrorMessage(err, 'Không bỏ ẩn được bài.'));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 pt-4">
        <div>
          <h2 className="flex items-center gap-2 font-display text-base font-bold text-ink-deep"><Footprints className="h-4 w-4 text-primary" /> Bài đăng Trải nghiệm</h2>
          <p className="text-xs text-muted">Hành trình khách đăng công khai lên trang Trải nghiệm. Ẩn bài không phù hợp khỏi bảng tin — chủ lịch trình thấy lý do.</p>
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
        <p className="px-4 pb-4 text-sm text-muted">{filter === 'HIDDEN' ? 'Không có bài nào đang bị ẩn.' : 'Chưa có bài nào được đăng.'}</p>
      ) : (
        <ul className="flex flex-col gap-2 px-4 pb-2">
          {data?.content.map((row) => (
            <li key={row.id} className="flex flex-col gap-3 rounded-lg border border-border bg-white p-3 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1 text-xs">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-bold text-ink-deep">{postTitle(row)}</p>
                  {row.hiddenAt ? <StatusBadge tone="warning">Đã ẩn</StatusBadge> : <StatusBadge tone="success">Đang hiện</StatusBadge>}
                </div>
                <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-muted">
                  <span>{row.travelerName || 'Khách'}{row.travelerEmail ? ` · ${row.travelerEmail}` : ''}</span>
                  <span>·</span>
                  <span className="inline-flex items-center gap-0.5"><MapPin className="h-3 w-3" /> {row.stopCount} điểm</span>
                  <span>·</span>
                  <span>Đăng {new Date(row.publishedAt).toLocaleString('vi-VN')}</span>
                </p>
                {row.hiddenAt && row.hiddenReason && <p className="mt-1 text-amber-700">Lý do ẩn: {row.hiddenReason}</p>}
              </div>
              <div className="flex shrink-0 items-center gap-2 text-xs">
                {row.shareToken && (
                  <a
                    href={`/j/${row.shareToken}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 font-semibold text-ink hover:bg-hover"
                  >
                    <ExternalLink className="h-3.5 w-3.5" /> Xem bài
                  </a>
                )}
                {row.hiddenAt ? (
                  <button type="button" disabled={busyId === row.id} onClick={() => { void unhide(row); }} className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 font-semibold text-ink hover:bg-hover disabled:opacity-50">
                    {busyId === row.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />} Bỏ ẩn
                  </button>
                ) : (
                  <button type="button" onClick={() => { setDialogError(''); setHiding(row); }} className="inline-flex items-center gap-1 rounded-md border border-danger/40 px-2.5 py-1 font-semibold text-danger hover:bg-danger/5">
                    <EyeOff className="h-3.5 w-3.5" /> Ẩn bài
                  </button>
                )}
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
          title="Ẩn bài khỏi Trải nghiệm"
          description={`"${postTitle(hiding)}" sẽ không còn trên trang Trải nghiệm; chủ lịch trình vẫn thấy bài kèm lý do. Có thể bỏ ẩn sau.`}
          confirmLabel="Ẩn bài"
          reasonRequired
          error={dialogError}
          onCancel={() => setHiding(null)}
          onConfirm={async (reason) => {
            try {
              replace(await hideFeedJourney(hiding.id, reason));
              notify('success', 'Đã ẩn bài khỏi Trải nghiệm.');
              setHiding(null);
            } catch (err) {
              setDialogError(getApiErrorMessage(err, 'Không ẩn được bài.'));
            }
          }}
        />
      )}
    </div>
  );
}
