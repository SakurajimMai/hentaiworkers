import {
  escapeLike,
  normalizeListQuery,
  seriesPrefixCandidates,
} from '../domain/recommendation';
import type {
  AnimeDetail,
  AnimeSimilarItem,
  CatalogListQuery,
  CatalogPage,
  SitemapData,
  TagSummary,
} from '../domain/models';
import type { CatalogReadRepository } from '../ports/catalog-read-repository';

export class CatalogQueryService {
  constructor(private readonly repository: CatalogReadRepository) {}

  list(input: CatalogListQuery = {}): Promise<CatalogPage> {
    const normalized = normalizeListQuery(input);
    return this.repository.list({
      ...input,
      page: normalized.page,
      limit: normalized.limit,
      sort: normalized.sort,
      activeOnly: normalized.activeOnly,
    });
  }

  /**
   * Detail composes the live favourite count from the system favourites lists.
   * `animes.favorite_count` is never read: it was inserted as 0 and never
   * maintained. A count failure degrades to `null` ("unknown") instead of
   * failing the whole detail read or inventing a number.
   */
  async getById(id: number): Promise<AnimeDetail | null> {
    const anime = await this.repository.getById(id);
    if (!anime) return null;
    return { ...anime, favoriteCount: await this.countFavorites(id) };
  }

  private async countFavorites(id: number): Promise<number | null> {
    try {
      const total = await this.repository.countFavorites(id);
      return Number.isFinite(total) && total >= 0 ? Math.trunc(total) : null;
    } catch (error) {
      console.error('countFavorites failed', error);
      return null;
    }
  }

  listTags(): Promise<ReadonlyArray<TagSummary>> {
    return this.repository.listTags();
  }

  /** Sitemap files are chunked by lib/sitemap, so the full active catalog is returned here. */
  getSitemapData(): Promise<SitemapData> {
    return this.repository.getSitemapData();
  }

  /**
   * Rule-based discovery: shared tags with seed anime ids, excluding already known ids.
   * Score is implicit via shared-tag repository ordering + popularity fallback.
   */
  async recommendFromSeeds(
    seedAnimeIds: readonly number[],
    options?: { excludeIds?: readonly number[]; limit?: number },
  ): Promise<AnimeSimilarItem[]> {
    const limit = Math.min(24, Math.max(1, options?.limit ?? 12));
    const exclude = new Set<number>([
      ...seedAnimeIds,
      ...(options?.excludeIds ?? []),
    ]);
    const tagIdSet = new Set<number>();
    for (const animeId of seedAnimeIds.slice(0, 20)) {
      const tagIds = await this.repository.listTagIdsForAnime(animeId);
      for (const tagId of tagIds) tagIdSet.add(tagId);
      if (tagIdSet.size >= 40) break;
    }
    const excludeIds = [...exclude];
    if (tagIdSet.size === 0) {
      return [...(await this.repository.listPopular({ excludeIds, limit }))];
    }
    const tagMatches = await this.repository.listBySharedTags({
      tagIds: [...tagIdSet],
      excludeIds,
      limit,
    });
    if (tagMatches.length >= limit) return [...tagMatches];
    const popular = await this.repository.listPopular({
      excludeIds: [...excludeIds, ...tagMatches.map((item) => item.id)],
      limit: limit - tagMatches.length,
    });
    return [...tagMatches, ...popular];
  }

  async getSimilar(id: number, limit = 12): Promise<AnimeSimilarItem[]> {
    const current = await this.repository.getById(id);
    if (!current) return [];

    const prefixes = seriesPrefixCandidates(current.title, current.titleJapanese);
    const seriesMatches: AnimeSimilarItem[] = [];

    for (const prefix of prefixes) {
      if (seriesMatches.length >= limit) break;
      const rows = await this.repository.listByTitlePrefix({
        prefix: escapeLike(prefix),
        excludeIds: [id, ...seriesMatches.map((item) => item.id)],
        limit: limit - seriesMatches.length,
      });
      seriesMatches.push(...rows);
    }

    const remaining = limit - seriesMatches.length;
    if (remaining <= 0) return seriesMatches;

    const tagIds = await this.repository.listTagIdsForAnime(id);
    const excludeIds = [id, ...seriesMatches.map((item) => item.id)];

    if (tagIds.length === 0) {
      const fallback = await this.repository.listPopular({
        excludeIds,
        limit: remaining,
      });
      return [...seriesMatches, ...fallback];
    }

    const tagMatches = await this.repository.listBySharedTags({
      tagIds,
      excludeIds,
      limit: remaining,
    });
    return [...seriesMatches, ...tagMatches];
  }
}
