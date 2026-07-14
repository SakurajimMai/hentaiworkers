import {
  createListAnimesDependency,
  createListAnimesHandler,
  type ListAnimeServiceLoader,
} from './handler';

export const dynamic = 'force-dynamic';

const loadAnimeService: ListAnimeServiceLoader = () => import('@/lib/anime-service');
const listAnimesFromProduction = createListAnimesDependency(loadAnimeService);

export const GET = createListAnimesHandler(listAnimesFromProduction);
