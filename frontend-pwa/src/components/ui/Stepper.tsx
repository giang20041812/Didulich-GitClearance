import { useEffect, useState } from 'react';
import { Minus, Plus } from 'lucide-react';

interface StepperProps {
  label: string;
  value: number;
  min: number;
  max?: number;
  onChange: (value: number) => void;
  /** Dòng phụ dưới nhãn (vd "Còn 3 phòng trống"). */
  hint?: string;
}

/** Ô tăng / giảm số lượng (phòng, khách) kèm ô nhập trực tiếp từ bàn phím. */
export default function Stepper({ label, value, min, max, onChange, hint }: StepperProps) {
  const [draft, setDraft] = useState(() => String(value));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setDraft(String(value));
  }, [value, focused]);

  const clamp = (n: number) => {
    const upper = max != null ? Math.min(max, n) : n;
    return Math.max(min, upper);
  };

  const commit = (raw: string) => {
    const digits = raw.replace(/\D+/g, '');
    if (!digits) {
      setDraft(String(value));
      return;
    }
    const next = clamp(Number(digits));
    setDraft(String(next));
    if (next !== value) onChange(next);
  };

  const button = 'flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-slate-700 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-30 cursor-pointer';
  return (
    <div className="flex items-center justify-between gap-2 rounded-md border border-slate-200 bg-white px-3 py-2">
      <div className="min-w-0">
        <div className="text-sm font-bold text-slate-800">{label}</div>
        {hint && <div className="truncate text-[11px] font-medium text-[var(--color-muted)]">{hint}</div>}
      </div>
      <div className="flex items-center gap-1.5">
        <button type="button" onClick={() => onChange(clamp(value - 1))} disabled={value <= min} aria-label={`Giảm ${label.toLowerCase()}`} className={button}>
          <Minus className="h-3.5 w-3.5" />
        </button>
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          aria-label={label}
          value={focused ? draft : String(value)}
          onFocus={(e) => {
            setFocused(true);
            setDraft(String(value));
            e.currentTarget.select();
          }}
          onChange={(e) => {
            const digits = e.target.value.replace(/\D+/g, '');
            setDraft(digits);
            if (digits) {
              const parsed = Number(digits);
              if (Number.isFinite(parsed) && parsed >= min && (max == null || parsed <= max)) {
                onChange(parsed);
              }
            }
          }}
          onBlur={(e) => {
            setFocused(false);
            commit(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              e.currentTarget.blur();
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              const next = clamp(value + 1);
              setDraft(String(next));
              onChange(next);
            } else if (e.key === 'ArrowDown') {
              e.preventDefault();
              const next = clamp(value - 1);
              setDraft(String(next));
              onChange(next);
            }
          }}
          className="h-8 w-11 rounded-md border border-transparent bg-transparent text-center text-base font-black text-[var(--color-ink-deep)] outline-none transition-colors hover:border-slate-200 focus:border-[var(--color-primary)] focus:bg-slate-50/70 tabular-nums"
        />
        <button type="button" onClick={() => onChange(clamp(value + 1))} disabled={max != null && value >= max} aria-label={`Tăng ${label.toLowerCase()}`} className={button}>
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
