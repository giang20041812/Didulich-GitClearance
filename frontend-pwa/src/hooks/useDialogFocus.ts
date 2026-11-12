import { useEffect, type RefObject } from 'react';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Hộp thoại tự dựng (portal role="dialog"): mở thì đưa focus vào khung, Tab / Shift+Tab chỉ đi vòng trong khung (không lọt
 * ra trang phía sau), đóng thì trả focus về nút đã mở. Khung cần tabIndex={-1} để nhận focus.
 */
export function useDialogFocus(ref: RefObject<HTMLElement | null>, active = true): void {
  useEffect(() => {
    if (!active) return undefined;
    const panel = ref.current;
    if (!panel) return undefined;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!panel.contains(document.activeElement)) panel.focus({ preventScroll: true });

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null || el === document.activeElement);
      if (items.length === 0) { e.preventDefault(); panel.focus(); return; }
      const first = items[0] as HTMLElement;
      const last = items[items.length - 1] as HTMLElement;
      const current = document.activeElement;
      if (e.shiftKey && (current === first || current === panel || !panel.contains(current))) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (current === last || !panel.contains(current))) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      if (previous && document.contains(previous)) previous.focus({ preventScroll: true });
    };
  }, [ref, active]);
}
