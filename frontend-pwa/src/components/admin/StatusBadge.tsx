import type { ReactNode } from 'react';

export type StatusTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'brand';

/** Bảng màu ngữ nghĩa dùng chung cho mọi trạng thái ở khu vực admin. */
const TONE: Record<StatusTone, { badge: string; dot: string }> = {
  success: { badge: 'bg-accent/10 text-primary-700 ring-accent/30', dot: 'bg-accent' },
  warning: { badge: 'bg-sun/15 text-amber-700 ring-sun/40', dot: 'bg-sun' },
  danger: { badge: 'bg-danger/10 text-danger ring-danger/30', dot: 'bg-danger' },
  info: { badge: 'bg-secondary/10 text-secondary-700 ring-secondary/30', dot: 'bg-secondary' },
  brand: { badge: 'bg-primary-50 text-primary ring-primary/30', dot: 'bg-primary' },
  neutral: { badge: 'bg-canvas text-muted ring-border', dot: 'bg-muted/60' },
};

interface StatusBadgeProps {
  tone: StatusTone;
  children: ReactNode;
  /** Chấm nhấp nháy cho trạng thái đang chờ xử lý. */
  pulse?: boolean;
  className?: string;
}

export function StatusBadge({ tone, children, pulse = false, className = '' }: StatusBadgeProps) {
  const t = TONE[tone];
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset transition-colors duration-200 ${t.badge} ${className}`}
    >
      <span className="relative flex h-1.5 w-1.5">
        {pulse && <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 ${t.dot}`} />}
        <span className={`relative inline-flex h-1.5 w-1.5 rounded-full ${t.dot}`} />
      </span>
      {children}
    </span>
  );
}
