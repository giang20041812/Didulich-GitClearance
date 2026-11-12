import { useEffect } from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import OverlayPortal from './OverlayPortal';

export interface Notice {
  type: 'success' | 'error';
  text: string;
}

interface NoticeDialogProps {
  notice: Notice;
  onClose: () => void;
}

const AUTO_CLOSE_MS: Record<Notice['type'], number> = { success: 2600, error: 8000 };

/** Thông báo kết quả đặt giữa màn hình (thành công tự đóng sau ít giây; lỗi ở lại lâu hơn để đọc). */
export default function NoticeDialog({ notice, onClose }: NoticeDialogProps) {
  useEffect(() => {
    const id = window.setTimeout(onClose, AUTO_CLOSE_MS[notice.type]);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Enter') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(id);
      window.removeEventListener('keydown', onKey);
    };
  }, [notice, onClose]);

  const ok = notice.type === 'success';
  return (
    <OverlayPortal>
      <div className="admin-overlay-shell admin-dialog-shell fade-in-overlay z-[10001] flex items-center justify-center bg-ink-deep/40 p-4 backdrop-blur-[2px]" onClick={onClose}>
        <div
          role={ok ? 'status' : 'alert'}
          aria-live="polite"
          onClick={(e) => e.stopPropagation()}
          className="admin-dialog-panel rise-in flex w-full min-w-0 max-w-sm flex-col items-center gap-3 rounded-lg border border-border bg-white px-6 py-6 text-center shadow-xl *:shrink-0"
        >
          <span className={`flex h-12 w-12 items-center justify-center rounded-md ${ok ? 'bg-accent/15 text-primary' : 'bg-danger/10 text-danger'}`}>
            {ok ? <CheckCircle2 className="h-7 w-7" /> : <AlertTriangle className="h-7 w-7" />}
          </span>
          <h3 className="font-display text-base font-bold text-ink-deep">{ok ? 'Thành công' : 'Có lỗi xảy ra'}</h3>
          <p className="max-w-full break-words text-sm leading-relaxed text-ink">{notice.text}</p>
          <button
            type="button"
            onClick={onClose}
            autoFocus
            className={`mt-1 min-h-11 min-w-24 rounded-md px-5 text-sm font-semibold text-white shadow-xs transition-colors ${
              ok ? 'bg-primary hover:bg-primary-600' : 'bg-danger hover:opacity-90'
            }`}
          >
            Đóng
          </button>
        </div>
      </div>
    </OverlayPortal>
  );
}
