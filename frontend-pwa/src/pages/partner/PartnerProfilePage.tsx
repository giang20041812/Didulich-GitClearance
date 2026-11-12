import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AlertCircle, Lock, Save, User } from 'lucide-react';
import type { PortalLoginResponse } from '@/types/user';
import { PageHeader } from '@/components/partner/PartnerUI';
import { clearPortalSession } from '@/lib/authInterceptor';
import { changePortalPassword } from '@/services/authService';

export default function PartnerProfilePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get('tab') || 'info';
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [isSavingPassword, setIsSavingPassword] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem('portal_user');
      if (raw) {
        const session = JSON.parse(raw) as PortalLoginResponse;
        setName(session.fullName || session.provider?.name || '');
        setEmail(session.email || '');
        setPhone(session.phone || '');
      }
    } catch {
      // Ignore an invalid stale local session.
    }
  }, []);

  const handleUpdateInfo = (event: React.FormEvent) => {
    event.preventDefault();
    setSuccessMsg('Đã cập nhật thông tin thành công.');
    window.setTimeout(() => setSuccessMsg(''), 3000);
  };

  const handleChangePassword = (event: React.FormEvent) => {
    event.preventDefault();
    setErrorMsg('');
    if (newPassword !== confirmPassword) {
      setErrorMsg('Mật khẩu xác nhận không khớp.');
      return;
    }
    if (newPassword.length < 6) {
      setErrorMsg('Mật khẩu mới phải có ít nhất 6 ký tự.');
      return;
    }

    setIsSavingPassword(true);
    void changePortalPassword({ currentPassword: oldPassword, newPassword })
      .then(() => {
        setSuccessMsg('Đổi mật khẩu thành công. Bạn sẽ được chuyển đến trang đăng nhập.');
        setOldPassword('');
        setNewPassword('');
        setConfirmPassword('');
        window.setTimeout(() => {
          clearPortalSession({ revoke: false });
          window.location.assign('/portal/login');
        }, 1200);
      })
      .catch((error: unknown) => {
        const responseError = error && typeof error === 'object' && 'message' in error
          && typeof error.message === 'string' ? error.message : null;
        setErrorMsg(responseError ?? 'Không thể đổi mật khẩu. Vui lòng thử lại.');
      })
      .finally(() => setIsSavingPassword(false));
  };

  return (
    <div className="max-w-3xl mx-auto flex flex-col gap-6">
      <PageHeader breadcrumbs={[{ label: 'Bảng điều khiển', to: '/partner/overview' }, { label: 'Tài khoản & Bảo mật' }]} title="Tài khoản & Bảo mật" />
      <div className="bg-white border border-border rounded-lg overflow-hidden shadow-sm">
        <div className="flex border-b border-border">
          <button onClick={() => setSearchParams({ tab: 'info' })} className={`flex-1 py-3 text-sm font-semibold text-center transition-colors ${tab === 'info' ? 'border-b-2 border-primary text-primary bg-primary-50/50' : 'text-muted hover:text-ink hover:bg-canvas'}`}>
            <User className="inline-block w-4 h-4 mr-2" /> Thông tin cá nhân
          </button>
          <button onClick={() => setSearchParams({ tab: 'password' })} className={`flex-1 py-3 text-sm font-semibold text-center transition-colors ${tab === 'password' ? 'border-b-2 border-primary text-primary bg-primary-50/50' : 'text-muted hover:text-ink hover:bg-canvas'}`}>
            <Lock className="inline-block w-4 h-4 mr-2" /> Đổi mật khẩu
          </button>
        </div>
        <div className="p-6">
          {successMsg && <div className="mb-6 p-3 bg-accent/10 border border-accent/20 rounded-md flex items-center gap-2 text-primary-700 text-sm"><AlertCircle className="w-4 h-4" />{successMsg}</div>}
          {errorMsg && <div className="mb-6 p-3 bg-danger/10 border border-danger/20 rounded-md text-danger text-sm">{errorMsg}</div>}
          {tab === 'info' && <form onSubmit={handleUpdateInfo} className="space-y-4">
            <div><label className="block text-sm font-medium text-ink-deep mb-1">Tên nhà cung cấp / Họ tên</label><input type="text" value={name} onChange={(event) => setName(event.target.value)} className="w-full h-10 px-3 border border-border rounded-md text-sm focus:outline-none focus:border-primary" required /></div>
            <div><label className="block text-sm font-medium text-ink-deep mb-1">Email</label><input type="email" value={email} disabled className="w-full h-10 px-3 border border-border rounded-md text-sm bg-canvas text-muted cursor-not-allowed" /></div>
            <div><label className="block text-sm font-medium text-ink-deep mb-1">Số điện thoại</label><input type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} className="w-full h-10 px-3 border border-border rounded-md text-sm focus:outline-none focus:border-primary" /></div>
            <div className="pt-4 border-t border-border flex justify-end"><button type="submit" className="flex items-center gap-2 px-6 py-2 bg-primary text-white text-sm font-semibold rounded-md hover:bg-primary-hover shadow-sm"><Save className="w-4 h-4" /> Lưu thay đổi</button></div>
          </form>}
          {tab === 'password' && <form onSubmit={handleChangePassword} className="space-y-4">
            <div><label className="block text-sm font-medium text-ink-deep mb-1">Mật khẩu hiện tại</label><input type="password" value={oldPassword} onChange={(event) => setOldPassword(event.target.value)} className="w-full h-10 px-3 border border-border rounded-md text-sm focus:outline-none focus:border-primary" required autoComplete="current-password" /></div>
            <div><label className="block text-sm font-medium text-ink-deep mb-1">Mật khẩu mới</label><input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} className="w-full h-10 px-3 border border-border rounded-md text-sm focus:outline-none focus:border-primary" required minLength={6} autoComplete="new-password" /></div>
            <div><label className="block text-sm font-medium text-ink-deep mb-1">Xác nhận mật khẩu mới</label><input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} className="w-full h-10 px-3 border border-border rounded-md text-sm focus:outline-none focus:border-primary" required autoComplete="new-password" /></div>
            <div className="pt-4 border-t border-border flex justify-end"><button type="submit" disabled={isSavingPassword} className="flex items-center gap-2 px-6 py-2 bg-coral text-white text-sm font-semibold rounded-md hover:bg-coral-hover shadow-sm disabled:opacity-60"><Save className="w-4 h-4" /> {isSavingPassword ? 'Đang cập nhật...' : 'Cập nhật mật khẩu'}</button></div>
          </form>}
        </div>
      </div>
    </div>
  );
}
