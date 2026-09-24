import { localStore } from './safe-storage';

export const SEARCH_HISTORY_KEY = 'animestream.searchHistory.v1';
const MAX_ITEMS = 12;

export function readSearchHistory(): string[] {
  const store = localStore();
  if (!store) return [];
  try {
    const raw = store.getItem(SEARCH_HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => String(item ?? '').trim())
      .filter(Boolean)
      .slice(0, MAX_ITEMS);
  } catch {
    return [];
  }
}

export function pushSearchHistory(query: string): void {
  const store = localStore();
  if (!store) return;
  const q = query.trim();
  if (!q) return;
  const next = [q, ...readSearchHistory().filter((item) => item.toLowerCase() !== q.toLowerCase())]
    .slice(0, MAX_ITEMS);
  try {
    store.setItem(SEARCH_HISTORY_KEY, JSON.stringify(next));
  } catch {
    // Full or read-only storage: the search still runs, it is just not remembered.
  }
}

export function clearSearchHistory(): void {
  try {
    localStore()?.removeItem(SEARCH_HISTORY_KEY);
  } catch {
    // Nothing to clear when storage is unavailable.
  }
}
