import { useLayoutEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * ScrollToTop component ensures that on any route navigation:
 * 1. The viewport immediately snaps to the top (top: 0, left: 0).
 * 2. No automatic smooth scrolling / sliding occurs (behavior: 'instant').
 * 3. Browser native scroll restoration is disabled to prevent unwanted jumps.
 */
export default function ScrollToTop() {
  const { pathname } = useLocation();

  useLayoutEffect(() => {
    // Disable browser's native automatic scroll restoration
    if ('scrollRestoration' in window.history) {
      window.history.scrollRestoration = 'manual';
    }

    // Instantly reset scroll to top before browser paint only when pathname changes
    window.scrollTo({
      top: 0,
      left: 0,
      behavior: 'instant' as ScrollBehavior,
    });

    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }, [pathname]);

  return null;
}
