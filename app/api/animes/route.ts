import {
  createListAnimesDependency,
  createListAnimesHandler,
  type ListAnimesDependency,
  type ListAnimeServiceLoader,
} from './handler';
import type { AnimeListResponse, ListAnimesOptions } from '@/lib/public-api-types';
import {
  createPublicReadCache,
  publicReadCacheKey,
} from '@/lib/server/shared/stale-read-cache';

export const dynamic = 'force-dynamic';

const loadAnimeService: ListAnimeServiceLoader = () => import('@/lib/anime-service');
const listAnimesFromProduction = createListAnimesDependency(loadAnimeService);
const animeListCache = createPublicReadCache<AnimeListResponse>(64, (error) => {
  console.error('[api/animes] background cache refresh failed', error);
});

function animeListCacheKey(options: ListAnimesOptions): string {
  const page = Number.isFinite(options.page) ? Math.max(1, Math.trunc(options.page)) : 'invalid';
  const limit = Number.isFinite(options.limit)
    ? Math.min(100, Math.max(1, Math.trunc(options.limit)))
    : 'invalid';
  const tagId = options.tagId && Number.isFinite(options.tagId)
    ? Math.trunc(options.tagId)
    : null;
  const search = options.search?.trim() || null;
  return publicReadCacheKey([page, limit, tagId, search, options.sort]);
}

const listAnimesWithCache: ListAnimesDependency = (options) =>
  animeListCache.get(
    animeListCacheKey(options),
    () => listAnimesFromProduction(options),
  );

export const GET = createListAnimesHandler(listAnimesWithCache);
