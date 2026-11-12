import { CalendarCheck, ClipboardCheck, LayoutDashboard, Menu, Siren, type LucideIcon } from 'lucide-react';
import type { AdminTab } from './adminNav';

/** Các hàng đợi gộp vào nút "Cần duyệt" (ưu tiên mở hàng đợi đang có việc). */
const QUEUE_TABS: AdminTab[] = ['applications', 'changes', 'places', 'reviews'];

interface AdminBottomNavProps {
  active: AdminTab;
  counts: Partial<Record<AdminTab, number | null>>;
  allowed: (tab: AdminTab) => boolean;
  onSelect: (tab: AdminTab) => void;
  onOpenMenu: () => void;
}

/**
 * Thanh điều hướng đáy cho điện thoại (ẩn từ lg): 4 việc dùng nhiều nhất trong tầm ngón cái + mở menu đầy đủ.
 * Số đếm giống badge của sidebar; SOS hiện đỏ để không bỏ sót.
 */
export default function AdminBottomNav({ active, counts, allowed, onSelect, onOpenMenu }: AdminBottomNavProps) {
  const queues = QUEUE_TABS.filter(allowed);
  const queueCount = queues.reduce((sum, t) => sum + (counts[t] ?? 0), 0);
  const nextQueue = queues.find((t) => (counts[t] ?? 0) > 0) ?? queues[0];

  const items: { key: string; label: string; icon: LucideIcon; count?: number; urgent?: boolean; isActive: boolean; onClick: () => void }[] = [
    { key: 'dashboard', label: 'Tổng quan', icon: LayoutDashboard, isActive: active === 'dashboard', onClick: () => onSelect('dashboard') },
    ...(nextQueue
      ? [{ key: 'queue', label: 'Cần duyệt', icon: ClipboardCheck, count: queueCount, isActive: QUEUE_TABS.includes(active), onClick: () => onSelect(nextQueue) }]
      : []),
    ...(allowed('bookings')
      ? [{ key: 'bookings', label: 'Đặt phòng', icon: CalendarCheck, count: counts.bookings ?? 0, isActive: active === 'bookings', onClick: () => onSelect('bookings') }]
      : []),
    ...(allowed('sos')
      ? [{ key: 'sos', label: 'SOS', icon: Siren, count: counts.sos ?? 0, urgent: true, isActive: active === 'sos', onClick: () => onSelect('sos') }]
      : []),
    { key: 'menu', label: 'Menu', icon: Menu, isActive: false, onClick: onOpenMenu },
  ];

  return (
    <nav
      aria-label="Điều hướng nhanh"
      className="admin-bottom-nav fixed inset-x-0 bottom-0 z-30 border-t border-border bg-white/95 pb-[var(--safe-bottom)] backdrop-blur lg:hidden"
    >
      <ul className="mx-auto flex max-w-lg items-stretch justify-around">
        {items.map(({ key, label, icon: Icon, count, urgent, isActive, onClick }) => (
          <li key={key} className="min-w-0 flex-1">
            <button
              type="button"
              onClick={onClick}
              aria-current={isActive ? 'page' : undefined}
              className={`relative flex h-16 w-full flex-col items-center justify-center gap-1 rounded-xl text-[11px] font-semibold transition-colors active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary ${
                isActive ? 'text-primary' : 'text-muted'
              }`}
            >
              {isActive && <span aria-hidden className="absolute top-0 h-0.5 w-8 rounded-full bg-primary" />}
              <span className="relative">
                <Icon className="h-5 w-5" aria-hidden />
                {!!count && count > 0 && (
                  <span
                    className={`absolute -right-2.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold leading-none text-white ${
                      urgent ? 'animate-pulse bg-danger' : 'bg-coral'
                    }`}
                  >
                    {count > 99 ? '99+' : count}
                  </span>
                )}
              </span>
              {label}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
