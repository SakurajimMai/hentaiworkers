import { NextResponse } from 'next/server';
import type { AnimeDetail, PublicAnimeService } from '@/lib/public-api-types';

export type GetAnimeByIdDependency = (id: number) => Promise<AnimeDetail | null>;
export type AnimeDetailServiceLoader = () => Promise<
  Pick<PublicAnimeService, 'getAnimeById'>
>;

export function createAnimeDetailDependency(
  loadAnimeService: AnimeDetailServiceLoader,
): GetAnimeByIdDependency {
  return async (id) => {
    const animeService = await loadAnimeService();
    return animeService.getAnimeById(id);
  };
}

export function createAnimeDetailHandler(getAnimeById: GetAnimeByIdDependency) {
  return async function animeDetailHandler(
    _req: Request,
    { params }: { params: Promise<{ id: string }> },
  ) {
    try {
      const { id: idStr } = await params;
      const id = parseInt(idStr, 10);
      if (!Number.isFinite(id)) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 });
      }
      const anime = await getAnimeById(id);
      if (!anime) return NextResponse.json({ error: 'Not found' }, { status: 404 });
      return NextResponse.json(anime);
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : 'Failed' },
        { status: 500 },
      );
    }
  };
}
