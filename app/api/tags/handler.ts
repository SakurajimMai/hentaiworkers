import { NextRequest, NextResponse } from 'next/server';
import type { PublicAnimeService, TagSummary } from '@/lib/public-api-types';
import { PUBLIC_READ_CACHE_CONTROL } from '@/lib/server/shared/stale-read-cache';

export const DEFAULT_TAG_LIMIT = 100;
export const MAX_TAG_LIMIT = 100;

export type ListTagsDependency = () => Promise<readonly TagSummary[]>;
export type TagsAnimeServiceLoader = () => Promise<
  Pick<PublicAnimeService, 'listTags'>
>;

export function createTagsDependency(
  loadAnimeService: TagsAnimeServiceLoader,
): ListTagsDependency {
  return async () => {
    const animeService = await loadAnimeService();
    return animeService.listTags();
  };
}

export function parseTagsLimit(value: string | null): number {
  if (value === null || !/^-?\d+$/.test(value)) return DEFAULT_TAG_LIMIT;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) return DEFAULT_TAG_LIMIT;
  return Math.min(MAX_TAG_LIMIT, Math.max(1, parsed));
}

export function createTagsHandler(listTags: ListTagsDependency) {
  return async function tagsHandler(req: NextRequest) {
    try {
      const rows = await listTags();
      const limit = parseTagsLimit(req.nextUrl.searchParams.get('limit'));
      return NextResponse.json(rows.slice(0, limit), {
        headers: { 'Cache-Control': PUBLIC_READ_CACHE_CONTROL },
      });
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : 'Failed' },
        { status: 500 },
      );
    }
  };
}
