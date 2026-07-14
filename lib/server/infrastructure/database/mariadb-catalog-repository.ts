import { and, desc, eq, inArray, like, notInArray, or, sql } from 'drizzle-orm';
import { db, withDbRetry } from '@/lib/db';
import { animeTags, animes, tags } from '@/lib/schema';
import type {
  AnimeDetail,
  AnimeSimilarItem,
  CatalogListQuery,
  CatalogPage,
  SitemapData,
  TagSummary,
} from '../../catalog/domain/models';
import type {
  CatalogReadRepository,
  PopularQuery,
  SharedTagsQuery,
  TitlePrefixQuery,
} from '../../catalog/ports/catalog-read-repository';
import type {
  CatalogWriteAnimeInput,
  CatalogWriteRepository,
} from '../../catalog/ports/catalog-write-repository';
import { normalizeListQuery } from '../../catalog/domain/recommendation';
import { nowIso } from '@/lib/utils';

function activeAnimeCondition() {
  return sql`(${animes.isActive} = 1 OR ${animes.isActive} IS NULL)`;
}

export class MariaDbCatalogRepository
  implements CatalogReadRepository, CatalogWriteRepository
{
  list(input: CatalogListQuery): Promise<CatalogPage> {
    return withDbRetry(async () => {
      const { page, limit, sort, activeOnly, offset } = normalizeListQuery(input);
      const orderColumn = sort === 'popular' ? animes.viewCount : animes.createdAt;
      const conditions = [];
      if (activeOnly) conditions.push(activeAnimeCondition());
      if (input.search) {
        const searchLike = `%${input.search}%`;
        conditions.push(
          sql`(${animes.title} LIKE ${searchLike} OR ${animes.titleJapanese} LIKE ${searchLike})`,
        );
      }

      if (input.tagId) {
        const where = and(eq(animeTags.tagId, input.tagId), ...conditions);
        const rows = await db
          .select({
            id: animes.id,
            title: animes.title,
            cover: animes.cover,
            viewCount: animes.viewCount,
            titleEnglish: animes.titleEnglish,
          })
          .from(animes)
          .innerJoin(animeTags, eq(animes.id, animeTags.animeId))
          .where(where)
          .orderBy(desc(orderColumn))
          .limit(limit)
          .offset(offset);

        const [countRow] = await db
          .select({ count: sql<number>`count(*)` })
          .from(animes)
          .innerJoin(animeTags, eq(animes.id, animeTags.animeId))
          .where(where);

        const total = Number(countRow?.count ?? 0);
        return {
          data: rows,
          pagination: {
            page,
            limit,
            total,
            totalPages: Math.max(1, Math.ceil(total / limit)),
          },
        };
      }

      const where = conditions.length ? and(...conditions) : undefined;
      const rows = await db
        .select({
          id: animes.id,
          title: animes.title,
          cover: animes.cover,
          viewCount: animes.viewCount,
          titleEnglish: animes.titleEnglish,
        })
        .from(animes)
        .where(where)
        .orderBy(desc(orderColumn))
        .limit(limit)
        .offset(offset);

      const [countRow] = await db
        .select({ count: sql<number>`count(*)` })
        .from(animes)
        .where(where);
      const total = Number(countRow?.count ?? 0);

      return {
        data: rows,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.max(1, Math.ceil(total / limit)),
        },
      };
    });
  }

  getById(id: number): Promise<AnimeDetail | null> {
    return withDbRetry(async () => {
      const [anime] = await db.select().from(animes).where(eq(animes.id, id)).limit(1);
      if (!anime) return null;

      const tagRows = await db
        .select({
          id: tags.id,
          name: tags.name,
          description: tags.description,
        })
        .from(tags)
        .innerJoin(animeTags, eq(tags.id, animeTags.tagId))
        .where(eq(animeTags.animeId, id));

      return { ...anime, tags: tagRows };
    });
  }

  listTags(): Promise<ReadonlyArray<TagSummary>> {
    return withDbRetry(() =>
      db
        .select({ id: tags.id, name: tags.name })
        .from(tags)
        .orderBy(tags.name),
    );
  }

  getSitemapData(): Promise<SitemapData> {
    return withDbRetry(async () => {
      const activeCondition = activeAnimeCondition();
      const [animeRows, tagRows] = await Promise.all([
        db
          .select({
            id: animes.id,
            createdAt: animes.createdAt,
            updatedAt: animes.updatedAt,
          })
          .from(animes)
          .where(activeCondition),
        db
          .select({ id: tags.id, name: tags.name })
          .from(tags)
          .orderBy(tags.name),
      ]);
      return { animes: animeRows, tags: tagRows };
    });
  }

  listByTitlePrefix(input: TitlePrefixQuery): Promise<ReadonlyArray<AnimeSimilarItem>> {
    return withDbRetry(async () => {
      const pattern = `${input.prefix}%`;
      const excludeIds = [...input.excludeIds];
      return db
        .select({
          id: animes.id,
          title: animes.title,
          cover: animes.cover,
          fanart: animes.fanart,
          viewCount: animes.viewCount,
        })
        .from(animes)
        .where(
          and(
            excludeIds.length ? notInArray(animes.id, excludeIds) : sql`1=1`,
            activeAnimeCondition(),
            or(like(animes.title, pattern), like(animes.titleJapanese, pattern)),
          ),
        )
        .orderBy(desc(animes.createdAt))
        .limit(input.limit);
    });
  }

  listBySharedTags(input: SharedTagsQuery): Promise<ReadonlyArray<AnimeSimilarItem>> {
    return withDbRetry(async () => {
      if (input.tagIds.length === 0 || input.limit <= 0) return [];
      const excludeIds = [...input.excludeIds];
      return db
        .select({
          id: animes.id,
          title: animes.title,
          cover: animes.cover,
          fanart: animes.fanart,
          viewCount: animes.viewCount,
          matches: sql<number>`count(${animeTags.tagId})`.as('match_count'),
        })
        .from(animes)
        .innerJoin(animeTags, eq(animes.id, animeTags.animeId))
        .where(
          and(
            inArray(animeTags.tagId, [...input.tagIds]),
            excludeIds.length ? notInArray(animes.id, excludeIds) : sql`1=1`,
            activeAnimeCondition(),
          ),
        )
        .groupBy(animes.id)
        .orderBy(desc(sql`match_count`), desc(animes.viewCount))
        .limit(input.limit);
    });
  }

  listPopular(input: PopularQuery): Promise<ReadonlyArray<AnimeSimilarItem>> {
    return withDbRetry(async () => {
      const excludeIds = [...input.excludeIds];
      return db
        .select({
          id: animes.id,
          title: animes.title,
          cover: animes.cover,
          fanart: animes.fanart,
          viewCount: animes.viewCount,
        })
        .from(animes)
        .where(
          and(
            excludeIds.length ? notInArray(animes.id, excludeIds) : sql`1=1`,
            activeAnimeCondition(),
          ),
        )
        .orderBy(desc(animes.viewCount))
        .limit(input.limit);
    });
  }

  listTagIdsForAnime(animeId: number): Promise<ReadonlyArray<number>> {
    return withDbRetry(async () => {
      const rows = await db
        .select({ id: animeTags.tagId })
        .from(animeTags)
        .where(eq(animeTags.animeId, animeId));
      return rows.map((row) => row.id);
    });
  }

  async createAnime(input: CatalogWriteAnimeInput): Promise<number> {
    return withDbRetry(async () => {
      await db.insert(animes).values({
        title: input.title,
        videoUrl: input.videoUrl,
        titleEnglish: input.titleEnglish ?? null,
        titleJapanese: input.titleJapanese ?? null,
        description: input.description ?? null,
        cover: input.cover ?? null,
        fanart: input.fanart ?? null,
        isActive: input.isActive ?? 1,
        viewCount: 0,
        favoriteCount: 0,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      });
      const [row] = await db
        .select({ id: animes.id })
        .from(animes)
        .where(eq(animes.title, input.title))
        .orderBy(sql`${animes.id} desc`)
        .limit(1);
      const animeId = row?.id;
      if (!animeId) throw new Error('Failed to create anime');
      if (input.tagIds?.length) {
        await db.insert(animeTags).values(
          input.tagIds.map((tagId) => ({
            animeId,
            tagId,
            createdAt: nowIso(),
            updatedAt: nowIso(),
          })),
        );
      }
      return animeId;
    });
  }

  async updateAnime(id: number, input: CatalogWriteAnimeInput): Promise<void> {
    return withDbRetry(async () => {
      await db
        .update(animes)
        .set({
          title: input.title,
          videoUrl: input.videoUrl,
          titleEnglish: input.titleEnglish ?? null,
          titleJapanese: input.titleJapanese ?? null,
          description: input.description ?? null,
          cover: input.cover ?? null,
          fanart: input.fanart ?? null,
          isActive: input.isActive ?? 1,
          updatedAt: nowIso(),
        })
        .where(eq(animes.id, id));

      await db.delete(animeTags).where(eq(animeTags.animeId, id));
      if (input.tagIds?.length) {
        await db.insert(animeTags).values(
          input.tagIds.map((tagId) => ({
            animeId: id,
            tagId,
            createdAt: nowIso(),
            updatedAt: nowIso(),
          })),
        );
      }
    });
  }

  async deleteAnime(id: number): Promise<void> {
    return withDbRetry(async () => {
      await db.delete(animeTags).where(eq(animeTags.animeId, id));
      await db.delete(animes).where(eq(animes.id, id));
    });
  }

  async setAnimeActive(id: number, isActive: number): Promise<void> {
    return withDbRetry(async () => {
      await db
        .update(animes)
        .set({ isActive, updatedAt: nowIso() })
        .where(eq(animes.id, id));
    });
  }
}

let defaultRepository: MariaDbCatalogRepository | undefined;

export function getMariaDbCatalogRepository(): MariaDbCatalogRepository {
  defaultRepository ??= new MariaDbCatalogRepository();
  return defaultRepository;
}
