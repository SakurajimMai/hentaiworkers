import { isActiveRow, normalizeListQuery } from '../domain/recommendation';
import type {
  AnimeDetail,
  AnimeSeed,
  AnimeSimilarItem,
  CatalogListQuery,
  CatalogPage,
  SitemapData,
  TagSummary,
} from '../domain/models';
import type {
  CatalogReadRepository,
  PopularQuery,
  SharedTagsQuery,
  TitlePrefixQuery,
} from '../ports/catalog-read-repository';

type TagRecord = TagSummary & { description: string | null };

export class InMemoryCatalogRepository implements CatalogReadRepository {
  private readonly animes = new Map<number, AnimeSeed>();
  private readonly tags = new Map<number, TagRecord>();

  seedAnime(seed: AnimeSeed) {
    this.animes.set(seed.id, {
      videoUrl: 'https://example.com/video.mp4',
      ...seed,
    });
  }

  seedTag(tag: TagRecord) {
    this.tags.set(tag.id, tag);
  }

  async list(input: CatalogListQuery): Promise<CatalogPage> {
    const { page, limit, sort, activeOnly, offset } = normalizeListQuery(input);
    let rows = [...this.animes.values()];

    if (activeOnly) {
      rows = rows.filter((row) => isActiveRow(row.isActive));
    }
    if (input.search) {
      const needle = input.search.toLowerCase();
      rows = rows.filter(
        (row) =>
          row.title.toLowerCase().includes(needle)
          || (row.titleJapanese ?? '').toLowerCase().includes(needle)
          || (row.titleEnglish ?? '').toLowerCase().includes(needle)
          || (row.description ?? '').toLowerCase().includes(needle),
      );
    }
    if (input.tagId !== undefined) {
      rows = rows.filter((row) => (row.tagIds ?? []).includes(input.tagId!));
    }

    rows.sort((a, b) => {
      if (sort === 'popular') {
        return (b.viewCount ?? 0) - (a.viewCount ?? 0) || b.id - a.id;
      }
      const aTime = a.updatedAt ?? a.createdAt ?? '';
      const bTime = b.updatedAt ?? b.createdAt ?? '';
      return bTime.localeCompare(aTime) || b.id - a.id;
    });

    const total = rows.length;
    const pageRows = rows.slice(offset, offset + limit).map((row) => ({
      id: row.id,
      title: row.title,
      cover: row.cover ?? null,
      viewCount: row.viewCount ?? null,
      titleEnglish: row.titleEnglish ?? null,
    }));

    return {
      data: pageRows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  async getById(id: number): Promise<AnimeDetail | null> {
    const row = this.animes.get(id);
    if (!row) return null;
    const tags = (row.tagIds ?? [])
      .map((tagId) => this.tags.get(tagId))
      .filter((tag): tag is TagRecord => !!tag)
      .map((tag) => ({
        id: tag.id,
        name: tag.name,
        description: tag.description,
      }));

    return {
      id: row.id,
      title: row.title,
      titleEnglish: row.titleEnglish ?? null,
      titleJapanese: row.titleJapanese ?? null,
      description: row.description ?? null,
      cover: row.cover ?? null,
      fanart: row.fanart ?? null,
      videoUrl: row.videoUrl ?? 'https://example.com/video.mp4',
      releaseYear: row.releaseYear ?? null,
      releaseDate: row.releaseDate ?? null,
      viewCount: row.viewCount ?? null,
      favoriteCount: row.favoriteCount ?? null,
      isActive: row.isActive ?? null,
      categoryId: row.categoryId ?? null,
      createdAt: row.createdAt ?? null,
      updatedAt: row.updatedAt ?? null,
      tags,
    };
  }

  async listTags(): Promise<ReadonlyArray<TagSummary>> {
    return [...this.tags.values()]
      .map(({ id, name }) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async getSitemapData(): Promise<SitemapData> {
    const animes = [...this.animes.values()]
      .filter((row) => isActiveRow(row.isActive))
      .map((row) => ({
        id: row.id,
        createdAt: row.createdAt ?? null,
        updatedAt: row.updatedAt ?? null,
      }));
    const tags = await this.listTags();
    return { animes, tags };
  }

  async listByTitlePrefix(input: TitlePrefixQuery): Promise<ReadonlyArray<AnimeSimilarItem>> {
    const prefix = input.prefix.toLowerCase();
    return [...this.animes.values()]
      .filter((row) => isActiveRow(row.isActive))
      .filter((row) => !input.excludeIds.includes(row.id))
      .filter((row) => {
        const title = row.title.toLowerCase();
        const jp = (row.titleJapanese ?? '').toLowerCase();
        return title.startsWith(prefix) || jp.startsWith(prefix);
      })
      .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
      .slice(0, input.limit)
      .map((row) => this.toSimilar(row));
  }

  async listBySharedTags(input: SharedTagsQuery): Promise<ReadonlyArray<AnimeSimilarItem>> {
    const wanted = new Set(input.tagIds);
    return [...this.animes.values()]
      .filter((row) => isActiveRow(row.isActive))
      .filter((row) => !input.excludeIds.includes(row.id))
      .map((row) => {
        const matches = (row.tagIds ?? []).filter((id) => wanted.has(id)).length;
        return { row, matches };
      })
      .filter((item) => item.matches > 0)
      .sort(
        (a, b) =>
          b.matches - a.matches
          || (b.row.viewCount ?? 0) - (a.row.viewCount ?? 0),
      )
      .slice(0, input.limit)
      .map(({ row, matches }) => ({ ...this.toSimilar(row), matches }));
  }

  async listPopular(input: PopularQuery): Promise<ReadonlyArray<AnimeSimilarItem>> {
    return [...this.animes.values()]
      .filter((row) => isActiveRow(row.isActive))
      .filter((row) => !input.excludeIds.includes(row.id))
      .sort((a, b) => (b.viewCount ?? 0) - (a.viewCount ?? 0))
      .slice(0, input.limit)
      .map((row) => this.toSimilar(row));
  }

  async listTagIdsForAnime(animeId: number): Promise<ReadonlyArray<number>> {
    return this.animes.get(animeId)?.tagIds ?? [];
  }

  private toSimilar(row: AnimeSeed): AnimeSimilarItem {
    return {
      id: row.id,
      title: row.title,
      cover: row.cover ?? null,
      fanart: row.fanart ?? null,
      viewCount: row.viewCount ?? null,
    };
  }
}
