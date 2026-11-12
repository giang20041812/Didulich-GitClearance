import { Fragment, useEffect, useMemo, useState } from 'react';
import { Building2, Check, ChevronRight, Copy, Eye, EyeOff, Inbox, KeyRound, Plus, Trash2 } from 'lucide-react';
import { adminService } from '@/services/adminService';
import { useAdminPermission } from '@/hooks/useAdminPermission';
import type { AdminProviderSummaryDto, ProviderAccountDto, ProviderStatus } from '@/types/admin';
import { CompactSelect, FilterSearch, RefreshButton, TableFooter, ReasonDialog } from './AdminFilters';
import { PROVIDER_SERVICES, providerServiceByType } from '@/components/layout/providerServices';
import type { ProviderServiceType } from '@/types/partner';
import DeleteAccountDialog, { type DeleteAccountTarget } from './DeleteAccountDialog';
import StatusFilter, { type StatusFilterItem } from './StatusFilter';
import { STATUS_COLOR } from './statusColor';
import { useUrlStatus } from '@/hooks/useUrlStatus';
import { StatusBadge } from './StatusBadge';
import { PROVIDER_STATUS, actionButtonClass } from './statusStyles';

interface ProvidersPanelProps {
  providers: AdminProviderSummaryDto[];
  loading: boolean;
  error: boolean;
  onReload: () => void;
  onCreate: () => void;
  onChangeStatus: (id: number, name: string, status: ProviderStatus) => void;
  notify: (type: 'success' | 'error', text: string) => void;
  /** Số hồ sơ đăng ký NCC đang chờ duyệt (null = chưa biết); hiển thị dải nhắc dẫn sang mục "Hồ sơ NCC mới". */
  pendingApplications?: number | null;
  onOpenApplications?: () => void;
}

/**
 * Tab lọc của trang Đối tác: "Hoạt động" = ProviderStatus.ACTIVE; "Bị khóa" = SUSPENDED (đình chỉ) hoặc TERMINATED (chấm dứt)
 * — backend không có trạng thái "bị khóa" riêng cho đối tác nên gộp hai trạng thái không hoạt động này.
 */
type ProviderFilter = 'ACTIVE' | 'LOCKED';
const PROVIDER_FILTER_ITEMS: StatusFilterItem<ProviderFilter>[] = [
  { value: 'ACTIVE', label: 'Hoạt động', tone: STATUS_COLOR.green },
  { value: 'LOCKED', label: 'Bị khóa', tone: STATUS_COLOR.red },
];
const PROVIDER_FILTER_VALUES = PROVIDER_FILTER_ITEMS.map((i) => i.value);
const providerFilterOf = (status: ProviderStatus): ProviderFilter => (status === 'ACTIVE' ? 'ACTIVE' : 'LOCKED');

const th = 'px-3 py-2.5';
const PAGE_SIZE = 15;
const SERVICE_TYPE_OPTIONS = [
  { value: '' as const, label: 'Tất cả' },
  ...PROVIDER_SERVICES.map((option) => ({ value: option.type, label: option.label })),
];
const dateTime = (d?: string | null) => (d ? new Date(d).toLocaleString('vi-VN') : 'Chưa đăng nhập');

/** Sinh mật khẩu ngẫu nhiên mạnh bằng CSPRNG (đủ chữ hoa, thường, số, ký tự đặc biệt). */
function generatePassword(): string {
  const sets = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnpqrstuvwxyz', '23456789', '@#$%'];
  const all = sets.join('');
  const rand = (n: number) => (crypto.getRandomValues(new Uint32Array(1))[0] ?? 0) % n;
  const chars = sets.map((s) => s.charAt(rand(s.length)));
  while (chars.length < 12) chars.push(all.charAt(rand(all.length)));
  const out: string[] = [];
  while (chars.length > 0) out.push(chars.splice(rand(chars.length), 1).join(''));
  return out.join('');
}

