import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { Bell, BellOff, BellRing, CalendarCheck, CheckCheck, FilePen, Inbox, Loader2, Siren, UserPlus, X } from 'lucide-react';
import { adminService } from '@/services/adminService';
import { useVisibleInterval } from '@/hooks/useVisibleInterval';
import { disablePush, enablePush, getPushState, type AdminPushState } from '@/lib/adminPush';
import { getApiErrorMessage } from '@/lib/apiError';
import type { AdminNotificationFeed, AdminNotificationItem } from '@/types/admin';
import { timeAgo } from './auditMeta';
import OverlayPortal from './OverlayPortal';

const POLL_MS = 30_000;
/** Phát khi danh sách thông báo đổi (đã đọc / có mới) để mọi chuông tải lại ngay. */
export const NOTIFICATIONS_SYNC_EVENT = 'admin-notifications-changed';
const SYNC_EVENT = NOTIFICATIONS_SYNC_EVENT;
type ReadSync = { readIds?: number[]; writing?: boolean };

function withReadItems(feed: AdminNotificationFeed | null, ids: Set<number>): AdminNotificationFeed | null {
  if (!feed) return feed;
  const items = feed.items.map(item => ids.has(item.id) ? { ...item, read: true } : item);
  return { ...feed, items, unread: items.filter(item => !item.read).length };
}

interface AdminNotificationBellProps {
  /** Mở mục tương ứng của cổng quản trị khi bấm một thông báo (target do backend gửi kèm). */
  /** Mở mục tương ứng; {@code bookingId}: thông báo về một đơn đặt phòng thì mở luôn đơn đó. */
  onOpenTarget: (target: string, bookingId?: number | null) => void;
  /** Vị trí hộp thư thả xuống: dưới-phải (mặc định), dưới-trái, hoặc bên phải nút (khi nút nằm trong sidebar thu gọn). */
  placement?: 'below-right' | 'below-left' | 'beside';
}

/** Biểu tượng theo mục đích của thông báo (target do backend gửi kèm). */
export const NOTIFICATION_ICON: Record<string, typeof Inbox> = {
  applications: Inbox,
  accounts: UserPlus,
  bookings: CalendarCheck,
  changes: FilePen,
  sos: Siren,
};
const ICON = NOTIFICATION_ICON;

