import { useCallback, useEffect, useState } from 'react';
import { Building2, Eye, Lock, Mail, Plus, RotateCcw, Unlock, UserPlus } from 'lucide-react';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useAdminPermission } from '@/hooks/useAdminPermission';
import { adminService } from '@/services/adminService';
import type { AccountStatus, AdminTravelerDto, PageResponse, TravelerSignupMethod } from '@/types/admin';
import {
  CompactDateRange,
  CompactSelect,
  FilterSearch,
  ReasonDialog,
  RefreshButton,
  SortSelect,
  TableFooter,
  type SelectOption,
  type SortOption,
} from './AdminFilters';
import { StatusBadge } from './StatusBadge';
import StatusFilter, { type StatusFilterItem } from './StatusFilter';
import { STATUS_COLOR } from './statusColor';
import { useUrlStatus } from '@/hooks/useUrlStatus';
import { useStatusCounts } from '@/hooks/useStatusCounts';
import AccountDetailDrawer, { type AccountDetailTarget } from './AccountDetailDrawer';
import CreateTravelerModal from './CreateTravelerModal';
import Avatar from './Avatar';
import { GoogleMark } from '@/components/auth/GoogleMark';
import { getApiErrorMessage } from '@/lib/apiError';
import { actionButtonClass } from './statusStyles';
import DeleteAccountDialog, { DeleteAccountButton, type DeleteAccountTarget } from './DeleteAccountDialog';

/**
 * Chỉ hiển thị danh sách tài khoản Khách du lịch (quản lý Admin/NCC hiện không có màn danh sách riêng ở đây).
 * Vẫn cho tạo mới Admin/NCC ngay từ đây — dùng chung 2 modal đã có sẵn ở trang cha (Modal "Tạo Admin mới" và
 * modal "Tạo đối tác NCC & tài khoản đăng nhập" của tab Đối tác/NCC), không tạo form mới trùng lặp.
 */
interface AccountsPanelProps {
  currentAccountId?: number;
  /** Đổi giá trị này để buộc tải lại. */
  refreshKey?: number;
  onCreateAdmin: () => void;
  onCreateProvider: () => void;
  onResetPassword: (account: { id: number; email: string }) => void;
  notify: (type: 'success' | 'error', text: string) => void;
}

const PAGE_SIZE = 15;

/** Trạng thái khách = traveler.status: ACTIVE (Hoạt động) / INACTIVE (Bị khóa). */
const STATUS_ITEMS: StatusFilterItem<AccountStatus>[] = [
  { value: 'ACTIVE', label: 'Hoạt động', tone: STATUS_COLOR.green },
  { value: 'INACTIVE', label: 'Bị khóa', tone: STATUS_COLOR.red },
];
const STATUS_VALUES = STATUS_ITEMS.map((i) => i.value);
const SIGNUP_OPTIONS: SelectOption<TravelerSignupMethod>[] = [
  { value: '', label: 'Tất cả' },
  { value: 'GOOGLE', label: 'Google' },
  { value: 'EMAIL', label: 'Email' },
];
const SORT_OPTIONS: SortOption[] = [
  { value: 'createdAt:desc', label: 'Mới tạo nhất' },
  { value: 'createdAt:asc', label: 'Cũ nhất' },
  { value: 'lastLoginAt:desc', label: 'Đăng nhập gần đây' },
  { value: 'fullName:asc', label: 'Tên A → Z' },
];
const DEFAULT_SORT = 'createdAt:desc';

const formatDate = (iso?: string | null) => (iso ? new Date(iso).toLocaleString('vi-VN') : '—');

const createBtnCls =
  'flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-semibold shadow-xs transition-all duration-200 hover:-translate-y-0.5';

