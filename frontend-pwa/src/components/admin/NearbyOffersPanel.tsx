import { useCallback, useEffect, useState } from 'react';
import { useAdminPermission } from '@/hooks/useAdminPermission';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { getApiErrorMessage } from '@/lib/apiError';
import { nearbyAdminApi } from '@/services/portalServicesApi';
import type { PageResponse } from '@/types/admin';
import type { AdminOfferRow } from '@/types/nearby';
import { CompactSelect, FilterSearch, ReasonDialog, RefreshButton, TableFooter } from './AdminFilters';
import { StatusBadge } from './StatusBadge';
import { actionButtonClass } from './statusStyles';

const PAGE_SIZE = 20;
const HIDDEN_OPTIONS = [
  { value: '' as const, label: 'Tất cả' },
  { value: 'visible' as const, label: 'Đang cho hiện' },
  { value: 'hidden' as const, label: 'Đã ẩn' },
];

/**
 * Admin — "Gợi ý quanh đây": lời mời NCC hiện cho khách ở gần điểm nổi tiếng. Lời mời hiện ngay khi NCC bật (địa điểm đã
 * được duyệt); Admin ẩn gợi ý vi phạm kèm lý do (NCC được báo), và hiện lại khi NCC đã sửa. Cấp 3 chỉ xem.
 */
export default function NearbyOffersPanel({ notify }: { notify: (type: 'success' | 'error', text: string) => void }) {
  const canOperate = useAdminPermission().can('operate');
  const [hidden, setHidden] = useState<'' | 'visible' | 'hidden'>('');
  const [keyword, setKeyword] = useState('');
  const debouncedKeyword = useDebouncedValue(keyword);
  const [page, setPage] = useState(0);
  const [data, setData] = useState<PageResponse<AdminOfferRow> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [hiding, setHiding] = useState<AdminOfferRow | null>(null);
  const [dialogError, setDialogError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setData(await nearbyAdminApi.list({
        hidden: hidden === '' ? undefined : hidden === 'hidden', keyword: debouncedKeyword.trim() || undefined, page, size: PAGE_SIZE,
      }));
    } catch (err) {
      setError(getApiErrorMessage(err, 'Không tải được danh sách gợi ý.'));
    } finally {
      setLoading(false);
    }
  }, [hidden, debouncedKeyword, page]);

  useEffect(() => { void load(); }, [load, reload]);

  const show = async (row: AdminOfferRow) => {
    try {
      await nearbyAdminApi.show(row.placeId);
      notify('success', `Đã hiển thị lại gợi ý của "${row.placeName}".`);
      setReload((r) => r + 1);
    } catch (err) {
      notify('error', getApiErrorMessage(err, 'Không hiển thị lại được gợi ý.'));
    }
  };

  const rows = data?.content ?? [];
  const th = 'px-4 py-2.5';
  return (
    <section className="rounded-lg border border-border bg-white shadow-sm">
      <p className="border-b border-border bg-canvas/50 px-4 py-2.5 text-xs text-muted">
        Khách bật "Gợi ý quanh đây" đi tới gần điểm nổi tiếng thì thấy lời mời của các địa điểm trong bán kính NCC chọn. Vị trí
        khách chỉ tính trên điện thoại của khách.
      </p>
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2.5">
        <FilterSearch value={keyword} onChange={(v) => { setKeyword(v); setPage(0); }} placeholder="Tìm theo tên địa điểm..." />
        <CompactSelect label="Hiển thị" value={hidden} options={HIDDEN_OPTIONS} onChange={(v) => { setHidden(v); setPage(0); }} />
        <RefreshButton loading={loading} onClick={() => setReload((r) => r + 1)} />
      </div>
      {error && <div role="alert" className="border-b border-danger/20 bg-danger/5 px-4 py-2.5 text-xs text-danger">{error}</div>}
      <div className={`overflow-x-auto transition-opacity ${loading ? 'opacity-60' : ''}`}>
        <table className="admin-stack w-full border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-border bg-canvas/60 text-[11px] font-semibold uppercase tracking-wide text-muted">
              <th className={th}>Địa điểm</th>
              <th className={th}>Lời mời</th>
              <th className={th}>Bán kính</th>
              <th className={th}>Trạng thái</th>
              <th className={`${th} text-right`}>Thao tác</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/70">
            {rows.map((row) => (
              <tr key={row.placeId}>
                <td className={th}>
                  <div className="font-semibold text-ink-deep">{row.placeName}</div>
                  <div className="text-[11px] text-muted">{[row.label, row.providerName].filter(Boolean).join(' · ')}</div>
                </td>
                <td className={`${th} max-w-[320px] text-ink`}>{row.message ? `“${row.message}”` : <span className="text-muted">Không có lời mời</span>}</td>
                <td data-label="Bán kính" className={`${th} whitespace-nowrap`}>{row.radiusKm} km</td>
                <td className={th}>
                  <div className="flex flex-wrap gap-1">
                    {row.hiddenByAdmin ? <StatusBadge tone="danger">Admin đã ẩn</StatusBadge>
                      : row.enabled && row.placeVisible ? <StatusBadge tone="success">Đang gợi ý</StatusBadge>
                        : <StatusBadge tone="neutral">{row.enabled ? 'Địa điểm chưa đủ điều kiện' : 'NCC đang tắt'}</StatusBadge>}
                  </div>
                  {row.hiddenByAdmin && row.hiddenReason && <p className="mt-1 text-[11px] text-danger">Lý do: {row.hiddenReason}</p>}
                </td>
                <td className={`${th} text-right`}>
                  {canOperate && (row.hiddenByAdmin
                    ? <button type="button" onClick={() => { void show(row); }} className={actionButtonClass('success')}>Hiện lại</button>
                    : <button type="button" onClick={() => { setDialogError(''); setHiding(row); }} className={actionButtonClass('danger')}>Ẩn</button>)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && rows.length === 0 && !error && <div className="py-12 text-center text-xs text-muted">Chưa có gợi ý nào.</div>}
      </div>
      <TableFooter total={data?.totalElements ?? 0} activeCount={[hidden, keyword.trim()].filter(Boolean).length}
        onClear={() => { setHidden(''); setKeyword(''); setPage(0); }} page={page} totalPages={data?.totalPages ?? 0} onPage={setPage} />
      {hiding && (
        <ReasonDialog
          title="Ẩn gợi ý quanh đây"
          description={`Khách không còn thấy gợi ý của "${hiding.placeName}". Nhà cung cấp được báo lý do; chỉ Admin hiện lại được.`}
          confirmLabel="Ẩn gợi ý"
          reasonRequired
          reasonRequiredMessage="Vui lòng nhập lý do (10–500 ký tự)"
          tone="danger"
          error={dialogError}
          onCancel={() => setHiding(null)}
          onConfirm={async (reason) => {
            try {
              await nearbyAdminApi.hide(hiding.placeId, reason);
              notify('success', 'Đã ẩn gợi ý, nhà cung cấp được báo lý do.');
              setHiding(null);
              setReload((r) => r + 1);
            } catch (err) {
              setDialogError(getApiErrorMessage(err, 'Không ẩn được gợi ý.'));
            }
          }}
        />
      )}
    </section>
  );
}