/** Chuông thông báo: NCC gửi hồ sơ đăng ký, khách đăng ký mới. Tự làm mới định kỳ. */
export default function AdminNotificationBell({ onOpenTarget, placement = 'below-right' }: AdminNotificationBellProps) {
  const [feed, setFeed] = useState<AdminNotificationFeed | null>(null);
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState('');
  const [savedNote, setSavedNote] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef(true);
  const savingRef = useRef(false);
  const loadIdRef = useRef(0);

  // A portal keeps the mobile popup out of the drawer's animated transform.
  useLayoutEffect(() => {
    if (!open) return;
    const updatePosition = () => {
      const rect = rootRef.current?.getBoundingClientRect();
      const panel = panelRef.current;
      if (!rect || !panel) return;
      const panelWidth = Math.min(352, window.innerWidth - 24);
      const desiredLeft = placement === 'beside' ? rect.right + 12 : placement === 'below-right' ? rect.right - panelWidth : rect.left;
      const left = Math.max(12, Math.min(desiredLeft, window.innerWidth - panelWidth - 12));
      const top = Math.max(12, Math.min(placement === 'beside' ? rect.top : rect.bottom + 8, window.innerHeight - 208));
      panel.style.setProperty('--admin-notification-left', `${left}px`);
      panel.style.setProperty('--admin-notification-top', `${top}px`);
      panel.style.setProperty('--admin-notification-max-height', `calc(100dvh - ${top}px - 12px)`);
    };
    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open, placement]);

  const load = useCallback(async () => {
    if (savingRef.current) return;
    const loadId = ++loadIdRef.current;
    try {
      const next = await adminService.getNotifications();
      if (!activeRef.current || loadId !== loadIdRef.current) return;
      setFeed(next);
      setFailed(false);
    } catch {
      if (!activeRef.current || loadId !== loadIdRef.current) return;
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    activeRef.current = true;
    void load();
    // Có nhiều chuông cùng lúc (sidebar + thanh trên cùng): khi một chuông đánh dấu đã đọc thì các chuông khác tải lại ngay.
    const onSync = (event: Event) => {
      const detail = (event as CustomEvent<ReadSync>).detail;
      // Cả chuông ở sidebar và header phải bỏ phản hồi GET bắt đầu trước thao tác ghi.
      loadIdRef.current += 1;
      if (detail?.writing) return;
      if (detail?.readIds) setFeed(prev => withReadItems(prev, new Set(detail.readIds)));
      void load();
    };
    window.addEventListener(SYNC_EVENT, onSync);
    return () => {
      activeRef.current = false;
      window.removeEventListener(SYNC_EVENT, onSync);
    };
  }, [load]);

  // Làm mới định kỳ chỉ khi tab đang mở; tab ẩn thì dừng, mở lại tab thì tải ngay.
  const poll = useCallback(() => void load(), [load]);
  useVisibleInterval(poll, POLL_MS);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node) && !panelRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const unread = feed?.unread ?? 0;

  const saveRead = async (ids: number[], all: boolean) => {
    const firstId = ids[0];
    if (savingRef.current || firstId == null) return;
    savingRef.current = true;
    window.dispatchEvent(new CustomEvent<ReadSync>(SYNC_EVENT, { detail: { writing: true } }));
    setSaving(true);
    setActionError('');
    setSavedNote('');
    let saved = false;
    try {
      if (all) await adminService.markAllNotificationsRead();
      else await adminService.markNotificationRead(firstId);
      if (activeRef.current) {
        setFeed(prev => withReadItems(prev, new Set(ids)));
        setSavedNote(all ? 'Đã đánh dấu tất cả thông báo là đã đọc.' : 'Đã đánh dấu thông báo là đã đọc.');
      }
      saved = true;
    } catch (err: unknown) {
      if (activeRef.current) setActionError(getApiErrorMessage(err, 'Không lưu được trạng thái đã đọc. Vui lòng thử lại.'));
    } finally {
      savingRef.current = false;
      if (activeRef.current) setSaving(false);
      if (saved) window.dispatchEvent(new CustomEvent<ReadSync>(SYNC_EVENT, { detail: { readIds: ids } }));
    }
  };

  const openItem = (item: AdminNotificationItem) => {
    if (!item.read) void saveRead([item.id], false);
    setOpen(false);
    if (item.target) onOpenTarget(item.target, item.entityType === 'Booking' ? item.entityId : null);
  };

  const readAll = () => saveRead(feed?.items.filter(item => !item.read).map(item => item.id) ?? [], true);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => {
          setOpen((o) => !o);
          if (!open) void load();
        }}
        aria-label={unread > 0 ? `Thông báo, ${unread} chưa đọc` : 'Thông báo'}
        aria-expanded={open}
        title="Thông báo"
        className={`relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border bg-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary lg:h-8 lg:w-8 lg:rounded-md ${
          open ? 'border-primary/50 text-primary' : 'border-border text-muted hover:border-primary/40 hover:text-primary'
        }`}
      >
        <Bell className="h-5 w-5 lg:h-4 lg:w-4" />
        {unread > 0 && (
          <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-coral px-1 text-[10px] font-bold leading-none text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <OverlayPortal lockScroll={false}>
        <div
          ref={panelRef}
          data-admin-overlay="notification"
          role="dialog"
          aria-label="Thông báo"
          style={{
            '--admin-notification-top': '12px',
            '--admin-notification-left': '12px',
            '--admin-notification-max-height': 'calc(100dvh - 24px)',
          } as CSSProperties}
          className="admin-notification-panel rise-in fixed z-[10030] flex w-[22rem] max-w-[calc(100vw-24px)] flex-col overflow-hidden rounded-2xl border border-border bg-white shadow-xl lg:rounded-lg"
        >
          <header className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-3 py-2.5 sm:px-4">
            <h3 className="min-w-0 flex-1 font-display text-sm font-bold text-ink-deep">
              Thông báo {unread > 0 && <span className="ml-1 rounded bg-coral/10 px-1.5 py-px text-[10px] font-bold text-coral">{unread} mới</span>}
            </h3>
            {!!feed?.items.length && (
              <button type="button" data-read-notifications disabled={saving || unread === 0} aria-busy={saving}
                onClick={() => void readAll()}
                className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold text-primary transition-colors hover:bg-primary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-default disabled:text-muted">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCheck className="h-4 w-4" />}
                {saving ? 'Đang lưu...' : unread > 0 ? 'Đọc tất cả' : 'Đã đọc tất cả'}
              </button>
            )}
            <button type="button" onClick={() => setOpen(false)} aria-label="Đóng thông báo" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-muted hover:bg-canvas focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary lg:h-8 lg:w-8"><X className="h-5 w-5 lg:h-4 lg:w-4" /></button>
          </header>
          {actionError && <p role="alert" className="shrink-0 border-b border-danger/20 bg-danger/5 px-4 py-3 text-xs leading-relaxed text-danger">{actionError}</p>}
          {savedNote && !actionError && <p role="status" className="shrink-0 border-b border-border bg-primary-50 px-4 py-2 text-xs text-primary">{savedNote}</p>}
          <div className="admin-scroll-area min-h-0 max-h-96 flex-1 overflow-y-auto overscroll-contain">
            {failed && feed && <p role="alert" className="px-4 py-2 text-xs text-danger">Chưa tải được thông báo mới. Đang hiển thị danh sách trước đó.</p>}
            {failed && !feed ? (
              <p className="px-4 py-8 text-center text-xs text-danger">Không tải được thông báo.</p>
            ) : !feed ? (
              <p className="px-4 py-8 text-center text-xs text-muted">Đang tải...</p>
            ) : feed.items.length === 0 ? (
              <p className="flex flex-col items-center gap-2 px-4 py-8 text-center text-xs text-muted">
                <BellOff className="h-5 w-5 text-primary-300" /> Chưa có thông báo nào.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {feed.items.map((n) => {
                  const Icon = (n.target && ICON[n.target]) || Bell;
                  return (
                    <li key={n.id}>
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => openItem(n)}
                        className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-canvas ${n.read ? '' : 'bg-primary-50/50'}`}
                      >
                        <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${n.read ? 'bg-canvas text-muted' : 'bg-sun/15 text-amber-700'}`}>
                          <Icon className="h-4 w-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className={`block text-xs ${n.read ? 'font-semibold text-ink' : 'font-bold text-ink-deep'}`}>{n.title ?? 'Thông báo'}</span>
                          <span className="mt-0.5 block text-[11px] leading-snug text-muted">{n.message}</span>
                          <span className="mt-1 block text-[10px] text-muted/80">{timeAgo(n.createdAt)}</span>
                        </span>
                        {!n.read && <span aria-hidden className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-coral" />}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <PushToggle />
        </div>
        </OverlayPortal>
      )}
    </div>
  );
}

const PUSH_HINT: Record<AdminPushState, string> = {
  on: 'Đang bật trên thiết bị này — thông báo hiện ra ngoài màn hình kể cả khi đóng tab.',
  off: 'Nhận thông báo ngoài màn hình khi có đơn mới, khách sửa / hủy đơn, NCC xử lý đơn, yêu cầu mới hoặc SOS.',
  denied: 'Trình duyệt đang chặn thông báo. Mở biểu tượng ổ khóa cạnh thanh địa chỉ → Thông báo → Cho phép, rồi tải lại trang.',
  'ios-install': 'Trên iPhone/iPad: bấm Chia sẻ → "Thêm vào MH chính", mở web từ biểu tượng đó rồi bật thông báo.',
  unsupported: 'Trình duyệt này không hỗ trợ thông báo đẩy. Hãy dùng Chrome, Edge, Firefox hoặc Safari mới.',
};

/** Bật / tắt thông báo đẩy ra ngoài màn hình cho thiết bị đang dùng (mỗi thiết bị bật riêng). */
function PushToggle() {
  const [state, setState] = useState<AdminPushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');

  useEffect(() => {
    let alive = true;
    getPushState()
      .then((s) => alive && setState(s))
      .catch(() => alive && setState('unsupported'));
    return () => {
      alive = false;
    };
  }, []);

  const run = async (action: () => Promise<AdminPushState | void>, success?: string) => {
    setBusy(true);
    setNote('');
    try {
      const next = await action();
      if (next) setState(next);
      if (success) setNote(success);
    } catch (err: unknown) {
      setNote(getApiErrorMessage(err, err instanceof Error ? err.message : 'Không thực hiện được, vui lòng thử lại.'));
    } finally {
      setBusy(false);
    }
  };

  if (state === null) return null;
  const on = state === 'on';
  const canToggle = state === 'on' || state === 'off';

  return (
    <div className="shrink-0 border-t border-border bg-canvas/60 px-4 py-3">
      <div className="flex items-center gap-3">
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${on ? 'bg-accent/15 text-primary' : 'bg-white text-muted ring-1 ring-border'}`}>
          {on ? <BellRing className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold text-ink-deep">Thông báo đẩy {on ? '· Đang bật' : ''}</p>
          <p className="text-[11px] leading-snug text-muted">{PUSH_HINT[state]}</p>
        </div>
        {canToggle && (
          <button
            type="button"
            role="switch"
            aria-checked={on}
            aria-label={on ? 'Tắt thông báo đẩy' : 'Bật thông báo đẩy'}
            disabled={busy}
            onClick={() => void run(on ? () => disablePush() : () => enablePush(), on ? 'Đã tắt thông báo đẩy trên thiết bị này.' : 'Đã bật! Bấm "Gửi thử" để kiểm tra.')}
            className={`relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-60 ${on ? 'bg-accent' : 'bg-border'}`}
          >
            <span className={`absolute top-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-white shadow transition-all ${on ? 'left-[1.375rem]' : 'left-0.5'}`}>
              {busy && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted" />}
            </span>
          </button>
        )}
      </div>
      {on && (
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              const delivered = await adminService.testPush();
              setNote(delivered > 0 ? `Đã gửi thử tới ${delivered} thiết bị — kiểm tra góc màn hình.` : 'Chưa gửi được — hãy tắt rồi bật lại thông báo đẩy.');
            })
          }
          className="mt-2 h-8 w-full rounded-md border border-border bg-white text-xs font-semibold text-primary transition-colors hover:border-primary/40 active:scale-[0.99] disabled:opacity-60"
        >
          Gửi thử thông báo
        </button>
      )}
      {note && <p className="mt-2 text-[11px] text-ink">{note}</p>}
    </div>
  );
}
