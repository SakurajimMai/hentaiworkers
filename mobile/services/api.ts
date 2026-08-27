import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import {
  Anime,
  AnimeListParams,
  AnimeListResponse,
  AuthUser,
  MangaChapterResponse,
  MangaDetail,
  MangaListParams,
  MangaListResponse,
  PublicAdsConfig,
} from './types';

const DEFAULT_API_ORIGIN = 'https://www.ixacg.de';

function resolveApiBaseUrl(): string {
  if (Platform.OS === 'web') return '';

  const extra = (
    Constants.expoConfig?.extra ??
    (Constants as { manifest?: { extra?: { apiBaseUrl?: string } } }).manifest?.extra
  ) as { apiBaseUrl?: string } | undefined;
  const fromEnv = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();
  const fromExtra = extra?.apiBaseUrl?.trim();
  const candidate = (fromEnv || fromExtra || DEFAULT_API_ORIGIN).replace(/\/+$/, '');

  try {
    const parsed = new URL(candidate);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return DEFAULT_API_ORIGIN;
    }
    return parsed.origin;
  } catch {
    return DEFAULT_API_ORIGIN;
  }
}

export const API_BASE_URL = resolveApiBaseUrl();

const SESSION_COOKIE_KEY = '@auth/cookie';
let sessionCookie = '';

export async function loadSessionCookie(): Promise<string> {
  try {
    sessionCookie = (await AsyncStorage.getItem(SESSION_COOKIE_KEY)) || '';
  } catch {
    sessionCookie = '';
  }
  return sessionCookie;
}

export async function clearSessionCookie(): Promise<void> {
  sessionCookie = '';
  try {
    await AsyncStorage.removeItem(SESSION_COOKIE_KEY);
  } catch {
    /* ignore */
  }
}

function cookieFromSetCookie(header: string | null): string {
  if (!header) return '';
  const match = header.match(/animestream_session=[^;]+/i);
  if (match) return match[0];
  return header.split(';')[0].trim();
}

function readSetCookie(headers: Headers): string | null {
  const withGetSetCookie = headers as Headers & { getSetCookie?: () => string[] };
  if (typeof withGetSetCookie.getSetCookie === 'function') {
    const match = withGetSetCookie.getSetCookie().find((value) => /animestream_session=/i.test(value));
    if (match) return match;
  }
  return headers.get('set-cookie');
}

async function persistSessionCookie(headers: Headers): Promise<void> {
  const value = cookieFromSetCookie(readSetCookie(headers));
  if (!value) return;
  sessionCookie = value;
  try {
    await AsyncStorage.setItem(SESSION_COOKIE_KEY, value);
  } catch {
    /* ignore */
  }
}

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

function buildAnimeListQuery(params: AnimeListParams = {}) {
  const query = new URLSearchParams({
    page: String(params.page ?? 1),
    limit: String(params.limit ?? 24),
  });

  if (params.tagId) {
    query.set('tag', String(params.tagId));
  }

  const search = params.search?.trim();
  if (search) {
    query.set('search', search);
  }

  if (params.sort) {
    query.set('sort', params.sort);
  }

  return query.toString();
}

function buildMangaListQuery(params: MangaListParams = {}) {
  const query = new URLSearchParams({
    page: String(params.page ?? 1),
    limit: String(params.limit ?? 24),
  });

  const q = params.q?.trim();
  if (q) query.set('q', q);

  const tag = params.tag?.trim();
  if (tag) query.set('tag', tag);

  if (params.rank) query.set('rank', params.rank);

  return query.toString();
}

async function fetchJson<T>(endpoint: string, init?: RequestInit): Promise<T> {
  if (!sessionCookie) {
    await loadSessionCookie();
  }
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...(init?.headers as Record<string, string> | undefined),
  };
  if (sessionCookie) {
    headers.Cookie = sessionCookie;
  }
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...init,
    headers,
  });
  await persistSessionCookie(response.headers);

  const responseText = await response.text();
  let payload: any = null;
  try {
    payload = responseText ? JSON.parse(responseText) : null;
  } catch {
    if (!response.ok) {
      throw new ApiError(`请求失败：${response.status}`, response.status);
    }
    throw new ApiError('响应不是合法 JSON', response.status);
  }

  if (!response.ok) {
    const rawError = payload?.error;
    const message =
      typeof rawError === 'string'
        ? rawError
        : rawError?.message || `请求失败：${response.status}`;
    throw new ApiError(message, response.status);
  }

  return payload as T;
}

class AnimeApiService {
  async getAnimeList(params: AnimeListParams = {}): Promise<AnimeListResponse> {
    return fetchJson<AnimeListResponse>(`/api/animes?${buildAnimeListQuery(params)}`);
  }

  async getAnimeDetail(id: number): Promise<Anime> {
    return fetchJson<Anime>(`/api/animes/${id}`);
  }

  async getSimilarAnimes(id: number): Promise<Anime[]> {
    return fetchJson<Anime[]>(`/api/animes/${id}/similar`);
  }

