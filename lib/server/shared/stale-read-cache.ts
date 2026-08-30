import { createHash } from 'node:crypto';

export const PUBLIC_READ_CACHE_CONTROL =
  'public, max-age=30, stale-while-revalidate=120, stale-if-error=900';

const PUBLIC_READ_FRESH_TTL_MS = 30_000;
const PUBLIC_READ_STALE_TTL_MS = 15 * 60_000;
const PUBLIC_READ_RETRY_DELAY_MS = 15_000;

type SettledEntry<T> = {
  value: T;
  freshUntil: number;
  staleUntil: number;
  retryAfter: number;
  lastAccessOrder: number;
};

export type StaleReadCacheOptions = Readonly<{
  maxEntries: number;
  freshTtlMs: number;
  staleTtlMs: number;
  retryDelayMs: number;
  now?: () => number;
  onBackgroundError?: (error: unknown) => void;
}>;

function assertNonNegativeFinite(name: string, value: number): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative finite number`);
  }
}

/**
 * Bounded process-local cache for public reads. Fresh entries are returned
 * directly; stale entries are returned immediately while one refresh runs.
 */
export class StaleReadCache<T> {
  private readonly settled = new Map<string, SettledEntry<T>>();
  private readonly inFlights = new Map<string, Promise<T>>();
  private readonly now: () => number;
  private generation = 0;
  private order = 0;

  constructor(private readonly options: StaleReadCacheOptions) {
    if (!Number.isInteger(options.maxEntries) || options.maxEntries < 1) {
      throw new RangeError('maxEntries must be a positive integer');
    }
    assertNonNegativeFinite('freshTtlMs', options.freshTtlMs);
    assertNonNegativeFinite('staleTtlMs', options.staleTtlMs);
    assertNonNegativeFinite('retryDelayMs', options.retryDelayMs);
    this.now = options.now ?? Date.now;
  }

  get size(): number {
    return this.settled.size;
  }

  clear(): void {
    this.generation += 1;
    this.settled.clear();
    this.inFlights.clear();
  }

  get(key: string, load: () => Promise<T>): Promise<T> {
    const currentTime = this.now();
    const entry = this.settled.get(key);

    if (entry) {
      this.touch(key, entry);

      if (currentTime <= entry.freshUntil) {
        return Promise.resolve(entry.value);
      }

      if (currentTime <= entry.staleUntil) {
        if (!this.inFlights.has(key) && currentTime >= entry.retryAfter) {
          const refresh = this.startLoad(key, load, entry);
          void refresh.catch((error) => this.reportBackgroundError(error));
        }
        return Promise.resolve(entry.value);
      }

      this.settled.delete(key);
    }

    return this.startLoad(key, load);
  }

  private startLoad(
    key: string,
    load: () => Promise<T>,
    staleEntry?: SettledEntry<T>,
  ): Promise<T> {
    const existing = this.inFlights.get(key);
    if (existing) return existing;

    const generation = this.generation;
    const loadOrder = this.nextOrder();
    const inFlight = Promise.resolve()
      .then(load)
      .then(
        (value) => {
          if (this.isCurrentLoad(key, inFlight, generation)) {
            this.inFlights.delete(key);
            this.commit(key, value, loadOrder);
          }
          return value;
        },
        (error: unknown) => {
          if (this.isCurrentLoad(key, inFlight, generation)) {
            this.inFlights.delete(key);
            if (staleEntry && this.settled.get(key) === staleEntry) {
              staleEntry.retryAfter = this.now() + this.options.retryDelayMs;
            }
          }
          throw error;
        },
      );

    this.inFlights.set(key, inFlight);
    return inFlight;
  }

  private commit(key: string, value: T, loadOrder: number): void {
    const existing = this.settled.get(key);
    if (!existing && this.settled.size >= this.options.maxEntries) {
      const oldest = this.settled.entries().next().value as
        | [string, SettledEntry<T>]
        | undefined;
      if (oldest && oldest[1].lastAccessOrder > loadOrder) return;
      if (oldest) this.settled.delete(oldest[0]);
    }

    const loadedAt = this.now();
    const freshUntil = loadedAt + this.options.freshTtlMs;
    this.settled.delete(key);
    this.settled.set(key, {
      value,
      freshUntil,
      staleUntil: freshUntil + this.options.staleTtlMs,
      retryAfter: 0,
      lastAccessOrder: this.nextOrder(),
    });
    this.evictOverflow();
  }

  private touch(key: string, entry: SettledEntry<T>): void {
    entry.lastAccessOrder = this.nextOrder();
    this.settled.delete(key);
    this.settled.set(key, entry);
  }

  private evictOverflow(): void {
    while (this.settled.size > this.options.maxEntries) {
      const oldestKey = this.settled.keys().next().value as string | undefined;
      if (oldestKey === undefined) return;
      this.settled.delete(oldestKey);
    }
  }

  private isCurrentLoad(
    key: string,
    inFlight: Promise<T>,
    generation: number,
  ): boolean {
    return generation === this.generation && this.inFlights.get(key) === inFlight;
  }

  private nextOrder(): number {
    this.order += 1;
    return this.order;
  }

  private reportBackgroundError(error: unknown): void {
    try {
      this.options.onBackgroundError?.(error);
    } catch {
      // Observability must not affect stale response delivery.
    }
  }
}

export function createPublicReadCache<T>(
  maxEntries: number,
  onBackgroundError?: (error: unknown) => void,
): StaleReadCache<T> {
  return new StaleReadCache<T>({
    maxEntries,
    freshTtlMs: PUBLIC_READ_FRESH_TTL_MS,
    staleTtlMs: PUBLIC_READ_STALE_TTL_MS,
    retryDelayMs: PUBLIC_READ_RETRY_DELAY_MS,
    onBackgroundError,
  });
}

type CacheKeyPart = string | number | boolean | null;

/** Hash normalized supported options so user-provided search text is not retained as a key. */
export function publicReadCacheKey(parts: readonly CacheKeyPart[]): string {
  return createHash('sha256').update(JSON.stringify(parts)).digest('hex');
}
