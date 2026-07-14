import { and, desc, eq } from 'drizzle-orm';
import { db, withDbRetry } from '@/lib/db';
import { animes, userFavorites } from '@/lib/schema';
import type {
  FavoriteAnimeListItem,
  FavoritesRepository,
} from '../../identity/ports/favorites-repository';

function asIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (value == null) return new Date().toISOString();
  const s = String(value);
  if (s.includes('T')) return s;
  return `${s.replace(' ', 'T')}Z`;
}

export class MariaDbFavoritesRepository implements FavoritesRepository {
  listAnimeIds(userId: number): Promise<ReadonlyArray<number>> {
    return withDbRetry(async () => {
      const rows = await db
        .select({ animeId: userFavorites.animeId })
        .from(userFavorites)
        .where(eq(userFavorites.userId, userId))
        .orderBy(desc(userFavorites.createdAt));
      return rows.map((r) => r.animeId);
    });
  }

  listWithAnime(userId: number): Promise<ReadonlyArray<FavoriteAnimeListItem>> {
    return withDbRetry(async () => {
      const rows = await db
        .select({
          id: animes.id,
          title: animes.title,
          cover: animes.cover,
          viewCount: animes.viewCount,
          titleEnglish: animes.titleEnglish,
          favoritedAt: userFavorites.createdAt,
        })
        .from(userFavorites)
        .innerJoin(animes, eq(userFavorites.animeId, animes.id))
        .where(eq(userFavorites.userId, userId))
        .orderBy(desc(userFavorites.createdAt));

      return rows.map((row) => ({
        id: row.id,
        title: row.title,
        cover: row.cover,
        viewCount: row.viewCount,
        titleEnglish: row.titleEnglish,
        favoritedAt: asIso(row.favoritedAt),
      }));
    });
  }

  isFavorite(userId: number, animeId: number): Promise<boolean> {
    return withDbRetry(async () => {
      const [row] = await db
        .select({ id: userFavorites.id })
        .from(userFavorites)
        .where(
          and(eq(userFavorites.userId, userId), eq(userFavorites.animeId, animeId)),
        )
        .limit(1);
      return !!row;
    });
  }

  add(userId: number, animeId: number): Promise<void> {
    return withDbRetry(async () => {
      try {
        await db.insert(userFavorites).values({ userId, animeId });
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        // Idempotent: already favorited is success
        if (!/Duplicate/i.test(msg)) throw error;
      }
    });
  }

  remove(userId: number, animeId: number): Promise<void> {
    return withDbRetry(async () => {
      await db
        .delete(userFavorites)
        .where(
          and(eq(userFavorites.userId, userId), eq(userFavorites.animeId, animeId)),
        );
    });
  }
}
