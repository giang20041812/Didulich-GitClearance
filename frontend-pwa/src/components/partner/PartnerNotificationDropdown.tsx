import { useState, useRef, useEffect, useCallback } from 'react';
import { Bell, BellOff, BellRing, AlertCircle, Clock, Edit3, XCircle, CheckCircle2, Wallet } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { partnerNotificationService } from '@/services/partnerNotificationService';
import { useVisibleInterval } from '@/hooks/useVisibleInterval';
import { disablePush, enablePush, getPushState, type AdminPushState } from '@/lib/adminPush';
import type { AdminNotificationItem } from '@/types/admin';
import type { ChangeOperation, ChangeRequestSummary } from '@/types/changeRequest';

type NotificationType = 'NEW_BOOKING' | 'BOOKING_UPDATED' | 'BOOKING_DONE' | 'PAID' | 'CANCELLED'
  | 'CHANGE_PENDING' | 'CHANGE_APPROVED' | 'CHANGE_REJECTED';

type Notification = {
  id: string;
  /** Thông báo lưu ở máy chủ (đơn đặt phòng): đánh dấu đã đọc qua API, không qua trình duyệt. */
  serverId?: number;
  type: NotificationType;
  title: string;
  detail?: string;
  at: string;
  read: boolean;
  link: string;
};

const READ_KEY = 'partner_read_notifications';
/** Trì hoãn lần tải đầu của chuông (ms): trang vừa mở gửi request chính trước. */
const FIRST_LOAD_DELAY_MS = 1500;
/** Thông báo đã tự bật khung lên một lần — không bật lại mỗi lượt làm mới. */
const ANNOUNCED_KEY = 'partner_announced_notifications';
const OPERATION_LABEL: Record<ChangeOperation, string> = {
  CREATE: 'thêm', UPDATE: 'chỉnh sửa', DELETE: 'xóa', PUBLISH: 'xuất bản', TRANSFER: 'chuyển NCC quản lý',
};

/** Thông báo đã đọc / đã bật chỉ là tiện ích trên trình duyệt này; lỗi lưu trữ thì coi như chưa đọc. */
function storedIds(key: string): Set<string> {
  try { return new Set<string>(JSON.parse(localStorage.getItem(key) ?? '[]') as string[]); } catch { return new Set(); }
}
function saveIds(key: string, ids: Set<string>) {
  try { localStorage.setItem(key, JSON.stringify([...ids].slice(-300))); } catch { /* bỏ qua: chỉ là tiện ích */ }
}
const readIds = () => storedIds(READ_KEY);
const saveReadIds = (ids: Set<string>) => saveIds(READ_KEY, ids);

/** Thông báo đơn đặt phòng do máy chủ gửi (đơn mới, khách sửa / hủy, Admin xử lý). */
function fromServer(n: AdminNotificationItem): Omit<Notification, 'read'> & { read: boolean } {
  const title = n.title ?? 'Thông báo đơn đặt phòng';
  const lower = title.toLowerCase();
  const type: NotificationType = lower.includes('hủy') ? 'CANCELLED'
    : lower.includes('thay đổi') ? 'BOOKING_UPDATED'
    : lower.includes('thanh toán') ? 'PAID'
    : lower.includes('xác nhận') ? 'BOOKING_DONE'
    : 'NEW_BOOKING';
  return {
    id: `srv-${n.id}`, serverId: n.id, type, title, detail: n.message ?? undefined, at: n.createdAt, read: n.read,
    link: n.entityType === 'Booking' && n.entityId ? `/partner/bookings/${n.entityId}` : '/partner/bookings',
  };
}

/** Thông báo về yêu cầu chỉnh sửa Homestay/loại phòng/giá của chính NCC gửi quản trị viên duyệt. */
function fromChangeRequest(r: ChangeRequestSummary): Omit<Notification, 'read'> | null {
  const action = `Yêu cầu ${OPERATION_LABEL[r.operation]} “${r.targetName}”`;
  const link = r.targetType === 'HOMESTAY' ? `/partner/homestay/${r.placeId}/edit` : `/partner/homestay/${r.placeId}/rooms`;
  switch (r.status) {
    case 'PENDING':
      return { id: `ncc-change-${r.id}-pending`, type: 'CHANGE_PENDING', title: `${action} đang chờ quản trị viên duyệt`, detail: r.placeName, at: r.submittedAt, link };
    case 'APPROVED':
      return { id: `ncc-change-${r.id}-approved`, type: 'CHANGE_APPROVED', title: `${action} đã được duyệt`, detail: r.placeName, at: r.reviewedAt ?? r.submittedAt, link };
    case 'REJECTED':
      return { id: `ncc-change-${r.id}-rejected`, type: 'CHANGE_REJECTED', title: `${action} bị từ chối`, detail: r.reviewNote ? `Lý do: ${r.reviewNote}` : r.placeName, at: r.reviewedAt ?? r.submittedAt, link };
    default:
      return null;
  }
}

