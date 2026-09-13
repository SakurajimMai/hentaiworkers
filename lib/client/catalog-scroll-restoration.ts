export const CATALOG_SCROLL_STORAGE_PREFIX = 'animestream.scroll.v1:';
export const CATALOG_SCROLL_INDEX_KEY = 'animestream.scroll.v1.index';
export const CATALOG_RETURN_KEY = 'animestream.return.v1';
export const CATALOG_SCROLL_MAX_ENTRIES = 20;
export const CATALOG_SCROLL_RESTORE_MAX_MS = 1500;

export const CATALOG_RESTORE_SCROLL_OPTIONS = {
  left: 0,
  behavior: 'instant',
} as const;

type ScrollStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

let pendingTraverse = false;
let historyListenerInstalled = false;

export function catalogLocationKey(pathname: string, search = ''): string {
  const path = pathname.startsWith('/') ? pathname : `/${pathname}`;
  const query = search.startsWith('?') ? search.slice(1) : search;
  return query ? `${path}?${query}` : path;
}

export function catalogLocationPath(key: string): string {
  const path = key.split('?')[0] ?? key;
  return path || '/';
}

export function isManagedScrollPath(pathname: string): boolean {
  return !pathname.includes('/read/');
}

export function shouldRestoreCatalogScroll(input: {
  traverse: boolean;
  pathname: string;
  hash: string;
}): boolean {
  return input.traverse && isManagedScrollPath(input.pathname) && input.hash === '';
}

export function isHistoryBackTarget(returnTo: string | null | undefined, fallbackHref: string): boolean {
  if (!returnTo || !fallbackHref) return false;
  const queryIndex = fallbackHref.indexOf('?');
  const fallbackPath = catalogLocationPath(
    catalogLocationKey(
      queryIndex === -1 ? fallbackHref : fallbackHref.slice(0, queryIndex),
      queryIndex === -1 ? '' : fallbackHref.slice(queryIndex),
    ),
  );
  return catalogLocationPath(returnTo) === fallbackPath;
}

export function parseStoredScrollY(raw: string | null | undefined): number | null {
  if (raw == null || raw.trim() === '') return null;
  const y = Number(raw);
  if (!Number.isFinite(y) || y <= 0) return null;
  return Math.floor(y);
}

export function rememberScrollEntry(
  index: readonly string[],
  key: string,
  max = CATALOG_SCROLL_MAX_ENTRIES,
): { index: string[]; evicted: string | null } {
  const next = [key, ...index.filter((item) => item !== key)];
  if (next.length <= max) return { index: next, evicted: null };
  return { index: next.slice(0, max), evicted: next[max] ?? null };
}

export function readCatalogScrollY(storage: ScrollStorage, key: string): string | null {
  try {
    return storage.getItem(`${CATALOG_SCROLL_STORAGE_PREFIX}${key}`);
  } catch {
    return null;
  }
}

export function writeCatalogScrollY(storage: ScrollStorage, key: string, y: number): void {
  try {
    const storageKey = `${CATALOG_SCROLL_STORAGE_PREFIX}${key}`;
    if (y <= 0) {
      storage.removeItem(storageKey);
      return;
    }
    storage.setItem(storageKey, String(Math.floor(y)));
    const index = rememberScrollEntry(readScrollIndex(storage), key);
    storage.setItem(CATALOG_SCROLL_INDEX_KEY, JSON.stringify(index.index));
    if (index.evicted) storage.removeItem(`${CATALOG_SCROLL_STORAGE_PREFIX}${index.evicted}`);
  } catch {
    // Private mode and quota errors must not break navigation.
  }
}

export function decideScrollRestoreAttempt(input: {
  savedY: number;
  scrollHeight: number;
  viewport: number;
  elapsedMs: number;
  maxMs?: number;
}): { top: number; continue: boolean } {
  const viewport = Math.max(0, input.viewport);
  const maxTop = Math.max(0, input.scrollHeight - viewport);
  const top = Math.min(Math.max(0, input.savedY), maxTop);
  const ready = input.scrollHeight >= input.savedY + Math.min(32, viewport);
  const expired = input.elapsedMs >= (input.maxMs ?? CATALOG_SCROLL_RESTORE_MAX_MS);
  return { top, continue: !ready && !expired };
}

export function applyRestoredScrollY(
  scrollTo: (options: { top: number; left: number; behavior: 'instant' }) => void,
  y: number,
): void {
  scrollTo({ ...CATALOG_RESTORE_SCROLL_OPTIONS, top: y });
}

export function noteHistoryTraverse(): void {
  pendingTraverse = true;
}

export function takeHistoryTraverse(): boolean {
  if (!pendingTraverse) return false;
  pendingTraverse = false;
  return true;
}

type ScrollHistoryTarget = {
  addEventListener: (type: string, listener: () => void) => void;
  history?: { scrollRestoration?: string };
  navigation?: {
    addEventListener: (type: string, listener: (event: { navigationType?: string }) => void) => void;
  };
};

export function installCatalogScrollHistoryListener(target?: ScrollHistoryTarget): void {
  const listenerTarget =
    target ?? (typeof window === 'undefined' ? undefined : (window as Window & ScrollHistoryTarget));
  if (historyListenerInstalled || !listenerTarget) return;
  historyListenerInstalled = true;
  if (listenerTarget.history) listenerTarget.history.scrollRestoration = 'manual';
  listenerTarget.addEventListener('popstate', noteHistoryTraverse);
  listenerTarget.navigation?.addEventListener('navigate', (event) => {
    if (event.navigationType === 'traverse') noteHistoryTraverse();
  });
}

function readScrollIndex(storage: ScrollStorage): string[] {
  try {
    const parsed = JSON.parse(storage.getItem(CATALOG_SCROLL_INDEX_KEY) ?? '[]') as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === 'string' && item.length > 0);
  } catch {
    return [];
  }
}
