import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

/** Khung hộp thoại chứa form combo (toàn màn hình trên điện thoại, hộp giữa màn hình từ 640px). */
export default function ComboModal({ title, onClose, children, note }: { title: string; onClose: () => void; children: ReactNode; note?: ReactNode }) {
  return createPortal(
    <div className="fixed inset-0 z-[10000] flex items-stretch justify-center bg-black/60 sm:items-center sm:p-4">
      <div role="dialog" aria-modal="true" aria-label={title}
        className="flex max-h-full w-full flex-col bg-white shadow-xl sm:max-h-[94vh] sm:max-w-3xl sm:rounded-lg">
        <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-base font-bold text-ink-deep">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Đóng" className="flex h-11 w-11 items-center justify-center rounded-md text-muted hover:bg-hover"><X className="h-4 w-4" /></button>
        </div>
        {note}
        {children}
      </div>
    </div>,
    document.body,
  );
}
