import { NextResponse } from 'next/server';
import type {
  AnimeSimilarItem,
  PublicAnimeService,
} from '@/lib/public-api-types';

export type GetSimilarAnimesDependency = (id: number) => Promise<AnimeSimilarItem[]>;
export type SimilarAnimeServiceLoader = () => Promise<
  Pick<PublicAnimeService, 'getSimilarAnimes'>
>;

export function createSimilarAnimesDependency(
  loadAnimeService: SimilarAnimeServiceLoader,
): GetSimilarAnimesDependency {
  return async (id) => {
    const animeService = await loadAnimeService();
    return animeService.getSimilarAnimes(id);
  };
}

export function createSimilarAnimesHandler(
  getSimilarAnimes: GetSimilarAnimesDependency,
) {
  return async function similarAnimesHandler(
    _req: Request,
    { params }: { params: Promise<{ id: string }> },
  ) {
    try {
      const { id: idStr } = await params;
      const id = parseInt(idStr, 10);
      if (!Number.isFinite(id)) return NextResponse.json([]);
      const rows = await getSimilarAnimes(id);
      return NextResponse.json(rows);
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : 'Failed' },
        { status: 500 },
      );
    }
  };
}
