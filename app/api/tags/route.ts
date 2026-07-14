import {
  createTagsDependency,
  createTagsHandler,
  type TagsAnimeServiceLoader,
} from './handler';

export const dynamic = 'force-dynamic';

const loadAnimeService: TagsAnimeServiceLoader = () => import('@/lib/anime-service');
const listTagsFromProduction = createTagsDependency(loadAnimeService);

export const GET = createTagsHandler(listTagsFromProduction);
