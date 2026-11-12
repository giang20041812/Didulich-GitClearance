import { useId, useMemo, useRef, useState, type ComponentProps, type FormEvent } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { AlertCircle, ChevronLeft, Loader2, X } from 'lucide-react';
import { googleRegister, type GoogleSignupProfile } from '@/services/authService';
import type { GoogleLoginResponse } from '@/types/integrations/google-identity';
import type { AuthErrorResponse } from '@/types/user';

interface GoogleSignupDialogProps {
  idToken: string;
  profile: GoogleSignupProfile;
  onClose: () => void;
  /** Tài khoản vừa tạo: trang mở hộp thoại lưu phiên rồi điều hướng như đăng nhập thường. */
  onCreated: (session: GoogleLoginResponse) => void | Promise<void>;
}

/** Ô nhập kiểu nhãn nằm trong khung (nhãn nhỏ phía trên, giá trị phía dưới); viền do khung bao ngoài vẽ. */
function FramedInput({ label, invalid = false, className = '', ...input }: { label: string; invalid?: boolean } & ComponentProps<'input'>) {
  return (
    <label
      className={`relative block px-4 pb-2 pt-2.5 focus-within:z-10 focus-within:ring-2 focus-within:ring-inset ${
        invalid ? 'focus-within:ring-danger' : 'focus-within:ring-ink-deep'
      } ${className}`}
    >
      <span className={`block text-xs ${invalid ? 'text-danger' : 'text-slate-500'}`}>{label}</span>
      <input
        {...input}
        aria-invalid={invalid || undefined}
        className="mt-0.5 w-full bg-transparent text-base text-ink-deep outline-none placeholder:text-slate-400 disabled:text-slate-500"
      />
    </label>
  );
}

function FieldError({ id, message }: { id: string; message: string }) {
  return (
    <p id={id} className="mt-2 flex items-center gap-1.5 text-xs font-medium text-danger">
      <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden />
      {message}
    </p>
  );
}

/**
 * Lần đầu đăng nhập Google: "Hãy tạo tài khoản của bạn". Tên, họ và email điền sẵn từ Google; khách nhập số điện thoại
 * (điền sẵn khi đặt phòng để chủ nhà liên hệ) rồi mới tạo tài khoản. Điện thoại: toàn màn hình; máy tính: hộp giữa trang.
 */
