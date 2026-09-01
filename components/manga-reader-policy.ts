export type ReaderPageIntersection = Readonly<{
  index: number;
  isIntersecting: boolean;
  top: number;
  bottom: number;
}>;

export type ReaderImageRequestPolicy = Readonly<{
  loading: 'eager';
  fetchPriority: 'high' | 'low';
}>;

export type ReaderAdRenderPolicy = Readonly<{
  reserveSlot: boolean;
  mountContent: boolean;
}>;

export const READER_PREFETCH_ROOT_MARGIN = '0px 0px 600px 0px';

export const READER_RESTORE_SCROLL_OPTIONS = {
  behavior: 'instant',
  block: 'start',
} as const;

export function clampReaderPage(index: number, pageCount: number): number {
  if (pageCount <= 0 || !Number.isFinite(index)) return 0;
  return Math.min(Math.max(0, Math.floor(index)), pageCount - 1);
}

export function getStoredReaderPage(raw: string | null, pageCount: number): number | null {
  if (raw == null || raw.trim() === '') return null;
  const index = Number(raw);
  if (!Number.isInteger(index) || index < 0 || index >= pageCount) return null;
  return index;
}

export function getInitialReaderPages(initialPage: number, pageCount: number): number[] {
  return pageCount > 0 ? [clampReaderPage(initialPage, pageCount)] : [];
}

export function getReaderImageRequestPolicy(isPriority: boolean): ReaderImageRequestPolicy {
  return {
    loading: 'eager',
    fetchPriority: isPriority ? 'high' : 'low',
  };
}

export function shouldSyncReaderProgress(state: {
  available: boolean;
  authenticated: boolean;
}): boolean {
  return state.available && state.authenticated;
}

export function isReaderViewportTransition(
  previousIndex: number,
  nextIndex: number | null,
): nextIndex is number {
  return Number.isInteger(nextIndex) && nextIndex != null && nextIndex >= 0
    && nextIndex !== previousIndex;
}

export function getReaderAdRenderPolicy(
  html: string,
  priorityPageSettled: boolean,
): ReaderAdRenderPolicy {
  const hasContent = html.trim().length > 0;
  return {
    reserveSlot: hasContent,
    mountContent: hasContent && priorityPageSettled,
  };
}

export function selectActiveReaderPage(
  intersections: ReadonlyArray<ReaderPageIntersection>,
  viewportHeight: number,
  previousIndex: number,
): number | null {
  if (!(viewportHeight > 0)) return null;

  const visible = intersections.filter(
    (entry) => entry.isIntersecting && entry.bottom > 0 && entry.top < viewportHeight,
  );
  if (visible.length === 0) return null;

  // Read slightly below fixed reader chrome, while keeping short landscape pages
  // at the top of a new chapter from being skipped automatically.
  const readingLine = Math.min(160, viewportHeight * 0.2);
  const atReadingLine = visible.filter(
    (entry) => entry.top <= readingLine && entry.bottom > readingLine,
  );
  if (atReadingLine.length > 0) {
    const previous = atReadingLine.find((entry) => entry.index === previousIndex);
    return (previous ?? atReadingLine[0]).index;
  }

  const ranked = visible
    .map((entry) => ({
      entry,
      visiblePixels: Math.max(
        0,
        Math.min(viewportHeight, entry.bottom) - Math.max(0, entry.top),
      ),
      distance: Math.min(
        Math.abs(entry.top - readingLine),
        Math.abs(entry.bottom - readingLine),
      ),
    }))
    .sort((a, b) => {
      if (b.visiblePixels !== a.visiblePixels) return b.visiblePixels - a.visiblePixels;
      if (a.entry.index === previousIndex) return -1;
      if (b.entry.index === previousIndex) return 1;
      return a.distance - b.distance || a.entry.index - b.entry.index;
    });

  return ranked[0]?.entry.index ?? null;
}
