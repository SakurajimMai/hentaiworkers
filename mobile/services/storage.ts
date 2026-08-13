import AsyncStorage from '@react-native-async-storage/async-storage';
import { Anime, MangaSummary } from './types';

const HISTORY_KEY = '@anime/history';
const FAVORITES_KEY = '@anime/favorites';
const MANGA_HISTORY_KEY = '@manga/history';
const MANGA_FAVORITES_KEY = '@manga/favorites';
const HISTORY_LIMIT = 50;

export interface HistoryItem {
  id: number;
  title: string;
  cover?: string | null;
  titleJapanese?: string | null;
  watchedAt: number;
}

export interface FavoriteItem {
  id: number;
  title: string;
  cover?: string | null;
  titleJapanese?: string | null;
  releaseYear?: number | null;
  favoritedAt: number;
}

async function readJson<T>(key: string): Promise<T[]> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeJson<T>(key: string, value: T[]): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

export const historyStore = {
  async list(): Promise<HistoryItem[]> {
    return readJson<HistoryItem>(HISTORY_KEY);
  },
  async push(anime: Anime): Promise<void> {
    const list = await readJson<HistoryItem>(HISTORY_KEY);
    const filtered = list.filter((item) => item.id !== anime.id);
    const next: HistoryItem[] = [
      {
        id: anime.id,
        title: anime.title,
        cover: anime.cover ?? null,
        titleJapanese: anime.titleJapanese ?? null,
        watchedAt: Date.now(),
      },
      ...filtered,
    ].slice(0, HISTORY_LIMIT);
    await writeJson(HISTORY_KEY, next);
  },
  async remove(id: number): Promise<void> {
    const list = await readJson<HistoryItem>(HISTORY_KEY);
    await writeJson(HISTORY_KEY, list.filter((item) => item.id !== id));
  },
  async clear(): Promise<void> {
    await AsyncStorage.removeItem(HISTORY_KEY);
  },
};

export const favoritesStore = {
  async list(): Promise<FavoriteItem[]> {
    return readJson<FavoriteItem>(FAVORITES_KEY);
  },
  async has(id: number): Promise<boolean> {
    const list = await readJson<FavoriteItem>(FAVORITES_KEY);
    return list.some((item) => item.id === id);
  },
  async toggle(anime: Anime): Promise<boolean> {
    const list = await readJson<FavoriteItem>(FAVORITES_KEY);
    const exists = list.some((item) => item.id === anime.id);
    if (exists) {
      await writeJson(FAVORITES_KEY, list.filter((item) => item.id !== anime.id));
      return false;
    }
    const next: FavoriteItem[] = [
      {
        id: anime.id,
        title: anime.title,
        cover: anime.cover ?? null,
        titleJapanese: anime.titleJapanese ?? null,
        releaseYear: anime.releaseYear ?? null,
        favoritedAt: Date.now(),
      },
      ...list,
    ];
    await writeJson(FAVORITES_KEY, next);
    return true;
  },
  async remove(id: number): Promise<void> {
    const list = await readJson<FavoriteItem>(FAVORITES_KEY);
    await writeJson(FAVORITES_KEY, list.filter((item) => item.id !== id));
  },
};

export interface MangaHistoryItem {
  id: number;
  title: string;
  coverUrl?: string | null;
  chapterNumber: number;
  readAt: number;
}

export interface MangaFavoriteItem {
  id: number;
  title: string;
  coverUrl?: string | null;
  author?: string | null;
  favoritedAt: number;
}

export const mangaHistoryStore = {
  async list(): Promise<MangaHistoryItem[]> {
    return readJson<MangaHistoryItem>(MANGA_HISTORY_KEY);
  },
  async push(manga: Pick<MangaSummary, 'id' | 'title' | 'coverUrl'>, chapterNumber: number): Promise<void> {
    const list = await readJson<MangaHistoryItem>(MANGA_HISTORY_KEY);
    const filtered = list.filter((item) => item.id !== manga.id);
    const next: MangaHistoryItem[] = [
      {
        id: manga.id,
        title: manga.title,
        coverUrl: manga.coverUrl ?? null,
        chapterNumber,
        readAt: Date.now(),
      },
      ...filtered,
    ].slice(0, HISTORY_LIMIT);
    await writeJson(MANGA_HISTORY_KEY, next);
  },
  async remove(id: number): Promise<void> {
    const list = await readJson<MangaHistoryItem>(MANGA_HISTORY_KEY);
    await writeJson(MANGA_HISTORY_KEY, list.filter((item) => item.id !== id));
  },
  async clear(): Promise<void> {
    await AsyncStorage.removeItem(MANGA_HISTORY_KEY);
  },
};

export const mangaFavoritesStore = {
  async list(): Promise<MangaFavoriteItem[]> {
    return readJson<MangaFavoriteItem>(MANGA_FAVORITES_KEY);
  },
  async has(id: number): Promise<boolean> {
    const list = await readJson<MangaFavoriteItem>(MANGA_FAVORITES_KEY);
    return list.some((item) => item.id === id);
  },
  async toggle(manga: Pick<MangaSummary, 'id' | 'title' | 'coverUrl' | 'author'>): Promise<boolean> {
    const list = await readJson<MangaFavoriteItem>(MANGA_FAVORITES_KEY);
    const exists = list.some((item) => item.id === manga.id);
    if (exists) {
      await writeJson(MANGA_FAVORITES_KEY, list.filter((item) => item.id !== manga.id));
      return false;
    }
    const next: MangaFavoriteItem[] = [
      {
        id: manga.id,
        title: manga.title,
        coverUrl: manga.coverUrl ?? null,
        author: manga.author ?? null,
        favoritedAt: Date.now(),
      },
      ...list,
    ];
    await writeJson(MANGA_FAVORITES_KEY, next);
    return true;
  },
  async remove(id: number): Promise<void> {
    const list = await readJson<MangaFavoriteItem>(MANGA_FAVORITES_KEY);
    await writeJson(MANGA_FAVORITES_KEY, list.filter((item) => item.id !== id));
  },
};
