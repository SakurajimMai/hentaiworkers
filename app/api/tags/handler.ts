import { NextResponse } from 'next/server';
import type { PublicAnimeService, TagSummary } from '@/lib/public-api-types';

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
      return NextResponse.json(rows);
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : 'Failed' },
        { status: 500 },
      );
    }
  };
}
