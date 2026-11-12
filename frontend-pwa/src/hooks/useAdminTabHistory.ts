import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { NAV_META, type AdminTab } from '@/components/admin/adminNav';

interface TabHistory {
  session: string;
  depth: number;
}

const HISTORY_KEY = '__adminTabHistory';

function stateObject(state: unknown): Record<string, unknown> {
  return state !== null && typeof state === 'object' ? state as Record<string, unknown> : {};
}

function readHistory(state: unknown): TabHistory | null {
  const marker = stateObject(state)[HISTORY_KEY];
  if (marker === null || typeof marker !== 'object' || !('session' in marker) || !('depth' in marker)) return null;
  if (typeof marker.session !== 'string' || !marker.session || typeof marker.depth !== 'number' || !Number.isSafeInteger(marker.depth) || marker.depth < 0) return null;
  return { session: marker.session, depth: marker.depth };
}

/** Each Admin section occupies one browser entry, so native Back stays within tab history. */
export function useAdminTabHistory(enabled: boolean) {
  const location = useLocation();
  const navigate = useNavigate();
  const rawTab = new URLSearchParams(location.search).get('tab');
  const requestedTab: AdminTab = rawTab && Object.prototype.hasOwnProperty.call(NAV_META, rawTab) ? rawTab as AdminTab : 'bookings';
  const [initialEntry] = useState<TabHistory>(() => ({
    session: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`,
    depth: 0,
  }));
  const entry = readHistory(location.state) ?? initialEntry;
  const canGoBack = enabled && entry.depth > 0;

  useEffect(() => {
    if (!enabled || readHistory(location.state)) return;
    navigate({ pathname: location.pathname, search: location.search, hash: location.hash }, {
      replace: true,
      state: { ...stateObject(location.state), [HISTORY_KEY]: initialEntry },
    });
  }, [enabled, initialEntry, location.pathname, location.search, location.hash, location.state, navigate]);

  const setActiveTab = useCallback((tab: AdminTab) => {
    if (!enabled || !Object.prototype.hasOwnProperty.call(NAV_META, tab) || tab === requestedTab) return;
    const params = new URLSearchParams(location.search);
    params.delete('status');
    params.delete('booking');
    params.set('tab', tab);
    navigate({ pathname: location.pathname, search: `?${params.toString()}`, hash: location.hash }, {
      state: { ...stateObject(location.state), [HISTORY_KEY]: { session: entry.session, depth: entry.depth + 1 } },
    });
  }, [enabled, requestedTab, location.pathname, location.search, location.hash, location.state, entry.session, entry.depth, navigate]);

  const goBack = useCallback(() => {
    if (canGoBack) navigate(-1);
  }, [canGoBack, navigate]);

  return { requestedTab, setActiveTab, canGoBack, goBack, historyState: location.state };
}
