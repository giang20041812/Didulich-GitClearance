import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { KeyRound, Pencil, ShieldCheck, X } from 'lucide-react';
import { adminService } from '@/services/adminService';
import { getApiErrorMessage } from '@/lib/apiError';
import type { AccountRole, AccountStatus, AdminAccountDto, AdminProviderSummaryDto, AdminTravelerDto } from '@/types/admin';
import { StatusBadge } from './StatusBadge';
import { actionButtonClass } from './statusStyles';
import OverlayPortal from './OverlayPortal';
import TravelerActivityPanel from './TravelerActivityPanel';

export type AccountDetailTarget =
  | { kind: 'STAFF'; id: number }
  | { kind: 'TRAVELER'; traveler: AdminTravelerDto };

interface AccountDetailDrawerProps {
  target: AccountDetailTarget;
  currentAccountId?: number;
  onClose: () => void;
  onChanged: () => void;
  onResetPassword: (account: { id: number; email: string }) => void;
  notify: (type: 'success' | 'error', text: string) => void;
}

const fmt = (iso?: string | null) => (iso ? new Date(iso).toLocaleString('vi-VN') : '—');

/** Mô tả quyền truy cập hiện tại theo vai trò và trạng thái tài khoản. */
function accessSummary(role: AccountRole | 'TRAVELER', status: AccountStatus, providerName?: string) {
  if (status !== 'ACTIVE') {
    return {
      tone: 'danger' as const,
      title: 'Đang bị chặn đăng nhập',
      items: ['Không thể đăng nhập và mọi phiên đang mở bị từ chối cho đến khi được mở khóa.'],
    };
  }
  if (role === 'ADMIN') {
    return {
      tone: 'brand' as const,
      title: 'Quản trị viên',
      items: ['Cổng quản trị toàn hệ thống', 'Quản lý tài khoản, đối tác, điểm đến, đặt phòng, tài chính và báo cáo', 'Ghi nhận giám sát Booking'],
    };
  }
  if (role === 'PROVIDER') {
    return {
      tone: 'warning' as const,
      title: 'Nhà cung cấp',
      items: [`Cổng đối tác — chỉ dữ liệu của cơ sở ${providerName ? `“${providerName}”` : 'được liên kết'}`, 'Quản lý homestay và đơn đặt phòng của cơ sở', 'Bị chặn khi cơ sở bị đình chỉ hoặc chấm dứt'],
    };
  }
  return {
    tone: 'info' as const,
    title: 'Khách du lịch',
    items: ['Tìm kiếm, đặt phòng và quản lý hồ sơ cá nhân', 'Không truy cập được cổng quản trị hoặc đối tác'],
  };
}

