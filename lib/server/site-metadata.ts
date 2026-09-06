import { unstable_cache } from 'next/cache';
import { SITE_META_CACHE_TAG, type SiteMetaTag } from '@/lib/site-meta';
import { getSystemSettingsService } from './system';

const readMetaTags = unstable_cache(
  () => getSystemSettingsService().getPublicMetaTags(),
  [SITE_META_CACHE_TAG],
  { revalidate: 300, tags: [SITE_META_CACHE_TAG] },
);

export async function getGlobalMetaTags(): Promise<SiteMetaTag[]> {
  try {
    return await readMetaTags();
  } catch (error) {
    console.error('[site-metadata] Failed to read global meta tags', error);
    return [];
  }
}
