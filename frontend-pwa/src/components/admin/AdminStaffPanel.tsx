import { useCallback, useEffect, useMemo, useState } from 'react';
import { KeyRound, Lock, Plus, ShieldCheck, Unlock } from 'lucide-react';
import { adminService } from '@/services/adminService';
import { getApiErrorMessage } from '@/lib/apiError';
import { ADMIN_LEVELS, LEVEL_META, toAdminLevel } from '@/lib/adminPermissions';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import type { AccountStatus, AdminAccountDto, AdminLevel } from '@/types/admin';
import { CompactSelect, FilterSearch, ReasonDialog, RefreshButton, type SelectOption } from './AdminFilters';
import { StatusBadge, type StatusTone } from './StatusBadge';
import StatusFilter, { type StatusFilterItem } from './StatusFilter';
import { STATUS_COLOR } from './statusColor';
import { useUrlStatus } from '@/hooks/useUrlStatus';
import DeleteAccountDialog, { DeleteAccountButton, type DeleteAccountTarget } from './DeleteAccountDialog';
import { actionButtonClass } from './statusStyles';
import Avatar from './Avatar';

interface AdminStaffPanelProps {
  currentAccountId?: number;
  onCreate: () => void;
  onResetPassword: (account: { id: number; email: string }) => void;
  notify: (type: 'success' | 'error', text: string) => void;
  /** Đổi giá trị để buộc tải lại (vd: sau khi tạo Admin mới). */
  refreshKey?: number;
}

const LEVEL_TONE: Record<AdminLevel, StatusTone> = { 1: 'danger', 2: 'brand', 3: 'neutral' };
/** Trạng thái quản trị viên = account.status: ACTIVE (Hoạt động) / INACTIVE (Bị khóa). */
const STATUS_ITEMS: StatusFilterItem<AccountStatus>[] = [
  { value: 'ACTIVE', label: 'Hoạt động', tone: STATUS_COLOR.green },
  { value: 'INACTIVE', label: 'Bị khóa', tone: STATUS_COLOR.red },
];
const STATUS_VALUES = STATUS_ITEMS.map((i) => i.value);
const fmtDateTime = (d?: string | null) => (d ? new Date(d).toLocaleString('vi-VN') : 'Chưa đăng nhập');

