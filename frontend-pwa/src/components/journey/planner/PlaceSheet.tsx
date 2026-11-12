import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useDialogFocus } from '@/hooks/useDialogFocus';

/**
 * Khung sửa một điểm (bấm điểm trên route / chip điểm chưa có tọa độ): trượt từ đáy trên điện thoại, hộp giữa màn hình
 * từ 640px. Esc hoặc bấm nền để đóng.
 */
export default function PlaceSheet({ label, onClose, children }: { label: string; onClose: () => void; children: ReactNode }) {
  const panelRef = useRef<HTMLDivElement>(null);
  useDialogFocus(panelRef);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = previous; };
  }, [onClose]);

  return createPortal(
    <div
      className="fade-in-overlay fixed inset-0 z-[99990] flex items-end justify-center bg-slate-900/45 backdrop-blur-[2px] sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="sheet-in max-h-[88vh] w-full overflow-y-auto rounded-t-3xl bg-white px-4 pb-[calc(1rem+var(--safe-bottom))] pt-2.5 shadow-2xl outline-none sm:max-w-[420px] sm:rounded-3xl sm:p-5"
      >
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-slate-200 sm:hidden" aria-hidden />
        {children}
      </div>
    </div>,
    document.body,
  );
}
