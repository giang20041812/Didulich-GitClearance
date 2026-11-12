import { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, X } from 'lucide-react';
import { adminService } from '@/services/adminService';
import { getPushState, showLocalNotification } from '@/lib/adminPush';
import type { AdminNotificationItem } from '@/types/admin';
import { NOTIFICATION_ICON, NOTIFICATIONS_SYNC_EVENT } from './AdminNotificationBell';

const POLL_MS = 20_000;
const TOAST_MS = 9_000;
const MAX_TOASTS = 3;

interface AdminLiveAlertsProps {
  /** Mở mục tương ứng khi bấm "Xem" trên toast (thông báo đơn đặt phòng mở luôn đơn đó). */
  onOpenTarget: (target: string, bookingId?: number | null) => void;
  /** Có thông báo mới: trang cha tải lại số đếm của menu. */
  onNewActivity: () => void;
}

/**
 * Báo ngay khi có việc mới (đơn mới, khách sửa / hủy đơn, NCC xác nhận / ghi nhận thanh toán, hồ sơ / yêu cầu NCC, SOS, khách mới):
 * - toast trong trang + rung nhẹ trên điện thoại;
 * - thiết bị chưa bật đẩy nhưng đã cho phép thông báo và tab đang ẩn → hiện thông báo hệ thống từ trang;
 * - thiết bị đã bật đẩy thì service worker hiện thông báo (kể cả đóng tab) và báo về đây để tải lại ngay.
 * Chỉ gắn một lần trong trang Admin (các chuông chỉ hiển thị, không tự báo) để không báo trùng.
 */
export default function AdminLiveAlerts({ onOpenTarget, onNewActivity }: AdminLiveAlertsProps) {
  const [toasts, setToasts] = useState<AdminNotificationItem[]>([]);
  const seen = useRef<Set<number> | null>(null);
  const onNewRef = useRef(onNewActivity);
  onNewRef.current = onNewActivity;

  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const check = useCallback(async () => {
    let items: AdminNotificationItem[];
    try {
      items = (await adminService.getNotifications()).items;
    } catch {
      return;
    }
    // Lần đầu chỉ ghi nhận những gì đã có, không báo lại thông báo cũ.
    if (seen.current === null) {
      seen.current = new Set(items.map((i) => i.id));
      return;
    }
    const fresh = items.filter((i) => !i.read && !seen.current!.has(i.id));
    items.forEach((i) => seen.current!.add(i.id));
    if (fresh.length === 0) return;

    setToasts((t) => [...fresh.slice(0, MAX_TOASTS), ...t].slice(0, MAX_TOASTS));
    window.dispatchEvent(new Event(NOTIFICATIONS_SYNC_EVENT));
    onNewRef.current();
    navigator.vibrate?.(fresh.some((i) => i.target === 'sos') ? [200, 100, 200, 100, 200] : 120);

    if (document.hidden && (await getPushState()) !== 'on') {
      for (const n of fresh.slice(0, MAX_TOASTS)) {
        const url = n.target ? `/admin?tab=${n.target}${n.entityType === 'Booking' && n.entityId ? `&booking=${n.entityId}` : ''}` : '/admin';
        void showLocalNotification(n.title ?? 'Thông báo mới', n.message ?? '', url, `admin-local-${n.id}`);
      }
    }
  }, []);

  useEffect(() => {
    void check();
    const timer = window.setInterval(() => void check(), POLL_MS);
    const onVisible = () => {
      if (!document.hidden) void check();
    };
    // Service worker vừa nhận push → kiểm tra ngay, không chờ chu kỳ.
    const onSwMessage = (e: MessageEvent) => {
      if (e.data?.type === 'admin-push') void check();
    };
    document.addEventListener('visibilitychange', onVisible);
    navigator.serviceWorker?.addEventListener('message', onSwMessage);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      navigator.serviceWorker?.removeEventListener('message', onSwMessage);
    };
  }, [check]);

  // Mỗi toast tự ẩn sau vài giây.
  useEffect(() => {
    if (toasts.length === 0) return;
    const timer = window.setTimeout(() => setToasts((t) => t.slice(0, -1)), TOAST_MS);
    return () => window.clearTimeout(timer);
  }, [toasts]);

  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-3 top-[max(0.75rem,var(--safe-top))] z-[10001] flex flex-col items-stretch gap-2 sm:inset-x-auto sm:right-4 sm:top-20 sm:w-96"
    >
      {toasts.map((n) => {
        const Icon = (n.target && NOTIFICATION_ICON[n.target]) || Bell;
        const urgent = n.target === 'sos';
        return (
          <div
            key={n.id}
            role="status"
            className={`rise-in pointer-events-auto flex items-start gap-3 rounded-xl border bg-white p-3 shadow-xl ${urgent ? 'border-danger/40' : 'border-border'}`}
          >
            <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${urgent ? 'bg-danger/10 text-danger' : 'bg-primary-50 text-primary'}`}>
              <Icon className="h-4 w-4" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-ink-deep">{n.title ?? 'Thông báo mới'}</p>
              {n.message && <p className="mt-0.5 line-clamp-2 text-xs leading-snug text-muted">{n.message}</p>}
              {n.target && (
                <button
                  type="button"
                  onClick={() => {
                    dismiss(n.id);
                    onOpenTarget(n.target!, n.entityType === 'Booking' ? n.entityId : null);
                    void adminService.markNotificationRead(n.id).finally(() => window.dispatchEvent(new Event(NOTIFICATIONS_SYNC_EVENT)));
                  }}
                  className="mt-2 h-8 rounded-md bg-primary px-3 text-xs font-semibold text-white transition-colors active:scale-95 hover:bg-primary-600"
                >
                  Xem ngay
                </button>
              )}
            </div>
            <button type="button" onClick={() => dismiss(n.id)} aria-label="Đóng thông báo" className="rounded-md p-1 text-muted hover:bg-hover hover:text-ink">
              <X className="h-4 w-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
