import { useEffect, useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { AlertCircle, Lock, Save, User } from 'lucide-react';
import { getCurrentCustomer, changeTravelerPassword, logoutCurrentSession, updateTravelerProfile } from '@/services/authService';
import { phoneError as phoneProblem } from '@/lib/fieldValidation';
import { installAxiosBoot } from '@/lib/axiosBoot';

// Trang dùng axios (đổi thông tin, mật khẩu — services/authService): cài cấu hình (baseURL, hàng đợi / hedge /
// interceptor) trước request đầu tiên.
installAxiosBoot();

/** Hồ sơ chỉ giữ thông tin tài khoản — lịch trình và nơi đã check-in nằm ở tab "Của tôi" của trang Lịch trình. */
const PROFILE_TABS = [
  { id: 'info', Icon: User, label: 'Thông tin cá nhân', short: 'Thông tin' },
  { id: 'password', Icon: Lock, label: 'Đổi mật khẩu', short: 'Mật khẩu' },
] as const;

export default function UserProfilePage() {
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
  const [isSavingInfo, setIsSavingInfo] = useState(false);
  const [infoTouched, setInfoTouched] = useState(false);

  useEffect(() => {
    const customer = getCurrentCustomer();
    if (customer) {
      setName(customer.fullName || '');
      setEmail(customer.email || '');
      setPhone(customer.phone || '');
    } else {
      window.location.assign('/login');
    }
  }, []);

  const nameProblem = name.trim().length < 2 ? 'Họ và tên phải có ít nhất 2 ký tự.' : null;
  // Số Việt Nam 10 chữ số (để trống được); cùng quy tắc với backend.
  const phoneIssue = phone.trim() && !/^(0|\+84)[35789]\d{8}$/.test(phone.trim().replace(/[\s.()-]/g, '')) ? (phoneProblem(phone) ?? 'Số điện thoại không đúng định dạng (VD: 0912345678).') : null;

  /** Lưu thật lên máy chủ (trước đây chỉ hiện "đã cập nhật" mà không lưu gì). */
  const handleUpdateInfo = (event: React.FormEvent) => {
    event.preventDefault();
    setInfoTouched(true);
    setErrorMsg('');
    setSuccessMsg('');
    if (nameProblem || phoneIssue) return;
    setIsSavingInfo(true);
    void updateTravelerProfile({ fullName: name.trim(), phone: phone.trim() })
      .then(() => {
        const updated = getCurrentCustomer();
        if (updated) { setName(updated.fullName || ''); setPhone(updated.phone || ''); }
        setSuccessMsg('Đã lưu thông tin cá nhân.');
        window.setTimeout(() => setSuccessMsg(''), 3000);
      })
      .catch((error: unknown) => {
        const message = error && typeof error === 'object' && 'message' in error && typeof error.message === 'string' ? error.message : null;
        setErrorMsg(message ?? 'Không lưu được thông tin. Vui lòng thử lại.');
      })
      .finally(() => setIsSavingInfo(false));
  };

  const handleChangePassword = (event: React.FormEvent) => {
    event.preventDefault();
    setErrorMsg('');
    if (newPassword !== confirmPassword) {
      setErrorMsg('Mật khẩu xác nhận không khớp.');
      return;
    }
    if (newPassword.length < 8) {
      setErrorMsg('Mật khẩu mới phải có ít nhất 8 ký tự.');
      return;
    }

    setIsSavingPassword(true);
    void changeTravelerPassword({ currentPassword: oldPassword, newPassword })
      .then(() => {
        setSuccessMsg('Đổi mật khẩu thành công. Bạn sẽ được chuyển đến trang đăng nhập.');
        setOldPassword('');
        setNewPassword('');
        setConfirmPassword('');
        window.setTimeout(() => {
          logoutCurrentSession();
          window.location.assign('/login');
        }, 1200);
      })
      .catch((error: unknown) => {
        const responseError = error && typeof error === 'object' && 'message' in error
          && typeof error.message === 'string' ? error.message : null;
        setErrorMsg(responseError ?? 'Không thể đổi mật khẩu. Vui lòng thử lại.');
      })
      .finally(() => setIsSavingPassword(false));
  };

  // Link cũ tới tab lịch trình / địa điểm đã đi của hồ sơ.
  if (tab === 'trips' || tab === 'visited') return <Navigate to="/lich-trinh?tab=cua-toi" replace />;

  return (
    <div className="w-full min-h-[calc(100vh-140px)] p-4 sm:p-6 lg:p-10 bg-[#F6FAF8] overflow-y-auto">
      <div className="max-w-2xl mx-auto flex flex-col gap-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">Hồ sơ cá nhân</h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">Quản lý thông tin tài khoản và bảo mật của bạn</p>
        </div>

        <div className="bg-white border border-slate-200/80 rounded-2xl overflow-hidden shadow-xs">
          {/* Tab Switcher */}
          <div className="p-3 sm:p-4 border-b border-slate-100 bg-slate-50/50">
            <div className="flex gap-1.5 rounded-xl bg-slate-200/60 p-1.5" role="tablist" aria-label="Mục hồ sơ">
              {PROFILE_TABS.map(({ id, Icon, label, short }) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={tab === id}
                  onClick={() => setSearchParams({ tab: id })}
                  className={`flex min-w-0 flex-1 items-center justify-center gap-2 py-2.5 px-3 text-xs sm:text-sm font-bold rounded-lg transition-all cursor-pointer ${
                    tab === id ? 'bg-white text-[var(--color-primary)] shadow-xs' : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="truncate sm:hidden">{short}</span>
                  <span className="hidden truncate sm:inline">{label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="p-6 sm:p-8">
            {successMsg && (
              <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2.5 text-emerald-800 text-xs sm:text-sm font-medium">
                <AlertCircle className="w-4 h-4 shrink-0 text-emerald-600" />
                <span>{successMsg}</span>
              </div>
            )}
            {errorMsg && (
              <div className="mb-6 p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-2.5 text-rose-800 text-xs sm:text-sm font-medium">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                <span>{errorMsg}</span>
              </div>
            )}
            
            {tab === 'info' && (
              <form onSubmit={handleUpdateInfo} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">Họ và tên</label>
                  <input
                    type="text"
                    value={name}
                    maxLength={255}
                    onChange={(event) => setName(event.target.value)}
                    onBlur={() => setInfoTouched(true)}
                    className={`w-full h-11 px-4 border rounded-xl text-sm transition-all focus:outline-none ${
                      infoTouched && nameProblem
                        ? 'border-rose-400 bg-rose-50/20 focus:border-rose-500'
                        : 'border-slate-200 focus:border-[var(--color-primary)] focus:ring-2 focus:ring-emerald-500/10'
                    }`}
                  />
                  {infoTouched && nameProblem && (
                    <p role="alert" className="mt-1 text-xs font-semibold text-rose-500">{nameProblem}</p>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">Email đăng nhập</label>
                  <input
                    type="email"
                    value={email}
                    disabled
                    className="w-full h-11 px-4 border border-slate-200 rounded-xl text-sm bg-slate-50 text-slate-400 cursor-not-allowed"
                  />
                  <p className="mt-1.5 text-xs text-slate-400">Email dùng để đăng nhập nên không thể thay đổi tại đây.</p>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">Số điện thoại</label>
                  <input
                    type="tel"
                    inputMode="tel"
                    value={phone}
                    maxLength={16}
                    placeholder="VD: 0912 345 678"
                    onChange={(event) => setPhone(event.target.value)}
                    onBlur={() => setInfoTouched(true)}
                    className={`w-full h-11 px-4 border rounded-xl text-sm transition-all focus:outline-none ${
                      infoTouched && phoneIssue
                        ? 'border-rose-400 bg-rose-50/20 focus:border-rose-500'
                        : 'border-slate-200 focus:border-[var(--color-primary)] focus:ring-2 focus:ring-emerald-500/10'
                    }`}
                  />
                  {infoTouched && phoneIssue && (
                    <p role="alert" className="mt-1 text-xs font-semibold text-rose-500">{phoneIssue}</p>
                  )}
                </div>
                <div className="pt-4 border-t border-slate-100 flex justify-end">
                  <button
                    type="submit"
                    disabled={isSavingInfo}
                    className="flex items-center gap-2 h-11 px-6 cta cta-primary text-white text-xs sm:text-sm font-bold rounded-xl shadow-sm transition-all active:scale-95 disabled:opacity-60 cursor-pointer"
                  >
                    <Save className="w-4 h-4" />
                    <span>{isSavingInfo ? 'Đang lưu...' : 'Lưu thay đổi'}</span>
                  </button>
                </div>
              </form>
            )}

            {tab === 'password' && (
              <form onSubmit={handleChangePassword} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">Mật khẩu hiện tại</label>
                  <input
                    type="password"
                    value={oldPassword}
                    onChange={(event) => setOldPassword(event.target.value)}
                    className="w-full h-11 px-4 border border-slate-200 rounded-xl text-sm transition-all focus:outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-emerald-500/10"
                    required
                    autoComplete="current-password"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">Mật khẩu mới (tối thiểu 8 ký tự)</label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                    className="w-full h-11 px-4 border border-slate-200 rounded-xl text-sm transition-all focus:outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-emerald-500/10"
                    required
                    minLength={8}
                    autoComplete="new-password"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">Xác nhận mật khẩu mới</label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    className="w-full h-11 px-4 border border-slate-200 rounded-xl text-sm transition-all focus:outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-emerald-500/10"
                    required
                    autoComplete="new-password"
                  />
                </div>
                <div className="pt-4 border-t border-slate-100 flex justify-end">
                  <button
                    type="submit"
                    disabled={isSavingPassword}
                    className="flex items-center gap-2 h-11 px-6 cta cta-coral text-white text-xs sm:text-sm font-bold rounded-xl shadow-sm transition-all active:scale-95 disabled:opacity-60 cursor-pointer"
                  >
                    <Save className="w-4 h-4" />
                    <span>{isSavingPassword ? 'Đang cập nhật...' : 'Cập nhật mật khẩu'}</span>
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
