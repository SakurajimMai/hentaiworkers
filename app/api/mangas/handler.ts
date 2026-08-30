import { NextRequest, NextResponse } from 'next/server';
import type {
  MangaListResult as MangaServiceListResponse,
  MangaRank,
} from '@/lib/manga-service';
import { PUBLIC_READ_CACHE_CONTROL } from '@/lib/server/shared/stale-read-cache';

export type ListMangasOptions = Readonly<{
  page: number;
  limit: number;
  q?: string;
  tag?: string;
  rank?: MangaRank;
}>;

export type ListMangasDependency = (
  options: ListMangasOptions,
) => Promise<MangaServiceListResponse | null>;

export type MangaServiceLoader = () => Promise<{
  isMangaEnabled: () => Promise<boolean>;
  listMangas: (options: ListMangasOptions) => Promise<MangaServiceListResponse>;
}>;

function parseMangaRank(value: string | null): MangaRank | undefined {
  return value === 'day' || value === 'week' || value === 'month' || value === 'all'
    ? value
    : undefined;
}

export function createListMangasDependency(
  loadMangaService: MangaServiceLoader,
): ListMangasDependency {
  return async (options) => {
    const mangaService = await loadMangaService();
    if (!(await mangaService.isMangaEnabled())) return null;
    return mangaService.listMangas(options);
  };
}

export function createListMangasHandler(listMangas: ListMangasDependency) {
  return async function listMangasHandler(req: NextRequest) {
    try {
      const sp = req.nextUrl.searchParams;
      const page = parseInt(sp.get('page') || '1', 10);
      const limit = parseInt(sp.get('limit') || '24', 10);
      const q = sp.get('q') || undefined;
      const tag = sp.get('tag') || undefined;
      const rank = parseMangaRank(sp.get('rank'));
      const result = await listMangas({ page, limit, q, tag, rank });

      if (!result) {
        return NextResponse.json({ error: 'Manga disabled' }, { status: 404 });
      }

      return NextResponse.json(
        {
          data: result.data,
          pagination: {
            page: result.page,
            limit: result.limit,
            total: result.total,
            totalPages: result.totalPages,
          },
        },
        { headers: { 'Cache-Control': PUBLIC_READ_CACHE_CONTROL } },
      );
    } catch (error) {
      console.error(error);
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Failed' },
        { status: 500 },
      );
    }
  };
}
