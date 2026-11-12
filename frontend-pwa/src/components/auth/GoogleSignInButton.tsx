import { useState } from 'react';
import { signInWithGoogleGsi } from '@/lib/firebase';
import { GoogleMark } from './GoogleMark';

interface GoogleSignInButtonProps {
  text?: 'signin_with' | 'signup_with' | 'continue_with';
  onCredential: (idToken: string) => void | Promise<void>;
  onError?: (message: string) => void;
}

/** Shared Google Identity Services button used by login and registration. */
export function GoogleSignInButton({ text = 'continue_with', onCredential, onError }: GoogleSignInButtonProps) {
  const [isLoading, setIsLoading] = useState(false);

  const getLabel = () => {
    switch (text) {
      case 'signin_with': return 'Đăng nhập bằng Google';
      case 'signup_with': return 'Đăng ký bằng Google';
      default: return 'Tiếp tục với Google';
    }
  };

  const handleClick = async (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (isLoading) return;

    setIsLoading(true);
    try {
      await onCredential(await signInWithGoogleGsi());
    } catch (error: unknown) {
      onError?.(error instanceof Error ? error.message : 'Đăng nhập Google thất bại. Vui lòng thử lại.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isLoading}
      title={getLabel()}
      className="group relative flex h-11 w-full items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-800 shadow-2xs transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:bg-slate-50/80 hover:shadow-xs active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:translate-y-0 cursor-pointer"
    >
      {isLoading ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--color-primary)] border-t-transparent" /> : <GoogleMark />}
      <span>{isLoading ? 'Đang kết nối Google...' : getLabel()}</span>
    </button>
  );
}

export default GoogleSignInButton;