/** Quản lý quản trị viên theo cấp (chỉ Admin cấp 1): xem, đổi cấp, khóa / mở khóa, đặt lại mật khẩu, tạo mới. */
export default function AdminStaffPanel({ currentAccountId, onCreate, onResetPassword, notify, refreshKey = 0 }: AdminStaffPanelProps) {
  const [keyword, setKeyword] = useState('');
  const [levelTab, setLevelTab] = useState<`${AdminLevel}` | ''>('');
  const [statusFilter, setStatusFilter] = useUrlStatus<AccountStatus>(STATUS_VALUES, '');
  const [admins, setAdmins] = useState<AdminAccountDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [reload, setReload] = useState(0);
  const [levelTarget, setLevelTarget] = useState<{ account: AdminAccountDto; level: AdminLevel } | null>(null);
  const [lockTarget, setLockTarget] = useState<{ account: AdminAccountDto; next: AccountStatus } | null>(null);
  const [dialogError, setDialogError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<DeleteAccountTarget | null>(null);

  /** Nút tải lại: đưa màn hình về trạng thái ban đầu (bỏ mọi điều kiện tìm kiếm / lọc / sắp xếp, về tab mặc định, trang 1) rồi tải lại dữ liệu mới nhất. */
  const reloadFromStart = () => {
    setKeyword('');
    setLevelTab('');
    setStatusFilter('');
    setReload((n) => n + 1);
  };

  const debounced = useDebouncedValue(keyword);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const page = await adminService.getAccounts({ role: 'ADMIN', keyword: debounced.trim() || undefined, sortBy: 'createdAt', sortDir: 'asc', size: 100 });
      setAdmins(page.content);
    } catch (err: unknown) {
      setLoadError(getApiErrorMessage(err, 'Không tải được danh sách quản trị viên. Vui lòng thử lại.'));
    } finally {
      setLoading(false);
    }
  }, [debounced]);

  useEffect(() => {
    void load();
  }, [load, reload, refreshKey]);

  const byLevel = useMemo(
    () => admins.filter((a) => !levelTab || String(toAdminLevel(a.adminLevel)) === levelTab),
    [admins, levelTab],
  );
  const rows = useMemo(() => byLevel.filter((a) => !statusFilter || a.status === statusFilter), [byLevel, statusFilter]);
  const countBy = (l: AdminLevel) => admins.filter((a) => toAdminLevel(a.adminLevel) === l).length;
  // Số đếm trên tab tính trên danh sách đã lọc theo cấp + từ khóa, chỉ khác trạng thái.
  const counts: Record<string, number | null> = {
    '': byLevel.length,
    ACTIVE: byLevel.filter((a) => a.status === 'ACTIVE').length,
    INACTIVE: byLevel.filter((a) => a.status === 'INACTIVE').length,
  };
  const levelOptions: SelectOption<`${AdminLevel}`>[] = [
    { value: '', label: 'Tất cả' },
    ...ADMIN_LEVELS.map((l) => ({ value: `${l}` as const, label: `${LEVEL_META[l].label} · ${LEVEL_META[l].role}` })),
  ];

  const name = (a: AdminAccountDto) => a.fullName?.trim() || a.email || `#${a.id}`;

  const confirmLevel = async (reason: string) => {
    if (!levelTarget) return;
    try {
      await adminService.updateAdminLevel(levelTarget.account.id, { adminLevel: levelTarget.level, reason });
      notify('success', `Đã chuyển ${name(levelTarget.account)} sang ${LEVEL_META[levelTarget.level].label} (${LEVEL_META[levelTarget.level].role}).`);
      setLevelTarget(null);
      setDialogError('');
      setReload((n) => n + 1);
    } catch (err: unknown) {
      setDialogError(getApiErrorMessage(err, 'Không thể đổi cấp quản trị viên.'));
    }
  };

  const confirmLock = async (reason: string) => {
    if (!lockTarget) return;
    if (lockTarget.next === 'INACTIVE' && !reason) {
      setDialogError('Vui lòng nhập lý do.');
      return;
    }
    try {
      await adminService.updateAccountStatus(lockTarget.account.id, { status: lockTarget.next, reason: reason || 'Admin mở khóa tài khoản quản trị' });
      notify('success', lockTarget.next === 'ACTIVE' ? `Đã mở khóa ${name(lockTarget.account)}.` : `Đã khóa ${name(lockTarget.account)}.`);
      setLockTarget(null);
      setDialogError('');
      setReload((n) => n + 1);
    } catch (err: unknown) {
      setDialogError(getApiErrorMessage(err, 'Không thể cập nhật trạng thái tài khoản.'));
    }
  };

  const th = 'px-4 py-2.5';
  const td = 'px-4 py-2.5';

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        {ADMIN_LEVELS.map((l) => (
          <section key={l} className="rounded-lg border border-border bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <ShieldCheck className={`h-4 w-4 ${l === 1 ? 'text-danger' : l === 2 ? 'text-primary' : 'text-muted'}`} />
                <h3 className="font-display text-sm font-bold text-ink-deep">
                  {LEVEL_META[l].label} · {LEVEL_META[l].role}
                </h3>
              </div>
              <span className="rounded bg-canvas px-1.5 py-px text-[10px] font-bold tabular-nums text-muted">{countBy(l)} người</span>
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-muted">{LEVEL_META[l].description}</p>
            <ul className="mt-2 flex flex-col gap-1 text-[11px] text-ink">
              {LEVEL_META[l].capabilities.map((c) => (
                <li key={c} className="flex gap-1.5">
                  <span aria-hidden className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-primary/60" />
                  {c}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <section className="rounded-lg border border-border bg-white shadow-sm">
        <StatusFilter ariaLabel="Trạng thái quản trị viên" items={STATUS_ITEMS} value={statusFilter} counts={counts} onChange={setStatusFilter} />

        <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2.5">
          <FilterSearch value={keyword} onChange={setKeyword} placeholder="Tìm theo tên, email hoặc số điện thoại..." />
          <CompactSelect label="Cấp" value={levelTab} options={levelOptions} onChange={(v) => setLevelTab(v)} />
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <RefreshButton loading={loading} onClick={reloadFromStart} />
            <button
              type="button"
              onClick={onCreate}
              className="flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-semibold text-white shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:bg-primary-600"
            >
              <Plus className="h-4 w-4" /> Tạo quản trị viên
            </button>
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
                <th className={th}>Quản trị viên</th>
                <th className={th}>Cấp quản trị</th>
                <th className={th}>Đăng nhập gần nhất</th>
                <th className={th}>Trạng thái</th>
                <th className={`${th} text-right`}>Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/70">
              {rows.map((a) => {
                const level = toAdminLevel(a.adminLevel);
                const self = a.id === currentAccountId;
                return (
                  <tr key={a.id} className="transition-colors duration-150 hover:bg-canvas">
                    <td className={td}>
                      <div className="flex items-center gap-2.5">
                        <Avatar name={name(a)} src={null} />
                        <div className="min-w-0">
                          <div className="truncate font-semibold text-ink-deep">
                            {name(a)} {self && <span className="ml-1 rounded bg-primary-50 px-1.5 py-px text-[10px] font-bold text-primary">Bạn</span>}
                          </div>
                          <div className="truncate text-[11px] text-muted">{[a.email, a.phone].filter(Boolean).join(' · ')}</div>
                        </div>
                      </div>
                    </td>
                    <td className={td}>
                      {self ? (
                        <StatusBadge tone={LEVEL_TONE[level]}>
                          {LEVEL_META[level].label} · {LEVEL_META[level].role}
                        </StatusBadge>
                      ) : (
                        <select
                          value={level}
                          aria-label={`Cấp quản trị của ${name(a)}`}
                          onChange={(e) => {
                            setDialogError('');
                            setLevelTarget({ account: a, level: toAdminLevel(Number(e.target.value)) });
                          }}
                          className="h-8 cursor-pointer rounded-md border border-border bg-white px-2 text-xs text-ink hover:border-primary/40 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                        >
                          {ADMIN_LEVELS.map((l) => (
                            <option key={l} value={l}>
                              {LEVEL_META[l].label} · {LEVEL_META[l].role}
                            </option>
                          ))}
                        </select>
                      )}
                    </td>
                    <td data-label="Đăng nhập gần nhất" className={`${td} text-muted`}>{fmtDateTime(a.lastLoginAt)}</td>
                    <td className={td}>
                      <StatusBadge tone={a.status === 'ACTIVE' ? 'success' : 'danger'} pulse={a.status !== 'ACTIVE'}>
                        {a.status === 'ACTIVE' ? 'Hoạt động' : 'Bị khóa'}
                      </StatusBadge>
                    </td>
                    <td className={`${td} text-right`}>
                      <div className="flex items-center justify-end gap-1">
                        {!self && (
                          <>
                            <button type="button" onClick={() => onResetPassword({ id: a.id, email: a.email ?? '' })} className={actionButtonClass('brand')}>
                              <KeyRound className="h-3 w-3" /> Đặt lại mật khẩu
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setDialogError('');
                                setLockTarget({ account: a, next: a.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' });
                              }}
                              className={actionButtonClass(a.status === 'ACTIVE' ? 'danger' : 'success')}
                            >
                              {a.status === 'ACTIVE' ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}
                              {a.status === 'ACTIVE' ? 'Khóa' : 'Mở khóa'}
                            </button>
                            <DeleteAccountButton label={name(a)} onClick={() => setDeleteTarget({ kind: 'ADMIN', id: a.id, name: name(a) })} />
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!loading && rows.length === 0 && !loadError && <div className="py-12 text-center text-xs text-muted">Không có quản trị viên nào khớp bộ lọc.</div>}
        </div>
        <div className="border-t border-border px-4 py-2.5 text-xs text-muted">
          <strong className="tabular-nums text-ink">{rows.length}</strong> quản trị viên · Đổi cấp có hiệu lực ngay ở lần thao tác kế tiếp của người đó.
        </div>
      </section>

      {deleteTarget && (
        <DeleteAccountDialog target={deleteTarget} notify={notify} onClose={() => setDeleteTarget(null)} onDeleted={() => setReload((n) => n + 1)} />
      )}

      {levelTarget && (
        <ReasonDialog
          title="Đổi cấp quản trị viên"
          description={`${name(levelTarget.account)} sẽ chuyển từ ${LEVEL_META[toAdminLevel(levelTarget.account.adminLevel)].label} sang ${LEVEL_META[levelTarget.level].label} (${LEVEL_META[levelTarget.level].role}): ${LEVEL_META[levelTarget.level].description}`}
          confirmLabel="Đổi cấp"
          reasonRequired
          reasonRequiredMessage="Vui lòng nhập lý do đổi cấp (ghi vào nhật ký hoạt động)."
          finalConfirm={`Bạn sắp chuyển ${name(levelTarget.account)} sang ${LEVEL_META[levelTarget.level].label} (${LEVEL_META[levelTarget.level].role}). Quyền mới có hiệu lực ngay sau khi xác nhận.`}
          tone="primary"
          error={dialogError}
          onCancel={() => setLevelTarget(null)}
          onConfirm={confirmLevel}
        />
      )}

      {lockTarget && (
        <ReasonDialog
          title={lockTarget.next === 'INACTIVE' ? 'Khóa tài khoản quản trị' : 'Mở khóa tài khoản quản trị'}
          description={
            lockTarget.next === 'INACTIVE'
              ? `${name(lockTarget.account)} sẽ không thể đăng nhập cổng quản trị cho đến khi được mở khóa.`
              : `${name(lockTarget.account)} sẽ đăng nhập được trở lại.`
          }
          confirmLabel={lockTarget.next === 'INACTIVE' ? 'Khóa' : 'Mở khóa'}
          reasonRequired={lockTarget.next === 'INACTIVE'}
          finalConfirm={
            lockTarget.next === 'INACTIVE'
              ? `Bạn sắp KHÓA tài khoản quản trị ${name(lockTarget.account)}. Người này sẽ không đăng nhập được cổng quản trị cho đến khi được mở khóa.`
              : `Bạn sắp MỞ KHÓA tài khoản quản trị ${name(lockTarget.account)}. Người này sẽ đăng nhập được cổng quản trị trở lại ngay sau khi xác nhận.`
          }
          tone={lockTarget.next === 'INACTIVE' ? 'danger' : 'primary'}
          error={dialogError}
          onCancel={() => setLockTarget(null)}
          onConfirm={confirmLock}
        />
      )}
    </div>
  );
}
