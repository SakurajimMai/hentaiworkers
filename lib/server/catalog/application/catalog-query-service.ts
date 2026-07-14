import { assertSitemapEntryLimit } from '@/lib/sitemap';
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

  getById(id: number): Promise<AnimeDetail | null> {
    return this.repository.getById(id);
  }

  listTags(): Promise<ReadonlyArray<TagSummary>> {
    return this.repository.listTags();
  }

  async getSitemapData(): Promise<SitemapData> {
    const data = await this.repository.getSitemapData();
    assertSitemapEntryLimit(data.animes.length, data.tags.length);
    return data;
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