/**
 * Chuông thông báo của cổng NCC: tin đơn đặt phòng từ máy chủ (đơn mới, khách sửa / hủy đơn, Admin xác nhận / ghi nhận
 * thanh toán / hủy) và kết quả các yêu cầu chỉnh sửa Homestay. Có tin mới thì tự mở khung; thiết bị bật thông báo đẩy thì
 * tin hiện ra cả ngoài màn hình khi đã đóng web.
 */
export default function PartnerNotificationDropdown() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const unreadCount = notifications.filter(n => !n.read).length;

  const activeRef = useRef(true);
  const load = useCallback(async () => {
    // Only the visible header polls; the other responsive header is mounted too.
    if (!dropdownRef.current?.getClientRects().length) return;
    // Một lượt gọi ưu tiên thấp cho cả hai nguồn (đơn + yêu cầu chỉnh sửa): nhường request chính của trang.
    // Máy chủ trả changes = null nếu phần yêu cầu chỉnh sửa lỗi, không làm mất thông báo đơn.
    // Phiên hết hạn / bị thu hồi do interceptor axios xử lý (về trang đăng nhập kèm thông báo).
    let inbox;
    try {
      inbox = await partnerNotificationService.getInbox();
    } catch {
      return; // giữ danh sách cũ, lượt sau thử lại
    }
    if (!activeRef.current) return;
    const read = readIds();
    const items: Notification[] = [];
    items.push(...inbox.feed.items.map(fromServer));
    inbox.changes?.forEach((r) => { const n = fromChangeRequest(r); if (n) items.push({ ...n, read: read.has(n.id) }); });
    setNotifications(items.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()));

    // Có thông báo mới chưa đọc: tự mở khung, không bắt chủ nhà để ý chấm đỏ. Header điện thoại và thanh trên máy tính
    // đều gắn một bản, bản đang bị ẩn bằng CSS không được bật (và không đánh dấu) để bản đang hiện vẫn mở được.
    const el = dropdownRef.current;
    if (!el || el.getClientRects().length === 0) return;
    const announced = storedIds(ANNOUNCED_KEY);
    // Yêu cầu do chính NCC vừa gửi (đang chờ duyệt) không phải tin mới với họ: không tự bật khung vì nó.
    const fresh = items.filter((n) => n.type !== 'CHANGE_PENDING' && !n.read && !announced.has(n.id));
    if (fresh.length === 0) return;
    fresh.forEach((n) => announced.add(n.id));
    saveIds(ANNOUNCED_KEY, announced);
    setOpen(true);
  }, []);

  useEffect(() => {
    activeRef.current = true;
    // Lần đầu chờ một nhịp để request chính của trang (lịch phòng, danh sách đơn...) được gửi trước.
    const first = window.setTimeout(() => void load(), FIRST_LOAD_DELAY_MS);
    // Service worker vừa nhận thông báo đẩy → tải lại ngay, không chờ chu kỳ.
    const onSwMessage = (e: MessageEvent) => {
      if (e.data?.type === 'partner-push') void load();
    };
    navigator.serviceWorker?.addEventListener('message', onSwMessage);
    return () => {
      activeRef.current = false;
      window.clearTimeout(first);
      navigator.serviceWorker?.removeEventListener('message', onSwMessage);
    };
  }, [load]);

  // Làm mới mỗi 20 giây khi tab đang mở; tab ẩn thì dừng, mở lại tab thì tải ngay.
  const poll = useCallback(() => {
    void load();
  }, [load]);
  useVisibleInterval(poll, 20000);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const markRead = (items: Notification[]) => {
    const local = readIds();
    items.forEach((n) => {
      if (n.serverId != null) void partnerNotificationService.markRead(n.serverId).catch(() => undefined);
      else local.add(n.id);
    });
    saveReadIds(local);
    const ids = new Set(items.map((n) => n.id));
    setNotifications(prev => prev.map(n => ids.has(n.id) ? { ...n, read: true } : n));
  };

  const markAllRead = () => {
    const unread = notifications.filter(n => !n.read);
    if (unread.some((n) => n.serverId != null)) void partnerNotificationService.markAllRead().catch(() => undefined);
    markRead(unread.filter((n) => n.serverId == null));
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  };

  const handleNotificationClick = (notif: Notification) => {
    markRead([notif]);
    setOpen(false);
    navigate(notif.link);
  };

  const getIcon = (type: NotificationType) => {
    switch (type) {
      case 'NEW_BOOKING': return <AlertCircle className="h-5 w-5 text-primary" />;
      case 'BOOKING_UPDATED': return <Edit3 className="h-5 w-5 text-sun" />;
      case 'BOOKING_DONE': return <CheckCircle2 className="h-5 w-5 text-sky-600" />;
      case 'PAID': return <Wallet className="h-5 w-5 text-accent-600" />;
      case 'CHANGE_PENDING': return <Clock className="h-5 w-5 text-secondary-700" />;
      case 'CHANGE_APPROVED': return <CheckCircle2 className="h-5 w-5 text-accent-600" />;
      case 'CHANGE_REJECTED':
      case 'CANCELLED': return <XCircle className="h-5 w-5 text-danger" />;
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        aria-label={unreadCount > 0 ? `Thông báo (${unreadCount} mới)` : 'Thông báo'}
        onClick={() => setOpen(!open)}
        className="relative rounded-md p-1.5 text-ink hover:bg-surface focus:outline-none focus:ring-2 focus:ring-primary/20"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute right-1 top-1 flex h-2 w-2 rounded-full bg-coral"></span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-[min(22rem,calc(100vw-24px))] rounded-lg border border-border bg-white pt-2 shadow-xl z-[9999]">
          <div className="flex items-center justify-between border-b border-border px-4 pb-2">
            <h3 className="font-bold text-ink-deep">Thông báo</h3>
            {unreadCount > 0 && (
              <button type="button" onClick={markAllRead}
                className="rounded-md bg-coral-light px-2 py-0.5 text-[10px] font-bold text-coral-hover hover:underline">
                {unreadCount} mới · Đánh dấu đã đọc
              </button>
            )}
          </div>

          <div className="max-h-[320px] overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="p-4 text-center text-sm text-muted">Không có thông báo nào</p>
            ) : (
              notifications.map((notif) => (
                <button
                  type="button"
                  key={notif.id}
                  onClick={() => handleNotificationClick(notif)}
                  className={`flex w-full items-start gap-3 border-b border-border px-4 py-3 text-left transition-colors hover:bg-surface ${!notif.read ? 'bg-primary-50/50' : ''}`}
                >
                  <div className="mt-0.5 shrink-0">
                    {getIcon(notif.type)}
                  </div>
                  <div className="min-w-0">
                    <p className={`text-sm ${!notif.read ? 'font-bold text-ink-deep' : 'text-ink'}`}>
                      {notif.title}
                    </p>
                    {notif.detail && <p className="mt-0.5 line-clamp-2 text-xs text-ink">{notif.detail}</p>}
                    <p className="mt-1 text-xs text-muted">{new Date(notif.at).toLocaleString('vi-VN')}</p>
                  </div>
                </button>
              ))
            )}
          </div>
          <PushSwitch />
        </div>
      )}
    </div>
  );
}

