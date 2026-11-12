import type { ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';

export interface ConfirmRequest {
  title: string;
  body: ReactNode;
  confirmLabel: string;
  tone?: 'primary' | 'danger' | 'coral';
  onConfirm: () => void;
}

const TONE = {
  primary: 'bg-primary hover:bg-primary-700',
  danger: 'bg-danger hover:opacity-90',
  coral: 'bg-coral hover:bg-coral-hover',
} as const;

/**
 * NFR-USA-02: xem lại nội dung và xác nhận rõ ràng trước thao tác có hậu quả (chấp nhận, từ chối, nhận/trả phòng...).
 * Lớp trên cùng (z 10010): hộp xác nhận mở từ trong ngăn kéo loại phòng (z 10000) vẫn phải nổi lên trên.
 */
export default function ConfirmDialog({ request, onClose }: { request: ConfirmRequest | null; onClose: () => void }) {
  return (
    <Dialog.Root open={request !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[10010] bg-ink-deep/50" />
        <Dialog.Content aria-describedby={undefined}
          className="fixed left-1/2 top-1/2 z-[10010] flex w-[min(440px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 flex-col gap-4 rounded-lg bg-white p-5 shadow-[var(--shadow-lg)]">
          {request && (
            <>
              <Dialog.Title className="text-base font-bold text-ink-deep">{request.title}</Dialog.Title>
              <div className="text-sm text-ink">{request.body}</div>
              <div className="flex justify-end gap-2">
                <Dialog.Close className="rounded-md border border-border px-4 py-2 text-sm font-semibold text-ink hover:bg-canvas">Quay lại</Dialog.Close>
                <button type="button" autoFocus onClick={() => { request.onConfirm(); onClose(); }}
                  className={`rounded-md px-4 py-2 text-sm font-semibold text-white transition-colors duration-200 ${TONE[request.tone ?? 'primary']}`}>
                  {request.confirmLabel}
                </button>
              </div>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
