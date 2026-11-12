import { useEffect } from 'react';

let locks = 0;
let releaseBody: (() => void) | undefined;

/** Keep the page still while allowing the current Admin drawer/dialog to scroll. */
export function useAdminOverlayLock(active: boolean) {
  useEffect(() => {
    if (!active) return;

    if (locks === 0) {
      const body = document.body;
      const saved = {
        position: body.style.position,
        top: body.style.top,
        left: body.style.left,
        width: body.style.width,
        overflow: body.style.overflow,
      };
      const { scrollX, scrollY } = window;
      body.style.position = 'fixed';
      body.style.top = `${-scrollY}px`;
      body.style.left = `${-scrollX}px`;
      body.style.width = '100%';
      body.style.overflow = 'hidden';
      releaseBody = () => {
        Object.assign(body.style, saved);
        window.scrollTo({ left: scrollX, top: scrollY, behavior: 'instant' });
      };
    }
    locks += 1;

    return () => {
      locks -= 1;
      if (locks === 0) {
        releaseBody?.();
        releaseBody = undefined;
      }
    };
  }, [active]);
}
