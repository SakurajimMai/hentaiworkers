import { and, desc, eq, like, or, sql } from 'drizzle-orm';
import type { MySqlTransaction } from 'drizzle-orm/mysql-core';
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
import { nowIso } from '@/lib/utils';
import type {
  AdminAnimeListItem,
  AdminAnimeSaveInput,
  AdminCatalogRepository,
  AdminTagSaveInput,
} from '../../catalog/application/admin-catalog-service';

type Tx = MySqlTransaction<any, any>;

/**
 * Hard-delete one anime and every dependent row that references it.
 * `user_list_items` is not in drizzle schema (lists repo uses raw SQL).
 * Order: dependents first, then `animes` (anime_tags has FK to animes without CASCADE).
 */
async function deleteAnimeAndDependents(executor: typeof db | Tx, id: number): Promise<void> {
  await executor.delete(animeTags).where(eq(animeTags.animeId, id));
  await executor.delete(mediaSources).where(eq(mediaSources.animeId, id));
  await executor.delete(userWatchProgress).where(eq(userWatchProgress.animeId, id));
  await executor.delete(userFavorites).where(eq(userFavorites.animeId, id));
  await executor.delete(userEvents).where(eq(userEvents.animeId, id));
  // user_list_items lives outside drizzle schema; keep the same transaction.
  await executor.execute(sql`DELETE FROM user_list_items WHERE anime_id = ${id}`);
  await executor.delete(animes).where(eq(animes.id, id));
}

async function insertAnimeReturningId(
  executor: typeof db | Tx,
  values: typeof animes.$inferInsert,
): Promise<number> {
  const result = await executor.insert(animes).values(values);
  const header = Array.isArray(result) ? result[0] : result;
  const insertId = Number((header as { insertId?: number })?.insertId ?? 0);
  if (insertId > 0) return insertId;

  // Fallback for drivers that omit insertId on the drizzle wrapper.
  const [rows] = await pool.query('SELECT LAST_INSERT_ID() AS id');
  const id = Number((rows as Array<{ id: number }>)[0]?.id ?? 0);
  if (!id) throw new Error('Failed to resolve insert id');
  return id;
}

async function replaceAnimeTags(
  executor: typeof db | Tx,
  animeId: number,
  tagIds: readonly number[],
) {
  await executor.delete(animeTags).where(eq(animeTags.animeId, animeId));
  if (!tagIds.length) return;
  await executor.insert(animeTags).values(
    tagIds.map((tagId) => ({
      animeId,
      tagId,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    })),
  );
}

export class MariaDbAdminCatalogRepository implements AdminCatalogRepository {
  saveAnimeTransactional(input: AdminAnimeSaveInput): Promise<number> {
    return withDbRetry(async () => {
      const payload = {
        title: input.title,
        titleEnglish: input.titleEnglish ?? null,
        titleJapanese: input.titleJapanese ?? null,
        description: input.description ?? null,
        cover: input.cover ?? null,
        fanart: input.fanart ?? null,
        videoUrl: input.videoUrl,
        isActive: input.isActive ?? 1,
        updatedAt: nowIso(),
      };
      const tagIds = input.tagIds ?? [];

      return db.transaction(async (tx) => {
        let animeId = input.id && Number.isFinite(input.id) ? Number(input.id) : null;
        if (animeId) {
          await tx.update(animes).set(payload).where(eq(animes.id, animeId));
        } else {
          animeId = await insertAnimeReturningId(tx, {
            ...payload,
            viewCount: 0,
            favoriteCount: 0,
            createdAt: nowIso(),
          });
        }
        await replaceAnimeTags(tx, animeId, tagIds);
        return animeId;
      });
    });
  }

  deleteAnimeTransactional(id: number): Promise<void> {
    return withDbRetry(async () => {
      await db.transaction(async (tx) => {
        await deleteAnimeAndDependents(tx, id);
      });
    });
  }

  setAnimeActive(id: number, isActive: number): Promise<void> {
    return withDbRetry(async () => {
      await db
        .update(animes)
        .set({ isActive, updatedAt: nowIso() })
        .where(eq(animes.id, id));
    });
  }

  saveTag(input: AdminTagSaveInput): Promise<number> {
    return withDbRetry(async () => {
      if (input.id) {
        await db
          .update(tags)
          .set({
            name: input.name,
            description: input.description ?? null,
            updatedAt: nowIso(),
          })
          .where(eq(tags.id, input.id));
        return input.id;
      }
      const result = await db.insert(tags).values({
        name: input.name,
        description: input.description ?? null,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      });
      const header = Array.isArray(result) ? result[0] : result;
      const insertId = Number((header as { insertId?: number })?.insertId ?? 0);
      if (insertId) return insertId;
      const [row] = await db.select().from(tags).where(eq(tags.name, input.name)).limit(1);
      if (!row) throw new Error('Failed to create tag');
      return row.id;
    });
  }

  deleteTagIfUnlinked(id: number): Promise<void> {
    return withDbRetry(async () => {
      await db.delete(tags).where(eq(tags.id, id));
    });
  }

  countTagLinks(tagId: number): Promise<number> {
    return withDbRetry(async () => {
      const [row] = await db
        .select({ count: sql<number>`count(*)` })
        .from(animeTags)
        .where(eq(animeTags.tagId, tagId));
      return Number(row?.count ?? 0);
    });
  }

  searchAnimes(q: string, page: number): Promise<{ data: AdminAnimeListItem[]; total: number }> {
    return withDbRetry(async () => {
      const limit = 30;
      const offset = (Math.max(1, page) - 1) * limit;
      const where = q
        ? or(like(animes.title, `%${q}%`), like(animes.titleJapanese, `%${q}%`))
        : undefined;
      const data = await db
        .select({
          id: animes.id,
          title: animes.title,
          cover: animes.cover,
          isActive: animes.isActive,
          viewCount: animes.viewCount,
          videoUrl: animes.videoUrl,
        })
        .from(animes)
        .where(where)
        .orderBy(desc(animes.id))
        .limit(limit)
        .offset(offset);
      const [countRow] = await db
        .select({ count: sql<number>`count(*)` })
        .from(animes)
        .where(where);
      return { data, total: Number(countRow.count) };
    });
  }
}

let defaultAdminRepo: MariaDbAdminCatalogRepository | undefined;

export function getMariaDbAdminCatalogRepository(): MariaDbAdminCatalogRepository {
  defaultAdminRepo ??= new MariaDbAdminCatalogRepository();
  return defaultAdminRepo;
}
