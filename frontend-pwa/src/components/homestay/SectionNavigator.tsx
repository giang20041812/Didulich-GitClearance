import { useEffect, useRef, useState } from 'react';
import { ListTree, X } from 'lucide-react';

export interface SectionLink {
  /** id phần tử trên trang để cuộn tới. */
  id: string;
  label: string;
  /** Chữ phụ bên phải (vd số điểm trong lịch trình, giá từ). */
  hint?: string;
}

interface SectionNavigatorProps {
  sections: SectionLink[];
  /** Số trên góc nút (vd số điểm đã thêm vào lịch trình); 0 thì ẩn. */
  badge?: number;
}

/**
 * Nút tròn dính góc trái dưới (góc phải là nút "Về đầu trang"): bấm mở danh sách mục của trang, chọn mục thì trang tự
 * cuộn tới. Cuộn xuống (đang đọc) thì nút lặn đi cho khỏi che nội dung, cuộn lên thì hiện lại; trên điện thoại khi thanh
 * đặt phòng dính đáy đang hiện thì nút ẩn hẳn (globals.css .section-nav).
 */
export default function SectionNavigator({ sections, badge = 0 }: SectionNavigatorProps) {
  const [open, setOpen] = useState(false);
  const [tucked, setTucked] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let lastY = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      if (Math.abs(y - lastY) < 12) return;
      setTucked(y > lastY && y > 240);
      lastY = y;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    const onPointer = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onPointer);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onPointer);
    };
  }, [open]);

  const go = (id: string) => {
    setOpen(false);
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  if (sections.length === 0) return null;

  return (
    <div
      ref={rootRef}
      className={`section-nav fixed bottom-[calc(1.5rem+var(--safe-bottom))] left-4 z-40 transition-[opacity,transform] duration-300 md:bottom-8 md:left-6 ${
        tucked && !open ? 'pointer-events-none translate-y-4 opacity-0' : 'opacity-100'
      }`}
    >
      {open && (
        <nav aria-label="Các mục của trang" className="absolute bottom-14 left-0 w-60 overflow-hidden rounded-2xl border border-slate-200 bg-white py-1.5 shadow-xl">
          {sections.map((section) => (
            <button
              key={section.id}
              type="button"
              onClick={() => go(section.id)}
              className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-sm font-semibold text-slate-800 transition-colors hover:bg-[var(--color-primary-50)] hover:text-[var(--color-primary)] cursor-pointer"
            >
              <span>{section.label}</span>
              {section.hint && <span className="shrink-0 text-xs font-bold text-[var(--color-primary)]">{section.hint}</span>}
            </button>
          ))}
        </nav>
      )}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={open ? 'Đóng danh sách mục' : 'Đi tới mục của trang'}
        className="relative flex h-12 w-12 items-center justify-center rounded-full cta cta-primary text-white shadow-[0_8px_24px_rgba(10,46,38,0.32)] transition-transform active:scale-95 cursor-pointer"
      >
        {open ? <X className="h-5 w-5" /> : <ListTree className="h-5 w-5" />}
        {!open && badge > 0 && (
          <span className="absolute -right-1 -top-1 flex h-6 min-w-6 items-center justify-center rounded-full border-2 border-white bg-amber-500 px-1 text-xs font-extrabold text-white">
            {badge}
          </span>
        )}
      </button>
    </div>
  );
}