export default function AccountsPanel({ currentAccountId, refreshKey = 0, onCreateAdmin, onCreateProvider, onResetPassword, notify }: AccountsPanelProps) {
  // Nút tạo/khóa theo cấp: tạo Admin chỉ cấp 1; tạo NCC/khách và khóa từ cấp 2; cấp 3 chỉ xem.
  const { can } = useAdminPermission();
  const canOperate = can('operate');
  const [keyword, setKeyword] = useState('');
  const [status, setStatus] = useUrlStatus<AccountStatus>(STATUS_VALUES, '');
  const [signup, setSignup] = useState<TravelerSignupMethod | ''>('');
  const [createdFrom, setCreatedFrom] = useState('');
  const [createdTo, setCreatedTo] = useState('');
  const [sort, setSort] = useState(DEFAULT_SORT);
  const [page, setPage] = useState(0);

  const [travelers, setTravelers] = useState<PageResponse<AdminTravelerDto> | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [reload, setReload] = useState(0);

  const [lockTarget, setLockTarget] = useState<{ id: number; name: string; next: AccountStatus } | null>(null);
  const [lockError, setLockError] = useState('');
  const [detail, setDetail] = useState<AccountDetailTarget | null>(null);
  const [showCreateTraveler, setShowCreateTraveler] = useState(false);
  // Xóa hẳn tài khoản: chỉ quản trị viên cấp 1 (backend cũng chặn).
  const canDelete = can('manageAdmins');
  const [deleteTarget, setDeleteTarget] = useState<DeleteAccountTarget | null>(null);

  const debouncedKeyword = useDebouncedValue(keyword);

  const activeCount = [debouncedKeyword, status, signup, createdFrom || createdTo].filter(Boolean).length;

  // Đổi bất kỳ bộ lọc nào thì về trang đầu.
  const resetPage = <T,>(setter: (v: T) => void) => (v: T) => {
    setter(v);
    setPage(0);
  };

  /** Đặt lại: xóa toàn bộ điều kiện tra cứu đang nhập (kể cả sắp xếp) và đưa danh sách về trạng thái ban đầu. */
  const clearFilters = () => {
    setKeyword('');
    setStatus('');
    setSignup('');
    setCreatedFrom('');
    setCreatedTo('');
    setSort(DEFAULT_SORT);
    setPage(0);
  };

  /** Nút tải lại: đưa màn hình về trạng thái ban đầu (bỏ mọi điều kiện tìm kiếm / lọc / sắp xếp, về tab mặc định, trang 1) rồi tải lại dữ liệu mới nhất. */
  const reloadFromStart = () => {
    clearFilters();
    setReload((n) => n + 1);
  };

  const load = useCallback(async () => {
    const [sortBy, sortDir] = sort.split(':') as [string, 'asc' | 'desc'];
    setLoading(true);
    setLoadError('');
    try {
      setTravelers(
        await adminService.getTravelers({
          status: status || undefined,
          keyword: debouncedKeyword.trim() || undefined,
          createdFrom: createdFrom || undefined,
          createdTo: createdTo || undefined,
          sortBy,
          sortDir,
          page,
          size: PAGE_SIZE,
          signupMethod: signup || undefined,
        }),
      );
    } catch (err: unknown) {
      setLoadError(getApiErrorMessage(err, 'Không tải được danh sách. Vui lòng kiểm tra kết nối máy chủ và thử lại.'));
    } finally {
      setLoading(false);
    }
  }, [status, signup, debouncedKeyword, createdFrom, createdTo, sort, page]);

  useEffect(() => {
    void load();
  }, [load, reload, refreshKey]);

  /** Số lượng trên từng tab: áp dụng cùng ô tìm kiếm / cách đăng ký / khoảng ngày, chỉ khác trạng thái. */
  const counts = useStatusCounts(
    STATUS_VALUES,
    async (s) =>
      (
        await adminService.getTravelers({
          status: s || undefined,
          keyword: debouncedKeyword.trim() || undefined,
          createdFrom: createdFrom || undefined,
          createdTo: createdTo || undefined,
          signupMethod: signup || undefined,
          page: 0,
          size: 1,
        })
      ).totalElements,
    JSON.stringify([debouncedKeyword.trim(), signup, createdFrom, createdTo]),
    reload + refreshKey,
  );

  const confirmLock = async (reason: string) => {
    if (!lockTarget) return;
    if (lockTarget.next === 'INACTIVE' && !reason) {
      setLockError('Vui lòng nhập lý do.');
      return;
    }
    try {
      const body = { status: lockTarget.next, reason: reason || 'Admin mở khóa tài khoản' };
      await adminService.updateTravelerStatus(lockTarget.id, body);
      notify('success', lockTarget.next === 'ACTIVE' ? 'Đã mở khóa tài khoản.' : 'Đã khóa tài khoản.');
      setLockTarget(null);
      setLockError('');
      setReload((n) => n + 1);
    } catch (err: unknown) {
      setLockError(getApiErrorMessage(err, 'Không thể cập nhật trạng thái tài khoản.'));
    }
  };

  const openLock = (id: number, name: string, current: AccountStatus) => {
    setLockError('');
    setLockTarget({ id, name, next: current === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' });
  };

  const total = travelers?.totalElements ?? 0;
  const totalPages = travelers?.totalPages ?? 0;
  const rowsEmpty = !travelers?.content.length;

  const th = 'px-4 py-2.5';
  const td = 'px-4 py-2.5';
  const iconBtn = 'rounded-md p-1.5 text-muted transition-colors';

  return (
    <section className="rounded-lg border border-border bg-white shadow-sm">
      {/* Đầu thẻ: tiêu đề + 3 nút tạo tài khoản cùng hàng */}
      <header className="flex flex-wrap items-center justify-between gap-3 px-4 pt-4 pb-3">
        <h3 className="font-display text-sm font-bold text-ink-deep">Khách du lịch</h3>
        <div className="flex flex-wrap items-center gap-2">
          {can('manageAdmins') && (
            <button type="button" onClick={onCreateAdmin} className={`${createBtnCls} border border-primary text-primary hover:bg-primary-50`}>
              <Plus className="h-4 w-4" /> Tạo Admin
            </button>
          )}
          {canOperate && (
            <>
              <button type="button" onClick={onCreateProvider} className={`${createBtnCls} border border-sun/50 text-amber-700 hover:bg-sun/10`}>
                <Building2 className="h-4 w-4" /> Tạo NCC
              </button>
              <button type="button" onClick={() => setShowCreateTraveler(true)} className={`${createBtnCls} bg-secondary text-white hover:bg-secondary-600`}>
                <UserPlus className="h-4 w-4" /> Tạo tài khoản khách
              </button>
            </>
          )}
        </div>
      </header>

      <StatusFilter ariaLabel="Trạng thái tài khoản" items={STATUS_ITEMS} value={status} counts={counts} onChange={resetPage(setStatus)} />

      {/* Toolbar một dòng */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2.5">
        <FilterSearch value={keyword} onChange={resetPage(setKeyword)} placeholder="Tìm theo tên, email hoặc số điện thoại..." />
        <CompactSelect label="Đăng ký bằng" value={signup} options={SIGNUP_OPTIONS} onChange={resetPage(setSignup)} />
        <CompactDateRange
          label="Ngày tạo"
          from={createdFrom}
          to={createdTo}
          onChange={(f, t) => {
            setCreatedFrom(f);
            setCreatedTo(t);
            setPage(0);
          }}
        />
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <SortSelect value={sort} options={SORT_OPTIONS} onChange={resetPage(setSort)} />
          <button
            type="button"
            onClick={clearFilters}
            title="Đặt lại: xóa điều kiện tra cứu và về trạng thái ban đầu"
            className="flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-border bg-white px-2.5 text-xs font-semibold text-muted transition-colors hover:border-primary/40 hover:text-primary"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Đặt lại</span>
          </button>
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
              <th className={th}>Khách hàng</th>
              <th className={th}>Số điện thoại</th>
              <th className={th}>Đăng ký bằng</th>
              <th className={th}>Ngày tạo</th>
              <th className={th}>Đăng nhập gần nhất</th>
              <th className={th}>Trạng thái</th>
              <th className={`${th} text-right`}>Thao tác</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/70">
            {travelers?.content.map((t) => {
              const label = t.fullName?.trim() || t.email;
              return (
                <tr key={t.id} className="transition-colors duration-150 hover:bg-canvas">
                  <td className={td}>
                    <div className="flex items-center gap-2.5">
                      <Avatar name={label} src={t.pictureUrl} />
                      <div className="min-w-0">
                        {t.fullName?.trim() ? (
                          <div className="truncate font-semibold text-ink-deep">{t.fullName}</div>
                        ) : (
                          <div className="italic text-muted">Chưa cập nhật tên</div>
                        )}
                        <div className="truncate text-[11px] text-muted">{t.email} · #{t.id}</div>
                      </div>
                    </div>
                  </td>
                  <td data-label="Số điện thoại" className={`${td} tabular-nums text-ink`}>{t.phone || '—'}</td>
                  <td className={td}>
                    <SignupBadge method={t.signupMethod} />
                  </td>
                  <td data-label="Ngày tạo" className={`${td} text-muted`}>{formatDate(t.createdAt)}</td>
                  <td data-label="Đăng nhập gần nhất" className={`${td} text-muted`}>{formatDate(t.lastLoginAt)}</td>
                  <td className={td}>
                    <StatusPill status={t.status} />
                  </td>
                  <td className={`${td} text-right`}>
                    <div className="flex items-center justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => setDetail({ kind: 'TRAVELER', traveler: t })}
                        title="Xem chi tiết"
                        aria-label={`Xem chi tiết ${label}`}
                        className={`${iconBtn} hover:bg-primary-50 hover:text-primary`}
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </button>
                      {canOperate && <LockButton status={t.status} onClick={() => openLock(t.id, label, t.status)} />}
                      {canDelete && <DeleteAccountButton label={label} onClick={() => setDeleteTarget({ kind: 'TRAVELER', id: t.id, name: label })} />}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!loading && rowsEmpty && !loadError && (
          <div className="py-12 text-center text-xs text-muted">Không có tài khoản nào khớp bộ lọc.</div>
        )}
      </div>

      <TableFooter total={total} activeCount={activeCount} onClear={clearFilters} page={page} totalPages={totalPages} onPage={setPage} />

      {detail && (
        <AccountDetailDrawer
          key={detail.kind === 'STAFF' ? `s${detail.id}` : `t${detail.traveler.id}`}
          target={detail}
          currentAccountId={currentAccountId}
          onClose={() => setDetail(null)}
          onChanged={() => setReload((n) => n + 1)}
          onResetPassword={onResetPassword}
          notify={notify}
        />
      )}

      {showCreateTraveler && (
        <CreateTravelerModal
          onClose={() => setShowCreateTraveler(false)}
          onCreated={(email) => {
            setShowCreateTraveler(false);
            notify('success', `Đã tạo tài khoản khách ${email}.`);
            setReload((n) => n + 1);
          }}
        />
      )}

      {deleteTarget && (
        <DeleteAccountDialog
          target={deleteTarget}
          notify={notify}
          onClose={() => setDeleteTarget(null)}
          onDeleted={() => {
            setDetail(null);
            setReload((n) => n + 1);
          }}
        />
      )}

      {lockTarget && (
        <ReasonDialog
          title={lockTarget.next === 'INACTIVE' ? 'Khóa tài khoản' : 'Mở khóa tài khoản'}
          description={
            lockTarget.next === 'INACTIVE'
              ? `${lockTarget.name} sẽ không thể đăng nhập cho đến khi được mở khóa.`
              : `${lockTarget.name} sẽ đăng nhập được trở lại.`
          }
          confirmLabel={lockTarget.next === 'INACTIVE' ? 'Khóa' : 'Mở khóa'}
          reasonRequired={lockTarget.next === 'INACTIVE'}
          finalConfirm={
            lockTarget.next === 'INACTIVE'
              ? `Bạn sắp KHÓA tài khoản ${lockTarget.name}. Người này sẽ không đăng nhập được cho đến khi bạn mở khóa lại.`
              : `Bạn sắp MỞ KHÓA tài khoản ${lockTarget.name}. Người này sẽ đăng nhập được trở lại ngay sau khi xác nhận.`
          }
          tone={lockTarget.next === 'INACTIVE' ? 'danger' : 'primary'}
          error={lockError}
          onCancel={() => setLockTarget(null)}
          onConfirm={confirmLock}
        />
      )}
    </section>
  );
}

function StatusPill({ status }: { status: AccountStatus }) {
  return (
    <StatusBadge tone={status === 'ACTIVE' ? 'success' : 'danger'} pulse={status !== 'ACTIVE'}>
      {status === 'ACTIVE' ? 'Hoạt động' : 'Bị khóa'}
    </StatusBadge>
  );
}

function SignupBadge({ method }: { method: TravelerSignupMethod }) {
  return method === 'GOOGLE' ? (
    <span className="inline-flex items-center gap-1.5 rounded-md bg-secondary/10 px-2 py-0.5 text-[11px] font-semibold text-secondary-700 ring-1 ring-inset ring-secondary/30">
      <GoogleMark size={12} /> Google
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 rounded-md bg-canvas px-2 py-0.5 text-[11px] font-semibold text-muted ring-1 ring-inset ring-border">
      <Mail className="h-3 w-3" /> Email
    </span>
  );
}

function LockButton({ status, onClick }: { status: AccountStatus; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={actionButtonClass(status === 'ACTIVE' ? 'danger' : 'success')}>
      {status === 'ACTIVE' ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}
      {status === 'ACTIVE' ? 'Khóa' : 'Mở khóa'}
    </button>
  );
}
