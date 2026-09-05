import {
  getInitialReaderPages,
  getReaderPrefetchPages,
  READER_PREFETCH_CONCURRENCY,
} from './manga-reader-policy';

type ImageState = 'loading' | 'success' | 'error';

// Admission mounts the one display <img>; it never makes a separate preload request.
export class ReaderImageScheduler {
  private readonly states = new Map<number, ImageState>();
  private visible = new Set<number>();
  private current: number;
  private direction: 1 | -1 = 1;
  private moved = false;
  private readonly positions: ReadonlyMap<number, number>;
  private readonly initialPage: number;

  constructor(
    private readonly pageIndexes: readonly number[],
    initialPage: number,
    private prefetchEnabled = true,
  ) {
    this.positions = new Map(pageIndexes.map((index, position) => [index, position]));
    this.current = this.valid(initialPage) ? initialPage : (pageIndexes[0] ?? 0);
    this.initialPage = this.current;
    this.updateViewport(this.current, pageIndexes.length > 0 ? [this.current] : []);
  }

  get admittedPages(): ReadonlySet<number> {
    return new Set(this.states.keys());
  }

  updateViewport(currentPage: number, visiblePages: readonly number[]): boolean {
    const current = this.valid(currentPage) ? currentPage : this.current;
    if (current !== this.current) {
      this.direction = this.positions.get(current)! > this.positions.get(this.current)! ? 1 : -1;
      this.moved = true;
      this.current = current;
    }
    this.visible = new Set(visiblePages.filter((index) => this.valid(index)));
    let changed = false;
    // Visible images never wait behind stalled speculative requests.
    for (const index of [current, ...this.visible]) {
      if (this.valid(index) && !this.states.has(index)) {
        this.states.set(index, 'loading');
        changed = true;
      }
    }
    return this.pump() || changed;
  }

  settle(index: number, result: 'success' | 'error'): boolean {
    if (this.states.get(index) !== 'loading') return false;
    this.states.set(index, result);
    if (index === this.initialPage) this.prefetchEnabled = true;
    return this.pump();
  }

  enablePrefetch(): boolean {
    this.prefetchEnabled = true;
    return this.pump();
  }

  retry(index: number): void {
    if (this.states.has(index)) this.states.set(index, 'loading');
  }

  private valid(index: number): boolean {
    return this.positions.has(index);
  }

  private pump(): boolean {
    if (!this.prefetchEnabled) return false;
    let pending = [...this.states].filter(
      ([index, state]) => state === 'loading' && !this.visible.has(index),
    ).length;
    const position = this.positions.get(this.current) ?? 0;
    const candidates = (this.moved
      ? getReaderPrefetchPages(position, this.pageIndexes.length, this.direction)
      : getInitialReaderPages(position, this.pageIndexes.length))
      .map((candidate) => this.pageIndexes[candidate]);
    let changed = false;
    for (const index of candidates) {
      if (pending >= READER_PREFETCH_CONCURRENCY) break;
      if (this.states.has(index)) continue;
      this.states.set(index, 'loading');
      pending += 1;
      changed = true;
    }
    return changed;
  }
}
