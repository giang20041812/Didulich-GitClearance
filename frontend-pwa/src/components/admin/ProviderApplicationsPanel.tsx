import { useCallback, useEffect, useState, type ReactNode } from 'react';
import axios from 'axios';
import { AlertTriangle, Briefcase, CalendarDays, CheckCircle2, FileText, Mail, MapPin, Phone, RotateCcw, UserRound, X, XCircle, type LucideIcon } from 'lucide-react';
import type { ProviderServiceType } from '@/types/partner';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useAdminPermission } from '@/hooks/useAdminPermission';
import { adminService } from '@/services/adminService';
import { getApiErrorMessage } from '@/lib/apiError';
import type { PageResponse, PlaceShowcase } from '@/types/admin';
import type { ProviderApplicationDetail, ProviderApplicationStatus, ProviderApplicationSummary } from '@/types/providerApplication';
import {
  CompactDateRange,
  CompactSelect,
  FilterSearch,
  ReasonDialog,
  RefreshButton,
  SortSelect,
  TableFooter,
  type SortOption,
} from './AdminFilters';
import { StatusBadge, type StatusTone } from './StatusBadge';
import StatusFilter, { type StatusFilterItem } from './StatusFilter';
import { STATUS_COLOR } from './statusColor';
import { useUrlStatus } from '@/hooks/useUrlStatus';
import {
  EXPERIENCE_TYPES, GUIDE_LANGUAGES, PROPERTY_TYPES, PROVIDER_SERVICES, VEHICLE_TYPES, codeLabel, providerServiceByType, type CodeOption,
} from '@/components/layout/providerServices';
import { useStatusCounts } from '@/hooks/useStatusCounts';
import { actionButtonClass } from './statusStyles';
import OverlayPortal from './OverlayPortal';
import Avatar from './Avatar';
import PlaceShowcaseSections from './PlaceShowcaseSections';

interface ProviderApplicationsPanelProps {
  notify: (type: 'success' | 'error', text: string) => void;
  /** Gọi sau khi duyệt/từ chối: cập nhật số đếm ở tab và (khi duyệt) danh sách đối tác. */
  onChanged: (approved: boolean) => void;
}

const PAGE_SIZE = 15;

const STATUS_LABEL: Record<ProviderApplicationStatus, string> = { PENDING: 'Chờ duyệt', APPROVED: 'Đã duyệt', REJECTED: 'Đã từ chối' };
const STATUS_TONE: Record<ProviderApplicationStatus, StatusTone> = { PENDING: 'warning', APPROVED: 'success', REJECTED: 'danger' };
/** Tab trạng thái hồ sơ NCC = provider_application.status (mặc định "Chờ duyệt"). */
const STATUS_ITEMS: StatusFilterItem<ProviderApplicationStatus>[] = [
  { value: 'PENDING', label: STATUS_LABEL.PENDING, tone: STATUS_COLOR.yellow },
  { value: 'APPROVED', label: STATUS_LABEL.APPROVED, tone: STATUS_COLOR.green },
  { value: 'REJECTED', label: STATUS_LABEL.REJECTED, tone: STATUS_COLOR.red },
];
const STATUS_VALUES = STATUS_ITEMS.map((i) => i.value);
const SORT_OPTIONS: SortOption[] = [
  { value: 'asc', label: 'Cũ nhất trước' },
  { value: 'desc', label: 'Mới nhất trước' },
];
const DEFAULT_SORT_DIR: 'asc' | 'desc' = 'asc';
const SERVICE_TYPE_OPTIONS = [
  { value: '' as const, label: 'Tất cả' },
  ...PROVIDER_SERVICES.map((option) => ({ value: option.type, label: option.label })),
];

const fmtDateTime = (d?: string | null) => (d ? new Date(d).toLocaleString('vi-VN') : '—');

/** `reopen` = xem xét lại hồ sơ đã từ chối (đưa về Chờ duyệt), chỉ áp dụng từng hồ sơ. */
type Decision =
  | { type: 'approve' | 'reject' | 'reopen'; kind: 'single'; application: ProviderApplicationSummary }
  | { type: 'approve' | 'reject'; kind: 'bulk'; ids: number[] };