const PUSH_HINT: Record<AdminPushState, string> = {
  on: 'Đơn mới, khách sửa / hủy đơn sẽ hiện ngay trên màn hình, kể cả khi đã đóng web.',
  off: 'Bật để đơn mới hiện ngay trên màn hình điện thoại / máy tính, kể cả khi đã đóng web.',
  denied: 'Trình duyệt đang chặn thông báo. Mở biểu tượng ổ khóa cạnh thanh địa chỉ → Thông báo → Cho phép.',
  'ios-install': 'iPhone/iPad: bấm Chia sẻ → "Thêm vào MH chính", mở web từ biểu tượng đó rồi bật thông báo.',
  unsupported: 'Trình duyệt này không hỗ trợ thông báo đẩy.',
};

/** Bật / tắt thông báo đẩy cho thiết bị đang dùng — một nút lớn, không cần cài đặt gì thêm. */
function PushSwitch() {
  const [state, setState] = useState<AdminPushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');

  useEffect(() => {
    let alive = true;
    getPushState().then((s) => alive && setState(s)).catch(() => alive && setState('unsupported'));
    return () => { alive = false; };
  }, []);

  if (state === null) return null;
  const on = state === 'on';
  const canToggle = on || state === 'off';

  async function toggle() {
    setBusy(true); setNote('');
    try {
      const next = on ? await disablePush(partnerNotificationService) : await enablePush(partnerNotificationService);
      setState(next);
      if (next === 'on') {
        const delivered = await partnerNotificationService.testPush().catch(() => 0);
        setNote(delivered > 0 ? 'Đã bật — vừa gửi một thông báo thử.' : 'Đã bật thông báo đẩy.');
      }
    } catch (e: unknown) {
      setNote(e instanceof Error && e.message ? e.message : 'Không bật được, vui lòng thử lại.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-b-lg bg-canvas/60 px-4 py-3">
      <p className="flex items-start gap-2 text-xs text-ink">
        {on ? <BellRing className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> : <BellOff className="mt-0.5 h-4 w-4 shrink-0 text-muted" />}
        <span>{PUSH_HINT[state]}</span>
      </p>
      {canToggle && (
        <button type="button" disabled={busy} onClick={() => void toggle()}
          className={`h-11 rounded-md text-sm font-bold transition-colors disabled:opacity-60 ${on ? 'border-2 border-border bg-white text-ink-deep hover:bg-canvas' : 'bg-primary text-white hover:bg-primary-700'}`}>
          {busy ? 'Đang xử lý...' : on ? 'Tắt thông báo trên thiết bị này' : 'Bật thông báo trên thiết bị này'}
        </button>
      )}
      {note && <p className="text-xs font-semibold text-primary-700">{note}</p>}
    </div>
  );
}
