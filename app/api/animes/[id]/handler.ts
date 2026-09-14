import { NextResponse } from 'next/server';
import type { AnimeDetail, PublicAnimeService } from '@/lib/public-api-types';

export type GetAnimeByIdDependency = (id: number) => Promise<AnimeDetail | null>;
export type AnimeDetailServiceLoader = () => Promise<
  Pick<PublicAnimeService, 'getAnimeById'>
>;

export type AnimeDetailHandlerDependencies = {
  getAnimeById: GetAnimeByIdDependency;
  /** Deduped real view write; see lib/anime-views.ts. */
  recordView: (animeId: number) => Promise<void>;
  /** `after()` in production, so the write never delays the response. */
  scheduleAfter: (task: Promise<unknown>) => void;
};

export function createAnimeDetailDependency(
  loadAnimeService: AnimeDetailServiceLoader,
): GetAnimeByIdDependency {
  return async (id) => {
    const animeService = await loadAnimeService();
    return animeService.getAnimeById(id);
  };
}

export function createAnimeDetailHandler(dependencies: AnimeDetailHandlerDependencies) {
  function scheduleViewTask(animeId: number): void {
    try {
      dependencies.scheduleAfter(dependencies.recordView(animeId));
    } catch (error) {
      console.error('[api/animes] failed to schedule anime view', error);
    }
  }

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
      const anime = await dependencies.getAnimeById(id);
      if (!anime) return NextResponse.json({ error: 'Not found' }, { status: 404 });
      scheduleViewTask(anime.id);
      return NextResponse.json(anime);
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : 'Failed' },
        { status: 500 },
      );
    }
  };
}
