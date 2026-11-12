import { useEffect, useState, type FormEvent } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { AlertCircle, Loader2, Phone } from 'lucide-react';
import { logoutCurrentSession, saveTravelerSession } from '@/lib/currentCustomer';
import { ApiError, travelerAccountApi } from '@/services/publicServicesApi';
import { phoneMissing } from '@/lib/phoneMissing';

const VN_PHONE = /^(0|\+84)(3|5|7|8|9)[0-9]{8}$/;

/**
 * Tài khoản khách (đăng ký bằng Google trước khi form bắt buộc số điện thoại) chưa có số điện thoại: lần vào sau hiện hộp
 * bắt buộc bổ sung — không đóng được, chỉ "Để sau, đăng xuất". Phiên đã có số thì không gọi máy chủ.
 */
export default function PhoneRequiredPrompt() {
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    const check = () => {
      if (!phoneMissing()) { setOpen(false); return; }
      travelerAccountApi.me()
        .then((me) => {
          if (!alive) return;
          if (me.phoneRequired) setOpen(true);
          else if (me.phone) {
            // Phiên lưu trên máy cũ hơn tài khoản (đã thêm số ở thiết bị khác): cập nhật lại.
            const user = JSON.parse(localStorage.getItem('traveler_user') ?? '{}') as Record<string, unknown>;
            localStorage.setItem('traveler_user', JSON.stringify({ ...user, phone: me.phone }));
          }
        })
        .catch(() => undefined);
    };
    check();
    window.addEventListener('auth_change', check);
    return () => { alive = false; window.removeEventListener('auth_change', check); };
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const clean = phone.trim().replace(/[\s.()-]/g, '');
    if (!VN_PHONE.test(clean)) { setError('Số điện thoại chưa đúng định dạng (VD: 0912 345 678).'); return; }
    setBusy(true);
    setError('');
    try {
      saveTravelerSession(await travelerAccountApi.addPhone(clean));
      setOpen(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Không lưu được số điện thoại.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog.Root open={open}>
      <Dialog.Portal>
        <Dialog.Overlay className="fade-in-overlay fixed inset-0 z-[10020] bg-ink-deep/50" />
        <Dialog.Content
          onEscapeKeyDown={(e) => e.preventDefault()}
          onPointerDownOutside={(e) => e.preventDefault()}
          className="sheet-in fixed inset-x-0 bottom-0 z-[10020] rounded-t-3xl bg-white p-6 pb-[calc(1.5rem+var(--safe-bottom))] shadow-[var(--shadow-lg)] sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:w-[min(440px,calc(100vw-32px))] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:pb-6"
        >
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary-50 text-primary"><Phone className="h-5 w-5" /></span>
          <Dialog.Title className="mt-3 text-lg font-bold text-ink-deep">Bổ sung số điện thoại</Dialog.Title>
          <Dialog.Description className="mt-1 text-sm text-slate-600">
            Tài khoản của bạn chưa có số điện thoại. Chủ nhà và nhà xe cần số này để liên hệ khi bạn đặt phòng, đặt combo.
          </Dialog.Description>
          <form onSubmit={(e) => { void submit(e); }} noValidate className="mt-4 space-y-3">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-slate-700">Số điện thoại</span>
              <input type="tel" inputMode="tel" autoComplete="tel" autoFocus value={phone} placeholder="VD: 0912 345 678"
                onChange={(e) => { setPhone(e.target.value); setError(''); }} aria-invalid={Boolean(error)}
                className={`w-full rounded-xl border bg-white px-3.5 py-3 text-base text-ink-deep focus:outline-none focus:ring-2 ${error ? 'border-danger focus:ring-danger/15' : 'border-slate-300 focus:border-primary focus:ring-primary/20'}`} />
            </label>
            {error && <p role="alert" className="flex items-center gap-1.5 text-xs text-danger"><AlertCircle className="h-3.5 w-3.5" /> {error}</p>}
            <button type="submit" disabled={busy} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-bold text-white hover:bg-primary-700 disabled:opacity-60">
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} Lưu số điện thoại
            </button>
            <button type="button" onClick={() => { logoutCurrentSession(); setOpen(false); }} className="w-full text-center text-xs font-semibold text-slate-500 underline hover:text-ink-deep">
              Để sau, đăng xuất
            </button>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
