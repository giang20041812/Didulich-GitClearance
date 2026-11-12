import type { ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';

/**
 * Khung thao tác cho cổng NCC: trượt lên từ đáy trên điện thoại (ngón cái với tới được, không che mất ngữ cảnh),
 * hộp giữa màn hình từ 640px. Nút lưu nằm cố định ở chân khung để không phải cuộn mới thấy.
 * Đang lưu (busy) thì không đóng được, tránh bấm nhầm ra ngoài làm mất thao tác.
 */
export default function BottomSheet({ open, onClose, title, subtitle, footer, busy = false, children }: {
  open: boolean; onClose: () => void; title: ReactNode; subtitle?: ReactNode; footer?: ReactNode; busy?: boolean; children: ReactNode;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={(next) => { if (!next && !busy) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fade-in-overlay fixed inset-0 z-[9999] bg-ink-deep/50" />
        {/* Căn giữa bằng flex (không dùng translate) để hiệu ứng trượt không ghi đè vị trí. */}
        <div className="pointer-events-none fixed inset-0 z-[9999] flex items-end justify-center pt-[calc(var(--safe-top)+0.5rem)] sm:items-center sm:p-4">
          <Dialog.Content aria-describedby={undefined}
            className="sheet-in pointer-events-auto flex max-h-[min(92dvh,100%)] w-full flex-col rounded-t-lg bg-white shadow-[var(--shadow-lg)] sm:max-h-[88dvh] sm:max-w-lg sm:rounded-lg">
            <header className="flex items-start justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
              <div className="min-w-0 pt-1">
                <Dialog.Title className="text-lg font-black leading-snug text-ink-deep">{title}</Dialog.Title>
                {subtitle && <div className="mt-0.5 text-sm font-semibold text-muted">{subtitle}</div>}
              </div>
              <Dialog.Close aria-label="Đóng" disabled={busy}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-border text-ink transition-colors duration-200 hover:bg-canvas disabled:opacity-40">
                <X className="h-6 w-6" />
              </Dialog.Close>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5">{children}</div>
            {footer && <footer className="border-t border-border px-4 pb-[max(12px,var(--safe-bottom))] pt-3 sm:px-5">{footer}</footer>}
          </Dialog.Content>
        </div>
      </Dialog.Portal>
    </Dialog.Root>
  );

}