export default function AccountDetailDrawer({ target, currentAccountId, onClose, onChanged, onResetPassword, notify }: AccountDetailDrawerProps) {
  const staffId = target.kind === 'STAFF' ? target.id : null;
  const [account, setAccount] = useState<AdminAccountDto | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(target.kind === 'STAFF');
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ fullName: '', phone: '', email: '' });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  // FR-AD-05: đổi quyền ADMIN ⇄ PROVIDER — xem lại nội dung rồi xác nhận (NFR-USA-02).
  const [roleForm, setRoleForm] = useState<{ providerId: string; reason: string; confirming: boolean } | null>(null);
  const [freeProviders, setFreeProviders] = useState<AdminProviderSummaryDto[]>([]);
  const [roleSaving, setRoleSaving] = useState(false);
  const [roleError, setRoleError] = useState('');

  const load = useCallback(async () => {
    if (staffId == null) return;
    setLoading(true);
    setError('');
    try {
      setAccount(await adminService.getAccountById(staffId));
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, 'Không tải được thông tin tài khoản.'));
    } finally {
      setLoading(false);
    }
  }, [staffId]);

  useEffect(() => {
    void load();
  }, [load]);

  const startEdit = () => {
    if (!account) return;
    setForm({ fullName: account.fullName ?? '', phone: account.phone ?? '', email: account.email ?? '' });
    setFormError('');
    setEditing(true);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!account) return;
    if (!form.fullName.trim()) {
      setFormError('Họ tên không được để trống.');
      return;
    }
    setSaving(true);
    setFormError('');
    try {
      const updated = await adminService.updateAccount(account.id, {
        fullName: form.fullName.trim(),
        phone: form.phone.trim() || undefined,
        email: form.email.trim() || undefined,
      });
      setAccount(updated);
      setEditing(false);
      notify('success', 'Đã cập nhật thông tin tài khoản.');
      onChanged();
    } catch (err: unknown) {
      setFormError(getApiErrorMessage(err, 'Không cập nhật được tài khoản.'));
    } finally {
      setSaving(false);
    }
  };

  const openRoleForm = () => {
    setRoleError('');
    setRoleForm({ providerId: '', reason: '', confirming: false });
    if (account?.role === 'ADMIN') {
      // Chỉ NCC chưa có tài khoản đăng nhập mới gán được (mỗi NCC một tài khoản).
      adminService
        .getProviders()
        .then((list) => setFreeProviders(list.filter((p) => p.accountCount === 0)))
        .catch(() => setRoleError('Không tải được danh sách nhà cung cấp.'));
    }
  };

  const submitRole = async () => {
    if (!account || !roleForm) return;
    const newRole: AccountRole = account.role === 'ADMIN' ? 'PROVIDER' : 'ADMIN';
    if (newRole === 'PROVIDER' && !roleForm.providerId) {
      setRoleError('Vui lòng chọn nhà cung cấp.');
      return;
    }
    if (!roleForm.reason.trim()) {
      setRoleError('Vui lòng nhập lý do đổi quyền.');
      return;
    }
    if (!roleForm.confirming) {
      setRoleError('');
      setRoleForm({ ...roleForm, confirming: true });
      return;
    }
    setRoleSaving(true);
    setRoleError('');
    try {
      const updated = await adminService.updateAccountRole(account.id, {
        role: newRole,
        providerId: newRole === 'PROVIDER' ? Number(roleForm.providerId) : undefined,
        reason: roleForm.reason.trim(),
      });
      setAccount(updated);
      setRoleForm(null);
      notify('success', 'Đã đổi quyền tài khoản. Mọi phiên đăng nhập cũ đã bị thu hồi.');
      onChanged();
    } catch (err: unknown) {
      setRoleError(getApiErrorMessage(err, 'Không đổi được quyền tài khoản.'));
      setRoleForm({ ...roleForm, confirming: false });
    } finally {
      setRoleSaving(false);
    }
  };

  const traveler = target.kind === 'TRAVELER' ? target.traveler : null;
  const role: AccountRole | 'TRAVELER' = traveler ? 'TRAVELER' : account?.role ?? 'ADMIN';
  const status: AccountStatus | null = traveler ? traveler.status : account?.status ?? null;
  const summary = status ? accessSummary(role, status, account?.providerName) : null;
  const inputClass =
    'h-9 w-full rounded-md border border-border bg-white px-3 text-xs text-ink focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20';

  return (
    <OverlayPortal>
    <div className="admin-overlay-shell z-[9998] flex justify-end bg-ink-deep/50" onClick={onClose}>
      <aside
        className="admin-drawer admin-account-drawer flex h-full min-h-0 w-full min-w-0 max-w-md flex-col gap-4 overflow-y-auto overscroll-contain bg-white px-4 py-5 shadow-xl *:shrink-0 sm:px-5"
        onClick={(e) => e.stopPropagation()}
        aria-label="Chi tiết tài khoản"
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">Hồ sơ tài khoản</p>
            <h3 className="break-words font-display text-lg font-bold text-ink-deep">
              {traveler ? traveler.fullName || traveler.email : account?.fullName || (loading ? 'Đang tải...' : '—')}
            </h3>
          </div>
          <button type="button" onClick={onClose} aria-label="Đóng" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-muted hover:bg-hover">
            <X className="h-5 w-5" />
          </button>
        </div>

        {error && (
          <div role="alert" className="flex items-center justify-between gap-2 rounded-md border border-danger/30 bg-danger/5 p-3 text-xs text-danger">
            <span>{error}</span>
            <button type="button" onClick={() => void load()} className="font-semibold underline">Thử lại</button>
          </div>
        )}

        {(traveler || account) && status && (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge tone={status === 'ACTIVE' ? 'success' : 'danger'}>{status === 'ACTIVE' ? 'Hoạt động' : 'Bị khóa'}</StatusBadge>
              <StatusBadge tone={role === 'ADMIN' ? 'brand' : role === 'PROVIDER' ? 'warning' : 'info'}>
                {role === 'ADMIN' ? 'Quản trị viên' : role === 'PROVIDER' ? 'Nhà cung cấp' : 'Khách du lịch'}
              </StatusBadge>
              {traveler && (
                <StatusBadge tone={traveler.signupMethod === 'GOOGLE' ? 'info' : 'neutral'}>
                  Đăng ký bằng {traveler.signupMethod === 'GOOGLE' ? 'Google' : 'Email'}
                </StatusBadge>
              )}
            </div>

            <Section
              title="Thông tin hồ sơ"
              action={
                account && !editing ? (
                  <button type="button" onClick={startEdit} className={actionButtonClass('brand')}>
                    <Pencil className="h-3 w-3" /> Chỉnh sửa
                  </button>
                ) : null
              }
            >
              {editing && account ? (
                <form onSubmit={save} className="flex flex-col gap-2">
                  <label className="flex flex-col gap-1 text-[11px] font-semibold text-muted">
                    Họ tên
                    <input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} className={inputClass} />
                  </label>
                  <label className="flex flex-col gap-1 text-[11px] font-semibold text-muted">
                    Email
                    <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={inputClass} />
                  </label>
                  <label className="flex flex-col gap-1 text-[11px] font-semibold text-muted">
                    Số điện thoại
                    <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={inputClass} />
                  </label>
                  {formError && <p role="alert" className="text-xs text-danger">{formError}</p>}
                  <div className="flex flex-wrap justify-end gap-2 pt-1">
                    <button type="button" onClick={() => setEditing(false)} className="min-h-11 rounded-md px-3 py-2 text-xs font-medium text-muted hover:bg-hover">
                      Hủy
                    </button>
                    <button type="submit" disabled={saving} className="min-h-11 rounded-md bg-primary px-3 py-2 text-xs font-semibold text-white hover:bg-primary-600 disabled:opacity-60">
                      {saving ? 'Đang lưu...' : 'Lưu thay đổi'}
                    </button>
                  </div>
                </form>
              ) : (
                <>
                  <Row k="Mã tài khoản" v={`#${traveler ? traveler.id : account?.id}`} />
                  <Row k="Họ tên" v={(traveler ? traveler.fullName : account?.fullName) || '—'} />
                  <Row k="Email" v={(traveler ? traveler.email : account?.email) || '—'} />
                  <Row k="Số điện thoại" v={(traveler ? traveler.phone : account?.phone) || '—'} />
                  {account?.providerName && <Row k="Cơ sở liên kết" v={account.providerName} />}
                  <Row k="Ngày tạo" v={fmt(traveler ? traveler.createdAt : account?.createdAt)} />
                  <Row k="Đăng nhập gần nhất" v={fmt(traveler ? traveler.lastLoginAt : account?.lastLoginAt)} />
                </>
              )}
            </Section>

            {traveler && <TravelerActivityPanel key={traveler.id} travelerId={traveler.id} />}

            {summary && (
              <Section title="Quyền truy cập hiện tại">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-primary" />
                  <StatusBadge tone={summary.tone}>{summary.title}</StatusBadge>
                </div>
                <ul className="list-disc pl-5 text-xs leading-relaxed text-ink">
                  {summary.items.map((it) => (
                    <li key={it}>{it}</li>
                  ))}
                </ul>
                {account && !roleForm && (
                  <button
                    type="button"
                    onClick={openRoleForm}
                    disabled={account.id === currentAccountId}
                    title={account.id === currentAccountId ? 'Bạn không thể tự đổi quyền của chính mình' : undefined}
                    className={`${actionButtonClass('brand')} w-fit disabled:cursor-not-allowed disabled:opacity-50`}
                  >
                    <ShieldCheck className="h-3 w-3" /> Đổi quyền
                  </button>
                )}
                {account && roleForm && (
                  <div className="flex flex-col gap-2 rounded-md bg-canvas p-3 text-xs">
                    <p className="font-semibold text-ink-deep">
                      Đổi quyền: {account.role === 'ADMIN' ? 'Quản trị viên → Nhà cung cấp' : 'Nhà cung cấp → Quản trị viên'}
                    </p>
                    {account.role === 'ADMIN' && (
                      <select
                        value={roleForm.providerId}
                        onChange={(e) => setRoleForm({ ...roleForm, providerId: e.target.value, confirming: false })}
                        className={inputClass}
                        aria-label="Nhà cung cấp"
                      >
                        <option value="">— Chọn nhà cung cấp chưa có tài khoản —</option>
                        {freeProviders.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    )}
                    <textarea
                      rows={2}
                      value={roleForm.reason}
                      onChange={(e) => setRoleForm({ ...roleForm, reason: e.target.value, confirming: false })}
                      placeholder="Lý do đổi quyền (bắt buộc)"
                      aria-label="Lý do đổi quyền"
                      className="w-full rounded-md border border-border bg-white px-3 py-2 text-xs text-ink focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                    {roleForm.confirming && (
                      <p role="alert" className="rounded-md bg-sun/10 px-3 py-2 text-[11px] text-amber-700">
                        Xác nhận: quyền của tài khoản sẽ đổi ngay và mọi phiên đăng nhập đang mở của tài khoản này bị đăng xuất.
                      </p>
                    )}
                    {roleError && <p className="text-danger">{roleError}</p>}
                    <div className="flex flex-wrap justify-end gap-2">
                      <button type="button" onClick={() => setRoleForm(null)} className="min-h-11 rounded-md px-3 py-2 text-xs font-medium text-muted hover:bg-hover">
                        Hủy
                      </button>
                      <button
                        type="button"
                        onClick={() => void submitRole()}
                        disabled={roleSaving}
                        className="min-h-11 rounded-md bg-primary px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                      >
                        {roleSaving ? 'Đang đổi...' : roleForm.confirming ? 'Xác nhận đổi quyền' : 'Xem lại'}
                      </button>
                    </div>
                  </div>
                )}
              </Section>
            )}

            {account && (
              <button
                type="button"
                onClick={() => onResetPassword({ id: account.id, email: account.email ?? account.phone ?? `#${account.id}` })}
                disabled={account.id === currentAccountId}
                title={account.id === currentAccountId ? 'Hãy đổi mật khẩu của chính bạn ở trang cá nhân' : undefined}
                className={`${actionButtonClass('warning')} w-fit disabled:cursor-not-allowed disabled:opacity-50`}
              >
                <KeyRound className="h-3 w-3" /> Đặt lại mật khẩu
              </button>
            )}
          </>
        )}
      </aside>
    </div>
    </OverlayPortal>
  );
}

function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex min-w-0 flex-col gap-2 rounded-md border border-border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-[11px] font-bold uppercase tracking-wider text-muted">{title}</h4>
        {action}
      </div>
      {children}
    </section>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] items-start gap-3 text-xs">
      <span className="break-words text-muted">{k}</span>
      <span className="min-w-0 break-words text-right text-ink">{v}</span>
    </div>
  );
}
