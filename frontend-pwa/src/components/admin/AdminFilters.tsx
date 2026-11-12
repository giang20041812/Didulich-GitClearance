import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, ArrowUpDown, CheckCircle2, CalendarDays, ChevronDown, ChevronLeft, ChevronRight, Loader2, RefreshCw, Search, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { StatusTone } from './StatusBadge';
import OverlayPortal from './OverlayPortal';

export function FilterSearch({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div className="relative min-w-0 flex-1 basis-[220px]">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-8 w-full rounded-md border border-border bg-white pl-8 pr-8 text-xs text-ink transition-all duration-200 placeholder:text-muted/80 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="Xóa từ khóa"
          className="absolute inset-y-0 right-0 flex w-8 items-center justify-center text-muted hover:text-ink"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// Toolbar gọn (High-Density): tab gạch chân có số đếm + select một dòng
// ─────────────────────────────────────────────

export interface TabItem<T extends string> {
  value: T | '';
  label: string;
  /** null/undefined = không hiện số đếm (khi backend không có số liệu). */
  count?: number | null;
  tone?: StatusTone;
}

/** Số đếm của tab đang chọn: tô đặc. */
const TAB_COUNT_ACTIVE: Record<StatusTone, string> = {
  success: 'bg-accent text-white',
  warning: 'bg-sun text-ink-deep',
  danger: 'bg-danger text-white',
  info: 'bg-secondary text-white',
  brand: 'bg-primary text-white',
  neutral: 'bg-muted text-white',
};
/** Số đếm của tab chưa chọn (khi > 0): nền nhạt cùng tông. */
const TAB_COUNT_IDLE: Record<StatusTone, string> = {
  success: 'bg-accent/10 text-primary-700',
  warning: 'bg-sun/15 text-amber-700',
  danger: 'bg-danger/10 text-danger',
  info: 'bg-secondary/10 text-secondary-700',
  brand: 'bg-primary-50 text-primary',
  neutral: 'bg-muted/10 text-ink',
};
const TAB_TEXT_ACTIVE: Record<StatusTone, string> = {
  success: 'text-primary-700',
  warning: 'text-amber-700',
  danger: 'text-danger',
  info: 'text-secondary-700',
  brand: 'text-primary',
  neutral: 'text-ink-deep',
};
/** Rê chuột / chạm vào tab chưa chọn: nền đậm hơn một chút cùng tông. */
const TAB_HOVER: Record<StatusTone, string> = {
  success: 'hover:bg-accent/10 hover:text-primary-700',
  warning: 'hover:bg-sun/15 hover:text-amber-700',
  danger: 'hover:bg-danger/10 hover:text-danger',
  info: 'hover:bg-secondary/10 hover:text-secondary-700',
  brand: 'hover:bg-primary-100 hover:text-primary',
  neutral: 'hover:bg-muted/10 hover:text-ink-deep',
};
/** Số đếm của tab chưa chọn khi rê chuột / chạm vào tab: đậm hơn nền nhạt thường ngày. */
const TAB_COUNT_IDLE_HOVER: Record<StatusTone, string> = {
  success: 'group-hover:bg-accent/20',
  warning: 'group-hover:bg-sun/30',
  danger: 'group-hover:bg-danger/20',
  info: 'group-hover:bg-secondary/20',
  brand: 'group-hover:bg-primary-100',
  neutral: 'group-hover:bg-muted/20',
};
const TAB_DOT: Record<StatusTone, string> = {
  success: 'bg-accent',
  warning: 'bg-sun',
  danger: 'bg-danger',
  info: 'bg-secondary',
  brand: 'bg-primary',
  neutral: 'bg-muted/60',
};
const TAB_UNDERLINE: Record<StatusTone, string> = {
  success: 'bg-accent',
  warning: 'bg-sun',
  danger: 'bg-danger',
  info: 'bg-secondary',
  brand: 'bg-primary',
  neutral: 'bg-muted',
};

/** Dải tab gạch chân đặt ở đầu bảng, thay cho nhóm nút lọc trạng thái chính. */
export function UnderlineTabs<T extends string>({
  items,
  value,
  onChange,
  ariaLabel,
  trailing,
}: {
  items: TabItem<T>[];
  value: T | '';
  onChange: (v: T | '') => void;
  ariaLabel: string;
  /** Phần phụ đặt cuối dải tab (vd: ô chọn "Khác" gom các trạng thái ít dùng). */
  trailing?: ReactNode;
}) {
  return (
    <div role="tablist" aria-label={ariaLabel} className="flex min-w-0 flex-wrap items-stretch gap-1.5 border-b border-border px-3 py-2">
      {items.map((it) => {
        const active = it.value === value;
        const tone: StatusTone = it.tone ?? 'brand';
        return (
          <button
            key={it.value || 'all'}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(it.value)}
            className={`group relative flex min-h-11 min-w-0 max-w-full items-center gap-1.5 rounded-lg border px-2.5 py-2 text-xs font-semibold transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 sm:min-h-0 ${
              active ? `${TAB_TEXT_ACTIVE[tone]} border-border bg-canvas/70 hover:bg-canvas` : `border-transparent text-muted ${TAB_HOVER[tone]}`
            }`}
          >
            {it.tone && (
              <span
                aria-hidden
                className={`h-1.5 w-1.5 shrink-0 rounded-full transition-opacity duration-200 ${TAB_DOT[tone]} ${!active && it.count === 0 ? 'opacity-40 group-hover:opacity-70' : ''}`}
              />
            )}
            <span className="min-w-0 break-words text-left">{it.label}</span>
            {it.count != null && (
              <span
                className={`shrink-0 rounded px-1.5 py-px text-[10px] font-bold tabular-nums transition-all duration-200 ${
                  active
                    ? `${TAB_COUNT_ACTIVE[tone]} group-hover:brightness-95`
                    : it.count > 0
                    ? `${TAB_COUNT_IDLE[tone]} ${TAB_COUNT_IDLE_HOVER[tone]}`
                    : 'bg-canvas text-muted/70 group-hover:bg-hover'
                }`}
              >
                {it.count}
              </span>
            )}
            <span
              className={`absolute inset-x-2 bottom-0 h-0.5 rounded-sm transition-all duration-300 ${TAB_UNDERLINE[tone]} ${
                active ? 'scale-x-100 opacity-100' : 'scale-x-0 opacity-0'
              }`}
            />
          </button>
        );
      })}
      {trailing && <div className="ml-auto flex min-w-0 max-w-full flex-wrap items-center gap-1.5">{trailing}</div>}
    </div>
  );
}

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  icon?: LucideIcon;
  /** Màu ngữ nghĩa của mục: khi chọn thì tô đặc, khi chưa chọn thì icon mang màu này. */
  tone: StatusTone;
  count?: number | null;
}

