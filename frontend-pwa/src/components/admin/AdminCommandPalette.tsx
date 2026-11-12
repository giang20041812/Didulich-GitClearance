import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { CornerDownLeft, History, Search, X, Zap, type LucideIcon } from 'lucide-react';
import { NAV_META, type AdminTab, type NavItemConfig } from './adminNav';
import OverlayPortal from './OverlayPortal';

export interface QuickAction {
  id: string;
  label: string;
  hint?: string;
  icon: LucideIcon;
  run: () => void;
}

interface AdminCommandPaletteProps {
  open: boolean;
  onClose: () => void;
  /** Thao tác nhanh đã lọc theo quyền của người đang đăng nhập. */
  actions: QuickAction[];
  /** Các trang được phép vào (đã lọc theo quyền). */
  pages: NavItemConfig[];
  /** Các mục đã mở gần đây, mới nhất trước. */
  recent: AdminTab[];
  onGo: (tab: AdminTab) => void;
}

interface Row {
  id: string;
  section: string;
  label: string;
  hint?: string;
  icon: LucideIcon;
  run: () => void;
}

/** Bỏ dấu tiếng Việt để tìm "duyet diem den" ra "Duyệt điểm đến". */
const fold = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd');

/** Bảng lệnh (Ctrl K): thao tác nhanh, đi tới trang và các mục mở gần đây; điều khiển hoàn toàn bằng bàn phím. */
export default function AdminCommandPalette({ open, onClose, actions, pages, recent, onGo }: AdminCommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Trang chỉ gắn component này khi mở (state luôn khởi tạo mới); chờ hộp thoại vẽ xong rồi mới focus.
  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const id = window.setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 0);
    return () => {
      window.clearTimeout(id);
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, [open]);

  const rows = useMemo<Row[]>(() => {
    const q = fold(query.trim());
    const match = (text: string) => !q || fold(text).includes(q);
    const go = (tab: AdminTab) => () => onGo(tab);
    const list: Row[] = [];

    for (const a of actions) {
      if (match(a.label) || match(a.hint ?? '')) list.push({ id: `action:${a.id}`, section: 'Thao tác nhanh', label: a.label, hint: a.hint, icon: a.icon, run: a.run });
    }
    // Mục gần đây chỉ hiện khi chưa gõ tìm kiếm (khi tìm thì đã có mục "Đi tới trang").
    if (!q) {
      for (const tab of recent) {
        const page = pages.find((p) => p.key === tab);
        if (page) list.push({ id: `recent:${tab}`, section: 'Mở gần đây', label: page.label, hint: NAV_META[tab].breadcrumb, icon: History, run: go(tab) });
      }
    }
    for (const p of pages) {
      if (match(p.label) || match(p.description)) list.push({ id: `page:${p.key}`, section: 'Đi tới trang', label: p.label, hint: NAV_META[p.key].breadcrumb, icon: p.icon, run: go(p.key) });
    }
    return list;
  }, [query, actions, pages, recent, onGo]);

  const activeIndex = Math.min(cursor, Math.max(0, rows.length - 1));

  useEffect(() => {
    document.getElementById(`cmd-row-${activeIndex}`)?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, rows]);

  if (!open) return null;

  const runRow = (row: Row | undefined) => {
    if (!row) return;
    onClose();
    row.run();
  };

  const onKeyDown = (e: ReactKeyboardEvent) => {
    if (e.key === 'Tab') {
      const focusable = Array.from(panelRef.current?.querySelectorAll<HTMLElement>('input, button:not([disabled])') ?? []).filter((el) => el.getClientRects().length > 0);
      const first = focusable?.[0];
      const last = focusable?.[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first && last) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last && first) {
        e.preventDefault();
        first.focus();
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setCursor((activeIndex + 1) % Math.max(1, rows.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setCursor((activeIndex - 1 + Math.max(1, rows.length)) % Math.max(1, rows.length));
    } else if (e.key === 'Enter' && e.target === inputRef.current) {
      e.preventDefault();
      runRow(rows[activeIndex]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  return (
    <OverlayPortal>
      <div data-admin-overlay="command" className="admin-overlay-shell admin-command-shell fade-in-overlay z-[10040] flex items-start justify-center bg-ink-deep/40 px-3 pt-4 backdrop-blur-[2px] sm:px-4 sm:pt-[14vh]" onClick={onClose}>
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-label="Bảng lệnh"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={onKeyDown}
          className="admin-dialog-panel rise-in flex w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-border bg-white shadow-xl sm:rounded-lg"
        >
          <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 sm:gap-3 sm:px-4">
            <Search className="h-5 w-5 shrink-0 text-muted" aria-hidden />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setCursor(0);
              }}
              placeholder="Gõ để tìm trang hoặc thao tác nhanh…"
              aria-label="Tìm trang hoặc thao tác"
              aria-controls="cmd-list"
              aria-activedescendant={rows.length ? `cmd-row-${activeIndex}` : undefined}
              className="h-14 min-w-0 flex-1 bg-transparent text-base text-ink placeholder:text-muted/70 focus:outline-none sm:h-12 sm:text-sm"
            />
            <button type="button" onClick={onClose} aria-label="Đóng tìm kiếm" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-muted hover:bg-canvas focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:hidden"><X className="h-5 w-5" /></button>
            <kbd className="hidden rounded-md border border-border bg-canvas px-1.5 py-0.5 text-[10px] font-semibold text-muted sm:inline">Esc</kbd>
          </div>

          <div id="cmd-list" role="listbox" aria-label="Kết quả" className="admin-scroll-area min-h-0 max-h-[52dvh] flex-1 overflow-y-auto overscroll-contain p-2 sm:max-h-[52vh]">
            {rows.length === 0 ? (
              <p className="px-3 py-8 text-center text-xs text-muted">Không có kết quả khớp “{query}”.</p>
            ) : (
              rows.map((row, i) => {
                const Icon = row.icon;
                const showHeader = i === 0 || rows[i - 1]?.section !== row.section;
                const active = i === activeIndex;
                return (
                  <div key={row.id}>
                    {showHeader && (
                      <div className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-nav-group">
                        {row.section === 'Thao tác nhanh' && <Zap className="mr-1 inline h-3 w-3" aria-hidden />}
                        {row.section}
                      </div>
                    )}
                    <button
                      id={`cmd-row-${i}`}
                      type="button"
                      role="option"
                      aria-selected={active}
                      onMouseMove={() => setCursor(i)}
                      onClick={() => runRow(row)}
                      className={`flex min-h-11 w-full items-center gap-3 rounded-nav px-3 py-2 text-left text-sm transition-colors sm:h-10 sm:min-h-0 sm:py-0 ${
                        active ? 'bg-nav-active-bg font-semibold text-nav-active-text' : 'text-ink'
                      }`}
                    >
                      <Icon className={`h-5 w-5 shrink-0 ${active ? 'text-nav-active-icon' : 'text-muted'}`} aria-hidden />
                      <span className="flex-1 truncate">{row.label}</span>
                      {row.hint && <span className="hidden shrink-0 text-xs font-normal text-muted sm:inline">{row.hint}</span>}
                      {active && <CornerDownLeft className="h-4 w-4 shrink-0 text-nav-active-icon" aria-hidden />}
                    </button>
                  </div>
                );
              })
            )}
          </div>

          <footer className="hidden shrink-0 items-center gap-4 border-t border-border bg-canvas/60 px-4 py-2 text-[11px] text-muted sm:flex">
            <span><kbd className="font-semibold">↑↓</kbd> chọn</span>
            <span><kbd className="font-semibold">Enter</kbd> mở</span>
            <span className="ml-auto"><kbd className="font-semibold">Ctrl K</kbd> bật / tắt</span>
          </footer>
        </div>
      </div>
    </OverlayPortal>
  );
}