export function GoogleSignupDialog({ idToken, profile, onClose, onCreated }: GoogleSignupDialogProps) {
  const id = useId();
  const [firstName, setFirstName] = useState(profile.firstName);
  const [lastName, setLastName] = useState(profile.lastName);
  const [touched, setTouched] = useState({ firstName: false });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const firstNameRef = useRef<HTMLInputElement>(null);

  const errors = useMemo(() => {
    const result: { firstName?: string } = {};
    if (!firstName.trim()) result.firstName = 'Vui lòng nhập tên của bạn.';
    else if (`${lastName.trim()} ${firstName.trim()}`.trim().length < 2) result.firstName = 'Họ và tên cần ít nhất 2 ký tự.';
    return result;
  }, [firstName, lastName]);

  const nameError = touched.firstName ? errors.firstName : undefined;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setTouched({ firstName: true });
    if (errors.firstName) {
      firstNameRef.current?.focus();
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const session = await googleRegister({ idToken, firstName: firstName.trim(), lastName: lastName.trim() });
      await onCreated(session);
    } catch (err: unknown) {
      const authError = err as AuthErrorResponse;
      setError(authError.message || 'Không thể tạo tài khoản lúc này. Vui lòng thử lại sau.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog.Root open onOpenChange={(open) => { if (!open && !submitting) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[10010] bg-ink-deep/50" />
        <Dialog.Content
          aria-describedby={undefined}
          // Tên đã điền sẵn thì đưa con trỏ vào ô còn thiếu là số điện thoại.
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            if (!profile.firstName) firstNameRef.current?.focus();
          }}
          className="fixed inset-0 z-[10010] flex flex-col bg-white sm:inset-auto sm:left-1/2 sm:top-1/2 sm:max-h-[min(820px,calc(100dvh-48px))] sm:w-[min(568px,calc(100vw-32px))] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:shadow-[var(--shadow-lg)]"
        >
          <header className="grid shrink-0 grid-cols-[40px_1fr_40px] items-center gap-2 border-b border-slate-200 px-3 pb-3 pt-[calc(0.75rem+var(--safe-top))] sm:px-4 sm:pt-3">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              aria-label="Quay lại đăng nhập"
              className="flex h-10 w-10 items-center justify-center rounded-full text-ink-deep transition-colors hover:bg-slate-100 disabled:opacity-50"
            >
              <ChevronLeft className="h-5 w-5" aria-hidden />
            </button>
            <Dialog.Title className="text-center text-base font-bold text-ink-deep">Hãy tạo tài khoản của bạn</Dialog.Title>
            <Dialog.Close
              disabled={submitting}
              aria-label="Đóng"
              className="flex h-10 w-10 items-center justify-center rounded-full text-ink-deep transition-colors hover:bg-slate-100 disabled:opacity-50"
            >
              <X className="h-5 w-5" aria-hidden />
            </Dialog.Close>
          </header>

          <form onSubmit={submit} noValidate className="flex min-h-0 flex-1 flex-col">
            <div className="flex-1 space-y-6 overflow-y-auto px-6 py-6">
              {error && (
                <div role="alert" className="flex items-start gap-2 rounded-xl border border-danger/30 bg-danger/5 p-3 text-sm text-danger">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                  <span>{error}</span>
                </div>
              )}

              <section>
                <h3 className="mb-3 text-base font-bold text-ink-deep">Tên pháp lý</h3>
                <div className={`rounded-xl border ${nameError ? 'border-danger' : 'border-slate-300'}`}>
                  <FramedInput
                    ref={firstNameRef}
                    label="Tên"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    onBlur={() => setTouched((t) => ({ ...t, firstName: true }))}
                    invalid={Boolean(nameError)}
                    aria-describedby={nameError ? `${id}-name-error` : `${id}-name-hint`}
                    autoComplete="given-name"
                    maxLength={120}
                    className="rounded-t-xl border-b border-slate-300"
                  />
                  <FramedInput
                    label="Họ"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    aria-describedby={`${id}-name-hint`}
                    autoComplete="family-name"
                    maxLength={120}
                    className="rounded-b-xl"
                  />
                </div>
                {nameError ? (
                  <FieldError id={`${id}-name-error`} message={nameError} />
                ) : (
                  <p id={`${id}-name-hint`} className="mt-2 text-xs leading-relaxed text-slate-500">
                    Hãy đảm bảo tên này khớp với tên trên giấy tờ tùy thân (CCCD hoặc hộ chiếu) để việc nhận phòng thuận lợi.
                  </p>
                )}
              </section>

              <section>
                <h3 className="mb-3 text-base font-bold text-ink-deep">Email</h3>
                <div className="rounded-xl border border-slate-200 bg-slate-50">
                  <FramedInput label="Email" type="email" value={profile.email} disabled readOnly className="rounded-xl" />
                </div>
                <p className="mt-2 text-xs leading-relaxed text-slate-500">Email Google dùng để đăng nhập, không đổi được ở đây.</p>
              </section>

              <p className="text-sm text-ink">Thông tin điền sẵn được lấy từ tài khoản Google của bạn.</p>
            </div>

            <footer className="shrink-0 border-t border-slate-200 px-6 pb-[calc(1rem+var(--safe-bottom))] pt-4 sm:pb-4">
              <button
                type="submit"
                disabled={submitting}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary text-base font-semibold text-white transition-colors hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    Đang tạo tài khoản…
                  </>
                ) : (
                  'Tạo tài khoản'
                )}
              </button>
            </footer>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export default GoogleSignupDialog;
