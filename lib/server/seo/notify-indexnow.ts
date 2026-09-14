import { getSystemSettingsService } from '@/lib/server/system';
import { resolveSiteUrl } from '@/lib/site-url';
import { submitIndexNow } from './indexnow';

/**
 * Best-effort ping after content changes. Runs inside `after()` so it never delays or fails the
 * admin action or publish request; missing key or network trouble only produce a log line.
 */
export async function notifyIndexNow(paths: readonly string[]): Promise<void> {
  try {
    const key = (await getSystemSettingsService().getSettings()).site.indexNowKey.trim();
    if (!key) return;
    const result = await submitIndexNow({
      siteUrl: resolveSiteUrl(process.env.SITE_URL),
      key,
      paths,
    });
    if (result.status !== null && result.status >= 400) {
      console.warn('[indexnow] submission rejected', result.status, paths.slice(0, 5));
    }
  } catch (error) {
    console.warn('[indexnow] submission failed', error);
  }
}

export function animeIndexNowPaths(id: number | null | undefined): string[] {
  const paths = ['/', '/browse'];
  if (id && Number.isFinite(id)) paths.unshift(`/watch/${id}`);
  return paths;
}

export function mangaIndexNowPaths(id: number | null | undefined): string[] {
  const paths = ['/manga', '/'];
  if (id && Number.isFinite(id)) paths.unshift(`/manga/${id}`);
  return paths;
}

/** Renaming or deleting a 里番 tag changes a sitemap URL, so submit the tag listing too. */
export function animeTagIndexNowPaths(tagId: number | null | undefined): string[] {
  const paths = ['/browse'];
  if (tagId && Number.isFinite(tagId)) paths.unshift(`/browse?tag=${tagId}`);
  return paths;
}

/** Only curated manga tags are indexable, and curation itself is what these actions change. */
export function mangaTagIndexNowPaths(...tags: ReadonlyArray<string | null | undefined>): string[] {
  const paths = ['/manga'];
  for (const tag of tags) {
    const trimmed = tag?.trim();
    if (trimmed) paths.unshift(`/manga?tag=${encodeURIComponent(trimmed)}`);
  }
  return paths;
}
