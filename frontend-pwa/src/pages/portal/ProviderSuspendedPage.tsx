import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut, ShieldAlert } from 'lucide-react';
import { clearPortalSession } from '@/lib/authInterceptor';

/**
 * Màn hình toàn trang cho NCC bị đình chỉ hoặc chấm dứt: chỉ có thông báo, không có điều hướng nào khác
 * ngoài đăng xuất.
 */
export default function ProviderSuspendedPage() {
  const navigate = useNavigate();

  useEffect(() => {
    clearPortalSession();
  }, []);

  return (
    <div className="min-h-dvh bg-canvas flex items-center justify-center px-4 pb-[calc(2.5rem+var(--safe-bottom))] pt-[calc(2.5rem+var(--safe-top))] font-body">
      <div className="w-full max-w-md rounded-lg border border-border bg-surface p-8 text-center shadow-[var(--shadow-card)]">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-md bg-coral-light text-coral">
          <ShieldAlert className="h-8 w-8" />
        </span>
        <h1 className="mt-5 font-display text-2xl font-extrabold text-ink-deep">Tài khoản đang bị đình chỉ</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Tài khoản của bạn đang bị đình chỉ nên hiện không thể sử dụng. Vui lòng liên hệ ban quản trị để được mở lại.
        </p>

        <button
          type="button"
          onClick={() => navigate('/portal/login', { replace: true })}
          className="mt-6 inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-semibold text-muted transition-colors hover:bg-hover hover:text-primary"
        >
          <LogOut className="h-4 w-4" /> Đăng xuất
        </button>
      </div>
    </div>
  );
}
