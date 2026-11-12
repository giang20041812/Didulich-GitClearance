import { Fragment, useCallback, useEffect, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { adminService } from '@/services/adminService';
import { getApiErrorMessage } from '@/lib/apiError';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import type { PageResponse } from '@/types/admin';
import type { AuditActor, AuditLogItem, AuditResult } from '@/types/auditLog';
import {
  CompactDateRange,
  CompactSelect,
  FilterSearch,
  RefreshButton,
  TableFooter,
  type SelectOption,
} from './AdminFilters';
import { StatusBadge, type StatusTone } from './StatusBadge';
import StatusFilter, { type StatusFilterItem } from './StatusFilter';
import { STATUS_COLOR } from './statusColor';
import { useUrlStatus } from '@/hooks/useUrlStatus';
import { useStatusCounts } from '@/hooks/useStatusCounts';
import { AUDIT_ACTION, AUDIT_ENTITY } from './auditMeta';

const PAGE_SIZE = 20;

const ACTOR_LABEL: Record<AuditActor, string> = { ADMIN: 'Quản trị viên', PROVIDER: 'Nhà cung cấp', CUSTOMER: 'Khách', SYSTEM: 'Hệ thống' };
const RESULT_LABEL: Record<AuditResult, string> = { SUCCESS: 'Thành công', FAILURE: 'Thất bại', DENIED: 'Bị từ chối' };
const RESULT_TONE: Record<AuditResult, StatusTone> = { SUCCESS: STATUS_COLOR.green, FAILURE: STATUS_COLOR.red, DENIED: STATUS_COLOR.yellow };

/** Trạng thái = kết quả ghi trong audit_log.result (SUCCESS / FAILURE / DENIED). */
const STATUS_ITEMS: StatusFilterItem<AuditResult>[] = (Object.keys(RESULT_LABEL) as AuditResult[]).map((r) => ({
  value: r,
  label: RESULT_LABEL[r],
  tone: RESULT_TONE[r],
}));
const STATUS_VALUES = STATUS_ITEMS.map((i) => i.value);
// Có mục "Tất cả" (value rỗng) để ô chọn không hiện sẵn một giá trị khi chưa lọc.
const ROLE_OPTIONS: SelectOption<AuditActor>[] = [
  { value: '', label: 'Tất cả' },
  ...(Object.keys(ACTOR_LABEL) as AuditActor[]).map((a) => ({ value: a, label: ACTOR_LABEL[a] })),
];
const ENTITY_OPTIONS: SelectOption<string>[] = [{ value: '', label: 'Tất cả' }, ...Object.entries(AUDIT_ENTITY).map(([value, label]) => ({ value, label }))];

const fmtDateTime = (d: string) => new Date(d).toLocaleString('vi-VN');

/**
 * Hoạt động hệ thống (nhật ký chỉ đọc): ai đã làm gì, lúc nào, kết quả ra sao.
 * Lọc theo từ khóa, vai trò người thao tác, trạng thái (kết quả), đối tượng và khoảng thời gian.
 */
export default function ActivityPanel() {
  const [keyword, setKeyword] = useState('');
  const [actor, setActor] = useState<AuditActor | ''>('');
  const [result, setResultUrl] = useUrlStatus<AuditResult>(STATUS_VALUES, '');
  const [entityType, setEntityType] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(0);

  const [data, setData] = useState<PageResponse<AuditLogItem> | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [reload, setReload] = useState(0);
  const [openId, setOpenId] = useState<number | null>(null);
  const [detail, setDetail] = useState<AuditLogItem | null>(null);
  const [detailError, setDetailError] = useState('');

  const debounced = useDebouncedValue(keyword);
  const trimmed = debounced.trim();
  const activeCount = [trimmed, actor, result, entityType, from || to].filter(Boolean).length;

  /** Nút tải lại: đưa màn hình về trạng thái ban đầu (bỏ mọi điều kiện tìm kiếm / lọc / sắp xếp, về tab mặc định, trang 1) rồi tải lại dữ liệu mới nhất. */
  const reloadFromStart = () => {
    setKeyword('');
    setActor('');
    setResultUrl('');
    setEntityType('');
    setFrom('');
    setTo('');
    setPage(0);
    setOpenId(null);
    setReload((n) => n + 1);
  };

  /** Bộ lọc chung (mọi thứ trừ trạng thái) — dùng cho cả danh sách lẫn số đếm của từng tab. */
  const baseParams = () => {
    // Nhãn tiếng Việt chỉ có ở giao diện: tra ra các mã hành động khớp từ khóa để máy chủ tìm theo cả mã đó.
    const lower = trimmed.toLowerCase();
    const codes = lower
      ? Object.entries(AUDIT_ACTION)
          .filter(([, meta]) => meta.label.toLowerCase().includes(lower))
          .map(([code]) => code)
      : [];
    return {
      keyword: trimmed || undefined,
      actionCodes: codes.length ? codes.join(',') : undefined,
      actor: actor || undefined,
      entityType: entityType || undefined,
      from: from || undefined,
      to: to || undefined,
    };
  };

  const counts = useStatusCounts(
    STATUS_VALUES,
    (s) => adminService.getAuditLogs({ ...baseParams(), result: (s as AuditResult) || undefined, page: 0, size: 1 }).then((p) => p.totalElements),
    JSON.stringify([trimmed, actor, entityType, from, to]),
    reload,
  );

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      setData(
        await adminService.getAuditLogs({
          ...baseParams(),
          result: result || undefined,
          page,
          size: PAGE_SIZE,
        }),
      );
    } catch (err: unknown) {
      setLoadError(getApiErrorMessage(err, 'Không tải được nhật ký hoạt động. Vui lòng kiểm tra kết nối máy chủ và thử lại.'));
    } finally {
      setLoading(false);
    }
  }, [trimmed, actor, result, entityType, from, to, page]);

  useEffect(() => {
    void load();
  }, [load, reload]);

  useEffect(() => {
    if (openId === null) return;
    let alive = true;
    adminService
      .getAuditLog(openId)
      .then((d) => {
        if (alive) {
          setDetail(d);
          setDetailError('');
        }
      })
      .catch((err: unknown) => {
        if (alive) setDetailError(getApiErrorMessage(err, 'Không tải được chi tiết bản ghi.'));
      });
    return () => {
      alive = false;
    };
  }, [openId]);

  const changeFilter = <T,>(setter: (v: T) => void) => (v: T) => {
    setter(v);
    setPage(0);
    setOpenId(null);
  };

  const rows = data?.content ?? [];
  const th = 'px-4 py-2.5';
  const td = 'px-4 py-2.5';

  return (
    <section className="rounded-lg border border-border bg-white shadow-sm">
      <StatusFilter ariaLabel="Trạng thái hoạt động" items={STATUS_ITEMS} value={result} counts={counts} onChange={changeFilter(setResultUrl)} />

      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2.5">
        <FilterSearch
          value={keyword}
          onChange={changeFilter(setKeyword)}
          placeholder="Tìm theo người thao tác, hành động, lý do hoặc mã đối tượng..."
        />
        <CompactSelect label="Vai trò" value={actor} options={ROLE_OPTIONS} onChange={changeFilter(setActor)} />
        <CompactSelect label="Đối tượng" value={entityType} options={ENTITY_OPTIONS} onChange={changeFilter(setEntityType)} />
        <CompactDateRange
          label="Thời gian"
          from={from}
          to={to}
          onChange={(f, t) => {
            setFrom(f);
            setTo(t);
            setPage(0);
            setOpenId(null);
          }}
        />
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <RefreshButton loading={loading} onClick={reloadFromStart} />
        </div>
      </div>

      {loadError && (
        <div role="alert" className="border-b border-danger/20 bg-danger/5 px-4 py-2.5 text-xs text-danger">
          {loadError}
        </div>
      )}

      <div className={`overflow-x-auto transition-opacity duration-200 ${loading ? 'opacity-60' : ''}`}>
        <table className="admin-stack w-full border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-border bg-canvas/60 text-[11px] font-semibold uppercase tracking-wide text-muted">
              <th className={th}>Thời gian</th>
              <th className={th}>Người thao tác</th>
              <th className={th}>Hành động</th>
              <th className={th}>Đối tượng</th>
              <th className={th}>Trạng thái</th>
              <th className={th}>IP</th>
              <th className={`${th} w-8`} />
            </tr>
          </thead>
          <tbody className="divide-y divide-border/70">
            {rows.map((row) => {
              const meta = AUDIT_ACTION[row.action];
              const open = openId === row.id;
              return (
                <Fragment key={row.id}>
                  <tr
                    onClick={() => {
                      setDetail(null);
                      setDetailError('');
                      setOpenId(open ? null : row.id);
                    }}
                    className={`cursor-pointer transition-colors duration-150 hover:bg-canvas ${open ? 'bg-primary-50/40' : ''}`}
                  >
                    <td className={`${td} whitespace-nowrap text-ink`}>{fmtDateTime(row.createdAt)}</td>
                    <td className={td}>
                      <div className="font-semibold text-ink-deep">{row.actorName ?? ACTOR_LABEL[row.actor]}</div>
                      <div className="text-[11px] text-muted">
                        {ACTOR_LABEL[row.actor]}
                        {row.actorId ? ` · #${row.actorId}` : ''}
                      </div>
                    </td>
                    <td className={td}>
                      <StatusBadge tone={meta?.tone ?? 'neutral'}>{meta?.label ?? row.action}</StatusBadge>
                      {row.reason && (
                        <div className="mt-0.5 max-w-[240px] truncate text-[11px] text-muted" title={row.reason}>
                          “{row.reason}”
                        </div>
                      )}
                    </td>
                    <td className={`${td} text-ink`}>
                      {row.entityType ? `${AUDIT_ENTITY[row.entityType] ?? row.entityType}${row.entityId ? ` #${row.entityId}` : ''}` : '—'}
                    </td>
                    <td className={td}>
                      {row.result ? <StatusBadge tone={RESULT_TONE[row.result]}>{RESULT_LABEL[row.result]}</StatusBadge> : <span className="text-muted">—</span>}
                    </td>
                    <td className={`${td} font-mono text-[11px] text-muted`}>{row.ip ?? '—'}</td>
                    <td className={`${td} text-muted`}>
                      <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${open ? 'rotate-180 text-primary' : ''}`} />
                    </td>
                  </tr>
                  {open && (
                    <tr className="bg-canvas">
                      <td colSpan={7} className="px-4 py-3 text-xs">
                        {detailError && <p className="text-danger">{detailError}</p>}
                        {!detail && !detailError && <p className="text-muted">Đang tải chi tiết...</p>}
                        {detail && (
                          <div className="grid gap-3 sm:grid-cols-2">
                            <div className="sm:col-span-2">
                              <div className="text-[10px] font-semibold uppercase tracking-wide text-muted">Mã hành động · Lý do</div>
                              <p className="mt-0.5 break-words text-ink">
                                <span className="font-mono">{detail.action}</span>
                                {detail.reason ? ` — ${detail.reason}` : ''}
                              </p>
                            </div>
                            <div>
                              <div className="text-[10px] font-semibold uppercase tracking-wide text-muted">Trước</div>
                              <pre className="mt-0.5 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-md bg-white p-2 font-mono text-[11px] text-ink">
                                {detail.beforeData ? JSON.stringify(detail.beforeData, null, 2) : '—'}
                              </pre>
                            </div>
                            <div>
                              <div className="text-[10px] font-semibold uppercase tracking-wide text-muted">Sau / chi tiết</div>
                              <pre className="mt-0.5 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-md bg-white p-2 font-mono text-[11px] text-ink">
                                {detail.afterData ? JSON.stringify(detail.afterData, null, 2) : '—'}
                              </pre>
                            </div>
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
        {!loading && rows.length === 0 && !loadError && <div className="py-12 text-center text-xs text-muted">Không có hoạt động nào khớp bộ lọc.</div>}
      </div>

      <TableFooter
        total={data?.totalElements ?? 0}
        activeCount={activeCount}
        onClear={() => {
          setKeyword('');
          setActor('');
          setResultUrl('');
          setEntityType('');
          setFrom('');
          setTo('');
          setPage(0);
          setOpenId(null);
        }}
        page={page}
        totalPages={data?.totalPages ?? 0}
        onPage={(p) => {
          setPage(p);
          setOpenId(null);
        }}
      />
    </section>
  );
}
