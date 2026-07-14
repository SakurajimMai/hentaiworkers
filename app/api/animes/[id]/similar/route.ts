import {
  createSimilarAnimesDependency,
  createSimilarAnimesHandler,
  type SimilarAnimeServiceLoader,
} from './handler';

export const dynamic = 'force-dynamic';

const loadAnimeService: SimilarAnimeServiceLoader = () => import('@/lib/anime-service');
const getSimilarAnimesFromProduction = createSimilarAnimesDependency(loadAnimeService);

export const GET = createSimilarAnimesHandler(getSimilarAnimesFromProduction);
