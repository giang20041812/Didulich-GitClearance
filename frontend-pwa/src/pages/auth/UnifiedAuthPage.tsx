import React, { useState, useMemo, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  Lock,
  Mail,
  RefreshCw,
  ShieldCheck,
  User,
} from 'lucide-react';
import { AuthDivider, AuthShell, authInputClass } from '@/components/auth/AuthShell';
import { GoogleSignInButton } from '@/components/auth/GoogleSignInButton';
import { ForgotPasswordModal } from '@/components/auth/ForgotPasswordModal';
import { GoogleSignupDialog } from '@/components/auth/GoogleSignupDialog';
import { installAxiosBoot } from '@/lib/axiosBoot';
import {
  googleSignIn,
  portalLogin,
  saveTravelerSession,
  travelerLogin,
  travelerRegister,
  type GoogleSignupProfile,
} from '@/services/authService';
import { clearPortalSessionNotice, readPortalSessionNotice } from '@/lib/authInterceptor';
import { fetchMyBookings } from '@/services/bookingService';
import type { GoogleLoginResponse } from '@/types/integrations/google-identity';
import type { AuthErrorResponse } from '@/types/user';
import { emailError } from '@/lib/fieldValidation';

installAxiosBoot();

const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
// Số điện thoại VN: 0xxxxxxxxx (10–11 số) hoặc +84xxxxxxxxx; cho phép khoảng trắng / dấu chấm / gạch ngang khi gõ.
const PHONE_REGEX = /^(\+?84|0)\d{8,10}$/;
const stripPhoneSeparators = (v: string) => v.replace(/[\s.\-]/g, '');
const normalizeLoginIdentifier = (v: string) => {
  const t = v.trim();
  return t.includes('@') ? t : stripPhoneSeparators(t);
};

export interface UnifiedAuthPageProps {
  initialMode?: 'login' | 'register';
}

