import { NextResponse } from 'next/server';
import type { PublicAnimeService, TagSummary } from '@/lib/public-api-types';
import { PUBLIC_READ_CACHE_CONTROL } from '@/lib/server/shared/stale-read-cache';

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

export function createTagsHandler(listTags: ListTagsDependency) {
  return async function tagsHandler() {
    try {
      const rows = await listTags();
      return NextResponse.json(rows, {
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
