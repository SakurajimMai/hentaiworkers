import { and, desc, eq, like, or, sql } from 'drizzle-orm';
import type { MySqlTransaction } from 'drizzle-orm/mysql-core';
import { db, pool, withDbRetry } from '@/lib/db';
import { animeTags, animes, tags } from '@/lib/schema';
import { nowIso } from '@/lib/utils';
import type {
  AdminAnimeListItem,
  AdminAnimeSaveInput,
  AdminCatalogRepository,
  AdminTagSaveInput,
  ImportAnimeItem,
  ImportResult,
} from '../../catalog/application/admin-catalog-service';

type Tx = MySqlTransaction<any, any>;

async function insertAnimeReturningId(
  executor: typeof db | Tx,
  values: typeof animes.$inferInsert,
): Promise<number> {
  const result = await executor.insert(animes).values(values);
  const header = Array.isArray(result) ? result[0] : result;
  const insertId = Number((header as { insertId?: number })?.insertId ?? 0);
  if (insertId > 0) return insertId;

  // Fallback for drivers that omit insertId on the drizzle wrapper.
  const [rows] = await pool.query<{ id: number }[]>(
    'SELECT LAST_INSERT_ID() AS id',
  );
  const id = Number((rows as unknown as Array<{ id: number }>)[0]?.id ?? 0);
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

async function resolveTagIdsByName(
  executor: typeof db | Tx,
  names: readonly string[],
): Promise<number[]> {
  const resolved: number[] = [];
  for (const raw of names) {
    const name = raw.trim();
    if (!name) continue;
    const [existing] = await executor.select().from(tags).where(eq(tags.name, name)).limit(1);
    if (existing) {
      resolved.push(existing.id);
      continue;
    }
    const result = await executor.insert(tags).values({
      name,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    });
    const header = Array.isArray(result) ? result[0] : result;
    let tagId = Number((header as { insertId?: number })?.insertId ?? 0);
    if (!tagId) {
      const [created] = await executor.select().from(tags).where(eq(tags.name, name)).limit(1);
      tagId = created?.id ?? 0;
    }
    if (tagId) resolved.push(tagId);
  }
  return resolved;
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
        await tx.delete(animeTags).where(eq(animeTags.animeId, id));
        await tx.delete(animes).where(eq(animes.id, id));
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

  importBatch(items: readonly ImportAnimeItem[]): Promise<ImportResult> {
    return withDbRetry(async () => {
      let created = 0;
      let updated = 0;
      let skipped = 0;
      const errors: Array<{ index: number; message: string }> = [];

      for (let index = 0; index < items.length; index += 1) {
        const item = items[index];
        try {
          const title = String(item.title || '').trim();
          const videoUrl = String(item.videoUrl || item.video_url || '').trim();
          if (!title || !videoUrl) {
            skipped += 1;
            continue;
          }

          const tagNames = Array.isArray(item.tags)
            ? (item.tags as unknown[]).map(String)
            : [];

          await db.transaction(async (tx) => {
            const base = {
              title,
              titleEnglish: item.titleEnglish
                ? String(item.titleEnglish)
                : item.title_english
                  ? String(item.title_english)
                  : null,
              titleJapanese: item.titleJapanese
                ? String(item.titleJapanese)
                : item.title_japanese
                  ? String(item.title_japanese)
                  : null,
              description: item.description ? String(item.description) : null,
              cover: item.cover ? String(item.cover) : null,
              fanart: item.fanart ? String(item.fanart) : null,
              videoUrl,
              isActive: item.isActive === 0 || item.is_active === 0 ? 0 : 1,
              updatedAt: nowIso(),
            };

            let animeId: number | null = item.id ? parseInt(String(item.id), 10) : null;
            let didUpdate = false;

            if (animeId && Number.isFinite(animeId)) {
              const [exists] = await tx
                .select({ id: animes.id })
                .from(animes)
                .where(eq(animes.id, animeId))
                .limit(1);
              if (exists) {
                await tx.update(animes).set(base).where(eq(animes.id, animeId));
                didUpdate = true;
              } else {
                animeId = null;
              }
            }

            if (!animeId) {
              animeId = await insertAnimeReturningId(tx, {
                ...base,
                viewCount: 0,
                favoriteCount: 0,
                createdAt: nowIso(),
              });
            }

            if (tagNames.length) {
              const tagIds = await resolveTagIdsByName(tx, tagNames);
              await replaceAnimeTags(tx, animeId, tagIds);
            }

            if (didUpdate) updated += 1;
            else created += 1;
          });
        } catch (error) {
          errors.push({
            index,
            message: error instanceof Error ? error.message : 'import failed',
          });
        }
      }

      return { created, updated, skipped, errors };
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