export default function UnifiedAuthPage({ initialMode }: UnifiedAuthPageProps) {
  const navigate = useNavigate();
  const location = useLocation();

  // Xác định mode mặc định dựa vào URL hoặc prop truyền vào
  const detectInitialMode = (): 'login' | 'register' => {
    if (initialMode) return initialMode;
    if (location.pathname.startsWith('/register')) return 'register';
    return 'login';
  };

  const [mode, setMode] = useState<'login' | 'register'>(detectInitialMode);

  // Đồng bộ khi URL thay đổi (VD người dùng nhấn nút Back/Forward của trình duyệt)
  useEffect(() => {
    if (location.pathname.startsWith('/register')) {
      setMode('register');
    } else if (
      location.pathname.startsWith('/login') ||
      location.pathname.startsWith('/portal/login') ||
      location.pathname.startsWith('/admin/login')
    ) {
      setMode('login');
    }
  }, [location.pathname]);

  // Thông tin điều hướng đích sau khi đăng nhập/đăng ký thành công
  const loginState = useMemo(() => {
    const state: unknown = location.state;
    if (!state || typeof state !== 'object') return null;
    const candidate = state as {
      returnUrl?: unknown;
      returnTo?: unknown;
      bookingState?: unknown;
      message?: unknown;
      from?: unknown;
    };
    const destination =
      typeof candidate.returnTo === 'string'
        ? candidate.returnTo
        : typeof candidate.returnUrl === 'string'
        ? candidate.returnUrl
        : typeof candidate.from === 'string'
        ? candidate.from
        : null;

    if (!destination || !destination.startsWith('/') || destination.startsWith('//') || destination === '/login') {
      return null;
    }
    return {
      destination,
      bookingState: candidate.bookingState,
      message: typeof candidate.message === 'string' ? candidate.message : undefined,
    };
  }, [location.state]);

  // Điều hướng thông minh sau khi khách đăng nhập / tạo tài khoản thành công
  const navigateAfterTravelerLogin = async (session?: GoogleLoginResponse) => {
    if (session) {
      saveTravelerSession(session);
    }

    if (loginState?.destination.startsWith('/qr/') || loginState?.destination.startsWith('/lich-trinh')) {
      navigate(loginState.destination, { replace: true });
      return;
    }

    try {
      const bookings = await fetchMyBookings();
      const pendingPayment = bookings.find((b) => b.status === 'CONFIRMED');
      if (pendingPayment) {
        navigate(`/bookings/${pendingPayment.bookingCode}`, { replace: true });
        return;
      }
    } catch (err) {
      console.warn('Could not check pending bookings on login:', err);
    }

    if (loginState) {
      navigate(loginState.destination, {
        replace: true,
        ...(loginState.bookingState !== undefined ? { state: loginState.bookingState } : {}),
      });
      return;
    }
    navigate('/', { replace: true });
  };

  // ─── LOGIN STATES ───
  const [loginIdentifier, setLoginIdentifier] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [loginTouched, setLoginTouched] = useState<{ [key: string]: boolean }>({});
  const [loginError, setLoginError] = useState<AuthErrorResponse | null>(null);

  // ─── REGISTER STATES ───
  const [fullName, setFullName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [regTouched, setRegTouched] = useState<{ [key: string]: boolean }>({});
  const [regServerError, setRegServerError] = useState<string | null>(null);
  const [duplicates, setDuplicates] = useState<{
    email?: { value: string; message: string };
  }>({});

  // ─── GENERAL STATES ───
  const [isLoading, setIsLoading] = useState(false);
  const [isForgotOpen, setIsForgotOpen] = useState(false);
  const [googleSignup, setGoogleSignup] = useState<{ idToken: string; profile: GoogleSignupProfile } | null>(null);

  // Thông báo lý do phiên hết hạn (từ interceptor)
  const [sessionNotice] = useState(readPortalSessionNotice);
  useEffect(() => () => clearPortalSessionNotice(), []);

  // Nếu đã đăng nhập tài khoản Cổng Quản Trị / NCC, chuyển thẳng về dashboard
  useEffect(() => {
    const rawPortal = localStorage.getItem('portal_user');
    const portalToken = localStorage.getItem('portal_token');
    if (rawPortal && portalToken) {
      try {
        const parsed = JSON.parse(rawPortal);
        if (parsed.role === 'ADMIN') navigate('/admin', { replace: true });
        else if (parsed.role === 'PROVIDER') navigate('/partner', { replace: true });
      } catch {}
    }
  }, [navigate]);

  // Chuyển đổi mượt mà giữa Đăng nhập và Đăng ký ngay trong một giao diện
  const handleSwitchMode = (newMode: 'login' | 'register') => {
    if (mode === newMode) return;
    setMode(newMode);
    setLoginError(null);
    setRegServerError(null);

    // Cập nhật đường dẫn tương ứng mà không làm giật trang hay mất thông tin returnUrl
    const targetPath = newMode === 'register' ? '/register' : '/login';
    navigate(targetPath, { replace: true, state: location.state });
  };

  // ─── VALIDATION CHO FORM LOGIN ───
  const loginErrors = useMemo(() => {
    const errs: { [key: string]: string } = {};
    const cleanId = loginIdentifier.trim();
    if (!cleanId) {
      errs.identifier = 'Vui lòng nhập Email hoặc Số điện thoại.';
    } else if (cleanId.includes('@') ? !EMAIL_REGEX.test(cleanId) : !PHONE_REGEX.test(stripPhoneSeparators(cleanId))) {
      errs.identifier = 'Email hoặc Số điện thoại chưa đúng định dạng.';
    }

    if (!loginPassword) {
      errs.password = 'Vui lòng nhập mật khẩu.';
    }
    return errs;
  }, [loginIdentifier, loginPassword]);

  const isLoginFormValid = Object.keys(loginErrors).length === 0;

  // ─── VALIDATION CHO FORM REGISTER ───
  const regErrors = useMemo(() => {
    const errs: { [key: string]: string } = {};

    const cleanName = fullName.trim();
    if (!cleanName) {
      errs.fullName = 'Vui lòng nhập họ và tên.';
    } else if (cleanName.length < 2) {
      errs.fullName = 'Họ và tên phải có ít nhất 2 ký tự.';
    }

    const cleanEmail = regEmail.trim();
    if (!cleanEmail) {
      errs.email = 'Vui lòng nhập địa chỉ email.';
    } else if (!EMAIL_REGEX.test(cleanEmail)) {
      errs.email = 'Địa chỉ email không hợp lệ (VD: ban@gmail.com).';
    } else if (emailError(cleanEmail)) {
      errs.email = emailError(cleanEmail) ?? '';
    } else if (duplicates.email && duplicates.email.value === cleanEmail.toLowerCase()) {
      errs.email = duplicates.email.message;
    }

    if (!regPassword) {
      errs.password = 'Vui lòng nhập mật khẩu.';
    } else if (regPassword.length < 8) {
      errs.password = 'Mật khẩu phải chứa ít nhất 8 ký tự.';
    }

    if (!confirmPassword) {
      errs.confirmPassword = 'Vui lòng xác nhận lại mật khẩu.';
    } else if (confirmPassword !== regPassword) {
      errs.confirmPassword = 'Mật khẩu xác nhận không khớp.';
    }

    return errs;
  }, [fullName, regEmail, regPassword, confirmPassword, duplicates]);

  // Độ an toàn mật khẩu khi đăng ký
  const passwordStrength = useMemo(() => {
    if (!regPassword) return { level: 0, label: '', color: '' };
    if (regPassword.length < 8) return { level: 1, label: 'Quá ngắn (ít nhất 8 ký tự)', color: 'bg-rose-500 text-rose-600' };

    let score = 1;
    if (/[A-Z]/.test(regPassword)) score++;
    if (/[0-9]/.test(regPassword)) score++;
    if (/[^A-Za-z0-9]/.test(regPassword)) score++;

    if (score <= 2) return { level: 2, label: 'Trung bình', color: 'bg-amber-500 text-amber-600' };
    return { level: 3, label: 'Mạnh & An toàn', color: 'bg-emerald-500 text-emerald-600' };
  }, [regPassword]);

  const isRegFormValid = Object.keys(regErrors).length === 0;

  // ─── XỬ LÝ SUBMIT ĐĂNG NHẬP ───
  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginTouched({ identifier: true, password: true });
    if (!isLoginFormValid) return;

    setIsLoading(true);
    setLoginError(null);
    const cleanId = normalizeLoginIdentifier(loginIdentifier);

    try {
      try {
        // 1. Thử đăng nhập Cổng Quản Trị (Admin hoặc NCC Partner)
        const res = await portalLogin({ identifier: cleanId, password: loginPassword });
        localStorage.setItem('portal_token', res.token);
        localStorage.setItem('portal_user', JSON.stringify(res));
        navigate(res.role === 'ADMIN' ? '/admin' : '/partner/bookings');
      } catch (err: unknown) {
        // NCC bị đình chỉ / chấm dứt
        if ((err as AuthErrorResponse)?.errorCode === 'PROVIDER_SUSPENDED') {
          navigate('/portal/suspended', { replace: true });
          return;
        }

        // Nếu không phải tài khoản Portal, thử tiếp tài khoản Khách du lịch (Traveler)
        if ((err as AuthErrorResponse)?.errorCode !== 'AUTH_INVALID_CREDENTIALS') throw err;

        try {
          const travelerRes = await travelerLogin(cleanId, loginPassword);
          saveTravelerSession(travelerRes);
          await navigateAfterTravelerLogin();
        } catch (travelerErr: unknown) {
          throw (travelerErr as AuthErrorResponse)?.errorCode === 'ACCOUNT_INACTIVE'
            ? travelerErr
            : err;
        }
      }
    } catch (err: unknown) {
      setLoginError(err as AuthErrorResponse);
    } finally {
      setIsLoading(false);
    }
  };

  // ─── XỬ LÝ SUBMIT ĐĂNG KÝ ───
  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegServerError(null);
    setRegTouched({
      fullName: true,
      email: true,
      password: true,
      confirmPassword: true,
    });

    if (!isRegFormValid) {
      setRegServerError('Vui lòng nhập đầy đủ và đúng các thông tin bắt buộc.');
      return;
    }

    setIsLoading(true);
    const submittedEmail = regEmail.trim().toLowerCase();
    try {
      const res = await travelerRegister({
        fullName: fullName.trim(),
        email: submittedEmail,
        password: regPassword,
        confirmPassword,
      });
      await navigateAfterTravelerLogin(res);
    } catch (err: unknown) {
      const fieldErrors = (err as AuthErrorResponse)?.fieldErrors ?? [];
      const emailDup = fieldErrors.find((f) => f.field === 'email');
      if (emailDup) {
        setDuplicates({
          email: { value: submittedEmail, message: emailDup.message },
        });
        return;
      }
      const message =
        (err as AuthErrorResponse)?.message ||
        (err instanceof Error ? err.message : 'Đăng ký không thành công. Vui lòng kiểm tra lại thông tin.');
      setRegServerError(message);
    } finally {
      setIsLoading(false);
    }
  };

  // ─── XỬ LÝ GOOGLE SIGN-IN ───
  const handleGoogleCredential = async (idToken: string) => {
    setIsLoading(true);
    setLoginError(null);
    setRegServerError(null);
    try {
      const result = await googleSignIn(idToken);
      if (result.kind === 'signup') {
        setGoogleSignup({ idToken: result.idToken, profile: result.profile });
        return;
      }
      saveTravelerSession(result.session);
      await navigateAfterTravelerLogin();
    } catch (err: unknown) {
      const authErr = err as AuthErrorResponse;
      if (mode === 'login') {
        setLoginError(authErr);
      } else {
        setRegServerError(authErr.message || 'Không thể đăng nhập bằng tài khoản Google.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <AuthShell
        title={mode === 'login' ? 'Đăng nhập tài khoản' : 'Tạo tài khoản mới'}
        subtitle={
          mode === 'login'
            ? 'Khám phá homestay Tây Bắc, quản lý đặt phòng và chuyến đi của bạn.'
            : 'Đăng ký để khám phá homestay, nhận ưu đãi độc quyền và quản lý chuyến đi Tây Bắc của bạn.'
        }
        footer={
          mode === 'login' ? (
            <p className="text-center text-xs text-slate-500">
              Đăng nhập hỗ trợ tài khoản Khách du lịch, Nhà cung cấp (homestay, trải nghiệm, nhà xe) và Ban quản trị hệ thống.
            </p>
          ) : null
        }
      >
        {/* Thông báo lý do bị chuyển về đây (hết hạn phiên cổng / cần đăng nhập để tiếp tục) */}
        {mode === 'login' && (sessionNotice ?? loginState?.message) && (
          <div
            role="status"
            className="mb-4 flex items-start gap-2.5 rounded-2xl border border-amber-200 bg-amber-50/80 p-3 text-xs font-medium text-amber-900"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <span>{sessionNotice ?? loginState?.message}</span>
          </div>
        )}

        {/* ─── TAB CHUYỂN ĐỔI: ĐÃ CÓ TÀI KHOẢN (ĐĂNG NHẬP) & ĐĂNG KÝ MỚI ─── */}
        <div className="mb-5 grid grid-cols-2 rounded-2xl bg-slate-100 p-1">
          <button
            type="button"
            onClick={() => handleSwitchMode('login')}
            className={`flex items-center justify-center rounded-xl py-2 text-xs font-bold transition-all duration-200 cursor-pointer ${
              mode === 'login'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-500 hover:text-slate-900 font-semibold'
            }`}
          >
            Đã có tài khoản
          </button>
          <button
            type="button"
            onClick={() => handleSwitchMode('register')}
            className={`flex items-center justify-center rounded-xl py-2 text-xs font-bold transition-all duration-200 cursor-pointer ${
              mode === 'register'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-500 hover:text-slate-900 font-semibold'
            }`}
          >
            Đăng ký mới
          </button>
        </div>

        {/* ─── BANNER DÀNH CHO ĐỐI TÁC / NHÀ CUNG CẤP ─── */}
        <div className="mb-5 flex items-center justify-between rounded-2xl bg-emerald-50/80 p-3.5 border border-emerald-100/90 text-xs">
          <div className="flex items-center gap-2.5">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-600 text-white font-bold text-[11px] shadow-2xs">
              NCC
            </span>
            <div className="leading-tight">
              <p className="font-bold text-emerald-950">Chủ Homestay · Nhà xe?</p>
              <p className="text-[11px] text-emerald-700">Đăng ký đối tác để kết nối khách</p>
            </div>
          </div>
          <Link
            to="/register/partner"
            className="shrink-0 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white shadow-2xs hover:bg-emerald-700 transition"
          >
            Đăng ký
          </Link>
        </div>

        {/* ─── NÚT GOOGLE SIGN-IN ─── */}
        <GoogleSignInButton
          text={mode === 'login' ? 'signin_with' : 'signup_with'}
          onCredential={handleGoogleCredential}
          onError={(msg) => {
            if (mode === 'login') {
              setLoginError({ status: 500, errorCode: 'GOOGLE_AUTH_ERROR', message: msg });
            } else {
              setRegServerError(msg);
            }
          }}
        />

        <AuthDivider
          label={mode === 'login' ? 'hoặc đăng nhập bằng tài khoản' : 'hoặc điền thông tin đăng ký'}
        />

        {/* ─── GIAO DIỆN 1: MỤC ĐĂNG NHẬP TÀI KHOẢN ─── */}
        {mode === 'login' && (
          <form onSubmit={handleLoginSubmit} className="flex flex-col gap-4 animate-in fade-in duration-200" noValidate>
            {/* Email hoặc Số điện thoại */}
            <div>
              <label
                htmlFor="loginIdentifier"
                className="mb-1.5 flex items-center justify-between text-xs font-semibold text-slate-800"
              >
                <span>Email hoặc Số điện thoại <span className="text-rose-500">*</span></span>
                {loginTouched.identifier && !loginErrors.identifier && (
                  <span className="flex items-center gap-1 text-xs text-emerald-600">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Hợp lệ
                  </span>
                )}
              </label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3.5 top-3.5 h-4 w-4 text-slate-400" />
                <input
                  id="loginIdentifier"
                  type="text"
                  value={loginIdentifier}
                  onChange={(e) => {
                    setLoginIdentifier(e.target.value);
                    setLoginError(null);
                  }}
                  onBlur={() => setLoginTouched((prev) => ({ ...prev, identifier: true }))}
                  placeholder="ban@gmail.com hoặc 09xx xxx xxx"
                  autoComplete="username"
                  className={`${authInputClass} ${
                    loginTouched.identifier && loginErrors.identifier
                      ? '!border-rose-400 !ring-rose-200'
                      : loginTouched.identifier && !loginErrors.identifier
                      ? '!border-emerald-500 !ring-emerald-200'
                      : ''
                  }`}
                />
              </div>
              {loginTouched.identifier && loginErrors.identifier && (
                <p className="mt-1 flex items-center gap-1 text-xs font-medium text-rose-600">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {loginErrors.identifier}
                </p>
              )}
            </div>

            {/* Mật khẩu & Quên mật khẩu */}
            <div>
              <div className="mb-1.5 flex items-center justify-between text-xs">
                <label htmlFor="loginPassword" className="font-semibold text-slate-800">
                  Mật khẩu <span className="text-rose-500">*</span>
                </label>
                <button
                  type="button"
                  onClick={() => setIsForgotOpen(true)}
                  className="font-semibold text-[var(--color-primary)] transition-colors hover:underline cursor-pointer"
                >
                  Quên mật khẩu?
                </button>
              </div>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3.5 top-3.5 h-4 w-4 text-slate-400" />
                <input
                  id="loginPassword"
                  type={showLoginPassword ? 'text' : 'password'}
                  value={loginPassword}
                  onChange={(e) => {
                    setLoginPassword(e.target.value);
                    setLoginError(null);
                  }}
                  onBlur={() => setLoginTouched((prev) => ({ ...prev, password: true }))}
                  placeholder="Nhập mật khẩu"
                  autoComplete="current-password"
                  className={`${authInputClass} pr-10 ${
                    loginTouched.password && loginErrors.password ? '!border-rose-400 !ring-rose-200' : ''
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowLoginPassword((v) => !v)}
                  aria-label={showLoginPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                  className="absolute right-3.5 top-3 text-slate-400 transition-colors hover:text-slate-700 cursor-pointer"
                >
                  {showLoginPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {loginTouched.password && loginErrors.password && (
                <p className="mt-1 flex items-center gap-1 text-xs font-medium text-rose-600">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {loginErrors.password}
                </p>
              )}
            </div>

            {/* Ghi nhớ đăng nhập */}
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="h-4 w-4 rounded-md border-slate-300 text-[var(--color-primary)] focus:ring-[var(--color-primary)]/20 accent-[var(--color-primary)] cursor-pointer"
                />
                <span className="text-xs font-medium text-slate-600">Ghi nhớ đăng nhập</span>
              </label>
            </div>

            {/* Lỗi đăng nhập tổng quát */}
            {loginError && (
              <div
                role="alert"
                className="flex items-start gap-2.5 rounded-2xl border border-rose-200 bg-rose-50/80 p-3 text-xs font-medium text-rose-700 animate-in fade-in duration-200"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" />
                <span>{loginError.message}</span>
              </div>
            )}

            {/* Nút Đăng nhập */}
            <button
              type="submit"
              disabled={!isLoginFormValid || isLoading}
              className={`flex h-11 w-full items-center justify-center gap-2 rounded-xl text-sm font-bold text-white shadow-md shadow-teal-900/10 transition-all duration-200 cursor-pointer ${
                !isLoginFormValid || isLoading
                  ? 'cursor-not-allowed bg-slate-200 text-slate-400 shadow-none'
                  : 'cta cta-primary hover:-translate-y-0.5 active:translate-y-0'
              }`}
            >
              {isLoading ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" /> Đang đăng nhập...
                </>
              ) : (
                <>
                  Đăng nhập <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>
        )}

        {/* ─── GIAO DIỆN 2: MỤC ĐĂNG KÝ TÀI KHOẢN MỚI ─── */}
        {mode === 'register' && (
          <form onSubmit={handleRegisterSubmit} className="flex flex-col gap-4 animate-in fade-in duration-200" noValidate>
            {/* Họ và tên */}
            <div>
              <label htmlFor="regFullName" className="mb-1.5 flex items-center justify-between text-xs font-semibold text-slate-800">
                <span>Họ và tên <span className="text-rose-500">*</span></span>
                {regTouched.fullName && !regErrors.fullName && (
                  <span className="flex items-center gap-1 text-xs text-emerald-600">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Hợp lệ
                  </span>
                )}
              </label>
              <div className="relative">
                <User className="pointer-events-none absolute left-3.5 top-3.5 h-4 w-4 text-slate-400" />
                <input
                  id="regFullName"
                  type="text"
                  value={fullName}
                  onChange={(e) => {
                    setFullName(e.target.value);
                    setRegServerError(null);
                  }}
                  onBlur={() => setRegTouched((prev) => ({ ...prev, fullName: true }))}
                  placeholder="Nguyễn Văn A"
                  autoComplete="name"
                  className={`${authInputClass} ${
                    regTouched.fullName && regErrors.fullName
                      ? '!border-rose-400 !ring-rose-200'
                      : regTouched.fullName && !regErrors.fullName
                      ? '!border-emerald-500 !ring-emerald-200'
                      : ''
                  }`}
                />
              </div>
              {regTouched.fullName && regErrors.fullName && (
                <p className="mt-1 flex items-center gap-1 text-xs font-medium text-rose-600">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {regErrors.fullName}
                </p>
              )}
            </div>

            {/* Email */}
            <div>
              <label htmlFor="regEmail" className="mb-1.5 flex items-center justify-between text-xs font-semibold text-slate-800">
                <span>Email <span className="text-rose-500">*</span></span>
                {regTouched.email && !regErrors.email && (
                  <span className="flex items-center gap-1 text-xs text-emerald-600">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Hợp lệ
                  </span>
                )}
              </label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3.5 top-3.5 h-4 w-4 text-slate-400" />
                <input
                  id="regEmail"
                  type="email"
                  value={regEmail}
                  onChange={(e) => {
                    setRegEmail(e.target.value);
                    setRegServerError(null);
                  }}
                  onBlur={() => setRegTouched((prev) => ({ ...prev, email: true }))}
                  placeholder="ban@gmail.com"
                  autoComplete="email"
                  className={`${authInputClass} ${
                    regTouched.email && regErrors.email
                      ? '!border-rose-400 !ring-rose-200'
                      : regTouched.email && !regErrors.email
                      ? '!border-emerald-500 !ring-emerald-200'
                      : ''
                  }`}
                />
              </div>
              {regTouched.email && regErrors.email && (
                <p className="mt-1 flex items-center gap-1 text-xs font-medium text-rose-600">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {regErrors.email}
                </p>
              )}
            </div>

            {/* Mật khẩu & Độ an toàn */}
            <div>
              <label htmlFor="regPassword" className="mb-1.5 flex items-center justify-between text-xs font-semibold text-slate-800">
                <span>Mật khẩu <span className="text-rose-500">*</span></span>
                {regPassword && !regErrors.password && (
                  <span className="flex items-center gap-1 text-xs text-emerald-600">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Hợp lệ
                  </span>
                )}
              </label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3.5 top-3.5 h-4 w-4 text-slate-400" />
                <input
                  id="regPassword"
                  type={showRegPassword ? 'text' : 'password'}
                  value={regPassword}
                  onChange={(e) => {
                    setRegPassword(e.target.value);
                    setRegServerError(null);
                  }}
                  onBlur={() => setRegTouched((prev) => ({ ...prev, password: true }))}
                  placeholder="Tối thiểu 8 ký tự"
                  autoComplete="new-password"
                  className={`${authInputClass} pr-10 ${
                    regTouched.password && regErrors.password
                      ? '!border-rose-400 !ring-rose-200'
                      : regTouched.password && !regErrors.password
                      ? '!border-emerald-500 !ring-emerald-200'
                      : ''
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowRegPassword((v) => !v)}
                  aria-label={showRegPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                  className="absolute right-3.5 top-3 text-slate-400 transition-colors hover:text-slate-700 cursor-pointer"
                >
                  {showRegPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>

              {/* Chỉ báo độ an toàn mật khẩu */}
              {regPassword && (
                <div className="mt-2 space-y-1">
                  <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                    <div
                      className={`h-full transition-all duration-300 rounded-full ${
                        passwordStrength.level === 1
                          ? 'w-1/3 bg-rose-500'
                          : passwordStrength.level === 2
                          ? 'w-2/3 bg-amber-500'
                          : 'w-full bg-emerald-500'
                      }`}
                    />
                  </div>
                  <div className="flex justify-between text-[11px]">
                    <span className="text-slate-400">Độ an toàn:</span>
                    <span className={`font-semibold ${passwordStrength.color.split(' ')[1]}`}>
                      {passwordStrength.label}
                    </span>
                  </div>
                </div>
              )}

              {regTouched.password && regErrors.password && (
                <p className="mt-1 flex items-center gap-1 text-xs font-medium text-rose-600">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {regErrors.password}
                </p>
              )}
            </div>

            {/* Xác nhận lại mật khẩu */}
            <div>
              <label htmlFor="confirmPassword" className="mb-1.5 flex items-center justify-between text-xs font-semibold text-slate-800">
                <span>Xác nhận lại mật khẩu <span className="text-rose-500">*</span></span>
                {confirmPassword && regTouched.confirmPassword && !regErrors.confirmPassword && (
                  <span className="flex items-center gap-1 text-xs text-emerald-600">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Khớp mật khẩu
                  </span>
                )}
              </label>
              <div className="relative">
                <ShieldCheck className="pointer-events-none absolute left-3.5 top-3.5 h-4 w-4 text-slate-400" />
                <input
                  id="confirmPassword"
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => {
                    setConfirmPassword(e.target.value);
                    setRegServerError(null);
                  }}
                  onBlur={() => setRegTouched((prev) => ({ ...prev, confirmPassword: true }))}
                  placeholder="Nhập lại mật khẩu vừa đặt"
                  autoComplete="new-password"
                  className={`${authInputClass} pr-10 ${
                    regTouched.confirmPassword && regErrors.confirmPassword
                      ? '!border-rose-400 !ring-rose-200'
                      : confirmPassword && regTouched.confirmPassword && !regErrors.confirmPassword
                      ? '!border-emerald-500 !ring-emerald-200'
                      : ''
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((v) => !v)}
                  aria-label={showConfirmPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                  className="absolute right-3.5 top-3 text-slate-400 transition-colors hover:text-slate-700 cursor-pointer"
                >
                  {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {regTouched.confirmPassword && regErrors.confirmPassword && (
                <p className="mt-1 flex items-center gap-1 text-xs font-medium text-rose-600">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {regErrors.confirmPassword}
                </p>
              )}
            </div>

            {/* Lỗi máy chủ khi đăng ký */}
            {regServerError && (
              <div role="alert" className="flex items-start gap-2.5 rounded-2xl border border-rose-200 bg-rose-50/80 p-3 text-xs font-medium text-rose-700 animate-in fade-in duration-200">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" />
                <span>{regServerError}</span>
              </div>
            )}

            {/* Nút Hoàn tất đăng ký */}
            <button
              type="submit"
              disabled={!isRegFormValid || isLoading}
              className={`flex h-11 w-full items-center justify-center gap-2 rounded-xl text-sm font-bold text-white shadow-md shadow-teal-900/10 transition-all duration-200 cursor-pointer ${
                !isRegFormValid || isLoading
                  ? 'cursor-not-allowed bg-slate-200 text-slate-400 shadow-none'
                  : 'cta cta-primary hover:-translate-y-0.5 active:translate-y-0'
              }`}
            >
              {isLoading ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" /> Đang tạo tài khoản...
                </>
              ) : (
                <>
                  Hoàn tất đăng ký <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>
        )}
      </AuthShell>

      {/* Modal Quên Mật Khẩu */}
      {isForgotOpen && (
        <ForgotPasswordModal
          initialIdentifier={loginIdentifier}
          onClose={() => setIsForgotOpen(false)}
          onDone={(id) => {
            setLoginIdentifier(id);
            setLoginPassword('');
            setLoginError(null);
            setIsForgotOpen(false);
          }}
        />
      )}

      {/* Dialog tạo tài khoản bổ sung cho tài khoản Google lần đầu */}
      {googleSignup && (
        <GoogleSignupDialog
          idToken={googleSignup.idToken}
          profile={googleSignup.profile}
          onClose={() => setGoogleSignup(null)}
          onCreated={async (session) => {
            saveTravelerSession(session);
            setGoogleSignup(null);
            await navigateAfterTravelerLogin();
          }}
        />
      )}
    </>
  );
}
