import { NextRequest, NextResponse } from 'next/server';
import type {
  AnimeListResponse,
  ListAnimesOptions,
  PublicAnimeService,
  SortType,
} from '@/lib/public-api-types';
import { PUBLIC_READ_CACHE_CONTROL } from '@/lib/server/shared/stale-read-cache';

export type { ListAnimesOptions } from '@/lib/public-api-types';

export type ListAnimesDependency = (
  options: ListAnimesOptions,
) => Promise<AnimeListResponse>;
export type ListAnimeServiceLoader = () => Promise<
  Pick<PublicAnimeService, 'listAnimes'>
>;

export function createListAnimesDependency(
  loadAnimeService: ListAnimeServiceLoader,
): ListAnimesDependency {
  return async (options) => {
    const animeService = await loadAnimeService();
    return animeService.listAnimes(options);
  };
}

export function createListAnimesHandler(listAnimes: ListAnimesDependency) {
  return async function listAnimesHandler(req: NextRequest) {
    try {
      const sp = req.nextUrl.searchParams;
      const page = parseInt(sp.get('page') || '1', 10);
      const limit = parseInt(sp.get('limit') || '48', 10);
      const tag = sp.get('tag');
      const search = sp.get('search') || undefined;
      const sort = (sp.get('sort') === 'popular' ? 'popular' : 'latest') as SortType;

      const result = await listAnimes({
        page,
        limit,
        tagId: tag ? parseInt(tag, 10) : undefined,
        search,
        sort,
      });
      return NextResponse.json(result, {
        headers: { 'Cache-Control': PUBLIC_READ_CACHE_CONTROL },
      });
    } catch (e) {
      console.error(e);
      return NextResponse.json(
        { error: e instanceof Error ? e.message : 'Failed' },
        { status: 500 },
      );
    }
  };
}
