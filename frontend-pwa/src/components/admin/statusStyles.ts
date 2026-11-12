import type { StatusTone } from './StatusBadge';

/** Nút hành động nhỏ theo tone, dùng cho Khóa / Mở khóa / Đình chỉ... */
export function actionButtonClass(tone: StatusTone): string {
  const map: Record<StatusTone, string> = {
    success: 'text-primary-700 hover:bg-accent/10 hover:ring-accent/40',
    warning: 'text-amber-700 hover:bg-sun/15 hover:ring-sun/50',
    danger: 'text-danger hover:bg-danger/10 hover:ring-danger/40',
    info: 'text-secondary-700 hover:bg-secondary/10 hover:ring-secondary/40',
    brand: 'text-primary hover:bg-primary-50 hover:ring-primary/40',
    neutral: 'text-muted hover:bg-hover hover:ring-border',
  };
  return `inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold ring-1 ring-inset ring-border transition-all duration-200 active:scale-95 ${map[tone]}`;
}

export const PROVIDER_STATUS: Record<'ACTIVE' | 'SUSPENDED' | 'TERMINATED', { tone: StatusTone; label: string }> = {
  ACTIVE: { tone: 'success', label: 'Đang hoạt động' },
  SUSPENDED: { tone: 'danger', label: 'Đình chỉ' }, // "Bị khóa" (đỏ) = đình chỉ hoặc chấm dứt
  TERMINATED: { tone: 'danger', label: 'Chấm dứt' },
};
