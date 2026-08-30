import {
  createTagsDependency,
  createTagsHandler,
  type ListTagsDependency,
  type TagsAnimeServiceLoader,
} from './handler';
import type { TagSummary } from '@/lib/public-api-types';
import { createPublicReadCache } from '@/lib/server/shared/stale-read-cache';

export const dynamic = 'force-dynamic';

const loadAnimeService: TagsAnimeServiceLoader = () => import('@/lib/anime-service');
const listTagsFromProduction = createTagsDependency(loadAnimeService);
const tagsCache = createPublicReadCache<readonly TagSummary[]>(1, (error) => {
  console.error('[api/tags] background cache refresh failed', error);
});
const listTagsWithCache: ListTagsDependency = () =>
  tagsCache.get('tags', listTagsFromProduction);

export const GET = createTagsHandler(listTagsWithCache);