const SEG_ACTIVE: Record<StatusTone, string> = {
  brand: 'bg-primary text-white shadow-[var(--shadow-teal)]',
  info: 'bg-secondary text-white shadow-sm',
  success: 'bg-accent text-white shadow-sm',
  warning: 'bg-sun text-ink-deep shadow-sm',
  danger: 'bg-danger text-white shadow-sm',
  neutral: 'bg-ink text-white shadow-sm',
};
const SEG_IDLE: Record<StatusTone, string> = {
  brand: 'hover:bg-primary-50 hover:text-primary',
  info: 'hover:bg-secondary/10 hover:text-secondary-700',
  success: 'hover:bg-accent/10 hover:text-primary-700',
  warning: 'hover:bg-sun/15 hover:text-amber-700',
  danger: 'hover:bg-danger/10 hover:text-danger',
  neutral: 'hover:bg-hover hover:text-ink',
};
const SEG_ICON: Record<StatusTone, string> = {
  brand: 'text-primary',
  info: 'text-secondary-700',
  success: 'text-accent',
  warning: 'text-amber-700',
  danger: 'text-danger',
  neutral: 'text-muted',
};

/** Bộ chuyển mục con dạng "viên" có màu theo ngữ nghĩa từng mục (vd: Quản trị & NCC / Khách du lịch). */
export function SegmentedTabs<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  stretch = false,
}: {
  options: SegmentOption<T>[];
  value: T;
  onChange: (v: T) => void;
  ariaLabel: string;
  /** true: các mục chia đều chiều ngang. */
  stretch?: boolean;
}) {
  return (
    <div role="tablist" aria-label={ariaLabel} className={`${stretch ? 'flex' : 'inline-flex'} max-w-full flex-wrap gap-0.5 rounded-md border border-border bg-canvas p-0.5`}>
      {options.map(({ value: v, label, icon: Icon, tone, count }) => {
        const active = v === value;
        return (
          <button
            key={v}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(v)}
            className={`flex min-w-0 max-w-full items-center justify-center gap-1.5 rounded px-3 py-1.5 text-xs font-semibold transition-all duration-200 active:scale-[0.98] ${
              stretch ? 'flex-1' : ''
            } ${active ? SEG_ACTIVE[tone] : `text-muted ${SEG_IDLE[tone]}`}`}
          >
            {Icon && <Icon className={`h-3.5 w-3.5 shrink-0 ${active ? 'text-current' : SEG_ICON[tone]}`} />}
            <span className="min-w-0 break-words">{label}</span>
            {count != null && (
              <span className={`shrink-0 rounded px-1.5 py-px text-[10px] font-bold tabular-nums ${active ? 'bg-white/25 text-current' : 'bg-white text-muted'}`}>{count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export interface SelectOption<T extends string> {
  value: T | '';
  label: string;
}

/** Select gọn cho bộ lọc phụ; khi đang lọc thì tô màu thương hiệu để dễ nhận biết. */
export function CompactSelect<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T | '';
  options: SelectOption<T>[];
  onChange: (v: T | '') => void;
}) {
  const active = value !== '';
  return (
    <label className="relative flex items-center" title={label}>
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T | '')}
        className={`h-8 cursor-pointer appearance-none rounded-md border py-0 pl-2.5 pr-7 text-xs transition-colors duration-200 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 ${
          active ? 'border-primary/50 bg-primary-50 font-semibold text-primary' : 'border-border bg-white text-ink hover:border-primary/40'
        }`}
      >
        {options.map((o) => (
          <option key={o.value || 'all'} value={o.value}>
            {`${label}: ${o.label}`}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2 h-3.5 w-3.5 text-muted" />
    </label>
  );
}

/** Khoảng ngày gọn trong một ô, dùng trong toolbar một dòng. */
export function CompactDateRange({
  label,
  from,
  to,
  onChange,
}: {
  label: string;
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
}) {
  const active = Boolean(from || to);
  const input =
    'h-11 min-w-0 w-full bg-transparent text-base text-ink [color-scheme:light] [accent-color:var(--color-primary)] focus:outline-none lg:h-auto lg:w-[6.9rem] lg:text-xs';
  return (
    <div
      className={`relative grid w-full min-w-0 grid-cols-2 items-center gap-x-2 gap-y-1.5 rounded-md border px-2 py-2 text-xs transition-colors duration-200 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20 lg:flex lg:h-8 lg:w-auto lg:gap-1.5 lg:py-0 ${
        active ? 'border-primary/50 bg-primary-50' : 'border-border bg-white hover:border-primary/40'
      }`}
    >
      <span className={`col-span-2 flex min-h-8 items-center gap-1.5 pr-8 lg:min-h-0 lg:shrink-0 lg:pr-0 ${active ? 'font-semibold text-primary' : 'text-muted'}`}>
        <CalendarDays className="h-3.5 w-3.5 shrink-0" />
        {label}
      </span>
      <input type="date" value={from} max={to || undefined} onChange={(e) => onChange(e.target.value, to)} aria-label={`${label} từ`} className={input} />
      <span className="hidden text-muted lg:inline">–</span>
      <input type="date" value={to} min={from || undefined} onChange={(e) => onChange(from, e.target.value)} aria-label={`${label} đến`} className={input} />
      {active && (
        <button type="button" onClick={() => onChange('', '')} aria-label={`Xóa lọc ${label}`} className="absolute right-0 top-0 flex h-11 w-11 items-center justify-center text-muted hover:text-danger lg:static lg:h-auto lg:w-auto lg:shrink-0">
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

/** Nút làm mới vuông nhỏ dùng trong toolbar. */
export function RefreshButton({ loading, onClick }: { loading: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Tải lại"
      title="Tải lại"
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-white text-muted transition-colors hover:border-primary/40 hover:text-primary"
    >
      <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
    </button>
  );
}

/** Chân bảng: số kết quả + xóa bộ lọc (trái), phân trang (phải). */
export function TableFooter({
  total,
  activeCount,
  onClear,
  page,
  totalPages,
  onPage,
}: {
  total: number;
  activeCount: number;
  onClear: () => void;
  page: number;
  totalPages: number;
  onPage: (p: number) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-2.5 text-xs text-muted">
      <span>
        <strong className="tabular-nums text-ink">{total}</strong> kết quả
        {activeCount > 0 && (
          <>
            {' · '}
            {activeCount} bộ lọc ·{' '}
            <button type="button" onClick={onClear} className="font-semibold text-primary hover:underline">
              Xóa bộ lọc
            </button>
          </>
        )}
      </span>
      <Pagination page={page} totalPages={totalPages} onChange={onPage} />
    </div>
  );
}

export interface ChipOption<T extends string> {
  value: T | '';
  label: string;
  /** Màu ngữ nghĩa của chip; bỏ trống = màu thương hiệu. */
  tone?: StatusTone;
}

const CHIP_ACTIVE: Record<StatusTone, string> = {
  success: 'border-accent bg-accent/15 text-primary-700 shadow-sm',
  warning: 'border-sun bg-sun/20 text-amber-700 shadow-sm',
  danger: 'border-danger bg-danger/10 text-danger shadow-sm',
  info: 'border-secondary bg-secondary/15 text-secondary-700 shadow-sm',
  brand: 'border-primary bg-primary text-white shadow-sm',
  neutral: 'border-muted/50 bg-muted/10 text-ink shadow-sm',
};
const CHIP_HOVER: Record<StatusTone, string> = {
  success: 'hover:border-accent/60 hover:bg-accent/5',
  warning: 'hover:border-sun/60 hover:bg-sun/10',
  danger: 'hover:border-danger/50 hover:bg-danger/5',
  info: 'hover:border-secondary/60 hover:bg-secondary/5',
  brand: 'hover:border-primary/50 hover:bg-primary-50',
  neutral: 'hover:border-muted/50 hover:bg-hover',
};
const CHIP_DOT: Record<StatusTone, string> = {
  success: 'bg-accent',
  warning: 'bg-sun',
  danger: 'bg-danger',
  info: 'bg-secondary',
  brand: 'bg-primary',
  neutral: 'bg-muted/60',
};

/** Nhóm chip chọn một giá trị; `value: ''` là "Tất cả". */
export function ChipGroup<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: ChipOption<T>[];
  value: T | '';
  onChange: (v: T | '') => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label={label}>
      <span className="mr-1 text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</span>
      {options.map((o) => {
        const active = o.value === value;
        const tone: StatusTone = o.tone ?? 'brand';
        return (
          <button
            key={o.value || 'all'}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={`inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-all duration-200 active:scale-95 ${
              active ? CHIP_ACTIVE[tone] : `border-border bg-white text-muted ${CHIP_HOVER[tone]}`
            }`}
          >
            {o.tone && <span className={`h-1.5 w-1.5 rounded-full ${active && tone === 'brand' ? 'bg-white' : CHIP_DOT[tone]}`} />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function DateRangeFilter({
  label = 'Ngày tạo',
  from,
  to,
  onChange,
}: {
  label?: string;
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
}) {
  const inputClass =
    'h-7 rounded-md border border-border bg-white pl-6 pr-1.5 text-xs text-ink [color-scheme:light] [accent-color:var(--color-primary)] focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20';
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="mr-1 text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</span>
      <span className="relative">
        <CalendarDays className="pointer-events-none absolute left-1.5 top-1.5 h-3.5 w-3.5 text-muted" />
        <input type="date" value={from} max={to || undefined} onChange={(e) => onChange(e.target.value, to)} aria-label={`${label} từ`} className={inputClass} />
      </span>
      <span className="text-xs text-muted">→</span>
      <span className="relative">
        <CalendarDays className="pointer-events-none absolute left-1.5 top-1.5 h-3.5 w-3.5 text-muted" />
        <input type="date" value={to} min={from || undefined} onChange={(e) => onChange(from, e.target.value)} aria-label={`${label} đến`} className={inputClass} />
      </span>
    </div>
  );
}

export interface SortOption {
  value: string; // dạng "field:dir"
  label: string;
}

export function SortSelect({
  value,
  options,
  onChange,
}: {
  value: string;
  options: SortOption[];
  onChange: (v: string) => void;
}) {
  return (
    <label className="relative flex items-center" title="Sắp xếp">
      <span className="sr-only">Sắp xếp</span>
      <ArrowUpDown className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-muted" />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 cursor-pointer appearance-none rounded-md border border-border bg-white py-0 pl-7 pr-7 text-xs text-ink transition-colors hover:border-primary/40 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2 h-3.5 w-3.5 text-muted" />
    </label>
  );
}

export function FilterFooter({
  total,
  activeCount,
  onClear,
}: {
  total: number;
  activeCount: number;
  onClear: () => void;
}) {
  return (
    <div className="flex items-center justify-between text-xs text-muted">
      <span>
        <strong className="text-ink">{total}</strong> kết quả
        {activeCount > 0 && <> · đang áp dụng {activeCount} bộ lọc</>}
      </span>
      {activeCount > 0 && (
        <button type="button" onClick={onClear} className="font-semibold text-primary hover:underline">
          Xóa bộ lọc
        </button>
      )}
    </div>
  );
}

export function Pagination({
  page,
  totalPages,
  onChange,
}: {
  page: number; // bắt đầu từ 0
  totalPages: number;
  onChange: (p: number) => void;
}) {
  if (totalPages <= 1) return null;
  const btn =
    'inline-flex h-7 min-w-7 items-center justify-center rounded-md border border-border bg-white px-1.5 text-xs font-medium tabular-nums text-ink transition-colors hover:border-primary/40 hover:text-primary disabled:cursor-not-allowed disabled:opacity-40';
  const start = Math.max(0, Math.min(page - 2, totalPages - 5));
  const pages = Array.from({ length: Math.min(5, totalPages) }, (_, i) => start + i);
  return (
    <nav className="flex items-center justify-center gap-1" aria-label="Phân trang">
      <button type="button" className={btn} disabled={page === 0} onClick={() => onChange(page - 1)} aria-label="Trang trước">
        <ChevronLeft className="h-4 w-4" />
      </button>
      {pages.map((p) => (
        <button
          key={p}
          type="button"
          onClick={() => onChange(p)}
          aria-current={p === page ? 'page' : undefined}
          className={`${btn} ${p === page ? '!border-primary !bg-primary !text-white' : ''}`}
        >
          {p + 1}
        </button>
      ))}
      <button type="button" className={btn} disabled={page >= totalPages - 1} onClick={() => onChange(page + 1)} aria-label="Trang sau">
        <ChevronRight className="h-4 w-4" />
      </button>
    </nav>
  );
}

/** Loại hộp xác nhận: `danger` = từ chối / khóa / ẩn / xóa (đỏ, icon cảnh báo) · `primary` = duyệt / công khai / mở khóa (xanh, icon tick). */
export type ReasonDialogTone = 'danger' | 'primary';

const DIALOG_TONE: Record<ReasonDialogTone, { icon: LucideIcon; badge: string; button: string }> = {
  danger: { icon: AlertTriangle, badge: 'bg-danger/10 text-danger', button: 'bg-danger hover:opacity-90' },
  primary: { icon: CheckCircle2, badge: 'bg-accent/15 text-primary', button: 'bg-primary hover:bg-primary-600' },
};

/** Khung chung của hộp xác nhận: bottom-sheet trên điện thoại (dễ bấm bằng ngón cái), hộp giữa màn hình từ sm trở lên. */
export function DialogShell({ label, alert, onDismiss, children }: { label: string; alert?: boolean; onDismiss?: () => void; children: ReactNode }) {
  useEffect(() => {
    if (!onDismiss) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDismiss();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onDismiss]);
  return (
    <OverlayPortal>
      {/* z cao hơn ngăn chi tiết (z-[9998]) để hộp xác nhận mở từ ngăn luôn nằm trên cùng. */}
      <div className="admin-overlay-shell fade-in-overlay fixed z-[10000] flex min-h-0 items-end justify-center overflow-hidden bg-ink-deep/60 backdrop-blur-[2px] sm:items-center sm:p-4" onClick={onDismiss}>
        <div
          role={alert ? 'alertdialog' : 'dialog'}
          aria-modal="true"
          aria-label={label}
          onClick={(e) => e.stopPropagation()}
          className="admin-dialog-panel rise-in flex min-h-0 max-h-full w-full flex-col gap-3 overflow-y-auto overscroll-contain rounded-t-2xl border border-border bg-white p-4 shadow-xl sm:max-w-md sm:rounded-lg sm:p-5"
        >
          <span aria-hidden className="mx-auto -mt-1 mb-1 h-1 w-10 shrink-0 rounded-full bg-border sm:hidden" />
          {children}
        </div>
      </div>
    </OverlayPortal>
  );
}

// Nút tối thiểu 44px trên điện thoại; cho phép xuống dòng với nhãn dài.
export const dialogBtn = 'flex min-h-11 items-center justify-center gap-1.5 rounded-md px-4 py-2 text-sm font-semibold transition-colors active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-9 sm:text-xs';

/**
 * Hộp thoại xác nhận dùng chung cho cả thao tác từ chối (khóa / từ chối / ẩn / xóa) và xác nhận (duyệt / công khai / mở khóa);
 * hai loại cùng layout, kích thước, vị trí, animation và cách đóng — chỉ khác màu, icon và nội dung theo `tone`.
 *
 * Luôn có hai bước: bấm nút xác nhận chưa gửi ngay mà chuyển sang bước "Xác nhận lần cuối" nêu rõ hậu quả
 * (`finalConfirm`, mặc định dùng `description`) và nhắc lại lý do; chỉ khi bấm xác nhận ở bước đó mới gọi `onConfirm`.
 * "Quay lại" về bước nhập lý do, không ghi nhận gì. Khi ẩn ô lý do (`hideReason`) thì mở thẳng bước xác nhận.
 *
 * `onConfirm` trả về Promise thì hộp thoại tự hiện "Đang xử lý…" và khóa các nút cho tới khi xong (chống bấm trùng).
 */
export function ReasonDialog({
  title,
  description,
  confirmLabel,
  reasonRequired,
  reasonRequiredMessage = 'Vui lòng nhập lý do.',
  finalConfirm,
  hideReason,
  tone = 'danger',
  error,
  onCancel,
  onConfirm,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  reasonRequired: boolean;
  /** Thông báo lỗi tại ô lý do khi bỏ trống. */
  reasonRequiredMessage?: string;
  /** Nội dung cảnh báo hậu quả ở bước xác nhận lần cuối; bỏ trống thì dùng `description`. */
  finalConfirm?: string;
  /** Ẩn ô nhập lý do (vd. thao tác duyệt không cần lý do). */
  hideReason?: boolean;
  tone?: ReasonDialogTone;
  error?: string;
  onCancel: () => void;
  onConfirm: (reason: string) => void | Promise<unknown>;
}) {
  const [reason, setReason] = useState('');
  // Không có ô lý do thì không cần bước nhập: vào thẳng bước xác nhận.
  const skipForm = Boolean(hideReason);
  const [step, setStep] = useState<'form' | 'final'>(skipForm ? 'final' : 'form');
  const meta = DIALOG_TONE[tone];
  const ToneIcon = meta.icon;
  const [localError, setLocalError] = useState('');
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  const submit = () => {
    if (reasonRequired && !reason.trim()) {
      setLocalError(reasonRequiredMessage);
      return;
    }
    setLocalError('');
    setStep('final');
  };

  const confirmFinal = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      await onConfirm(reason.trim());
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const cancel = () => {
    if (!busyRef.current) onCancel();
  };

  const shownError = localError || error;

  if (step === 'final') {
    return (
      <DialogShell label={title} alert onDismiss={cancel}>
        <div className="flex shrink-0 items-start gap-3">
          <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md ${meta.badge}`}>
            <ToneIcon className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">{skipForm ? 'Xác nhận' : 'Xác nhận lần cuối'}</p>
            <h3 className="font-display text-base font-bold text-ink-deep">{title}</h3>
          </div>
        </div>
        <p className="shrink-0 break-words text-sm leading-relaxed text-ink sm:text-xs">{finalConfirm ?? description}</p>
        {reason.trim() && (
          <p className="shrink-0 break-words rounded-md bg-canvas px-3 py-2 text-xs text-muted">
            Lý do: <span className="text-ink">“{reason.trim()}”</span>
          </p>
        )}
        {error && !busy && (
          <p role="alert" className="shrink-0 break-words rounded-md bg-danger/5 px-3 py-2 text-xs text-danger">
            {error}
          </p>
        )}
        <div className="flex shrink-0 flex-wrap gap-2 pt-1 sm:justify-end">
          <button type="button" autoFocus disabled={busy} onClick={() => (skipForm ? cancel() : setStep('form'))} className={`${dialogBtn} min-w-0 flex-1 text-muted hover:bg-hover sm:flex-none`}>
            Quay lại
          </button>
          <button type="button" disabled={busy} aria-busy={busy} onClick={() => void confirmFinal()} className={`${dialogBtn} min-w-0 flex-1 text-white sm:flex-none ${meta.button}`}>
            {busy ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden /> : <ToneIcon className="h-4 w-4 shrink-0" aria-hidden />}
            <span className="min-w-0 break-words">{busy ? 'Đang xử lý…' : confirmLabel}</span>
          </button>
        </div>
      </DialogShell>
    );
  }

  return (
    <DialogShell label={title} onDismiss={cancel}>
      <h3 className="shrink-0 break-words font-display text-base font-bold text-ink-deep">{title}</h3>
      <p className="shrink-0 break-words text-sm leading-relaxed text-muted sm:text-xs">{description}</p>
      {!hideReason && (
        <div className="flex shrink-0 flex-col gap-1.5">
          <label htmlFor="reason-dialog-input" className="text-xs font-semibold text-ink-deep">
            Lý do {reasonRequired && <span className="text-danger">*</span>}
          </label>
          <textarea
            id="reason-dialog-input"
            rows={3}
            autoFocus
            aria-required={reasonRequired}
            aria-invalid={Boolean(shownError)}
            aria-describedby={shownError ? 'reason-dialog-error' : undefined}
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              setLocalError('');
            }}
            className="min-h-[88px] w-full shrink-0 scroll-my-4 resize-y rounded-md border border-border px-3 py-2 text-base focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 sm:text-xs"
          />
        </div>
      )}
      {shownError && <p id="reason-dialog-error" role="alert" className="shrink-0 break-words text-xs text-danger">{shownError}</p>}
      <div className="flex shrink-0 flex-wrap gap-2 pt-1 sm:justify-end">
        <button type="button" onClick={cancel} className={`${dialogBtn} min-w-0 flex-1 text-muted hover:bg-hover sm:flex-none`}>
          Hủy
        </button>
        <button type="button" onClick={submit} className={`${dialogBtn} min-w-0 flex-1 text-white sm:flex-none ${meta.button}`}>
          Tiếp tục
        </button>
      </div>
    </DialogShell>
  );
}