/** Hồ sơ đăng ký NCC mới: Admin xem thông tin, thẩm định rồi Duyệt (tạo đối tác + tài khoản) hoặc Từ chối (bắt buộc lý do). */
export default function ProviderApplicationsPanel({ notify, onChanged }: ProviderApplicationsPanelProps) {
  // Admin cấp 3 chỉ xem; duyệt / từ chối từ cấp 2 (backend cũng chặn).
  const canOperate = useAdminPermission().can('operate');
  const [keyword, setKeyword] = useState('');
  const [serviceType, setServiceType] = useState<ProviderServiceType | ''>('');
  const [status, setStatus] = useUrlStatus<ProviderApplicationStatus>(STATUS_VALUES, 'PENDING');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>(DEFAULT_SORT_DIR);
  const [page, setPage] = useState(0);

  const [data, setData] = useState<PageResponse<ProviderApplicationSummary> | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [reload, setReload] = useState(0);
  const [openId, setOpenId] = useState<number | null>(null);
  // Tăng để ngăn chi tiết tải lại dữ liệu (vd. sau khi xem xét lại hồ sơ).
  const [drawerVersion, setDrawerVersion] = useState(0);
  const [decision, setDecision] = useState<Decision | null>(null);
  const [dialogError, setDialogError] = useState('');
  // Hồ sơ đang chọn để duyệt/từ chối hàng loạt — chỉ áp dụng cho hồ sơ ở trạng thái Chờ duyệt.
  const [selected, setSelected] = useState<number[]>([]);

  const debouncedKeyword = useDebouncedValue(keyword);
  const activeCount = [debouncedKeyword, from || to, serviceType].filter(Boolean).length;

  const resetPage = <T,>(setter: (v: T) => void) => (v: T) => {
    setter(v);
    setPage(0);
    setSelected([]);
  };

  const clearFilters = () => {
    setKeyword('');
    setServiceType('');
    setFrom('');
    setTo('');
    setSortDir(DEFAULT_SORT_DIR);
    setPage(0);
    setSelected([]);
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
        await adminService.getProviderApplications({
          status: status || undefined,
          serviceType: serviceType || undefined,
          keyword: debouncedKeyword.trim() || undefined,
          from: from || undefined,
          to: to || undefined,
          sortDir,
          page,
          size: PAGE_SIZE,
        }),
      );
    } catch (err: unknown) {
      setLoadError(getApiErrorMessage(err, 'Không tải được danh sách hồ sơ đăng ký. Vui lòng kiểm tra kết nối máy chủ và thử lại.'));
    } finally {
      setLoading(false);
    }
  }, [status, serviceType, debouncedKeyword, from, to, sortDir, page]);

  useEffect(() => {
    void load();
  }, [load, reload]);

  /** Số lượng trên từng tab: áp dụng cùng từ khóa / ngày gửi, chỉ khác trạng thái. */
  const counts = useStatusCounts(
    STATUS_VALUES,
    async (s) =>
      (
        await adminService.getProviderApplications({
          status: s || undefined,
          serviceType: serviceType || undefined,
          keyword: debouncedKeyword.trim() || undefined,
          from: from || undefined,
          to: to || undefined,
          page: 0,
          size: 1,
        })
      ).totalElements,
    JSON.stringify([debouncedKeyword.trim(), from, to, serviceType]),
    reload,
  );

  const confirm = async (reason: string) => {
    if (!decision) return;
    if (decision.type === 'reject' && !reason) {
      setDialogError('Vui lòng nhập lý do từ chối');
      return;
    }
    try {
      if (decision.type === 'reopen' && decision.kind === 'single') {
        await adminService.reopenProviderApplication(decision.application.id, reason || undefined);
        notify('success', `Đã đưa hồ sơ "${decision.application.businessName}" về Chờ duyệt — bạn có thể duyệt hoặc từ chối lại.`);
        onChanged(false);
        setDecision(null);
        setDialogError('');
        // Giữ ngăn chi tiết đang mở và tải lại để thấy ngay nút Duyệt / Từ chối.
        setDrawerVersion((v) => v + 1);
        setReload((n) => n + 1);
        return;
      }
      if (decision.kind === 'single') {
        if (decision.type === 'approve') await adminService.approveProviderApplication(decision.application.id, reason || undefined);
        else await adminService.rejectProviderApplication(decision.application.id, reason);
        notify('success', decision.type === 'approve' ? 'Đã phê duyệt hồ sơ Nhà cung cấp' : 'Đã từ chối hồ sơ Nhà cung cấp');
        onChanged(decision.type === 'approve');
      } else {
        const result =
          decision.type === 'approve'
            ? await adminService.bulkApproveProviderApplications(decision.ids, reason || undefined)
            : await adminService.bulkRejectProviderApplications(decision.ids, reason);
        const okCount = result.succeededIds.length;
        const failCount = result.failed.length;
        const failDetail = result.failed.map((f) => `#${f.id}: ${f.message}`).join(' · ');
        if (failCount === 0) {
          notify('success', decision.type === 'approve' ? `Đã phê duyệt ${okCount} hồ sơ Nhà cung cấp` : `Đã từ chối ${okCount} hồ sơ Nhà cung cấp`);
        } else if (okCount > 0) {
          notify('error', `Xử lý được ${okCount} hồ sơ, còn ${failCount} hồ sơ lỗi — ${failDetail}`);
        } else {
          notify('error', `Không xử lý được hồ sơ nào — ${failDetail}`);
        }
        if (okCount > 0) onChanged(decision.type === 'approve');
        setSelected([]);
      }
      setDecision(null);
      setDialogError('');
      setOpenId(null);
      setReload((n) => n + 1);
    } catch (err: unknown) {
      if (axios.isAxiosError(err) && err.response?.status === 403) {
        setDialogError('Không có quyền kiểm duyệt hồ sơ này');
      } else {
        setDialogError(getApiErrorMessage(err, 'Không thể xử lý hồ sơ đăng ký.'));
      }
    }
  };

  const ask = (type: Decision['type'], application: ProviderApplicationSummary) => {
    setDialogError('');
    setDecision({ type, kind: 'single', application });
  };

  const askBulk = (type: 'approve' | 'reject') => {
    setDialogError('');
    setDecision({ type, kind: 'bulk', ids: selected });
  };

  const rows = data?.content ?? [];
  // Chỉ hồ sơ Chờ duyệt mới chọn được để duyệt/từ chối hàng loạt.
  const pendingRows = rows.filter((r) => r.status === 'PENDING');
  const allSelected = pendingRows.length > 0 && pendingRows.every((r) => selected.includes(r.id));
  const toggleAll = () => setSelected(allSelected ? [] : pendingRows.map((r) => r.id));
  const toggleOne = (id: number) => setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  const th = 'px-4 py-2.5';
  const td = 'px-4 py-2.5';

  return (
    <>
      <StatusFilter ariaLabel="Trạng thái hồ sơ đăng ký" items={STATUS_ITEMS} value={status} counts={counts} onChange={resetPage(setStatus)} />

      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2.5">
        <FilterSearch value={keyword} onChange={resetPage(setKeyword)} placeholder="Tìm theo tên cơ sở, người liên hệ, SĐT hoặc email..." />
        <CompactSelect label="Loại hình" value={serviceType} options={SERVICE_TYPE_OPTIONS} onChange={resetPage(setServiceType)} />
        <CompactDateRange
          label="Ngày gửi"
          from={from}
          to={to}
          onChange={(f, t) => {
            setFrom(f);
            setTo(t);
            setPage(0);
            setSelected([]);
          }}
        />
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <SortSelect
            value={sortDir}
            options={SORT_OPTIONS}
            onChange={(v) => {
              setSortDir(v === 'desc' ? 'desc' : 'asc');
              setPage(0);
              setSelected([]);
            }}
          />
          <RefreshButton loading={loading} onClick={reloadFromStart} />
        </div>
      </div>

      {canOperate && selected.length > 0 && (
        <div className="rise-in flex flex-wrap items-center gap-2 border-b border-primary/20 bg-primary-50 px-4 py-2 text-xs">
          <strong className="text-primary">Đã chọn {selected.length} hồ sơ</strong>
          <button
            type="button"
            onClick={() => askBulk('approve')}
            className="flex h-7 items-center gap-1 rounded-md bg-accent px-2.5 font-semibold text-white transition-colors hover:bg-accent-600"
          >
            <CheckCircle2 className="h-3.5 w-3.5" /> Duyệt tất cả
          </button>
          <button
            type="button"
            onClick={() => askBulk('reject')}
            className="flex h-7 items-center gap-1 rounded-md border border-danger/40 bg-white px-2.5 font-semibold text-danger transition-colors hover:bg-danger/5"
          >
            <XCircle className="h-3.5 w-3.5" /> Từ chối tất cả
          </button>
          <button type="button" onClick={() => setSelected([])} className="ml-auto flex items-center gap-1 text-muted hover:text-ink">
            <X className="h-3.5 w-3.5" /> Bỏ chọn
          </button>
        </div>
      )}

      {loadError && (
        <div role="alert" className="border-b border-danger/20 bg-danger/5 px-4 py-2.5 text-xs text-danger">
          {loadError}
        </div>
      )}

      <div className={`overflow-x-auto transition-opacity duration-200 ${loading ? 'opacity-60' : ''}`}>
        <table className="admin-stack w-full border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-border bg-canvas/60 text-[11px] font-semibold uppercase tracking-wide text-muted">
              {canOperate && (
                <th className={`${th} w-10`}>
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAll}
                    disabled={pendingRows.length === 0}
                    aria-label="Chọn tất cả hồ sơ chờ duyệt"
                    className="accent-[var(--color-primary)] disabled:opacity-30"
                  />
                </th>
              )}
              <th className={th}>Cơ sở đăng ký</th>
              <th className={th}>Liên hệ</th>
              <th className={th}>Gửi lúc</th>
              <th className={th}>Trạng thái</th>
              <th className={`${th} text-right`}>Thao tác</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/70">
            {rows.map((application) => {
              const isSel = selected.includes(application.id);
              return (
              <tr
                key={application.id}
                onClick={() => setOpenId(application.id)}
                className={`cursor-pointer transition-colors duration-150 ${isSel ? 'bg-primary-50/60' : 'hover:bg-canvas'}`}
              >
                {canOperate && (
                  <td className={td} onClick={(e) => e.stopPropagation()}>
                    {application.status === 'PENDING' && (
                      <input
                        type="checkbox"
                        checked={isSel}
                        onChange={() => toggleOne(application.id)}
                        aria-label={`Chọn ${application.businessName}`}
                        className="accent-[var(--color-primary)]"
                      />
                    )}
                  </td>
                )}
                <td className={td}>
                  <div className="flex items-center gap-2.5">
                    <img
                      src={providerServiceByType(application.serviceType).image}
                      alt=""
                      aria-hidden
                      width={28}
                      height={28}
                      className="h-7 w-7 shrink-0 object-contain"
                    />
                    <div className="min-w-0">
                      <div className="max-w-[260px] truncate font-semibold text-ink-deep" title={application.businessName}>{application.businessName}</div>
                      <div className="max-w-[260px] truncate text-[11px] text-muted" title={application.address}>
                        #{application.id} · {providerServiceByType(application.serviceType).label} · {application.address}
                      </div>
                    </div>
                  </div>
                </td>
                <td className={td}>
                  <div className="text-ink">{application.contactName}</div>
                  <div className="text-[11px] text-muted">{[application.contactPhone, application.contactEmail].filter(Boolean).join(' · ')}</div>
                </td>
                <td data-label="Gửi lúc" className={`${td} whitespace-nowrap text-ink`}>{fmtDateTime(application.createdAt)}</td>
                <td className={td}>
                  <StatusBadge tone={STATUS_TONE[application.status]} pulse={application.status === 'PENDING'}>
                    {STATUS_LABEL[application.status]}
                  </StatusBadge>
                </td>
                <td className={`${td} text-right`} onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center justify-end gap-1">
                    <button type="button" onClick={() => setOpenId(application.id)} className={actionButtonClass('brand')}>
                      Xem
                    </button>
                    {canOperate && application.status === 'PENDING' && (
                      <>
                        <button type="button" onClick={() => ask('approve', application)} className={actionButtonClass('success')}>
                          Duyệt
                        </button>
                        <button type="button" onClick={() => ask('reject', application)} className={actionButtonClass('danger')}>
                          Từ chối
                        </button>
                      </>
                    )}
                    {canOperate && application.status === 'REJECTED' && (
                      <button type="button" onClick={() => ask('reopen', application)} className={actionButtonClass('warning')}>
                        Xem xét lại
                      </button>
                    )}
                  </div>
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
        {!loading && rows.length === 0 && !loadError && (
          <div className="py-12 text-center text-xs text-muted">Không có hồ sơ đăng ký nào khớp bộ lọc.</div>
        )}
      </div>

      <TableFooter
        total={data?.totalElements ?? 0}
        activeCount={activeCount}
        onClear={clearFilters}
        page={page}
        totalPages={data?.totalPages ?? 0}
        onPage={(p) => {
          setPage(p);
          setSelected([]);
        }}
      />

      {openId !== null && (
        <ApplicationDrawer
          key={`${openId}-${drawerVersion}`}
          id={openId}
          canOperate={canOperate}
          onClose={() => setOpenId(null)}
          onApprove={(application) => ask('approve', application)}
          onReject={(application) => ask('reject', application)}
          onReopen={(application) => ask('reopen', application)}
        />
      )}

      {decision?.type === 'reopen' && decision.kind === 'single' && (
        <ReasonDialog
          title="Xem xét lại hồ sơ đã từ chối"
          description={`Hồ sơ "${decision.application.businessName}" sẽ quay về trạng thái Chờ duyệt để bạn duyệt hoặc từ chối lại.${
            decision.application.reviewNote ? ` Lý do từ chối trước đây: “${decision.application.reviewNote}”.` : ''
          } Có thể ghi chú lý do xem xét lại (không bắt buộc).`}
          finalConfirm={`Đưa hồ sơ "${decision.application.businessName}" về Chờ duyệt. Kết quả từ chối cũ vẫn được lưu trong nhật ký hoạt động.`}
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
          title={
            decision.kind === 'bulk'
              ? decision.type === 'approve'
                ? `Duyệt ${decision.ids.length} hồ sơ đối tác`
                : `Từ chối ${decision.ids.length} hồ sơ đối tác`
              : decision.type === 'approve'
              ? 'Duyệt hồ sơ đối tác'
              : 'Từ chối hồ sơ đối tác'
          }
          description={
            decision.kind === 'bulk'
              ? decision.type === 'approve'
                ? `Hệ thống sẽ tạo đối tác và tài khoản đăng nhập cho ${decision.ids.length} hồ sơ đã chọn bằng thông tin và mật khẩu nhà cung cấp đã đăng ký. Hồ sơ không hợp lệ (đã xử lý, SĐT/email trùng...) sẽ được báo lỗi riêng, không ảnh hưởng các hồ sơ còn lại.`
                : `${decision.ids.length} hồ sơ đã chọn sẽ bị từ chối cùng một lý do và nhà cung cấp được thông báo.`
              : decision.type === 'approve'
              ? `Hệ thống sẽ tạo đối tác và tài khoản đăng nhập cho "${decision.application.businessName}" bằng thông tin và mật khẩu nhà cung cấp đã đăng ký.`
              : `Hồ sơ "${decision.application.businessName}" sẽ bị từ chối và nhà cung cấp được thông báo lý do. Nhà cung cấp có thể đăng ký lại.`
          }
          confirmLabel={
            decision.kind === 'bulk'
              ? decision.type === 'approve'
                ? `Duyệt ${decision.ids.length} hồ sơ`
                : `Từ chối ${decision.ids.length} hồ sơ`
              : decision.type === 'approve'
              ? 'Duyệt hồ sơ'
              : 'Từ chối'
          }
          reasonRequired={decision.type === 'reject'}
          reasonRequiredMessage="Vui lòng nhập lý do từ chối"
          finalConfirm={
            decision.type === 'reject'
              ? decision.kind === 'bulk'
                ? `Bạn sắp từ chối ${decision.ids.length} hồ sơ đăng ký nhà cung cấp cùng lúc. Các nhà cung cấp sẽ được báo kết quả kèm lý do và không thể hoàn tác thao tác này.`
                : `Bạn sắp từ chối hồ sơ "${decision.application.businessName}". Nhà cung cấp sẽ được báo kết quả kèm lý do và không thể hoàn tác thao tác này.`
              : decision.kind === 'bulk'
              ? `Bạn sắp duyệt ${decision.ids.length} hồ sơ đăng ký nhà cung cấp cùng lúc. Mỗi hồ sơ hợp lệ được tạo đối tác và tài khoản đăng nhập, nhà cung cấp được báo kết quả.`
              : `Bạn sắp duyệt hồ sơ "${decision.application.businessName}". Hệ thống tạo đối tác và tài khoản đăng nhập, nhà cung cấp được báo kết quả.`
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

interface ApplicationDrawerProps {
  id: number;
  canOperate: boolean;
  onClose: () => void;
  onApprove: (application: ProviderApplicationSummary) => void;
  onReject: (application: ProviderApplicationSummary) => void;
  onReopen: (application: ProviderApplicationSummary) => void;
}

function Field({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={`min-w-0 ${wide ? 'col-span-2' : ''}`}>
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted">{label}</dt>
      <dd className="mt-0.5 break-words text-ink">{children}</dd>
    </div>
  );
}

function InfoItem({ icon: Icon, label, children, wide }: { icon: LucideIcon; label: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={`flex min-w-0 items-start gap-2.5 ${wide ? 'col-span-2' : ''}`}>
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary-50 text-primary">
        <Icon className="h-3.5 w-3.5" aria-hidden />
      </span>
      <div className="min-w-0">
        <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted">{label}</dt>
        <dd className="mt-0.5 break-words text-xs text-ink">{children}</dd>
      </div>
    </div>
  );
}

/** Thẻ "Thông tin chung" của hồ sơ nhà cung cấp (dữ liệu từ ApplicationSummaryDto). */
function ProviderInfoCard({ application: a }: { application: ProviderApplicationSummary }) {
  return (
    <section aria-labelledby="provider-info-title" className="rounded-lg border border-border bg-white shadow-sm">
      <h4 id="provider-info-title" className="border-b border-border px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
        Thông tin chung
      </h4>
      <div className="flex items-center gap-3 px-4 pt-4">
        <Avatar name={a.businessName} size="lg" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-sm font-bold text-ink-deep" title={a.businessName}>{a.businessName}</p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <StatusBadge tone={STATUS_TONE[a.status]} pulse={a.status === 'PENDING'}>
              {STATUS_LABEL[a.status]}
            </StatusBadge>
            <span className="text-[11px] text-muted">Mã hồ sơ #{a.id}</span>
          </div>
        </div>
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3.5 p-4">
        <InfoItem icon={FileText} label="Mã số thuế / ĐKKD">{a.businessLicenseNo || 'Chưa cung cấp'}</InfoItem>
        <InfoItem icon={Briefcase} label="Loại hình dịch vụ">
          <span className="inline-flex items-center gap-1.5">
            <img src={providerServiceByType(a.serviceType).image} alt="" aria-hidden width={18} height={18} className="h-[18px] w-[18px] object-contain" />
            {providerServiceByType(a.serviceType).label}
          </span>
        </InfoItem>
        <InfoItem icon={UserRound} label="Người đại diện">{a.contactName}</InfoItem>
        <InfoItem icon={Phone} label="Số điện thoại">
          <a href={`tel:${a.contactPhone}`} className="tabular-nums text-primary hover:underline">{a.contactPhone}</a>
        </InfoItem>
        <InfoItem icon={Mail} label="Email" wide>
          {a.contactEmail ? <a href={`mailto:${a.contactEmail}`} className="text-primary hover:underline">{a.contactEmail}</a> : 'Chưa cung cấp'}
        </InfoItem>
        <InfoItem icon={MapPin} label="Địa chỉ" wide>{a.address}</InfoItem>
        <InfoItem icon={CalendarDays} label="Ngày đăng ký">{fmtDateTime(a.createdAt)}</InfoItem>
        <InfoItem icon={CheckCircle2} label="Trạng thái hồ sơ">
          <StatusBadge tone={STATUS_TONE[a.status]}>{STATUS_LABEL[a.status]}</StatusBadge>
        </InfoItem>
      </dl>
    </section>
  );
}

/** Một dòng câu trả lời riêng; danh sách mã hiện thành các nhãn nhỏ. */
function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[132px_1fr] gap-3 px-4 py-2.5">
      <dt className="text-[11px] font-semibold text-muted">{label}</dt>
      <dd className="min-w-0 break-words text-xs text-ink">{children}</dd>
    </div>
  );
}

function CodeChips({ options, value }: { options: CodeOption[]; value: unknown }) {
  const codes = Array.isArray(value) ? value : [];
  if (codes.length === 0) return <>—</>;
  return (
    <span className="flex flex-wrap gap-1">
      {codes.map((code) => (
        <span key={String(code)} className="rounded-full bg-primary-50 px-2 py-0.5 text-[11px] font-semibold text-primary">
          {codeLabel(options, code)}
        </span>
      ))}
    </span>
  );
}

const text = (value: unknown) => (value === null || value === undefined || value === '' ? '—' : String(value));

/** Câu trả lời riêng của từng loại hình trong mẫu đăng ký (homestay / trải nghiệm / nhà xe). */
function ApplicationDetailsCard({ type, details }: { type: ProviderServiceType; details: Record<string, unknown> | null }) {
  const service = providerServiceByType(type);
  return (
    <section aria-labelledby="provider-details-title" className="mt-4 rounded-lg border border-border bg-white shadow-sm">
      <h4 id="provider-details-title" className="flex items-center gap-2 border-b border-border px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
        <img src={service.image} alt="" aria-hidden width={18} height={18} className="h-[18px] w-[18px] object-contain" />
        Thông tin {service.label.toLowerCase()}
      </h4>
      {!details ? (
        <p className="px-4 py-3 text-xs text-muted">Hồ sơ gửi trước khi mẫu đăng ký có câu hỏi riêng — chưa khai báo.</p>
      ) : (
        <dl className="divide-y divide-border/70">
          {type === 'HOMESTAY' && (
            <>
              <DetailRow label="Loại nhà">{codeLabel(PROPERTY_TYPES, details.propertyType) || '—'}</DetailRow>
              <DetailRow label="Số phòng cho thuê">{text(details.roomCount)}</DetailRow>
              <DetailRow label="Khách tối đa cùng lúc">{text(details.maxGuests)}</DetailRow>
            </>
          )}
          {type === 'EXPERIENCE' && (
            <>
              <DetailRow label="Loại trải nghiệm"><CodeChips options={EXPERIENCE_TYPES} value={details.experienceTypes} /></DetailRow>
              <DetailRow label="Thời lượng mỗi lượt">{details.durationHours != null ? `${String(details.durationHours).replace('.', ',')} giờ` : '—'}</DetailRow>
              <DetailRow label="Khách tối đa mỗi đoàn">{text(details.groupSizeMax)}</DetailRow>
              <DetailRow label="Ngôn ngữ hướng dẫn"><CodeChips options={GUIDE_LANGUAGES} value={details.languages} /></DetailRow>
              <DetailRow label="Số thẻ hướng dẫn viên">{text(details.guideLicenseNo)}</DetailRow>
            </>
          )}
          {type === 'TRANSPORT' && (
            <>
              <DetailRow label="Loại xe"><CodeChips options={VEHICLE_TYPES} value={details.vehicleTypes} /></DetailRow>
              <DetailRow label="Số xe">{text(details.fleetSize)}</DetailRow>
              <DetailRow label="Tuyến chạy chính"><span className="whitespace-pre-line">{text(details.routes)}</span></DetailRow>
              <DetailRow label="GP kinh doanh vận tải">{text(details.transportLicenseNo)}</DetailRow>
            </>
          )}
        </dl>
      )}
    </section>
  );
}

/** Ngăn bên phải: thông tin hồ sơ đăng ký để thẩm định. */
function ApplicationDrawer({ id, canOperate, onClose, onApprove, onReject, onReopen }: ApplicationDrawerProps) {
  const [detail, setDetail] = useState<ProviderApplicationDetail | null>(null);
  const [error, setError] = useState('');
  const [showcase, setShowcase] = useState<PlaceShowcase | null>(null);
  const [showcaseError, setShowcaseError] = useState('');

  useEffect(() => {
    let alive = true;
    adminService
      .getProviderApplication(id)
      .then((d) => {
        if (alive) setDetail(d);
      })
      .catch((err: unknown) => {
        if (alive) setError(getApiErrorMessage(err, 'Không tải được chi tiết hồ sơ đăng ký.'));
      });
    adminService
      .getProviderApplicationShowcase(id)
      .then((s) => {
        if (alive) setShowcase(s);
      })
      .catch((err: unknown) => {
        if (alive) setShowcaseError(getApiErrorMessage(err, 'Không tải được hình ảnh, tiện nghi của hồ sơ.'));
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

  const a = detail?.summary;
  const taken = detail && (detail.phoneTaken || detail.emailTaken);

  return (
    <OverlayPortal>
      <div className="admin-overlay-shell z-[9998] flex justify-end bg-ink-deep/40 backdrop-blur-[2px] fade-in-overlay" onClick={onClose}>
        <aside
          role="dialog"
          aria-modal="true"
          aria-label="Chi tiết hồ sơ đăng ký đối tác"
          onClick={(e) => e.stopPropagation()}
          className="admin-drawer flex h-full min-h-0 w-full min-w-0 max-w-md flex-col bg-white shadow-xl panel-slide-in"
        >
          <header className="flex shrink-0 items-start gap-3 border-b border-border px-4 py-3 sm:px-5 sm:py-4">
            <div className="min-w-0 flex-1">
              <h3 className="break-words font-display text-base font-bold leading-snug text-ink-deep">{a?.businessName ?? 'Hồ sơ đăng ký'}</h3>
              {a && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <StatusBadge tone={STATUS_TONE[a.status]} pulse={a.status === 'PENDING'}>
                    {STATUS_LABEL[a.status]}
                  </StatusBadge>
                </div>
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
            {taken && (
              <p role="alert" className="mb-3 rounded-md bg-danger/5 px-3 py-2 text-[11px] text-danger">
                {[detail.phoneTaken ? 'Số điện thoại' : '', detail.emailTaken ? 'Email' : ''].filter(Boolean).join(' và ')} của hồ sơ đã thuộc một tài khoản khác nên
                không thể duyệt. Hãy từ chối hồ sơ kèm lý do.
              </p>
            )}
            {a && detail && (
              <>
                <ProviderInfoCard application={a} />
                <ApplicationDetailsCard type={a.serviceType} details={detail.details ?? null} />
                <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
                  <Field label="Giới thiệu" wide>
                    <span className="whitespace-pre-line">{detail.description || '—'}</span>
                  </Field>
                </dl>
                {/* Ảnh, tiện nghi, chính sách lưu trú chỉ có ở homestay. */}
                {a.serviceType === 'HOMESTAY' && <PlaceShowcaseSections
                  showcase={showcase}
                  error={showcaseError}
                  name={a.businessName}
                  showStayPolicy
                  note={
                    showcase?.placeId
                      ? <>Hình ảnh, tiện nghi và chính sách lấy theo Homestay <strong className="text-ink">{showcase.placeName}</strong> của đối tác.</>
                      : 'Hồ sơ đăng ký chưa kèm hình ảnh, tiện nghi và chính sách lưu trú; các mục này có sau khi hồ sơ được duyệt và nhà cung cấp tạo Homestay.'
                  }
                />}
              </>
            )}
            {a?.reviewedAt && (
              <p className="mt-4 rounded-md bg-canvas px-3 py-2 text-[11px] text-muted">
                Xử lý {fmtDateTime(a.reviewedAt)} bởi {a.reviewedByName ?? 'quản trị viên'}
                {a.reviewNote ? ` — ${a.reviewNote}` : ''}
                {a.providerId ? ` · Đối tác #${a.providerId}` : ''}
              </p>
            )}
            {a?.status === 'REJECTED' && a.reviewNote && (
              <p className="mt-3 rounded-md border border-danger/20 bg-danger/5 px-3 py-2 text-[11px] text-danger">
                Đã từ chối: “{a.reviewNote}”
              </p>
            )}
          </div>

          {canOperate && a?.status === 'PENDING' && (
            <footer className="flex shrink-0 flex-wrap items-center gap-2 border-t border-border bg-canvas/60 px-4 py-3 sm:px-5">
              {!taken && (
                <button
                  type="button"
                  onClick={() => onApprove(a)}
                  className="flex h-11 flex-1 items-center justify-center gap-1.5 rounded-md bg-accent px-3 text-sm font-semibold text-white shadow-xs transition-all duration-150 active:scale-[0.98] hover:bg-accent-600 sm:h-9 sm:text-xs"
                >
                  <CheckCircle2 className="h-4 w-4" /> Duyệt
                </button>
              )}
              <button
                type="button"
                onClick={() => onReject(a)}
                className="flex h-11 flex-1 items-center justify-center gap-1.5 rounded-md border border-danger/40 bg-white px-3 text-sm font-semibold text-danger transition-colors active:scale-[0.98] hover:bg-danger/5 sm:h-9 sm:text-xs"
              >
                <XCircle className="h-4 w-4" /> Từ chối
              </button>
            </footer>
          )}

          {/* Hồ sơ đã từ chối: chạm để xem xét lại (đưa về Chờ duyệt rồi duyệt / từ chối lại). */}
          {canOperate && a?.status === 'REJECTED' && (
            <footer className="flex shrink-0 flex-col gap-2 border-t border-border bg-canvas/60 px-4 py-3 sm:px-5">
              <button
                type="button"
                onClick={() => onReopen(a)}
                className="flex h-11 w-full items-center justify-center gap-1.5 rounded-md bg-primary px-3 text-sm font-semibold text-white shadow-xs transition-all duration-150 active:scale-[0.98] hover:bg-primary-600 sm:h-9 sm:text-xs"
              >
                <RotateCcw className="h-4 w-4" /> Xem xét lại hồ sơ
              </button>
            </footer>
          )}
        </aside>
      </div>
    </OverlayPortal>
  );
}
