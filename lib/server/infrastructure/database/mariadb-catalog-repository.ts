import { and, desc, eq, inArray, like, notInArray, or, sql } from 'drizzle-orm';
import type { RowDataPacket } from 'mysql2';
import { db, pool, withDbRetry } from '@/lib/db';
import {
  animeTags,
  animes,
  mediaSources,
  tags,
  userEvents,
  userFavorites,
  userWatchProgress,
} from '@/lib/schema';
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
import type { CatalogPageLookup } from '../../catalog/ports/catalog-read-repository';
import { catalogPageForPrecedingCount } from '@/lib/catalog-page';
import { normalizeListQuery } from '../../catalog/domain/recommendation';
import { nowIso } from '@/lib/utils';

function activeAnimeCondition() {
  return sql`(${animes.isActive} = 1 OR ${animes.isActive} IS NULL)`;
}

/**
 * Real favourites live in the system `favorites` list only
 * (`user_lists.list_type = 'favorites' AND is_system = 1`). Custom lists and the
 * backfill-only legacy `user_favorites` table are deliberately excluded.
 * `user_list_items` is not part of the drizzle schema, so this stays raw SQL;
 * `user_list_items_anime_id_idx` keeps the count indexed for a single anime.
 */
export const ANIME_FAVORITE_COUNT_SQL = `
  SELECT COUNT(*) AS total
  FROM user_list_items i
  INNER JOIN user_lists l ON l.id = i.list_id
  WHERE i.anime_id = ?
    AND l.list_type = 'favorites'
    AND l.is_system = 1
`;

export class MariaDbCatalogRepository
  implements CatalogReadRepository, CatalogWriteRepository
{
  list(input: CatalogListQuery): Promise<CatalogPage> {
    return withDbRetry(async () => {
      const { page, limit, sort, activeOnly, offset } = normalizeListQuery(input);
      // "latest" uses COALESCE(updated_at, created_at) so recrawls surface as 最近更新.
      // The id tiebreaker keeps pagination stable: without it MySQL may repeat or skip a row
      // across page boundaries when two works share a timestamp or a view count.
      const orderBy =
        sort === 'popular'
          ? sql`${animes.viewCount} DESC, ${animes.id} DESC`
          : sql`COALESCE(${animes.updatedAt}, ${animes.createdAt}) DESC, ${animes.id} DESC`;
      const conditions = [];
      if (activeOnly) conditions.push(activeAnimeCondition());
      if (input.search) {
        const needle = input.search.trim();
        if (needle) {
          const searchLike = `%${needle}%`;
          conditions.push(
            sql`(
              ${animes.title} LIKE ${searchLike}
              OR ${animes.titleJapanese} LIKE ${searchLike}
              OR ${animes.titleEnglish} LIKE ${searchLike}
              OR ${animes.description} LIKE ${searchLike}
            )`,
          );
        }
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
          .orderBy(orderBy)
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
        .orderBy(orderBy)
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

      // favorite_count is a dead crawler column; the live count is composed by
      // CatalogQueryService via countFavorites().
      return { ...anime, favoriteCount: null, tags: tagRows };
    });
  }

  countFavorites(animeId: number): Promise<number> {
    return withDbRetry(async () => {
      const [rows] = await pool.query<RowDataPacket[]>(ANIME_FAVORITE_COUNT_SQL, [animeId]);
      return Math.max(0, Number(rows[0]?.total ?? 0));
    });
  }

  /**
   * Mirrors the default `latest` ordering (COALESCE(updated_at, created_at) desc, id desc) so a
   * detail page can send the viewer back to the catalog page the work is actually on.
   */
  findCatalogPage(input: CatalogPageLookup): Promise<number> {
    return withDbRetry(async () => {
      const size = Math.max(1, Math.trunc(input.pageSize));
      const sortKey = sql`COALESCE(${animes.updatedAt}, ${animes.createdAt})`;
      const [current] = await db
        .select({ id: animes.id, sortKey: sql<string | null>`${sortKey}` })
        .from(animes)
        .where(and(eq(animes.id, input.animeId), activeAnimeCondition()))
        .limit(1);
      if (!current) return 1;

      const [countRow] = await db
        .select({ count: sql<number>`count(*)` })
        .from(animes)
        .where(
          and(
            activeAnimeCondition(),
            sql`(
              ${sortKey} > ${current.sortKey}
              OR (${sortKey} = ${current.sortKey} AND ${animes.id} > ${current.id})
            )`,
          ),
        );
      return catalogPageForPrecedingCount(Number(countRow?.count ?? 0), size);
    });
  }

  listTags(): Promise<ReadonlyArray<TagSummary>> {
    return withDbRetry(() =>
      db
        .selectDistinct({ id: tags.id, name: tags.name })
        .from(tags)
        .innerJoin(animeTags, eq(tags.id, animeTags.tagId))
        .innerJoin(animes, eq(animeTags.animeId, animes.id))
        .where(activeAnimeCondition())
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
            cover: animes.cover,
          })
          .from(animes)
          .where(activeCondition),
        // Same active-anime join as listTags(): a tag with no visible work renders noindex,
        // so submitting it would only earn "Submitted URL marked noindex" in Search Console.
        db
          .selectDistinct({ id: tags.id, name: tags.name })
          .from(tags)
          .innerJoin(animeTags, eq(tags.id, animeTags.tagId))
          .innerJoin(animes, eq(animeTags.animeId, animes.id))
          .where(activeAnimeCondition())
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
        // Column default only; favourite counts are never read from here.
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
      await db.transaction(async (tx) => {
        await tx.delete(animeTags).where(eq(animeTags.animeId, id));
        await tx.delete(mediaSources).where(eq(mediaSources.animeId, id));
        await tx.delete(userWatchProgress).where(eq(userWatchProgress.animeId, id));
        await tx.delete(userFavorites).where(eq(userFavorites.animeId, id));
        await tx.delete(userEvents).where(eq(userEvents.animeId, id));
        await tx.execute(sql`DELETE FROM user_list_items WHERE anime_id = ${id}`);
        await tx.delete(animes).where(eq(animes.id, id));
      });
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
