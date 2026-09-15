import { createImageProxyHandler } from './handler';
import { loadRecentCatalogImageHosts } from '@/lib/server/image-proxy-hosts';
import { StaleReadCache } from '@/lib/server/shared/stale-read-cache';
import { resolveSiteUrl } from '@/lib/site-url';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Only requests without a host segment (clients older than Build 112) consult the catalog.
const legacyHostCache = new StaleReadCache<readonly string[]>({
  maxEntries: 1,
  freshTtlMs: 10 * 60_000,
  staleTtlMs: 24 * 60 * 60_000,
  retryDelayMs: 60_000,
  onBackgroundError: (error) => {
    console.error('[cdn-img] background refresh of catalog image hosts failed', error);
  },
});

export const GET = createImageProxyHandler({
  siteOrigin: () => resolveSiteUrl(process.env.SITE_URL),
  legacyHosts: () => legacyHostCache.get('recent', loadRecentCatalogImageHosts),
});
