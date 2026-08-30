import { normalizeMangaTagQuery } from '@/lib/manga-tags';
import type { MangaListResult as MangaServiceListResponse } from '@/lib/manga-service';
import {
  createPublicReadCache,
  publicReadCacheKey,
} from '@/lib/server/shared/stale-read-cache';
import {
  createListMangasDependency,
  createListMangasHandler,
  type ListMangasDependency,
  type ListMangasOptions,
  type MangaServiceLoader,
} from './handler';

export const dynamic = 'force-dynamic';

const loadMangaService: MangaServiceLoader = () => import('@/lib/manga-client');
const listMangasFromProduction = createListMangasDependency(loadMangaService);
const mangaListCache = createPublicReadCache<MangaServiceListResponse | null>(64, (error) => {
  console.error('[api/mangas] background cache refresh failed', error);
});

function mangaListCacheKey(options: ListMangasOptions): string {
  const page = Number.isFinite(options.page) ? Math.max(1, Math.trunc(options.page)) : 'invalid';
  const limit = Number.isFinite(options.limit)
    ? Math.min(100, Math.max(1, Math.trunc(options.limit)))
    : 'invalid';
  const query = options.q?.trim() || null;
  const tag = normalizeMangaTagQuery(options.tag) || null;
  return publicReadCacheKey([page, limit, query, tag, options.rank ?? null]);
}

const listMangasWithCache: ListMangasDependency = (options) =>
  mangaListCache.get(
    mangaListCacheKey(options),
    () => listMangasFromProduction(options),
  );

export const GET = createListMangasHandler(listMangasWithCache);
