import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { AlertTriangle, BedDouble, Building2, CheckCircle2, Home, RotateCcw, X, XCircle, type LucideIcon } from 'lucide-react';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { adminService } from '@/services/adminService';
import { getApiErrorMessage } from '@/lib/apiError';
import type { PageResponse } from '@/types/admin';
import type { ChangeContext, ChangeRequestDetail, ChangeRequestStatus, ChangeRequestSummary, ChangeTargetType } from '@/types/changeRequest';
import {
  CompactDateRange,
  CompactSelect,
  FilterSearch,
  ReasonDialog,
  RefreshButton,
  TableFooter,
  type SelectOption,
} from './AdminFilters';
import { StatusBadge } from './StatusBadge';
import StatusFilter, { type StatusFilterItem } from './StatusFilter';
import { STATUS_COLOR } from './statusColor';
import { useUrlStatus } from '@/hooks/useUrlStatus';
import { useStatusCounts } from '@/hooks/useStatusCounts';
import { actionButtonClass, PROVIDER_STATUS } from './statusStyles';
import { VERIFICATION_LABEL, VERIFICATION_TONE, VISIBILITY_LABEL, VISIBILITY_TONE } from './placeMeta';
import { vnd } from './bookingMeta';
import OverlayPortal from './OverlayPortal';
import {
  CHANGE_OPERATION_LABEL,
  CHANGE_STATUS_LABEL,
  CHANGE_STATUS_TONE,
  CHANGE_TARGET_LABEL,
  CHANGE_TARGET_ORDER,
} from './changeRequestMeta';

interface ChangeRequestsPanelProps {
  notify: (type: 'success' | 'error', text: string) => void;
  /** Gọi sau khi duyệt/từ chối để cập nhật số đếm ở tab. */
  onChanged: () => void;
}

const PAGE_SIZE = 15;
/** Tab trạng thái yêu cầu thay đổi = change_request.status (mặc định "Chờ duyệt"). */
const STATUS_ITEMS: StatusFilterItem<ChangeRequestStatus>[] = [
  { value: 'PENDING', label: CHANGE_STATUS_LABEL.PENDING, tone: STATUS_COLOR.yellow },
  { value: 'APPROVED', label: CHANGE_STATUS_LABEL.APPROVED, tone: STATUS_COLOR.green },
  { value: 'REJECTED', label: CHANGE_STATUS_LABEL.REJECTED, tone: STATUS_COLOR.red },
  { value: 'CANCELLED', label: CHANGE_STATUS_LABEL.CANCELLED, tone: STATUS_COLOR.gray },
];
const STATUS_VALUES = STATUS_ITEMS.map((i) => i.value);
const TARGET_OPTIONS: SelectOption<ChangeTargetType>[] = [
  { value: '', label: 'Tất cả' },
  ...CHANGE_TARGET_ORDER.map((t) => ({ value: t, label: CHANGE_TARGET_LABEL[t] })),
];

const fmtDateTime = (d?: string | null) => (d ? new Date(d).toLocaleString('vi-VN') : '—');

/** `reopen` = xem xét lại yêu cầu đã từ chối (đưa về Chờ duyệt). */
type Decision = { type: 'approve' | 'reject' | 'reopen'; request: ChangeRequestSummary };

