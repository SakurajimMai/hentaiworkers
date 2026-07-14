import {
  createAnimeDetailDependency,
  createAnimeDetailHandler,
  type AnimeDetailServiceLoader,
} from './handler';

export const dynamic = 'force-dynamic';

const loadAnimeService: AnimeDetailServiceLoader = () => import('@/lib/anime-service');
const getAnimeByIdFromProduction = createAnimeDetailDependency(loadAnimeService);

export const GET = createAnimeDetailHandler(getAnimeByIdFromProduction);