  async getPopularTags(limit = 20): Promise<{ id: number; name: string; count?: number }[]> {
    try {
      return await fetchJson(`/api/tags?limit=${limit}`);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) {
        return this.aggregateTagsFromAnimes(limit);
      }
      throw e;
    }
  }

  private async aggregateTagsFromAnimes(
    limit: number,
  ): Promise<{ id: number; name: string; count: number }[]> {
    const list = await this.getAnimeList({ page: 1, limit: 60 });
    const sample = list.data.slice(0, 24);
    const details = await Promise.all(
      sample.map((a) => this.getAnimeDetail(a.id).catch(() => null)),
    );
    const counter = new Map<number, { id: number; name: string; count: number }>();
    for (const detail of details) {
      if (!detail?.tags) continue;
      for (const tag of detail.tags) {
        const existing = counter.get(tag.id);
        if (existing) {
          existing.count += 1;
        } else {
          counter.set(tag.id, { id: tag.id, name: tag.name, count: 1 });
        }
      }
    }
    return [...counter.values()].sort((a, b) => b.count - a.count).slice(0, limit);
  }
}

export const animeApi = new AnimeApiService();

class MangaApiService {
  async getMangaList(params: MangaListParams = {}): Promise<MangaListResponse> {
    return fetchJson<MangaListResponse>(`/api/mangas?${buildMangaListQuery(params)}`);
  }

  async getMangaDetail(id: number): Promise<MangaDetail> {
    return fetchJson<MangaDetail>(`/api/mangas/${id}`);
  }

  async getChapter(id: number, number: number): Promise<MangaChapterResponse> {
    return fetchJson<MangaChapterResponse>(`/api/mangas/${id}/chapters/${number}`);
  }
}

export const mangaApi = new MangaApiService();

class AdsApiService {
  async getAds(): Promise<PublicAdsConfig> {
    return fetchJson<PublicAdsConfig>('/api/ads');
  }
}

export const adsApi = new AdsApiService();

class AuthApiService {
  async login(emailOrUsername: string, password: string): Promise<AuthUser> {
    const payload = await fetchJson<{ user: AuthUser } | { error?: string }>('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ emailOrUsername, password }),
    });
    if (!('user' in payload) || !payload.user) {
      throw new ApiError(('error' in payload && payload.error) || '登录失败', 401);
    }
    return payload.user;
  }

  async logout(): Promise<void> {
    try {
      await fetchJson('/api/auth/logout', { method: 'POST' });
    } finally {
      await clearSessionCookie();
    }
  }

  async me(): Promise<AuthUser | null> {
    const payload = await fetchJson<{ user: AuthUser | null }>('/api/me');
    return payload.user || null;
  }
}

export const authApi = new AuthApiService();

export interface CloudFavoriteAnime {
  id: number;
  title: string;
  cover?: string | null;
  favoritedAt?: string;
}

export interface CloudFavoriteManga {
  id: number;
  title: string;
  coverUrl?: string | null;
  favoritedAt?: string;
}

export interface CloudWatchItem {
  animeId: number;
  title: string;
  cover: string | null;
  lastWatchedAt: string;
  positionSeconds?: number;
  durationSeconds?: number;
  completed?: boolean;
}

export interface CloudMangaProgressItem {
  mangaId: number;
  title: string;
  coverUrl: string | null;
  chapterNumber: number;
  pageIndex: number;
  lastReadAt: string;
}

class MeApiService {
  async getFavorites(): Promise<{ animes: CloudFavoriteAnime[]; mangas: CloudFavoriteManga[] }> {
    return fetchJson('/api/me/favorites');
  }

  async setFavorite(
    kind: 'anime' | 'manga',
    id: number,
    favorited?: boolean,
  ): Promise<{ favorited: boolean }> {
    return fetchJson('/api/me/favorites', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind, id, favorited }),
    });
  }

  async getWatchProgress(): Promise<{ data: CloudWatchItem[] }> {
    return fetchJson('/api/me/watch-progress?limit=50');
  }

  async putWatchProgress(
    animeId: number,
    body: { positionSeconds: number; durationSeconds?: number; completed?: boolean },
  ): Promise<void> {
    await fetchJson(`/api/me/watch-progress/${animeId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  async mergeWatchProgress(
    rows: Array<{
      animeId: number;
      positionSeconds: number;
      durationSeconds: number;
      lastWatchedAt?: string;
    }>,
  ): Promise<void> {
    await fetchJson('/api/me/watch-progress', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rows }),
    });
  }

  async deleteWatchProgress(animeId: number): Promise<void> {
    await fetchJson(`/api/me/watch-progress/${animeId}`, { method: 'DELETE' });
  }

  async deleteAllWatchProgress(): Promise<void> {
    await fetchJson('/api/me/watch-progress', { method: 'DELETE' });
  }

  async getMangaProgress(): Promise<{ data: CloudMangaProgressItem[] }> {
    return fetchJson('/api/me/manga-progress?limit=50');
  }

  async putMangaProgress(
    mangaId: number,
    body: { chapterNumber: number; pageIndex?: number },
  ): Promise<void> {
    await fetchJson(`/api/me/manga-progress/${mangaId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  async mergeMangaProgress(
    rows: Array<{
      mangaId: number;
      chapterNumber: number;
      pageIndex?: number;
      lastReadAt?: string;
    }>,
  ): Promise<void> {
    await fetchJson('/api/me/manga-progress', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rows }),
    });
  }

  async deleteMangaProgress(mangaId: number): Promise<void> {
    await fetchJson(`/api/me/manga-progress/${mangaId}`, { method: 'DELETE' });
  }

  async deleteAllMangaProgress(): Promise<void> {
    await fetchJson('/api/me/manga-progress', { method: 'DELETE' });
  }
}

export const meApi = new MeApiService();