/** Danh sách yêu cầu thay đổi Homestay/phòng/giá của NCC: Admin xem nội dung cũ/mới rồi Duyệt hoặc Từ chối. */
export default function ChangeRequestsPanel({ notify, onChanged }: ChangeRequestsPanelProps) {
  const [keyword, setKeyword] = useState('');
  const [status, setStatus] = useUrlStatus<ChangeRequestStatus>(STATUS_VALUES, 'PENDING');
  const [targetType, setTargetType] = useState<ChangeTargetType | ''>('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(0);

  const [data, setData] = useState<PageResponse<ChangeRequestSummary> | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [reload, setReload] = useState(0);
  const [openId, setOpenId] = useState<number | null>(null);
  // Tăng để ngăn chi tiết tải lại dữ liệu (vd. sau khi xem xét lại yêu cầu).
  const [drawerVersion, setDrawerVersion] = useState(0);
  const [decision, setDecision] = useState<Decision | null>(null);
  const [dialogError, setDialogError] = useState('');

  const debouncedKeyword = useDebouncedValue(keyword);
  const activeCount = [debouncedKeyword, targetType, from || to].filter(Boolean).length;

  const resetPage = <T,>(setter: (v: T) => void) => (v: T) => {
    setter(v);
    setPage(0);
  };

  const clearFilters = () => {
    setKeyword('');
    setTargetType('');
    setFrom('');
    setTo('');
    setPage(0);
  };

  /** Nút tải lại: đưa màn hình về trạng thái ban đầu (bỏ mọi điều kiện tìm kiếm / lọc / sắp xếp, về tab mặc định, trang 1) rồi tải lại dữ liệu mới nhất. */
  const reloadFromStart = () => {
    clearFilters();
    setStatus('PENDING');
    setOpenId(null);
    setReload((n) => n + 1);
  };

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      setData(
        await adminService.getChangeRequests({
          status: status || undefined,
          targetType: targetType || undefined,
          keyword: debouncedKeyword.trim() || undefined,
          from: from || undefined,
          to: to || undefined,
          sortDir: status === 'PENDING' ? 'asc' : 'desc',
          page,
          size: PAGE_SIZE,
        }),
      );
    } catch (err: unknown) {
      setLoadError(getApiErrorMessage(err, 'Không tải được danh sách yêu cầu thay đổi. Vui lòng kiểm tra kết nối máy chủ và thử lại.'));
    } finally {
      setLoading(false);
    }
  }, [status, targetType, debouncedKeyword, from, to, page]);

  useEffect(() => {
    void load();
  }, [load, reload]);

  /** Số lượng trên từng tab: áp dụng cùng từ khóa / đối tượng / ngày gửi, chỉ khác trạng thái. */
  const counts = useStatusCounts(
    STATUS_VALUES,
    async (s) =>
      (
        await adminService.getChangeRequests({
          status: s || undefined,
          targetType: targetType || undefined,
          keyword: debouncedKeyword.trim() || undefined,
          from: from || undefined,
          to: to || undefined,
          page: 0,
          size: 1,
        })
      ).totalElements,
    JSON.stringify([debouncedKeyword.trim(), targetType, from, to]),
    reload,
  );

  const confirm = async (reason: string) => {
    if (!decision) return;
    if (decision.type === 'reject' && !reason) {
      setDialogError('Vui lòng nhập lý do từ chối.');
      return;
    }
    try {
      if (decision.type === 'reopen') {
        await adminService.reopenChangeRequest(decision.request.id, reason || undefined);
        notify('success', `Đã đưa yêu cầu của "${decision.request.placeName}" về Chờ duyệt — bạn có thể duyệt hoặc từ chối lại.`);
        setDecision(null);
        setDialogError('');
        // Giữ ngăn chi tiết đang mở và tải lại để thấy ngay nút Duyệt / Từ chối.
        setDrawerVersion((v) => v + 1);
        setReload((n) => n + 1);
        onChanged();
        return;
      }
      if (decision.type === 'approve') await adminService.approveChangeRequest(decision.request.id, reason || undefined);
      else await adminService.rejectChangeRequest(decision.request.id, reason);
      notify('success', decision.type === 'approve' ? 'Đã duyệt và cập nhật dữ liệu chính thức.' : 'Đã từ chối yêu cầu thay đổi.');
      setDecision(null);
      setDialogError('');
      setOpenId(null);
      setReload((n) => n + 1);
      onChanged();
    } catch (err: unknown) {
      setDialogError(getApiErrorMessage(err, 'Không thể xử lý yêu cầu thay đổi.'));
    }
  };

  const ask = (type: Decision['type'], request: ChangeRequestSummary) => {
    setDialogError('');
    setDecision({ type, request });
  };

  const rows = data?.content ?? [];
  const th = 'px-4 py-2.5';
  const td = 'px-4 py-2.5';

  return (
    <>
      <StatusFilter ariaLabel="Trạng thái yêu cầu thay đổi" items={STATUS_ITEMS} value={status} counts={counts} onChange={resetPage(setStatus)} />

      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2.5">
        <FilterSearch value={keyword} onChange={resetPage(setKeyword)} placeholder="Tìm theo tên Homestay hoặc nhà cung cấp..." />
        <CompactSelect label="Đối tượng" value={targetType} options={TARGET_OPTIONS} onChange={resetPage(setTargetType)} />
        <CompactDateRange
          label="Ngày gửi"
          from={from}
          to={to}
          onChange={(f, t) => {
            setFrom(f);
            setTo(t);
            setPage(0);
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
              <th className={th}>Homestay / NCC</th>
              <th className={th}>Đối tượng</th>
              <th className={th}>Nội dung thay đổi</th>
              <th className={th}>Gửi lúc</th>
              <th className={th}>Trạng thái</th>
              <th className={`${th} text-right`}>Thao tác</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/70">
            {rows.map((request) => (
              <tr key={request.id} onClick={() => setOpenId(request.id)} className="cursor-pointer transition-colors duration-150 hover:bg-canvas">
                <td className={td}>
                  <div className="max-w-[240px] truncate font-semibold text-ink-deep" title={request.placeName}>{request.placeName}</div>
                  <div className="max-w-[240px] truncate text-[11px] text-muted">{request.providerName}</div>
                </td>
                <td className={td}>
                  <div className="text-ink">{CHANGE_TARGET_LABEL[request.targetType]}</div>
                  <div className="max-w-[200px] truncate text-[11px] text-muted">
                    {CHANGE_OPERATION_LABEL[request.operation]} · {request.targetName}
                  </div>
                </td>
                <td className={`${td} text-ink`}>
                  <div className="max-w-[280px] truncate" title={request.changeSummary}>{request.changeSummary || '—'}</div>
                </td>
                <td data-label="Gửi lúc" className={`${td} whitespace-nowrap text-ink`}>{fmtDateTime(request.submittedAt)}</td>
                <td className={td}>
                  <StatusBadge tone={CHANGE_STATUS_TONE[request.status]} pulse={request.status === 'PENDING'}>
                    {CHANGE_STATUS_LABEL[request.status]}
                  </StatusBadge>
                </td>
                <td className={`${td} text-right`} onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center justify-end gap-1">
                    <button type="button" onClick={() => setOpenId(request.id)} className={actionButtonClass('brand')}>
                      Xem
                    </button>
                    {request.status === 'PENDING' && (
                      <>
                        <button type="button" onClick={() => ask('approve', request)} className={actionButtonClass('success')}>
                          Duyệt
                        </button>
                        <button type="button" onClick={() => ask('reject', request)} className={actionButtonClass('danger')}>
                          Từ chối
                        </button>
                      </>
                    )}
                    {request.status === 'REJECTED' && (
                      <button type="button" onClick={() => ask('reopen', request)} className={actionButtonClass('warning')}>
                        Xem xét lại
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && rows.length === 0 && !loadError && (
          <div className="py-12 text-center text-xs text-muted">Không có yêu cầu thay đổi nào khớp bộ lọc.</div>
        )}
      </div>

      <TableFooter
        total={data?.totalElements ?? 0}
        activeCount={activeCount}
        onClear={clearFilters}
        page={page}
        totalPages={data?.totalPages ?? 0}
        onPage={setPage}
      />

      {openId !== null && (
        <ChangeRequestDrawer
          key={`${openId}-${drawerVersion}`}
          id={openId}
          onClose={() => setOpenId(null)}
          onApprove={(request) => ask('approve', request)}
          onReject={(request) => ask('reject', request)}
          onReopen={(request) => ask('reopen', request)}
        />
      )}

      {decision?.type === 'reopen' && (
        <ReasonDialog
          title="Xem xét lại yêu cầu đã từ chối"
          description={`Yêu cầu "${decision.request.changeSummary}" của "${decision.request.placeName}" sẽ quay về Chờ duyệt để bạn duyệt hoặc từ chối lại.${
            decision.request.reviewNote ? ` Lý do từ chối trước đây: “${decision.request.reviewNote}”.` : ''
          } Có thể ghi chú lý do xem xét lại (không bắt buộc).`}
          finalConfirm={`Đưa yêu cầu của "${decision.request.placeName}" về Chờ duyệt. Kết quả từ chối cũ vẫn được lưu trong nhật ký hoạt động.`}
          confirmLabel="Xem xét lại"
          reasonRequired={false}
          tone="primary"
          error={dialogError}
          onCancel={() => setDecision(null)}
          onConfirm={confirm}
        />
      )}

      {decision && decision.type !== 'reopen' && (
        <ReasonDialog
          title={decision.type === 'approve' ? 'Duyệt thay đổi' : 'Từ chối thay đổi'}
          description={
            decision.type === 'approve'
              ? `Nội dung mới sẽ được ghi vào dữ liệu chính thức của "${decision.request.placeName}" (${decision.request.changeSummary}).`
              : `Yêu cầu của "${decision.request.placeName}" sẽ bị từ chối, dữ liệu chính thức giữ nguyên. Lý do sẽ được lưu lại.`
          }
          confirmLabel={decision.type === 'approve' ? 'Duyệt và cập nhật' : 'Từ chối'}
          reasonRequired={decision.type === 'reject'}
          reasonRequiredMessage="Vui lòng nhập lý do từ chối."
          finalConfirm={
            decision.type === 'reject'
              ? `Bạn sắp từ chối yêu cầu thay đổi của "${decision.request.placeName}". Dữ liệu chính thức giữ nguyên, nhà cung cấp được báo kết quả và không thể hoàn tác thao tác này.`
              : `Bạn sắp duyệt yêu cầu thay đổi của "${decision.request.placeName}" (${decision.request.changeSummary}). Nội dung mới được ghi vào dữ liệu chính thức và nhà cung cấp được báo kết quả.`
          }
          hideReason={decision.type === 'approve'}
          tone={decision.type === 'reject' ? 'danger' : 'primary'}
          error={dialogError}
          onCancel={() => setDecision(null)}
          onConfirm={confirm}
        />
      )}
    </>
  );
}

interface ChangeRequestDrawerProps {
  id: number;
  onClose: () => void;
  onApprove: (request: ChangeRequestSummary) => void;
  onReject: (request: ChangeRequestSummary) => void;
  onReopen: (request: ChangeRequestSummary) => void;
}

function ContextItem({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={`min-w-0 ${wide ? 'col-span-2' : ''}`}>
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted">{label}</dt>
      <dd className="mt-0.5 break-words text-ink">{children || '—'}</dd>
    </div>
  );
}

function ContextGroup({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children: ReactNode }) {
  return (
    <div className="px-3 py-2.5">
      <p className="mb-2 flex items-center gap-1.5 text-[11px] font-bold text-ink-deep">
        <Icon className="h-3.5 w-3.5 text-primary" aria-hidden /> {title}
      </p>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">{children}</dl>
    </div>
  );
}

/** Ngữ cảnh xét duyệt: nhà cung cấp gửi yêu cầu, Homestay và loại phòng hiện tại (nếu yêu cầu liên quan phòng / giá). */
function ChangeContextCard({ context: { provider, homestay, room } }: { context: ChangeContext }) {
  if (!provider && !homestay && !room) return null;
  const providerStatus = provider?.status ? PROVIDER_STATUS[provider.status] : null;
  return (
    <section aria-label="Thông tin xét duyệt" className="mb-4 divide-y divide-border rounded-lg border border-border bg-white shadow-sm">
      {provider && (
        <ContextGroup icon={Building2} title="Nhà cung cấp">
          <ContextItem label="Tên nhà cung cấp" wide>
            <span className="inline-flex flex-wrap items-center gap-1.5">
              <span className="font-semibold text-ink-deep">{provider.name}</span>
              {providerStatus && <StatusBadge tone={providerStatus.tone}>{providerStatus.label}</StatusBadge>}
            </span>
          </ContextItem>
          <ContextItem label="Người đại diện">{provider.contactName}</ContextItem>
          <ContextItem label="Số điện thoại">{provider.contactPhone}</ContextItem>
          <ContextItem label="Email" wide>{provider.contactEmail}</ContextItem>
          <ContextItem label="Địa chỉ" wide>{provider.address}</ContextItem>
        </ContextGroup>
      )}
      {homestay && (
        <ContextGroup icon={Home} title="Homestay">
          <ContextItem label="Tên Homestay" wide><span className="font-semibold text-ink-deep">{homestay.name}</span></ContextItem>
          <ContextItem label="Khu vực">{homestay.regionName}</ContextItem>
          <ContextItem label="Số loại phòng">{String(homestay.roomTypeCount)}</ContextItem>
          <ContextItem label="Địa chỉ" wide>{homestay.address}</ContextItem>
          <ContextItem label="Hiển thị">
            {homestay.visibility && <StatusBadge tone={VISIBILITY_TONE[homestay.visibility]}>{VISIBILITY_LABEL[homestay.visibility]}</StatusBadge>}
          </ContextItem>
          <ContextItem label="Kiểm duyệt">
            {homestay.verification && <StatusBadge tone={VERIFICATION_TONE[homestay.verification]}>{VERIFICATION_LABEL[homestay.verification]}</StatusBadge>}
          </ContextItem>
        </ContextGroup>
      )}
      {room && (
        <ContextGroup icon={BedDouble} title="Loại phòng hiện tại">
          <ContextItem label="Tên loại phòng" wide>
            <span className="inline-flex flex-wrap items-center gap-1.5">
              <span className="font-semibold text-ink-deep">{room.name}</span>
              <StatusBadge tone={room.status === 'ACTIVE' ? 'success' : 'neutral'}>{room.status === 'ACTIVE' ? 'Mở bán' : 'Ngừng bán'}</StatusBadge>
            </span>
          </ContextItem>
          <ContextItem label="Tổng số phòng">{String(room.totalRoomCount)}</ContextItem>
          <ContextItem label="Khách tối đa mỗi phòng">{String(room.maxOccupancy)}</ContextItem>
          <ContextItem label="Giá ngày thường / phòng / đêm">{room.basePrice != null ? vnd(room.basePrice) : ''}</ContextItem>
          <ContextItem label="Giá cuối tuần (T7, CN)">{room.weekendPrice != null ? vnd(room.weekendPrice) : 'Bằng giá ngày thường'}</ContextItem>
        </ContextGroup>
      )}
    </section>
  );
}

/** Ngăn bên phải: so sánh nội dung cũ và mới của một yêu cầu thay đổi. */
function ChangeRequestDrawer({ id, onClose, onApprove, onReject, onReopen }: ChangeRequestDrawerProps) {
  const [detail, setDetail] = useState<ChangeRequestDetail | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    adminService
      .getChangeRequest(id)
      .then((d) => {
        if (alive) setDetail(d);
      })
      .catch((err: unknown) => {
        if (alive) setError(getApiErrorMessage(err, 'Không tải được chi tiết yêu cầu thay đổi.'));
      });
    return () => {
      alive = false;
    };
  }, [id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const summary = detail?.summary;
  const changedCount = detail?.fields.filter((f) => f.changed).length ?? 0;

  return (
    <OverlayPortal>
      <div className="admin-overlay-shell z-[9998] flex justify-end bg-ink-deep/40 backdrop-blur-[2px] fade-in-overlay" onClick={onClose}>
        <aside
          role="dialog"
          aria-modal="true"
          aria-label="Chi tiết yêu cầu thay đổi"
          onClick={(e) => e.stopPropagation()}
          className="admin-drawer flex h-full min-h-0 w-full min-w-0 max-w-lg flex-col bg-white shadow-xl panel-slide-in"
        >
          <header className="flex shrink-0 items-start gap-3 border-b border-border px-4 py-3 sm:px-5 sm:py-4">
            <div className="min-w-0 flex-1">
              <h3 className="break-words font-display text-base font-bold leading-snug text-ink-deep">{summary?.placeName ?? 'Yêu cầu thay đổi'}</h3>
              {summary && (
                <>
                  <p className="break-words text-[11px] text-muted">
                    {summary.providerName} · gửi {fmtDateTime(summary.submittedAt)} bởi {summary.submittedByName ?? '—'}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <StatusBadge tone={CHANGE_STATUS_TONE[summary.status]} pulse={summary.status === 'PENDING'}>
                      {CHANGE_STATUS_LABEL[summary.status]}
                    </StatusBadge>
                    <span className="inline-flex items-center rounded-md bg-primary-50 px-2 py-0.5 text-[11px] font-semibold text-primary">
                      {CHANGE_TARGET_LABEL[summary.targetType]} · {CHANGE_OPERATION_LABEL[summary.operation]}
                    </span>
                  </div>
                </>
              )}
            </div>
            <button type="button" onClick={onClose} aria-label="Đóng" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-hover hover:text-ink">
              <X className="h-5 w-5" />
            </button>
          </header>

          <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain break-words px-4 py-4 sm:px-5">
            {error && (
              <div role="alert" className="mb-3 flex items-center gap-2 rounded-md border border-danger/30 bg-danger/5 p-2.5 text-xs text-danger">
                <AlertTriangle className="h-4 w-4" /> {error}
              </div>
            )}
            {!detail && !error && (
              <div className="flex flex-col gap-2" aria-busy="true">
                <div className="h-3 w-24 animate-pulse rounded-sm bg-canvas" />
                <div className="h-24 animate-pulse rounded-md bg-canvas" />
              </div>
            )}
            {detail?.stale && (
              <p role="alert" className="mb-3 rounded-md bg-sun/10 px-3 py-2 text-[11px] text-amber-700">
                Dữ liệu chính thức đã thay đổi kể từ lúc nhà cung cấp gửi yêu cầu, nội dung "Hiện tại" bên dưới có thể không còn khớp.
              </p>
            )}
            {detail?.context && <ChangeContextCard context={detail.context} />}
            {detail && (
              <p className="mb-3 text-[11px] text-muted">
                {changedCount > 0 ? (
                  <>
                    <strong className="tabular-nums text-primary">{changedCount}</strong> / {detail.fields.length} trường thay đổi · các trường còn lại giữ nguyên
                  </>
                ) : (
                  'Yêu cầu không có trường nào khác với dữ liệu hiện tại.'
                )}
              </p>
            )}
            {/* Toàn bộ trường theo thứ tự: trường thay đổi so sánh cũ / mới, trường không đổi hiển thị một giá trị. */}
            <div className="flex flex-col gap-2">
              {detail?.fields.map((field) =>
                field.changed ? (
                  <section key={field.field} className="rounded-md border border-primary/40 shadow-xs">
                    <h4 className="flex items-center justify-between gap-2 border-b border-primary/20 bg-primary-50 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-primary">
                      {field.label}
                      <span className="rounded-sm bg-primary px-1.5 py-px text-[9px] font-bold tracking-wide text-white">Thay đổi</span>
                    </h4>
                    <div className="grid grid-cols-2 gap-3 px-3 py-2 text-xs">
                      <div className="min-w-0">
                        <div className="text-[10px] font-semibold uppercase tracking-wide text-muted">Hiện tại</div>
                        <p className="mt-0.5 whitespace-pre-line break-words text-ink line-through decoration-muted/60">{field.before || '—'}</p>
                      </div>
                      <div className="min-w-0">
                        <div className="text-[10px] font-semibold uppercase tracking-wide text-primary">Đề xuất mới</div>
                        <p className="mt-0.5 whitespace-pre-line break-words font-semibold text-ink-deep">{field.after || '—'}</p>
                        {field.field === 'photos' && <PendingPhotos photos={detail?.after?.photos} />}
                      </div>
                    </div>
                  </section>
                ) : (
                  <div key={field.field} className="grid grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] gap-3 rounded-md border border-border/70 px-3 py-2 text-xs">
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">{field.label}</span>
                    <span className="whitespace-pre-line break-words text-ink">{field.after || '—'}</span>
                  </div>
                ),
              )}
            </div>
            {summary?.reviewedAt && (
              <p className="mt-4 rounded-md bg-canvas px-3 py-2 text-[11px] text-muted">
                Xử lý {fmtDateTime(summary.reviewedAt)} bởi {summary.reviewedByName ?? 'hệ thống'}
                {summary.reviewNote ? ` — ${summary.reviewNote}` : ''}
              </p>
            )}
          </div>

          {summary?.status === 'PENDING' && (
            <footer className="flex shrink-0 flex-wrap items-center gap-2 border-t border-border bg-canvas/60 px-4 py-3 sm:px-5">
              <button
                type="button"
                onClick={() => onApprove(summary)}
                className="flex h-11 flex-1 items-center justify-center gap-1.5 rounded-md bg-accent px-3 text-sm font-semibold text-white shadow-xs transition-all duration-150 active:scale-[0.98] hover:bg-accent-600 sm:h-9 sm:text-xs"
              >
                <CheckCircle2 className="h-4 w-4" /> Duyệt
              </button>
              <button
                type="button"
                onClick={() => onReject(summary)}
                className="flex h-11 flex-1 items-center justify-center gap-1.5 rounded-md border border-danger/40 bg-white px-3 text-sm font-semibold text-danger transition-colors active:scale-[0.98] hover:bg-danger/5 sm:h-9 sm:text-xs"
              >
                <XCircle className="h-4 w-4" /> Từ chối
              </button>
            </footer>
          )}

          {/* Yêu cầu đã từ chối: chạm để xem xét lại (đưa về Chờ duyệt rồi duyệt / từ chối lại). */}
          {summary?.status === 'REJECTED' && (
            <footer className="flex shrink-0 flex-col gap-2 border-t border-border bg-canvas/60 px-4 py-3 sm:px-5">
              <button
                type="button"
                onClick={() => onReopen(summary)}
                className="flex h-11 w-full items-center justify-center gap-1.5 rounded-md bg-primary px-3 text-sm font-semibold text-white shadow-xs transition-all duration-150 active:scale-[0.98] hover:bg-primary-600 sm:h-9 sm:text-xs"
              >
                <RotateCcw className="h-4 w-4" /> Xem xét lại yêu cầu
              </button>
            </footer>
          )}
        </aside>
      </div>
    </OverlayPortal>
  );
}

/** Ảnh NCC chọn khi tạo loại phòng mới (payload "photos"): gắn vào phòng khi duyệt, Admin xem trước tại đây. */
function PendingPhotos({ photos }: { photos: unknown }) {
  const urls = Array.isArray(photos)
    ? photos.map((p) => (p && typeof p === 'object' ? (p as { url?: unknown }).url : null)).filter((u): u is string => typeof u === 'string' && u.length > 0)
    : [];
  if (!urls.length) return null;
  return (
    <div className="mt-1.5 grid grid-cols-3 gap-1.5">
      {urls.map((url, i) => (
        <a key={url} href={url} target="_blank" rel="noreferrer" className="relative block aspect-square overflow-hidden rounded-sm border border-border">
          <img src={url} alt={`Ảnh phòng ${i + 1}`} loading="lazy" className="h-full w-full object-cover" />
          {i === 0 && <span className="absolute left-1 top-1 rounded-sm bg-ink-deep/70 px-1 py-px text-[9px] font-bold text-white">Đại diện</span>}
        </a>
      ))}
    </div>
  );
}
