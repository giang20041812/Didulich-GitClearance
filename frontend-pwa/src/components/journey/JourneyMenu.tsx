import { useEffect, useRef, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { MoreHorizontal } from 'lucide-react';

export interface JourneyMenuItem {
  label: string;
  Icon: LucideIcon;
  onSelect: () => void;
  tone?: 'default' | 'danger';
  disabled?: boolean;
  /** Kẻ ngăn phía trên mục này (tách nhóm thao tác nguy hiểm). */
  divider?: boolean;
}

/** Nút "⋯" mở danh sách thao tác phụ của lịch trình (đổi tên, xóa / bỏ gắn). */
export default function JourneyMenu({ items, label = 'Thao tác khác' }: { items: JourneyMenuItem[]; label?: string }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e: PointerEvent) => { if (!rootRef.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('pointerdown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  if (items.length === 0) return null;
  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`flex h-10 w-10 items-center justify-center rounded-xl ring-1 transition-colors cursor-pointer ${open ? 'bg-slate-100 text-slate-900 ring-slate-300' : 'bg-white text-slate-600 ring-slate-200 hover:text-slate-900 hover:ring-slate-300'}`}
      >
        <MoreHorizontal className="h-5 w-5" />
      </button>
      {open && (
        <div role="menu" className="rise-in absolute right-0 top-full z-30 mt-2 w-60 overflow-hidden rounded-2xl bg-white p-1.5 shadow-[var(--shadow-lg)] ring-1 ring-black/5">
          {items.map((item) => (
            <div key={item.label}>
              {item.divider && <div className="mx-2 my-1 h-px bg-slate-100" />}
              <button
                type="button"
                role="menuitem"
                disabled={item.disabled}
                onClick={() => { setOpen(false); item.onSelect(); }}
                className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition-colors disabled:opacity-40 cursor-pointer ${
                  item.tone === 'danger' ? 'text-rose-600 hover:bg-rose-50' : 'text-slate-700 hover:bg-slate-50'
                }`}
              >
                <item.Icon className="h-4 w-4 shrink-0" />
                {item.label}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
