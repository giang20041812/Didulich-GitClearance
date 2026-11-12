import { useEffect, useState } from 'react';
import { Building2, ExternalLink, LogIn, RotateCcw } from 'lucide-react';
import { useAdminPermission } from '@/hooks/useAdminPermission';
import { getApiErrorMessage } from '@/lib/apiError';
import { adminService } from '@/services/adminService';
import type { PageResponse, TravelerActivity, TravelerActivityType } from '@/types/admin';

const FILTERS: { type: TravelerActivityType; label: string }[] = [
  { type: 'ALL', label: 'Tất cả' },
  { type: 'LOGIN', label: 'Đăng nhập' },
  { type: 'HOMESTAY_VIEW', label: 'Homestay đã xem' },
];
const formatTime = (iso: string) => new Date(iso).toLocaleString('vi-VN', {
  timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', second: '2-digit',
  day: '2-digit', month: '2-digit', year: 'numeric',
});

export default function TravelerActivityPanel({ travelerId }: { travelerId: number }) {
  const { can } = useAdminPermission();
  const allowed = can('viewActivity');
  const [type, setType] = useState<TravelerActivityType>('ALL');
  const [page, setPage] = useState(0);
  const [reload, setReload] = useState(0);
  const [data, setData] = useState<PageResponse<TravelerActivity> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!allowed) return;
    let active = true;
    setLoading(true); setError(''); setData(null);
    adminService.getTravelerActivity(travelerId, type, page)
      .then((value) => { if (active) setData(value); })
      .catch((err: unknown) => { if (active) setError(getApiErrorMessage(err, 'Không tải được lịch sử truy cập.')); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [travelerId, type, page, reload, allowed]);

  if (!allowed) return null;

  return (
    <section aria-labelledby="traveler-activity-title" className="min-w-0 rounded-lg border border-border bg-white p-3">
      <div className="flex items-center justify-between gap-2">
        <h4 id="traveler-activity-title" className="text-sm font-bold text-ink-deep">Lịch sử truy cập của khách</h4>
        <button type="button" disabled={loading} onClick={() => setReload((n) => n + 1)} aria-label="Làm mới lịch sử truy cập"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-muted hover:bg-hover disabled:opacity-50">
          <RotateCcw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>
      <p className="mb-3 text-[11px] leading-relaxed text-muted">Theo dõi thời điểm đăng nhập và homestay khách đã xem để tư vấn. Thời gian theo giờ Việt Nam.</p>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {FILTERS.map((filter) => (
          <button key={filter.type} type="button" aria-pressed={type === filter.type}
            onClick={() => { setType(filter.type); setPage(0); }}
            className={`min-h-11 rounded-md px-2.5 py-2 text-xs font-semibold ${type === filter.type ? 'bg-primary text-white' : 'bg-canvas text-muted hover:bg-hover'}`}>
            {filter.label}
          </button>
        ))}
      </div>
      {loading ? <p role="status" className="py-4 text-xs text-muted">Đang tải lịch sử…</p>
        : error ? <div role="alert" className="py-3 text-xs text-danger">{error} <button type="button" onClick={() => setReload((n) => n + 1)} className="underline">Thử lại</button></div>
        : !data?.content.length ? <p className="py-4 text-xs text-muted">Chưa có hoạt động được ghi nhận trong mục này.</p>
        : (
          <>
            <ol className="divide-y divide-border">
              {data.content.map((item) => (
                <li key={item.id} className="flex min-w-0 gap-2.5 py-3">
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary-50 text-primary">
                    {item.type === 'LOGIN' ? <LogIn className="h-4 w-4" /> : <Building2 className="h-4 w-4" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    {item.type === 'LOGIN' ? <p className="text-xs font-semibold text-ink-deep">Đăng nhập bằng {item.loginMethod === 'GOOGLE' ? 'Google' : 'email / số điện thoại'}</p>
                      : <>
                        <p className="break-words text-xs font-semibold text-ink-deep">Đã xem {item.placeName || 'Homestay'}</p>
                        {item.placeId != null && <a href={`/homestays/${item.placeId}`} target="_blank" rel="noopener noreferrer"
                          className="mt-1 inline-flex min-h-8 items-center gap-1 text-xs font-semibold text-primary hover:underline">
                          Xem homestay <ExternalLink className="h-3 w-3" />
                        </a>}
                      </>}
                    <time dateTime={item.occurredAt} className="mt-1 block text-[11px] tabular-nums text-muted">{formatTime(item.occurredAt)}</time>
                  </div>
                </li>
              ))}
            </ol>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2 text-[11px] text-muted">
              <span>{data.totalElements} hoạt động · Trang {data.number + 1}/{Math.max(1, data.totalPages)}</span>
              <div className="flex gap-1">
                <button type="button" disabled={page === 0 || loading} onClick={() => setPage((n) => Math.max(0, n - 1))}
                  className="min-h-11 rounded-md border border-border px-3 font-semibold disabled:opacity-40">Trước</button>
                <button type="button" disabled={page + 1 >= data.totalPages || loading} onClick={() => setPage((n) => n + 1)}
                  className="min-h-11 rounded-md border border-border px-3 font-semibold disabled:opacity-40">Sau</button>
              </div>
            </div>
          </>
        )}
      <p className="mt-3 border-t border-border pt-2 text-[11px] leading-relaxed text-muted">Lượt xem được ghi nhận khi khách đã đăng nhập và mở trang homestay. Các lượt xem trước khi bật tính năng này chưa có trong lịch sử.</p>
    </section>
  );
}
