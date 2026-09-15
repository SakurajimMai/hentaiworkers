import { desc } from 'drizzle-orm';
import { db } from '@/lib/db';
import { animes, mangas } from '@/lib/schema';
import { hostsFromUrls } from './image-proxy';

export const RECENT_COVER_SAMPLE = 100;

/**
 * Image hosts used by the newest catalog entries. Clients built before `/cdn-img` carried the host
 * segment only ever rewrote one host, so trying the hosts of recent covers resolves their requests
 * without configuration. Covers share their host with the pages behind them in this catalog.
 */
export async function loadRecentCatalogImageHosts(): Promise<string[]> {
  const [mangaRows, animeRows] = await Promise.all([
    db.select({ url: mangas.coverUrl }).from(mangas).orderBy(desc(mangas.id)).limit(RECENT_COVER_SAMPLE),
    db.select({ url: animes.cover }).from(animes).orderBy(desc(animes.id)).limit(RECENT_COVER_SAMPLE),
  ]);
  return hostsFromUrls([...mangaRows, ...animeRows].map((row) => row.url));
}
