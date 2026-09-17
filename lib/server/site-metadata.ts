import { isManagedSeoMeta, siteSeoSchema } from '@/lib/site-seo';
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
    return (await readMetaTags()).filter((tag) => !isManagedSeoMeta(tag.key));
  } catch (error) {
    console.error('[site-metadata] Failed to read global meta tags', error);
    return [];
  }
}

const readSiteSeo = unstable_cache(
  async () => (await getSystemSettingsService().getSettings()).site.seo,
  ['site-seo'],
  { revalidate: 300, tags: [SITE_META_CACHE_TAG] },
);

export async function getSiteSeo() {
  try {
    return await readSiteSeo();
  } catch (error) {
    console.error('[site-metadata] Failed to read site SEO', error);
    return siteSeoSchema.parse({});
  }
}
