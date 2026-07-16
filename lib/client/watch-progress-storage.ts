/** Guest watch progress in localStorage; merged to server after login. */

export const WATCH_PROGRESS_STORAGE_KEY = 'animestream.watchProgress.v1';

export type LocalWatchProgress = {
  animeId: number;
  positionSeconds: number;
  durationSeconds: number;
  completed: boolean;
  lastWatchedAt: string;
  title?: string;
  cover?: string | null;
};

function canUseStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

export function readLocalWatchProgress(): LocalWatchProgress[] {
  if (!canUseStorage()) return [];
  try {
    const raw = window.localStorage.getItem(WATCH_PROGRESS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((row): row is LocalWatchProgress => {
        return (
          !!row
          && typeof row === 'object'
          && Number.isFinite((row as LocalWatchProgress).animeId)
          && Number.isFinite((row as LocalWatchProgress).positionSeconds)
        );
      })
      .map((row) => ({
        animeId: Number(row.animeId),
        positionSeconds: Math.max(0, Math.floor(Number(row.positionSeconds) || 0)),
        durationSeconds: Math.max(0, Math.floor(Number(row.durationSeconds) || 0)),
        completed: Boolean(row.completed),
        lastWatchedAt: String(row.lastWatchedAt || new Date().toISOString()),
        title: row.title,
        cover: row.cover ?? null,
      }))
      .sort((a, b) => b.lastWatchedAt.localeCompare(a.lastWatchedAt));
  } catch {
    return [];
  }
}

export function writeLocalWatchProgress(rows: LocalWatchProgress[]): void {
  if (!canUseStorage()) return;
  window.localStorage.setItem(WATCH_PROGRESS_STORAGE_KEY, JSON.stringify(rows.slice(0, 100)));
}

export function upsertLocalWatchProgress(row: LocalWatchProgress): void {
  const rows = readLocalWatchProgress().filter((r) => r.animeId !== row.animeId);
  rows.unshift(row);
  writeLocalWatchProgress(rows);
}

export function removeLocalWatchProgress(animeId: number): void {
  writeLocalWatchProgress(readLocalWatchProgress().filter((r) => r.animeId !== animeId));
}

export function clearLocalWatchProgress(): void {
  if (!canUseStorage()) return;
  window.localStorage.removeItem(WATCH_PROGRESS_STORAGE_KEY);
}

export function isCompletedProgress(position: number, duration: number, flag?: boolean): boolean {
  if (flag) return true;
  if (duration <= 0) return false;
  if (position / duration >= 0.9) return true;
  return duration - position <= 5;
}
