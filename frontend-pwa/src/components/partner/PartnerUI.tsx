import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, CheckCircle2, Clock, Info, type LucideIcon } from 'lucide-react';
import { ui } from '@/lib/partnerUi';

/** Tiêu đề trang NCC: dòng nhỏ viết hoa, tiêu đề lớn, mô tả, nút hành động bên phải. */
export function PageHeader({ title, description, back, actions, breadcrumbs }: {
  title: ReactNode; description?: ReactNode; back?: { to: string; label: string }; actions?: ReactNode; breadcrumbs?: { label: string; to?: string }[];
}) {
  return (
    <div className="flex flex-col gap-3">
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav aria-label="Breadcrumb" className="flex items-center text-[11px] font-semibold text-muted">
          {breadcrumbs.map((bc, i) => (
             <span key={i} className="flex items-center">
               {i > 0 && <span className="mx-1.5 opacity-50">/</span>}
               {bc.to ? <Link to={bc.to} className="hover:text-ink">{bc.label}</Link> : <span className="text-ink">{bc.label}</span>}
             </span>
          ))}
        </nav>
      )}
      {back && (
        <Link to={back.to} className="group inline-flex w-fit items-center gap-1.5 text-sm font-semibold text-ink-deep hover:text-ink">
          <ArrowLeft className="h-4 w-4 transition-transform duration-200 group-hover:-translate-x-0.5" /> {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-extrabold tracking-tight text-ink-deep sm:text-3xl">{title}</h1>
          {description && <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

/** Khối nội dung có tiêu đề + icon + mô tả ngắn + nút ở góc phải. */
export function Card({ title, description, icon: Icon, actions, children, className = '', bodyClassName = '' }: {
  title?: ReactNode; description?: ReactNode; icon?: LucideIcon; actions?: ReactNode; children: ReactNode; className?: string; bodyClassName?: string;
}) {
  return (
    <section className={`${ui.card} ${className}`}>
      {(title || actions) && (
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-primary/10 px-5 py-4">
          <div className="flex min-w-0 items-start gap-3">
            {Icon && <span className="rounded-md bg-primary-50 p-2 text-primary"><Icon className="h-4 w-4" /></span>}
            <div className="min-w-0">
              {title && <h2 className="text-sm font-bold text-ink-deep">{title}</h2>}
              {description && <p className="mt-0.5 text-xs leading-relaxed text-muted">{description}</p>}
            </div>
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={`flex flex-col gap-4 p-5 ${bodyClassName}`}>{children}</div>
    </section>
  );
}

/** Nhãn + ô nhập + gợi ý. */
export function Field({ label, hint, required, children, className = '' }: { label: ReactNode; hint?: ReactNode; required?: boolean; children: ReactNode; className?: string }) {
  return (
    <label className={`flex flex-col gap-1.5 ${className}`}>
      <span className="text-xs font-semibold text-ink">{label}{required && <span className="text-danger"> *</span>}</span>
      {children}
      {hint && <span className="text-[11px] leading-relaxed text-muted">{hint}</span>}
    </label>
  );
}

export interface TabItem<T extends string> { id: T; label: string; icon?: LucideIcon; badge?: ReactNode }

/** Thanh tab dạng gạch chân, cuộn ngang được trên điện thoại. */
export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: TabItem<T>[]; value: T; onChange: (id: T) => void }) {
  return (
    <div role="tablist" className="-mx-1 flex gap-1 overflow-x-auto border-b border-primary/10 px-1">
      {tabs.map(({ id, label, icon: Icon, badge }) => {
        const active = id === value;
        return (
          <button key={id} type="button" role="tab" aria-selected={active} onClick={() => onChange(id)}
            className={`relative flex shrink-0 items-center gap-2 px-3 py-2.5 text-sm font-semibold transition-colors duration-200 ${active ? 'text-primary' : 'text-muted hover:text-ink'}`}>
            {Icon && <Icon className="h-4 w-4" />}{label}
            {badge != null && <span className="rounded-sm bg-primary-50 px-1.5 py-0.5 text-[10px] font-bold text-primary">{badge}</span>}
            <span className={`absolute inset-x-2 -bottom-px h-0.5 rounded-sm bg-primary transition-opacity duration-200 ${active ? 'opacity-100' : 'opacity-0'}`} />
          </button>
        );
      })}
    </div>
  );
}

/** Trạng thái trống: icon, tiêu đề, mô tả, hành động. */
export function EmptyState({ icon: Icon, title, description, action }: { icon: LucideIcon; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-primary/20 bg-surface px-6 py-10 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-md bg-primary-50 text-primary"><Icon className="h-6 w-6" /></span>
      <p className=" text-base font-bold text-ink-deep">{title}</p>
      {description && <p className="max-w-sm text-xs leading-relaxed text-muted">{description}</p>}
      {action}
    </div>
  );
}

const ALERT = {
  error: { cls: 'border-danger/30 bg-danger/5 text-danger', icon: AlertTriangle },
  success: { cls: 'border-primary/25 bg-primary-50 text-primary-700', icon: CheckCircle2 },
  info: { cls: 'border-secondary/30 bg-secondary-50 text-ink', icon: Info },
} as const;

export function Alert({ tone = 'info', children, action }: { tone?: keyof typeof ALERT; children: ReactNode; action?: ReactNode }) {
  const { cls, icon: Icon } = ALERT[tone];
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={`flex items-start gap-2.5 rounded-md border px-3.5 py-3 text-sm ${cls}`}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0 flex-1">{children}</div>
      {action}
    </div>
  );
}

/** Nhãn trạng thái nhỏ, bo 4px. */
export function Pill({ tone = 'neutral', children }: { tone?: 'primary' | 'sun' | 'danger' | 'neutral' | 'accent'; children: ReactNode }) {
  const cls = {
    primary: 'bg-primary-50 text-primary border-primary/20',
    sun: 'bg-sun-light text-ink-deep border-sun/30',
    danger: 'bg-danger/10 text-danger border-danger/20',
    neutral: 'bg-canvas text-muted border-border',
    accent: 'bg-accent-50 text-accent-700 border-accent/30',
  }[tone];
  return <span className={`inline-flex items-center gap-1 rounded-sm border px-2 py-0.5 text-[11px] font-bold ${cls}`}>{children}</span>;
}

/**
 * Tag "Chờ duyệt" dùng chung cho mọi thứ NCC đã gửi mà quản trị viên chưa duyệt (Homestay, loại phòng, giá...):
 * nền vàng đậm + đồng hồ, chữ đậm để nhìn là thấy. {@code detail} là danh sách thay đổi (hiện khi rê chuột / đọc màn hình).
 */
export function PendingTag({ count, detail, size = 'sm' }: { count?: number; detail?: string[]; size?: 'sm' | 'md' }) {
  const text = count && count > 1 ? `${count} thay đổi chờ duyệt` : 'Chờ duyệt';
  const title = detail?.length ? `Đang chờ quản trị viên duyệt: ${detail.join('; ')}` : 'Đang chờ quản trị viên duyệt';
  return (
    <span title={title} aria-label={title}
      className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-sm border border-sun bg-sun-light font-black text-amber-800 ${size === 'md' ? 'px-2.5 py-1 text-xs' : 'px-2 py-0.5 text-[11px]'}`}>
      <Clock className={size === 'md' ? 'h-3.5 w-3.5' : 'h-3 w-3'} strokeWidth={2.75} />{text}
    </span>
  );
}

/** Khung chờ tải dạng khối mờ. */
export function LoadingBlock({ label, rows = 3 }: { label: string; rows?: number }) {
  return (
    <div role="status" className="flex flex-col gap-3">
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }, (_, i) => <div key={i} aria-hidden="true" className="h-24 animate-pulse rounded-lg bg-primary/5" />)}
    </div>
  );
}