export default function ProvidersPanel({
  providers,
  loading,
  error,
  onReload,
  onCreate,
  onChangeStatus,
  notify,
  pendingApplications,
  onOpenApplications,
}: ProvidersPanelProps) {
  // Cấp 3 chỉ xem danh sách; tạo / đổi trạng thái NCC từ cấp 2 (backend cũng chặn theo cấp).
  const canOperate = useAdminPermission().can('operate');
  const [keyword, setKeyword] = useState('');
  const [serviceType, setServiceType] = useState<ProviderServiceType | ''>('');
  const [status, setStatusUrl] = useUrlStatus<ProviderFilter>(PROVIDER_FILTER_VALUES, '');
  const [openId, setOpenId] = useState<number | null>(null);
  const [page, setPage] = useState(0);

  /** Nút tải lại: đưa màn hình về trạng thái ban đầu (bỏ mọi điều kiện tìm kiếm / lọc / sắp xếp, về tab mặc định, trang 1) rồi tải lại dữ liệu mới nhất. */
  const reloadFromStart = () => {
    setKeyword('');
    setServiceType('');
    setStatusUrl('');
    setPage(0);
    setOpenId(null);
    onReload();
  };

  const matchesSearch = useMemo(() => {
    const k = keyword.trim().toLowerCase();
    return (p: AdminProviderSummaryDto) =>
      (!serviceType || (p.serviceType ?? 'HOMESTAY') === serviceType)
      && (!k || [p.name, p.contactName, p.contactPhone, p.contactEmail, p.address].some((v) => v?.toLowerCase().includes(k)));
  }, [keyword, serviceType]);

  // Số đếm từng tab tính trên các đối tác khớp ô tìm kiếm hiện tại.
  const counts = useMemo(() => {
    const found = providers.filter(matchesSearch);
    return {
      '': found.length,
      ACTIVE: found.filter((p) => providerFilterOf(p.status) === 'ACTIVE').length,
      LOCKED: found.filter((p) => providerFilterOf(p.status) === 'LOCKED').length,
    };
  }, [providers, matchesSearch]);

  const rows = useMemo(
    () => providers.filter((p) => (!status || providerFilterOf(p.status) === status) && matchesSearch(p)),
    [providers, status, matchesSearch],
  );

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const pageRows = rows.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  return (
    <section className="rounded-lg border border-border bg-white shadow-sm">
      {onOpenApplications && !!pendingApplications && (
        <button
          type="button"
          onClick={onOpenApplications}
          className="group flex w-full items-center gap-2.5 border-b border-sun/30 bg-sun/10 px-4 py-2.5 text-left text-xs text-amber-700 transition-colors hover:bg-sun/20"
        >
          <Inbox className="h-4 w-4 shrink-0" />
          <span className="flex-1">
            Có <strong>{pendingApplications}</strong> hồ sơ đăng ký NCC mới đang chờ duyệt — đối tác chỉ xuất hiện ở danh sách này sau khi được duyệt.
          </span>
          <span className="flex items-center gap-1 font-semibold">
            Xử lý ngay <ChevronRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
          </span>
        </button>
      )}

      <StatusFilter
        ariaLabel="Trạng thái đối tác"
        items={PROVIDER_FILTER_ITEMS}
        value={status}
        counts={counts}
        onChange={(v) => {
          setStatusUrl(v);
          setPage(0);
        }}
      />

      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2.5">
        <FilterSearch value={keyword} onChange={(v) => { setKeyword(v); setPage(0); }} placeholder="Tìm theo tên đối tác, người liên hệ, SĐT, email..." />
        <CompactSelect label="Loại hình" value={serviceType} options={SERVICE_TYPE_OPTIONS} onChange={(v) => { setServiceType(v); setPage(0); }} />
        <RefreshButton loading={loading} onClick={reloadFromStart} />
        {canOperate && (
          <button
            type="button"
            onClick={onCreate}
            className="ml-auto flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-semibold text-white shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:bg-primary-600 hover:shadow-[var(--shadow-teal)]"
          >
            <Plus className="h-4 w-4" /> Tạo đối tác mới
          </button>
        )}
      </div>

      {error && (
        <div role="alert" className="border-b border-danger/20 bg-danger/5 px-4 py-2.5 text-xs text-danger">
          Không tải được danh sách đối tác. Vui lòng thử lại.
        </div>
      )}

      <div className={`overflow-x-auto transition-opacity duration-200 ${loading ? 'opacity-60' : ''}`}>
        <table className="admin-stack w-full border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-border bg-canvas/60 text-[11px] font-semibold uppercase tracking-wide text-muted">
              <th className={th}>Đối tác</th>
              <th className={th}>Liên hệ</th>
              <th className={`${th} text-center`}>Địa điểm</th>
              <th className={`${th} text-center`}>Tài khoản</th>
              <th className={th}>Trạng thái</th>
              <th className={`${th} text-right`}>Thao tác</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/70">
            {pageRows.map((p) => {
              const st = PROVIDER_STATUS[p.status];
              const open = openId === p.id;
              return (
                <Fragment key={p.id}>
                  <tr className={`transition-colors duration-150 hover:bg-canvas ${open ? 'bg-primary-50/40' : ''}`}>
                    <td className={th}>
                      <div className="flex items-center gap-2.5">
                        <img src={providerServiceByType(p.serviceType).image} alt="" aria-hidden width={28} height={28} className="h-7 w-7 shrink-0 object-contain" />
                        <div className="min-w-0">
                          <div className="font-semibold text-ink-deep">{p.name}</div>
                          <div className="max-w-[220px] truncate text-[11px] text-muted" title={p.address}>
                            #{p.id} · {providerServiceByType(p.serviceType).label} · {p.address || 'Chưa có địa chỉ'}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className={th}>
                      <div className="text-ink">{p.contactName || '—'}</div>
                      <div className="text-[11px] text-muted">{[p.contactPhone, p.contactEmail].filter(Boolean).join(' · ')}</div>
                    </td>
                    <td className={`${th} text-center font-bold text-primary`}>{p.placeCount}</td>
                    <td className={`${th} text-center font-semibold text-ink`}>{p.accountCount}</td>
                    <td className={th}>
                      <StatusBadge tone={st.tone} pulse={p.status === 'SUSPENDED'}>
                        {st.label}
                      </StatusBadge>
                    </td>
                    <td className={`${th} text-right`}>
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => setOpenId(open ? null : p.id)}
                          aria-expanded={open}
                          title={open ? 'Ẩn thông tin tài khoản' : 'Xem thông tin tài khoản'}
                          className={`flex h-7 w-7 items-center justify-center rounded-md ring-1 ring-inset transition-all duration-200 active:scale-95 ${
                            open ? 'bg-primary text-white ring-primary' : 'text-muted ring-border hover:bg-primary-50 hover:text-primary hover:ring-primary/40'
                          }`}
                        >
                          {open ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                        </button>
                        {canOperate && p.status !== 'ACTIVE' && (
                          <button type="button" onClick={() => onChangeStatus(p.id, p.name, 'ACTIVE')} className={actionButtonClass('success')}>
                            Kích hoạt
                          </button>
                        )}
                        {canOperate && p.status !== 'SUSPENDED' && (
                          <button type="button" onClick={() => onChangeStatus(p.id, p.name, 'SUSPENDED')} className={actionButtonClass('warning')}>
                            Đình chỉ
                          </button>
                        )}
                        {canOperate && p.status !== 'TERMINATED' && (
                          <button type="button" onClick={() => onChangeStatus(p.id, p.name, 'TERMINATED')} className={actionButtonClass('danger')}>
                            Chấm dứt
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                  {open && (
                    <tr className="bg-canvas">
                      <td colSpan={6} className="px-4 py-3">
                        <ProviderCredentials providerId={p.id} notify={notify} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
        {!loading && rows.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-12 text-xs text-muted">
            <Building2 className="h-6 w-6 text-primary-300" />
            {providers.length === 0 ? 'Chưa có đối tác nào.' : 'Không có đối tác nào khớp bộ lọc.'}
          </div>
        )}
      </div>

      <TableFooter
        total={rows.length}
        activeCount={[keyword.trim(), status, serviceType].filter(Boolean).length}
        onClear={() => {
          setKeyword('');
          setStatusUrl('');
          setPage(0);
        }}
        page={safePage}
        totalPages={totalPages}
        onPage={setPage}
      />
    </section>
  );
}

type LoadState = { kind: 'loading' } | { kind: 'error' } | { kind: 'ready'; accounts: ProviderAccountDto[] };

/** Khối "mắt": tên đăng nhập của các tài khoản NCC + cấp lại mật khẩu (mật khẩu mới chỉ hiện một lần). */
function ProviderCredentials({ providerId, notify }: { providerId: number; notify: ProvidersPanelProps['notify'] }) {
  const { can } = useAdminPermission();
  const canOperate = can('operate');
  // Xóa hẳn tài khoản đăng nhập NCC: chỉ quản trị viên cấp 1.
  const canDelete = can('manageAdmins');
  const [deleteTarget, setDeleteTarget] = useState<DeleteAccountTarget | null>(null);
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [issued, setIssued] = useState<Record<number, string>>({});
  const [shown, setShown] = useState<Record<number, boolean>>({});
  const [busyId, setBusyId] = useState<number | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    adminService
      .getProviderAccounts(providerId)
      .then((accounts) => {
        if (!cancelled) setState({ kind: 'ready', accounts });
      })
      .catch(() => {
        if (!cancelled) setState({ kind: 'error' });
      });
    return () => {
      cancelled = true;
    };
  }, [providerId]);

  const copy = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 1500);
    } catch {
      notify('error', 'Không thể sao chép, vui lòng chọn và copy thủ công.');
    }
  };

  // Hộp thoại xác nhận cấp lại mật khẩu (thay window.confirm của trình duyệt).
  const [resetTarget, setResetTarget] = useState<ProviderAccountDto | null>(null);

  const reset = async (acc: ProviderAccountDto, reason: string) => {
    const next = generatePassword();
    setBusyId(acc.id);
    try {
      await adminService.resetPassword(acc.id, { newPassword: next, reason });
      setIssued((m) => ({ ...m, [acc.id]: next }));
      setShown((m) => ({ ...m, [acc.id]: true }));
      notify('success', `Đã cấp mật khẩu mới cho ${acc.email}. Hãy sao chép và gửi cho đối tác.`);
    } catch {
      notify('error', 'Không đặt lại được mật khẩu.');
    } finally {
      setBusyId(null);
    }
  };

  if (state.kind === 'loading') return <p className="text-xs text-muted">Đang tải thông tin tài khoản...</p>;
  if (state.kind === 'error') return <p className="text-xs text-danger">Không tải được thông tin tài khoản.</p>;
  if (state.accounts.length === 0) return <p className="text-xs text-muted">Đối tác này chưa có tài khoản đăng nhập.</p>;

  return (
    <div className="flex flex-col gap-2">
      {state.accounts.map((acc) => {
        const pwd = issued[acc.id];
        const visible = shown[acc.id];
        return (
          <div key={acc.id} className="grid gap-3 rounded-md border border-border bg-white p-3 sm:grid-cols-[1fr_1fr_auto] sm:items-center">
            <div className="min-w-0">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">Tài khoản</div>
              <div className="truncate font-semibold text-ink-deep">{acc.fullName}</div>
              <div className="flex items-center gap-1.5 text-[11px] text-ink">
                <span className="truncate">
                  {acc.phone ? `${acc.phone} · ` : ''}
                  {acc.email}
                </span>
                <button type="button" onClick={() => copy(`id-${acc.id}`, acc.phone || acc.email)} aria-label="Sao chép tên đăng nhập" className="text-muted hover:text-primary">
                  {copied === `id-${acc.id}` ? <Check className="h-3 w-3 text-accent" /> : <Copy className="h-3 w-3" />}
                </button>
              </div>
              <div className="mt-0.5 text-[11px] text-muted">Đăng nhập gần nhất: {dateTime(acc.lastLoginAt)}</div>
            </div>
            <div className="min-w-0">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">Mật khẩu</div>
              {pwd ? (
                <div className="flex items-center gap-1.5">
                  <code className="rounded-sm bg-primary-50 px-2 py-1 font-mono text-xs text-primary-700">{visible ? pwd : '••••••••••••'}</code>
                  <button type="button" onClick={() => setShown((m) => ({ ...m, [acc.id]: !visible }))} aria-label={visible ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'} className="text-muted hover:text-primary">
                    {visible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
                  <button type="button" onClick={() => copy(`pw-${acc.id}`, pwd)} aria-label="Sao chép mật khẩu" className="text-muted hover:text-primary">
                    {copied === `pw-${acc.id}` ? <Check className="h-3.5 w-3.5 text-accent" /> : <Copy className="h-3.5 w-3.5" />}
                  </button>
                </div>
              ) : (
                <div className="text-[11px] leading-relaxed text-muted">
                  <span className="font-mono tracking-widest text-ink">••••••••••••</span> — mã hóa một chiều, hệ thống không thể xem lại. Cấp lại mật khẩu mới nếu cần.
                </div>
              )}
              {pwd && <div className="mt-0.5 text-[11px] text-amber-700">Chỉ hiển thị một lần — rời trang là mất.</div>}
            </div>
            {canOperate && (
              <button type="button" disabled={busyId === acc.id} onClick={() => setResetTarget(acc)} className={`${actionButtonClass('brand')} justify-center disabled:opacity-50`}>
                <KeyRound className="h-3 w-3" /> {busyId === acc.id ? 'Đang cấp...' : 'Cấp lại mật khẩu'}
              </button>
            )}
            {canDelete && (
              <button
                type="button"
                onClick={() => setDeleteTarget({ kind: 'PROVIDER', id: acc.id, name: acc.fullName || acc.email })}
                className={`${actionButtonClass('danger')} justify-center`}
              >
                <Trash2 className="h-3 w-3" /> Xóa tài khoản
              </button>
            )}
          </div>
        );
      })}
      {deleteTarget && (
        <DeleteAccountDialog
          target={deleteTarget}
          notify={notify}
          onClose={() => setDeleteTarget(null)}
          onDeleted={() =>
            setState((s) => (s.kind === 'ready' ? { kind: 'ready', accounts: s.accounts.filter((a) => a.id !== deleteTarget.id) } : s))
          }
        />
      )}
      {resetTarget && (
        <ReasonDialog
          title="Cấp lại mật khẩu cho đối tác"
          description={`Cấp mật khẩu mới cho ${resetTarget.email}? Mật khẩu cũ sẽ không còn dùng được — đối tác cần dùng mật khẩu mới ngay lần đăng nhập kế tiếp.`}
          confirmLabel="Cấp mật khẩu mới"
          reasonRequired
          reasonRequiredMessage="Vui lòng nhập lý do cấp lại mật khẩu (ghi vào nhật ký hoạt động)."
          tone="primary"
          onCancel={() => setResetTarget(null)}
          onConfirm={(reason) => { const acc = resetTarget; if (!acc) return; setResetTarget(null); void reset(acc, reason); }}
        />
      )}
    </div>
  );
}
