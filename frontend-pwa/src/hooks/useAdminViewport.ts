import { useEffect } from 'react';

const properties = ['--admin-vv-height', '--admin-vv-width', '--admin-vv-top', '--admin-vv-left'] as const;

/** Scope iPhone viewport and keyboard adjustments to the mounted Admin page. */
export function useAdminViewport(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const body = document.body;
    const viewport = window.visualViewport;
    const previous = properties.map((name) => body.style.getPropertyValue(name));
    const wasActive = body.classList.contains('admin-ui-active');
    const previousKeyboard = body.dataset.adminKeyboard;
    body.classList.add('admin-ui-active');
    let frame = 0;
    let focusTimer = 0;

    const keepInputVisible = () => {
      const input = document.activeElement;
      if (!(input instanceof HTMLElement) || !input.matches('input, textarea, select')) return;
      const dialog = input.closest('.admin-dialog-panel, .admin-drawer, [role="dialog"], [role="alertdialog"]');
      if (!dialog) return;
      const bounds = input.getBoundingClientRect();
      const top = viewport?.offsetTop ?? 0;
      const bottom = top + (viewport?.height ?? window.innerHeight);
      if (bounds.top < top + 16 || bounds.bottom > bottom - 24) {
        input.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
      }
    };

    const update = () => {
      const height = viewport?.height ?? window.innerHeight;
      body.style.setProperty('--admin-vv-height', `${height}px`);
      body.style.setProperty('--admin-vv-width', `${viewport?.width ?? window.innerWidth}px`);
      body.style.setProperty('--admin-vv-top', `${viewport?.offsetTop ?? 0}px`);
      body.style.setProperty('--admin-vv-left', `${viewport?.offsetLeft ?? 0}px`);
      const editing = document.activeElement?.matches('input, textarea, select') ?? false;
      const keyboard = editing && (viewport?.scale ?? 1) <= 1.05 && window.innerHeight - height > 120;
      body.dataset.adminKeyboard = String(keyboard);
      // Allow the new CSS height to settle before scrolling a focused reason field.
      window.clearTimeout(focusTimer);
      focusTimer = window.setTimeout(keepInputVisible, 80);
    };
    const schedule = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(update);
    };

    update();
    viewport?.addEventListener('resize', schedule);
    viewport?.addEventListener('scroll', schedule);
    window.addEventListener('resize', schedule);
    document.addEventListener('focusin', schedule);
    document.addEventListener('focusout', schedule);

    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(focusTimer);
      viewport?.removeEventListener('resize', schedule);
      viewport?.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      document.removeEventListener('focusin', schedule);
      document.removeEventListener('focusout', schedule);
      properties.forEach((name, index) => {
        const value = previous[index];
        if (value) body.style.setProperty(name, value);
        else body.style.removeProperty(name);
      });
      if (!wasActive) body.classList.remove('admin-ui-active');
      if (previousKeyboard === undefined) delete body.dataset.adminKeyboard;
      else body.dataset.adminKeyboard = previousKeyboard;
    };
  }, [active]);
}
