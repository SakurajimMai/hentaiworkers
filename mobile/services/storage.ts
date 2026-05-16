import AsyncStorage from '@react-native-async-storage/async-storage';
import { Anime } from './types';

const HISTORY_KEY = '@anime/history';
const FAVORITES_KEY = '@anime/favorites';
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
