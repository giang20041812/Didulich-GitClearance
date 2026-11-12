import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Bell, 
  CheckCircle2, 
  XCircle, 

  CheckCheck, 
  BellOff, 
  ExternalLink,
  Clock,
  Sparkles
} from 'lucide-react';
import type { CustomerNotification } from '@/types/notification';
import { 
  fetchCustomerNotifications, 
  markNotificationAsRead, 
  markAllNotificationsAsRead 
} from '@/services/notificationService';
import { getCurrentCustomer, type CurrentCustomer } from '@/lib/currentCustomer';
import { useVisibleInterval } from '@/hooks/useVisibleInterval';

interface NotificationBellProps {
  isSolid: boolean;
}

export default function NotificationBell({ isSolid }: NotificationBellProps) {
  const [notifications, setNotifications] = useState<CustomerNotification[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [filter, setFilter] = useState<'ALL' | 'UNREAD'>('ALL');
  const [currentUser, setCurrentUser] = useState<CurrentCustomer | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const knownIds = useRef<Set<number> | null>(null);
  const navigate = useNavigate();

  // Đồng bộ thông tin người dùng đang đăng nhập
  const syncUser = useCallback(() => {
    setCurrentUser(getCurrentCustomer());
  }, []);

  useEffect(() => {
    syncUser();
    window.addEventListener('auth_change', syncUser);
    window.addEventListener('storage', syncUser);
    return () => {
      window.removeEventListener('auth_change', syncUser);
      window.removeEventListener('storage', syncUser);
    };
  }, [syncUser]);

  // Nạp danh sách thông báo từ server
  const loadNotifications = useCallback(async () => {
    if (!currentUser) {
      setNotifications([]);
      return;
    }

    const data = await fetchCustomerNotifications();
    // Có thông báo mới (VD: chủ nhà vừa xác nhận đơn) → ghim đơn đặt ở đầu trang cập nhật trạng thái ngay.
    const previous = knownIds.current;
    if (previous && data.some((n) => !previous.has(n.id))) window.dispatchEvent(new Event('booking_status_change'));
    knownIds.current = new Set(data.map((n) => n.id));
    setNotifications(data);
  }, [currentUser]);

  useEffect(() => {
    void loadNotifications();

    const handleCustomChange = () => {
      void loadNotifications();
    };

    window.addEventListener('notification_change', handleCustomChange);
    return () => {
      window.removeEventListener('notification_change', handleCustomChange);
    };
  }, [loadNotifications]);

  // Cập nhật trạng thái đơn mỗi 30 giây, chỉ khi tab đang mở (tab ẩn không gọi API); mở lại tab thì tải ngay.
  const pollNotifications = useCallback(() => {
    void loadNotifications();
  }, [loadNotifications]);
  useVisibleInterval(pollNotifications, 30000);

  // Đóng dropdown khi click ra ngoài
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  const handleMarkAsRead = async (id: number) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
    );
    await markNotificationAsRead(id);
  };

  const handleMarkAllRead = async () => {
    const unreadIds = notifications.filter((n) => !n.isRead).map((n) => n.id);
    if (unreadIds.length === 0) return;

    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    await markAllNotificationsAsRead({
      email: currentUser?.email,
      phone: currentUser?.phone,
      accountId: currentUser?.id,
      notificationIds: unreadIds,
    });
  };

  const handleClickItem = async (item: CustomerNotification) => {
    if (!item.isRead) {
      await handleMarkAsRead(item.id);
    }
    setIsOpen(false);
    // Nhắc giờ tham quan (và thông báo mới có link riêng): mở thẳng trang đích, vd tab lịch trình kèm cẩm nang.
    const url = typeof item.payload?.url === 'string' ? item.payload.url : null;
    if (url && url.startsWith('/') && !url.startsWith('//')) {
      navigate(url);
    } else if (item.bookingCode) {
      navigate(`/bookings/${encodeURIComponent(item.bookingCode)}`);
    } else {
      navigate('/bookings');
    }
  };

  const filteredList = notifications.filter((n) => {
    if (filter === 'UNREAD') return !n.isRead;
    return true;
  });

  const formatRelativeTime = (dateStr: string) => {
    try {
      const now = new Date();
      const past = new Date(dateStr);
      const diffMs = now.getTime() - past.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMins / 60);
      const diffDays = Math.floor(diffHours / 24);

      if (diffMins < 1) return 'Vừa xong';
      if (diffMins < 60) return `${diffMins} phút trước`;
      if (diffHours < 24) return `${diffHours} giờ trước`;
      if (diffDays === 1) return 'Hôm qua';
      if (diffDays < 7) return `${diffDays} ngày trước`;
      return past.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
    } catch {
      return dateStr;
    }
  };

  const getStatusBadge = (status?: string | null) => {
    switch (status) {
      case 'CONFIRMED':
        return (
          <span className="inline-flex items-center gap-1 rounded-sm border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">
            <CheckCircle2 className="h-3 w-3 text-emerald-600" />
            Đã xác nhận
          </span>
        );
      case 'PAID':
        return (
          <span className="inline-flex items-center gap-1 rounded-sm border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">
            <CheckCircle2 className="h-3 w-3 text-emerald-600" />
            Đã thanh toán
          </span>
        );
      // Trạng thái cũ (trước khi đơn còn 4 trạng thái) có thể còn trong thông báo đã lưu.
      case 'REJECTED':
        return (
          <span className="inline-flex items-center gap-1 rounded-sm border border-rose-200 bg-rose-50 px-1.5 py-0.5 text-[10px] font-bold text-rose-700">
            <XCircle className="h-3 w-3 text-rose-600" />
            Bị từ chối
          </span>
        );
      case 'CHANGE_APPROVED':
        return (
          <span className="inline-flex items-center gap-1 rounded-sm border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">
            <CheckCircle2 className="h-3 w-3 text-emerald-600" />
            Đã duyệt thay đổi
          </span>
        );
      case 'CHANGE_REJECTED':
        return (
          <span className="inline-flex items-center gap-1 rounded-sm border border-rose-200 bg-rose-50 px-1.5 py-0.5 text-[10px] font-bold text-rose-700">
            <XCircle className="h-3 w-3 text-rose-600" />
            Từ chối thay đổi
          </span>
        );
      case 'CANCELLED':
        return (
          <span className="inline-flex items-center gap-1 rounded-sm border border-rose-200 bg-rose-50 px-1.5 py-0.5 text-[10px] font-bold text-rose-700">
            <XCircle className="h-3 w-3 text-rose-600" />
            Đã hủy
          </span>
        );
      case 'EXPIRED':
        return (
          <span className="inline-flex items-center gap-1 rounded-sm border border-rose-200 bg-rose-50 px-1.5 py-0.5 text-[10px] font-bold text-rose-700">
            <XCircle className="h-3 w-3 text-rose-600" />
            Quá hạn
          </span>
        );
      case 'REVIEW_REPLY':
        return (
          <span className="inline-flex items-center gap-1 rounded-sm border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">
            <CheckCircle2 className="h-3 w-3 text-emerald-600" />
            Phản hồi mới
          </span>
        );

      default:
        return null;
    }
  };

  const getStatusIcon = (status?: string | null) => {
    switch (status) {
      case 'CONFIRMED':
      case 'PAID':
        return <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />;
      case 'REJECTED':
        return <XCircle className="h-4 w-4 shrink-0 text-rose-600" />;
      case 'CHANGE_APPROVED':
        return <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />;
      case 'CHANGE_REJECTED':
        return <XCircle className="h-4 w-4 shrink-0 text-rose-600" />;
      case 'CANCELLED':
        return <XCircle className="h-4 w-4 shrink-0 text-rose-600" />;
      case 'EXPIRED':
        return <XCircle className="h-4 w-4 shrink-0 text-rose-600" />;
      case 'REVIEW_REPLY':
        return <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />;

      default:
        return <Sparkles className="h-4 w-4 shrink-0 text-[var(--color-primary)]" />;
    }
  };

  return (
    <div className="relative" ref={containerRef}>
      {/* Nút Chuông Thông Báo */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-label={`Thông báo ${unreadCount > 0 ? `(${unreadCount} chưa đọc)` : ''}`}
        title="Thông báo đơn đặt phòng"
        className={`relative flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-md border-2 transition-all cursor-pointer active:scale-95 ${
          isSolid
            ? 'bg-white/90 border-gray-200 text-gray-700 hover:border-[var(--color-primary)] hover:bg-[#edfbf7]/60 hover:text-[var(--color-primary)] shadow-xs'
            : 'bg-white/15 backdrop-blur-md border-white/50 text-white hover:bg-white/25 shadow-xs'
        } ${isOpen ? 'ring-2 ring-[var(--color-primary)]' : ''}`}
      >
        <Bell className="h-4 w-4 sm:h-[18px] sm:w-[18px]" strokeWidth={2.2} />

        {/* Badge số lượng thông báo chưa đọc */}
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[var(--color-coral,#ea580c)] px-1 text-[10px] font-bold leading-none text-white ring-2 ring-white animate-in zoom-in-75 duration-200">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown Danh Sách Thông Báo */}
      {isOpen && (
        <div className="fixed inset-x-3 top-16 sm:absolute sm:inset-x-auto sm:right-0 sm:top-auto sm:mt-2 w-auto sm:w-96 max-w-[calc(100vw-24px)] rounded-lg border border-gray-200/90 bg-white shadow-xl z-[9999] animate-in fade-in-50 zoom-in-95 duration-150 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50/70 px-4 py-2.5">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-gray-900">Thông báo</span>
              {unreadCount > 0 && (
                <span className="rounded-sm bg-[var(--color-coral,#ea580c)]/15 px-1.5 py-0.5 text-[10px] font-bold text-[var(--color-coral,#ea580c)]">
                  {unreadCount} mới
                </span>
              )}
            </div>

            {unreadCount > 0 && (
              <button
                type="button"
                onClick={handleMarkAllRead}
                className="flex items-center gap-1 text-[11px] font-semibold text-[var(--color-primary)] hover:underline cursor-pointer"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                <span>Đọc tất cả</span>
              </button>
            )}
          </div>

          {/* Filter Tabs */}
          <div className="flex border-b border-gray-100 bg-white px-3 py-1.5 text-xs">
            <button
              type="button"
              onClick={() => setFilter('ALL')}
              className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors cursor-pointer ${
                filter === 'ALL'
                  ? 'bg-[var(--color-primary)] text-white shadow-xs'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              Tất cả ({notifications.length})
            </button>
            <button
              type="button"
              onClick={() => setFilter('UNREAD')}
              className={`ml-1.5 rounded-md px-2.5 py-1 text-xs font-semibold transition-colors cursor-pointer ${
                filter === 'UNREAD'
                  ? 'bg-[var(--color-primary)] text-white shadow-xs'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              Chưa đọc ({unreadCount})
            </button>
          </div>

          {/* Danh sách thông báo */}
          <div className="max-h-80 overflow-y-auto divide-y divide-gray-100">
            {filteredList.length > 0 ? (
              filteredList.map((item) => {
                const bookingStatus = item.bookingStatus || (item.payload?.bookingStatus as string | undefined);
                const isPositive = bookingStatus === 'CONFIRMED' || bookingStatus === 'PAID' || bookingStatus === 'CHANGE_APPROVED' || bookingStatus === 'REVIEW_REPLY';
                const isNegative = ['REJECTED', 'CHANGE_REJECTED', 'CANCELLED', 'EXPIRED', 'NO_SHOW'].includes(bookingStatus ?? '');

                return (
                  <div
                    key={item.id}
                    onClick={() => void handleClickItem(item)}
                    className={`flex items-start gap-3 p-3 transition-colors cursor-pointer hover:bg-gray-50 ${
                      !item.isRead
                          ? isPositive
                          ? 'bg-emerald-50/40'
                          : isNegative
                          ? 'bg-rose-50/40'
                          : 'bg-[#edfbf7]/50'
                        : 'bg-white'
                    }`}
                  >
                    {/* Icon trạng thái */}
                    <div className="mt-0.5 rounded-md border border-gray-100 bg-white p-1.5 shadow-2xs">
                      {getStatusIcon(bookingStatus)}
                    </div>

                    {/* Nội dung thông báo */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-gray-900 truncate">
                          {item.title}
                        </span>
                        {getStatusBadge(bookingStatus)}
                      </div>

                      <p className="mt-1 text-[11px] leading-relaxed text-gray-600 line-clamp-2">
                        {item.message}
                      </p>

                      <div className="mt-1.5 flex items-center justify-between gap-2 text-[10px] text-gray-400">
                        {item.bookingCode ? (
                          <span className="font-mono font-bold text-[var(--color-primary)]">
                            #{item.bookingCode}
                          </span>
                        ) : (
                          <span />
                        )}
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatRelativeTime(item.createdAt)}
                        </span>
                      </div>
                    </div>

                    {/* Chấm tròn chưa đọc */}
                    {!item.isRead && (
                      <span className="mt-1.5 h-2 w-2 rounded-full bg-[var(--color-coral,#ea580c)] shrink-0" />
                    )}
                  </div>
                );
              })
            ) : (
              <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
                <div className="rounded-md bg-gray-50 p-3 text-gray-400">
                  <BellOff className="h-6 w-6 stroke-[1.5]" />
                </div>
                <p className="mt-2 text-xs font-bold text-gray-700">Không có thông báo nào</p>
                <p className="mt-0.5 text-[11px] text-gray-500">
                  {filter === 'UNREAD'
                    ? 'Bạn đã đọc tất cả thông báo.'
                    : 'Thông báo về việc xác nhận, từ chối hoặc hoàn tiền đơn phòng sẽ xuất hiện ở đây.'}
                </p>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-gray-100 bg-gray-50/50 p-2.5 text-center">
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                navigate('/bookings');
              }}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-[var(--color-primary)] hover:underline cursor-pointer"
            >
              <span>Xem tất cả đơn đặt phòng của bạn</span>
              <ExternalLink className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
