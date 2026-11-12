import { useEffect, useState } from 'react';

const EDGE_WIDTH = 24;
const INTENT_DISTANCE = 12;
const BACK_DISTANCE = 80;
const MAX_GESTURE_TIME = 1000;
const EDITABLE = 'input, textarea, select, [contenteditable]:not([contenteditable="false"])';
const OVERLAYS = '[role="dialog"], [role="alertdialog"], [role="menu"], [data-admin-overlay], .admin-drawer';

interface AdminEdgeBackOptions {
  /** Only enable when going back will stay within this Admin session. */
  enabled: boolean;
  onBack: () => void;
}

interface Gesture {
  identifier: number;
  x: number;
  y: number;
  href: string;
  historyIndex: unknown;
  startedAt: number;
  intercepted: boolean;
}

function isStandalone(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function hasBlockingOverlay(): boolean {
  if (document.body.style.position === 'fixed' || document.body.dataset.adminKeyboard === 'true') return true;
  if (document.activeElement?.matches(EDITABLE)) return true;
  return Array.from(document.querySelectorAll<HTMLElement>(OVERLAYS)).some((element) => {
    // The closed mobile sidebar remains mounted with role="dialog".
    if (element.closest('[inert], [aria-hidden="true"]') || !element.getClientRects().length) return false;
    const style = window.getComputedStyle(element);
    if (style.visibility === 'hidden' || style.display === 'none') return false;
    const rect = element.getBoundingClientRect();
    return rect.right > 0 && rect.left < window.innerWidth && rect.bottom > 0 && rect.top < window.innerHeight;
  });
}

function findTouch(touches: TouchList, identifier: number): Touch | undefined {
  return Array.from(touches).find((touch) => touch.identifier === identifier);
}

/** Installed-app fallback; regular mobile browsers use native back with the same tab history. */
export function useAdminEdgeBack({ enabled, onBack }: AdminEdgeBackOptions): number {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    // Keeping native edge gestures in browsers avoids a second navigation after Safari's animation.
    if (!enabled || !isStandalone()) return;
    let gesture: Gesture | undefined;
    let frame = 0;
    let expiry = 0;

    const reset = () => {
      gesture = undefined;
      window.cancelAnimationFrame(frame);
      window.clearTimeout(expiry);
      frame = 0;
      expiry = 0;
      setProgress(0);
    };

    const showProgress = (distance: number) => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        setProgress(Math.min(1, Math.max(0, distance / BACK_DISTANCE)));
      });
    };

    const locationUnchanged = (started: Gesture) => (
      window.location.href === started.href && window.history.state?.idx === started.historyIndex
    );

    const onStart = (event: TouchEvent) => {
      reset();
      if (window.innerWidth >= 1024 || event.touches.length !== 1 || event.defaultPrevented ||
          (window.visualViewport?.scale ?? 1) > 1.05) return;
      const touch = event.touches[0];
      const target = event.target;
      if (!touch || touch.clientX < 0 || touch.clientX > EDGE_WIDTH || !(target instanceof Element)) return;
      if (!target.closest('.admin-ui') || target.closest(`${EDITABLE}, [data-admin-swipe-ignore], [role="slider"]`)) return;
      if (hasBlockingOverlay()) return;
      gesture = {
        identifier: touch.identifier,
        x: touch.clientX,
        y: touch.clientY,
        href: window.location.href,
        historyIndex: window.history.state?.idx,
        startedAt: performance.now(),
        intercepted: false,
      };
      expiry = window.setTimeout(reset, MAX_GESTURE_TIME);
    };

    const onMove = (event: TouchEvent) => {
      const started = gesture;
      if (!started) return;
      const touch = findTouch(event.touches, started.identifier);
      if (!touch || event.touches.length !== 1 || !locationUnchanged(started) ||
          (window.visualViewport?.scale ?? 1) > 1.05 ||
          performance.now() - started.startedAt > MAX_GESTURE_TIME || hasBlockingOverlay()) {
        reset();
        return;
      }
      const dx = touch.clientX - started.x;
      const dy = Math.abs(touch.clientY - started.y);
      if (Math.max(Math.abs(dx), dy) < INTENT_DISTANCE) return;
      // Once vertical scrolling or a reversed swipe starts, leave this whole gesture alone.
      if (dx <= 0 || dx < dy * 1.5) {
        reset();
        return;
      }
      // Safari can reserve a native edge gesture. Do not navigate a second time in that case.
      if (!event.cancelable || (!started.intercepted && event.defaultPrevented)) {
        reset();
        return;
      }
      event.preventDefault();
      if (!event.defaultPrevented) {
        reset();
        return;
      }
      started.intercepted = true;
      showProgress(dx);
    };

    const onEnd = (event: TouchEvent) => {
      const started = gesture;
      const touch = started && findTouch(event.changedTouches, started.identifier);
      const shouldGoBack = Boolean(
        started && touch && started.intercepted && event.touches.length === 0 &&
        touch.clientX - started.x >= BACK_DISTANCE &&
        touch.clientX - started.x >= Math.abs(touch.clientY - started.y) * 1.5 &&
        performance.now() - started.startedAt <= MAX_GESTURE_TIME &&
        (window.visualViewport?.scale ?? 1) <= 1.05 &&
        locationUnchanged(started) && !hasBlockingOverlay(),
      );
      reset();
      if (!shouldGoBack) return;
      if (event.cancelable) event.preventDefault();
      onBack();
    };

    // Cancel even if an overlay opens and closes between two touch events.
    const observer = new MutationObserver(() => {
      if (gesture && hasBlockingOverlay()) reset();
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'hidden', 'inert', 'role', 'aria-hidden', 'data-admin-overlay', 'data-admin-keyboard'],
    });

    document.addEventListener('touchstart', onStart, { passive: true });
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onEnd, { passive: false });
    document.addEventListener('touchcancel', reset);
    window.addEventListener('popstate', reset);
    window.addEventListener('resize', reset);
    window.addEventListener('orientationchange', reset);
    window.visualViewport?.addEventListener('resize', reset);

    return () => {
      document.removeEventListener('touchstart', onStart);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onEnd);
      document.removeEventListener('touchcancel', reset);
      window.removeEventListener('popstate', reset);
      window.removeEventListener('resize', reset);
      window.removeEventListener('orientationchange', reset);
      window.visualViewport?.removeEventListener('resize', reset);
      observer.disconnect();
      reset();
    };
  }, [enabled, onBack]);

  return enabled ? progress : 0;
}
