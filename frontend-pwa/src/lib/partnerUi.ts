/**
 * Class dùng chung cho giao diện Không gian đối tác (NCC). Theo AGENTS.md: bo góc tối đa 8px, màu lấy từ token,
 * đổ bóng có màu (shadow-card), hover nâng 2px, chuyển động 200–300ms.
 */
export const ui = {
  input: 'h-10 w-full rounded-md border border-border bg-surface px-3 text-sm text-ink placeholder:text-muted/70 transition-colors duration-200 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15 disabled:bg-canvas disabled:text-muted',
  textarea: 'w-full rounded-md border border-border bg-surface px-3 py-2 text-sm leading-relaxed text-ink placeholder:text-muted/70 transition-colors duration-200 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15',
  select: 'h-10 w-full rounded-md border border-border bg-surface px-3 text-sm text-ink transition-colors duration-200 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15',
  btnPrimary: 'inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-white shadow-[var(--shadow-teal)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-primary-600 active:translate-y-0 disabled:pointer-events-none disabled:opacity-50',
  btnCoral: 'inline-flex h-10 items-center justify-center gap-2 rounded-md bg-coral px-4 text-sm font-bold text-white shadow-[var(--shadow-coral)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-coral-hover active:translate-y-0 disabled:pointer-events-none disabled:opacity-50',
  btnOutline: 'inline-flex h-10 items-center justify-center gap-2 rounded-md border border-primary/30 bg-surface px-4 text-sm font-semibold text-primary transition-colors duration-200 hover:border-primary hover:bg-primary-50 disabled:pointer-events-none disabled:opacity-50',
  btnGhost: 'inline-flex h-9 items-center justify-center gap-1.5 rounded-md px-3 text-sm font-semibold text-muted transition-colors duration-200 hover:bg-canvas hover:text-ink disabled:pointer-events-none disabled:opacity-50',
  btnDanger: 'inline-flex h-10 items-center justify-center gap-2 rounded-md border border-danger/40 bg-surface px-4 text-sm font-semibold text-danger transition-colors duration-200 hover:bg-danger/5 disabled:pointer-events-none disabled:opacity-50',
  iconBtn: 'inline-flex h-9 w-9 items-center justify-center rounded-md text-muted transition-colors duration-200 hover:bg-canvas hover:text-primary disabled:opacity-40',
  card: 'rounded-lg border border-primary/10 bg-surface shadow-[var(--shadow-card)]',
  cardHover: 'transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-[var(--shadow-card-hover)]',
  chip: 'inline-flex items-center gap-1.5 rounded-sm border border-primary/10 bg-canvas px-2 py-1 text-xs text-ink',
} as const;

export const vnd = (n?: number | null) => (n == null ? '—' : new Intl.NumberFormat('vi-VN').format(n) + 'đ');
