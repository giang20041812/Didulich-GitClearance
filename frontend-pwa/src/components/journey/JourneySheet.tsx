import type { ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';

interface JourneySheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Dòng phụ dưới tiêu đề. */
  description?: ReactNode;
  children: ReactNode;
  /** Hàng nút dính đáy sheet (luôn thấy, kể cả khi nội dung dài). */
  footer?: ReactNode;
}

/**
 * Khung thao tác của các màn lịch trình: điện thoại trượt từ đáy (nền trắng, đệm vùng an toàn), máy tính hiện giữa màn
 * hình. Lớp z 10000 — trên header, dưới hộp xác nhận (ConfirmDialog z 10010).
 */
export default function JourneySheet({ open, onClose, title, description, children, footer }: JourneySheetProps) {
  return (
    <Dialog.Root open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fade-in-overlay fixed inset-0 z-[10000] flex items-end justify-center bg-slate-900/45 backdrop-blur-[2px] sm:items-center sm:p-4">
          <Dialog.Content
            aria-describedby={undefined}
            className="sheet-in flex max-h-[92dvh] w-full flex-col overflow-clip rounded-t-3xl bg-white shadow-2xl sm:max-w-md sm:rounded-3xl"
          >
            <div className="mx-auto mt-2.5 h-1.5 w-10 shrink-0 rounded-full bg-slate-200 sm:hidden" aria-hidden />
            <div className="flex shrink-0 items-start gap-3 px-5 pb-2 pt-3 sm:pt-5">
              <div className="min-w-0 flex-1">
                <Dialog.Title className="text-lg font-extrabold text-slate-900">{title}</Dialog.Title>
                {description && <p className="mt-0.5 text-sm text-slate-500">{description}</p>}
              </div>
              <Dialog.Close
                aria-label="Đóng"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600 transition-colors hover:bg-slate-200 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </Dialog.Close>
            </div>
            <div className={`min-h-0 flex-1 overflow-y-auto px-5 ${footer ? 'pb-4' : 'pb-[calc(1.25rem+var(--safe-bottom))] sm:pb-5'}`}>{children}</div>
            {footer && (
              <div className="shrink-0 border-t border-slate-100 bg-white px-5 pb-[calc(0.75rem+var(--safe-bottom))] pt-3 sm:pb-4">{footer}</div>
            )}
          </Dialog.Content>
        </Dialog.Overlay>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
