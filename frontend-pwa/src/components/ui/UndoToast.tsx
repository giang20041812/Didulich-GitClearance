import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Undo2 } from 'lucide-react';

interface UndoToastProps {
  /** Nội dung thông báo, vd "Đã bỏ “Cà phê ngắm hoàng hôn”". Đổi nội dung = đếm lại từ đầu. */
  message: ReactNode;
  /** Nhãn nút hoàn tác. */
  actionLabel?: string;
  /** Bấm "Hoàn tác". */
  onAction: () => void;
  /** Hết giờ mà khách không hoàn tác — lúc này mới nên ghi thay đổi lên máy chủ. */
  onTimeout: () => void;
  /** Thời gian hiện (ms), mặc định 5 giây; tạm dừng khi rê chuột / focus vào thông báo. */
  duration?: number;
  /** Lớp bổ sung — vd đẩy lên trên thanh lưu dính đáy: "bottom-[calc(5.5rem+var(--safe-bottom))]". */
  className?: string;
}

/**
 * Thông báo dưới đáy màn hình kèm nút "Hoàn tác" (bỏ mục khỏi lịch trình…): tự ẩn sau `duration`, tạm dừng đếm khi khách
 * rê chuột / focus vào để kịp bấm; trình đọc màn hình đọc nội dung (aria-live polite). Nằm trên vùng an toàn của iPhone.
 * Cha giữ thông báo trong state và gỡ khi onAction / onTimeout; đổi `key` khi có thông báo mới để đếm lại.
 */
export default function UndoToast({ message, actionLabel = 'Hoàn tác', onAction, onTimeout, duration = 5000, className = '' }: UndoToastProps) {
  const timeoutRef = useRef(onTimeout);
  const remainingRef = useRef(duration);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    timeoutRef.current = onTimeout;
  }, [onTimeout]);

  // Thông báo mới / đổi thời gian: đếm lại từ đầu (chạy trước hiệu ứng hẹn giờ bên dưới).
  useEffect(() => {
    remainingRef.current = duration;
  }, [message, duration]);

  useEffect(() => {
    if (paused) return undefined;
    const startedAt = Date.now();
    const timer = window.setTimeout(() => timeoutRef.current(), Math.max(0, remainingRef.current));
    return () => {
      window.clearTimeout(timer);
      remainingRef.current -= Date.now() - startedAt;
    };
  }, [paused, message, duration]);

  return (
    <div
      role="status"
      aria-live="polite"
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setPaused(false);
      }}
      className={`fixed inset-x-4 bottom-[calc(1rem+var(--safe-bottom))] z-[99995] mx-auto flex min-h-12 max-w-md items-center gap-2 rounded-lg bg-[var(--color-ink-deep)] py-1 pl-3.5 pr-1.5 text-white shadow-[0_12px_32px_rgba(13,43,38,0.2)] rise-in ${className}`}
    >
      <span className="min-w-0 flex-1 text-[13px] font-bold leading-snug">{message}</span>
      <button
        type="button"
        onClick={onAction}
        className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-md px-3 text-[13px] font-black text-[#7ef2dd] transition-colors hover:bg-white/10 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#7ef2dd]"
      >
        <Undo2 className="h-4 w-4" aria-hidden="true" /> {actionLabel}
      </button>
    </div>
  );
}
