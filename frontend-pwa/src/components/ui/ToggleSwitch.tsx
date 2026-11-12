interface ToggleSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** id của tiêu đề mô tả công tắc (aria-labelledby); không có thì dùng `label`. */
  labelledBy?: string;
  label?: string;
  /** Hiện chữ "Bật / Tắt" cạnh công tắc — rõ nghĩa hơn với người ít dùng điện thoại. */
  showState?: boolean;
  /** Khóa công tắc (đang lưu, hoặc không đủ quyền). */
  disabled?: boolean;
}

/** Công tắc bật / tắt (role="switch"). */
export default function ToggleSwitch({ checked, onChange, labelledBy, label, showState = true, disabled = false }: ToggleSwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={labelledBy}
      aria-label={labelledBy ? undefined : label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="group inline-flex shrink-0 items-center gap-2 rounded-full py-1 pl-2 pr-1 text-xs font-bold text-slate-600 transition-colors hover:bg-slate-50 cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
    >
      {showState && <span className={checked ? 'text-[var(--color-primary)]' : ''}>{checked ? 'Bật' : 'Tắt'}</span>}
      <span className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${checked ? 'bg-[var(--color-primary)]' : 'bg-slate-300 group-hover:bg-slate-400'}`}>
        <span className={`inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${checked ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
      </span>
    </button>
  );
}
