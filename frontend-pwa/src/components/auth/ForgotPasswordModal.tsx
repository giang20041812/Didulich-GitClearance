import { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Eye, EyeOff, HelpCircle, KeyRound, Mail, RefreshCw, Send, X } from 'lucide-react';
import { authInputClass } from '@/components/auth/AuthShell';
import { requestPasswordReset, resetPasswordWithOtp } from '@/services/authService';
import type { AuthErrorResponse } from '@/types/user';

const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
const VN_PHONE_REGEX = /^(0|\+84)(3|5|7|8|9)[0-9]{8}$/;
const MIN_PASSWORD = 6;

interface ForgotPasswordModalProps {
  /** Điền sẵn email/SĐT người dùng đã gõ ở form đăng nhập. */
  initialIdentifier?: string;
  onClose: () => void;
  /** Gọi sau khi đổi mật khẩu thành công để form đăng nhập điền sẵn tài khoản. */
  onDone: (identifier: string) => void;
}

type Step = 'request' | 'reset' | 'done';

const toMessage = (err: unknown, fallback: string) =>
  err && typeof err === 'object' && 'message' in err && typeof (err as AuthErrorResponse).message === 'string'
    ? (err as AuthErrorResponse).message
    : fallback;

/** Quên mật khẩu 2 bước: nhận OTP 6 số qua email → nhập OTP + mật khẩu mới. */
export function ForgotPasswordModal({ initialIdentifier = '', onClose, onDone }: ForgotPasswordModalProps) {
  const [step, setStep] = useState<Step>('request');
  const [identifier, setIdentifier] = useState(initialIdentifier);
  const [otp, setOtp] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ttl, setTtl] = useState(10);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const validIdentifier = () => {
    const id = identifier.trim();
    return EMAIL_REGEX.test(id) || VN_PHONE_REGEX.test(id);
  };

  const sendOtp = async () => {
    setError(null);
    if (!validIdentifier()) {
      setError('Vui lòng nhập email hoặc số điện thoại hợp lệ của tài khoản.');
      return;
    }
    setLoading(true);
    try {
      const res = await requestPasswordReset(identifier.trim());
      setTtl(res.otpTtlMinutes);
      setCooldown(res.resendAfterSeconds);
      setStep('reset');
    } catch (err: unknown) {
      setError(toMessage(err, 'Không thể gửi yêu cầu lúc này. Vui lòng thử lại sau.'));
    } finally {
      setLoading(false);
    }
  };

  const submitReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!/^\d{6}$/.test(otp.trim())) {
      setError('Mã OTP gồm đúng 6 chữ số.');
      return;
    }
    if (password.length < MIN_PASSWORD) {
      setError(`Mật khẩu mới tối thiểu ${MIN_PASSWORD} ký tự.`);
      return;
    }
    if (password !== confirm) {
      setError('Mật khẩu xác nhận không khớp.');
      return;
    }
    setLoading(true);
    try {
      await resetPasswordWithOtp(identifier.trim(), otp.trim(), password);
      setStep('done');
    } catch (err: unknown) {
      setError(toMessage(err, 'Không thể đặt lại mật khẩu lúc này. Vui lòng thử lại sau.'));
    } finally {
      setLoading(false);
    }
  };

  const primaryBtn =
    'flex h-11 flex-1 items-center justify-center gap-2 rounded-xl cta cta-primary text-sm font-bold text-white shadow-sm transition disabled:opacity-60 cursor-pointer';
  const ghostBtn =
    'h-11 flex-1 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-colors cursor-pointer';

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div role="dialog" aria-modal="true" aria-label="Khôi phục mật khẩu" className="relative w-full max-w-md rounded-3xl border border-slate-200/90 bg-white p-7 shadow-2xl shadow-slate-900/10">
        <button type="button" onClick={onClose} className="absolute right-5 top-5 rounded-full p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700" aria-label="Đóng">
          <X className="h-5 w-5" />
        </button>

        <div className="mb-5 flex items-center gap-3.5">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-teal-50 border border-teal-100 text-[var(--color-primary)]">
            <HelpCircle className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-900">Khôi phục mật khẩu</h3>
            <p className="text-xs font-medium text-slate-500">
              {step === 'request' ? 'Bước 1/2 · Nhận mã OTP qua email' : step === 'reset' ? 'Bước 2/2 · Nhập mã OTP và mật khẩu mới' : 'Hoàn tất'}
            </p>
          </div>
        </div>

        {step === 'request' && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void sendOtp();
            }}
            className="space-y-4"
          >
            <p className="text-xs leading-relaxed text-slate-600">
              Nhập email hoặc số điện thoại đăng ký tài khoản. Chúng tôi sẽ gửi mã OTP 6 số đến email của tài khoản.
            </p>
            <div>
              <label htmlFor="forgot-identifier" className="mb-1.5 block text-xs font-semibold text-slate-800">
                Email hoặc số điện thoại
              </label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
                <input
                  id="forgot-identifier"
                  type="text"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="ban@gmail.com hoặc 09xxxxxxxx"
                  autoComplete="username"
                  className={authInputClass}
                />
              </div>
            </div>
            {error && (
              <p role="alert" className="flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50/80 p-2.5 text-xs text-rose-700">
                <AlertCircle className="h-4 w-4 shrink-0" /> {error}
              </p>
            )}
            <div className="flex gap-2.5 pt-1">
              <button type="button" onClick={onClose} className={ghostBtn}>Hủy</button>
              <button type="submit" disabled={loading} className={primaryBtn}>
                {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <><Send className="h-4 w-4" /> Gửi mã OTP</>}
              </button>
            </div>
          </form>
        )}

        {step === 'reset' && (
          <form onSubmit={submitReset} className="space-y-4">
            <div className="rounded-2xl border border-teal-100 bg-teal-50/70 p-3.5 text-xs leading-relaxed text-slate-700">
              Nếu tài khoản <strong>{identifier.trim()}</strong> tồn tại và có email, mã OTP đã được gửi (hiệu lực {ttl} phút). Hãy kiểm tra cả hộp thư rác.
            </div>
            <div>
              <label htmlFor="forgot-otp" className="mb-1.5 block text-xs font-semibold text-slate-800">Mã OTP (6 số)</label>
              <div className="relative">
                <KeyRound className="pointer-events-none absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
                <input
                  id="forgot-otp"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                  placeholder="______"
                  className={`${authInputClass} text-center font-mono text-lg tracking-[0.5em] bg-slate-50/60`}
                />
              </div>
            </div>
            <div>
              <label htmlFor="forgot-new" className="mb-1.5 block text-xs font-semibold text-slate-800">Mật khẩu mới</label>
              <div className="relative">
                <input
                  id="forgot-new"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={`Tối thiểu ${MIN_PASSWORD} ký tự`}
                  className={`${authInputClass} pr-10`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                  className="absolute right-3.5 top-3 text-slate-400 hover:text-slate-700"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div>
              <label htmlFor="forgot-confirm" className="mb-1.5 block text-xs font-semibold text-slate-800">Nhập lại mật khẩu mới</label>
              <input
                id="forgot-confirm"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className={authInputClass}
              />
            </div>
            {error && (
              <p role="alert" className="flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50/80 p-2.5 text-xs text-rose-700">
                <AlertCircle className="h-4 w-4 shrink-0" /> {error}
              </p>
            )}
            <div className="flex items-center justify-between text-xs">
              <button type="button" onClick={() => { setStep('request'); setError(null); }} className="font-medium text-slate-500 hover:text-slate-800">
                ← Đổi email / SĐT
              </button>
              <button
                type="button"
                disabled={cooldown > 0 || loading}
                onClick={() => void sendOtp()}
                className="font-bold text-[var(--color-primary)] hover:underline disabled:cursor-not-allowed disabled:text-slate-400 disabled:no-underline"
              >
                {cooldown > 0 ? `Gửi lại mã sau ${cooldown}s` : 'Gửi lại mã'}
              </button>
            </div>
            <div className="flex gap-2.5 pt-1">
              <button type="button" onClick={onClose} className={ghostBtn}>Hủy</button>
              <button type="submit" disabled={loading} className={primaryBtn}>
                {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : 'Đặt lại mật khẩu'}
              </button>
            </div>
          </form>
        )}

        {step === 'done' && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-emerald-500/20 bg-emerald-50/70 p-5 text-center">
              <CheckCircle2 className="mx-auto h-9 w-9 text-emerald-600" />
              <h4 className="mt-2.5 text-base font-bold text-emerald-900">Đặt lại mật khẩu thành công</h4>
              <p className="mt-1 text-xs text-emerald-700">Bạn có thể đăng nhập bằng mật khẩu mới ngay bây giờ.</p>
            </div>
            <button type="button" onClick={() => onDone(identifier.trim())} className={`${primaryBtn} w-full`}>
              Về trang đăng nhập
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default ForgotPasswordModal;
