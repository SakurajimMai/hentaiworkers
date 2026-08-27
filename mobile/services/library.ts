import { meApi, ApiError } from './api';
import { getCachedUser } from './session';
import {
  FavoriteItem,
  HistoryItem,
  MangaFavoriteItem,
  MangaHistoryItem,
  favoritesStore,
  historyStore,
  mangaFavoritesStore,
  mangaHistoryStore,
} from './storage';
import { Anime, MangaSummary } from './types';

function cloudTime(value?: string): number {
  const parsed = value ? Date.parse(value) : NaN;
  return Number.isFinite(parsed) ? parsed : Date.now();
}

function loggedIn(): boolean {
  return Boolean(getCachedUser());
}

function isAuthError(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 401 || error.status === 403);
}

export async function listFavorites(): Promise<{
  animes: FavoriteItem[];
  mangas: MangaFavoriteItem[];
}> {
  if (loggedIn()) {
    try {
      const payload = await meApi.getFavorites();
      return {
        animes: (payload.animes || []).map((item) => ({
          id: item.id,
          title: item.title,
          cover: item.cover ?? null,
          favoritedAt: cloudTime(item.favoritedAt),
        })),
        mangas: (payload.mangas || []).map((item) => ({
          id: item.id,
          title: item.title,
          coverUrl: item.coverUrl ?? null,
          favoritedAt: cloudTime(item.favoritedAt),
        })),
      };
    } catch (error) {
      if (!isAuthError(error)) {
        /* keep going to local cache */
      }
    }
  }
  const [animes, mangas] = await Promise.all([favoritesStore.list(), mangaFavoritesStore.list()]);
  return { animes, mangas };
}

export async function isAnimeFavorite(id: number): Promise<boolean> {
  const { animes } = await listFavorites();
  return animes.some((item) => item.id === id);
}

export async function isMangaFavorite(id: number): Promise<boolean> {
  const { mangas } = await listFavorites();
  return mangas.some((item) => item.id === id);
}

export async function toggleAnimeFavorite(anime: Anime): Promise<boolean> {
  if (loggedIn()) {
    try {
      const result = await meApi.setFavorite('anime', anime.id);
      await favoritesStore.toggle(anime).catch(() => undefined);
      return result.favorited;
    } catch (error) {
      if (!isAuthError(error)) throw error;
    }
  }
  return favoritesStore.toggle(anime);
}

export async function toggleMangaFavorite(
  manga: Pick<MangaSummary, 'id' | 'title' | 'coverUrl' | 'author'>,
): Promise<boolean> {
  if (loggedIn()) {
    try {
      const result = await meApi.setFavorite('manga', manga.id);
      await mangaFavoritesStore.toggle(manga).catch(() => undefined);
      return result.favorited;
    } catch (error) {
      if (!isAuthError(error)) throw error;
    }
  }
  return mangaFavoritesStore.toggle(manga);
}

export async function removeAnimeFavorite(id: number): Promise<void> {
  if (loggedIn()) {
    try {
      await meApi.setFavorite('anime', id, false);
    } catch (error) {
      if (!isAuthError(error)) throw error;
    }
  }
  await favoritesStore.remove(id);
}

export async function removeMangaFavorite(id: number): Promise<void> {
  if (loggedIn()) {
    try {
      await meApi.setFavorite('manga', id, false);
    } catch (error) {
      if (!isAuthError(error)) throw error;
    }
  }
  await mangaFavoritesStore.remove(id);
}

export async function listHistory(): Promise<{
  animes: HistoryItem[];
  mangas: MangaHistoryItem[];
}> {
  if (loggedIn()) {
    try {
      const [watch, manga] = await Promise.all([meApi.getWatchProgress(), meApi.getMangaProgress()]);
      return {
        animes: (watch.data || []).map((item) => ({
          id: item.animeId,
          title: item.title,
          cover: item.cover,
          watchedAt: cloudTime(item.lastWatchedAt),
        })),
        mangas: (manga.data || []).map((item) => ({
          id: item.mangaId,
          title: item.title,
          coverUrl: item.coverUrl,
          chapterNumber: item.chapterNumber,
          readAt: cloudTime(item.lastReadAt),
        })),
      };
    } catch (error) {
      if (!isAuthError(error)) {
        /* fall through */
      }
    }
  }
  const [animes, mangas] = await Promise.all([historyStore.list(), mangaHistoryStore.list()]);
  return { animes, mangas };
}

export async function recordAnimeHistory(anime: Anime): Promise<void> {
  await historyStore.push(anime);
  if (!loggedIn()) return;
  try {
    await meApi.putWatchProgress(anime.id, {
      positionSeconds: 1,
      durationSeconds: 0,
    });
  } catch {
    /* keep local */
  }
}

export async function recordMangaHistory(
  manga: Pick<MangaSummary, 'id' | 'title' | 'coverUrl'>,
  chapterNumber: number,
  pageIndex = 0,
): Promise<void> {
  await mangaHistoryStore.push(manga, chapterNumber);
  if (!loggedIn()) return;
  try {
    await meApi.putMangaProgress(manga.id, { chapterNumber, pageIndex });
  } catch {
    /* keep local */
  }
}

export async function removeHistoryItem(kind: 'anime' | 'manga', id: number): Promise<void> {
  if (kind === 'anime') {
    await historyStore.remove(id);
    if (loggedIn()) {
      try {
        await meApi.deleteWatchProgress(id);
      } catch {
        /* ignore */
      }
    }
    return;
  }
  await mangaHistoryStore.remove(id);
  if (loggedIn()) {
    try {
      await meApi.deleteMangaProgress(id);
    } catch {
      /* ignore */
    }
  }
}

export async function clearHistory(): Promise<void> {
  await Promise.all([historyStore.clear(), mangaHistoryStore.clear()]);
  if (!loggedIn()) return;
  try {
    await Promise.all([meApi.deleteAllWatchProgress(), meApi.deleteAllMangaProgress()]);
  } catch {
    /* ignore */
  }
}

export async function syncLibraryAfterLogin(): Promise<void> {
  const [localAnimes, localMangas, localAnimeHistory, localMangaHistory] = await Promise.all([
    favoritesStore.list(),
    mangaFavoritesStore.list(),
    historyStore.list(),
    mangaHistoryStore.list(),
  ]);

  try {
    await Promise.all(
      localAnimes.map((item) => meApi.setFavorite('anime', item.id, true).catch(() => undefined)),
    );
    await Promise.all(
      localMangas.map((item) => meApi.setFavorite('manga', item.id, true).catch(() => undefined)),
    );
    if (localAnimeHistory.length) {
      await meApi.mergeWatchProgress(
        localAnimeHistory.map((item) => ({
          animeId: item.id,
          positionSeconds: 1,
          durationSeconds: 0,
          lastWatchedAt: new Date(item.watchedAt).toISOString(),
        })),
      );
    }
    if (localMangaHistory.length) {
      await meApi.mergeMangaProgress(
        localMangaHistory.map((item) => ({
          mangaId: item.id,
          chapterNumber: item.chapterNumber,
          lastReadAt: new Date(item.readAt).toISOString(),
        })),
      );
    }
  } catch {
    /* first sync is best-effort */
  }
}
