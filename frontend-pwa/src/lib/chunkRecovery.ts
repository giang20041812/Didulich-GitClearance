const RELOAD_KEY = 'chunk-recovery-at';
const COOLDOWN_MS = 5 * 60 * 1000;

export function isChunkLoadError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Loading chunk .* failed|Unable to preload CSS/i.test(message);
}

/** A stale PWA shell can keep requesting files removed by a deployment. */
export async function recoverChunkLoad(error: unknown): Promise<boolean> {
  if (!isChunkLoadError(error) || !navigator.onLine) return false;
  try {
    const previous = Number(sessionStorage.getItem(RELOAD_KEY));
    if (previous && Date.now() - previous < COOLDOWN_MS) return false;
    // Keep this marker across successful imports: another route may still fail.
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    // Without a persistent guard an automatic reload could loop.
    return false;
  }
  try {
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations
        .filter((registration) => registration.scope === `${window.location.origin}/`)
        .map((registration) => registration.unregister()));
    }
  } catch {
    // A reload can still recover when the browser refuses worker access.
  }
  window.location.reload();
  return true;
}
