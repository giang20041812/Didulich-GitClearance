import { Loader2 } from 'lucide-react';

interface SwitchToggleProps {
  checked: boolean;
  onChange: () => void;
  label: string;
  disabled?: boolean;
  busy?: boolean;
}

/** Công tắc bật / tắt (role="switch") — nhắc giờ, đăng công khai. */
export default function SwitchToggle({ checked, onChange, label, disabled = false, busy = false }: SwitchToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      disabled={disabled || busy}
      className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer ${
        checked ? 'bg-[#0a7d64]' : 'bg-slate-300'
      }`}
    >
      <span
        className={`flex h-6 w-6 items-center justify-center rounded-full bg-white shadow-sm transition-transform duration-200 ${checked ? 'translate-x-[22px]' : 'translate-x-0.5'}`}
      >
        {busy && <Loader2 className="h-3.5 w-3.5 animate-spin text-[#0a7d64]" />}
      </span>
    </button>
  );
}
