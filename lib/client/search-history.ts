export const SEARCH_HISTORY_KEY = 'animestream.searchHistory.v1';
const MAX_ITEMS = 12;

function canUseStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

export function readSearchHistory(): string[] {
  if (!canUseStorage()) return [];
  try {
    const raw = window.localStorage.getItem(SEARCH_HISTORY_KEY);
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
  if (!canUseStorage()) return;
  const q = query.trim();
  if (!q) return;
  const next = [q, ...readSearchHistory().filter((item) => item.toLowerCase() !== q.toLowerCase())]
    .slice(0, MAX_ITEMS);
  window.localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(next));
}

export function clearSearchHistory(): void {
  if (!canUseStorage()) return;
  window.localStorage.removeItem(SEARCH_HISTORY_KEY);
}
