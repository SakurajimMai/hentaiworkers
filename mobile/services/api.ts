import Constants from 'expo-constants';
import { Platform } from 'react-native';
import {
  Anime,
  AnimeListParams,
  AnimeListResponse,
  MangaChapterResponse,
  MangaDetail,
  MangaListParams,
  MangaListResponse,
} from './types';

function resolveApiBaseUrl(): string {
  if (Platform.OS === 'web') return '';

  const extra = Constants.expoConfig?.extra as { apiBaseUrl?: string } | undefined;
  const fromEnv = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();
  const fromExtra = extra?.apiBaseUrl?.trim();
  const candidate = (fromEnv || fromExtra || '').replace(/\/+$/, '');

  if (!candidate) {
    throw new Error(
      'Mobile API base URL is required. Set EXPO_PUBLIC_API_BASE_URL or expo.extra.apiBaseUrl.',
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new Error('Mobile API base URL must be an absolute HTTP(S) origin');
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Mobile API base URL only supports HTTP(S)');
  }
  if (parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw new Error('Mobile API base URL must not include path, query, or hash');
  }
  return parsed.origin;
}

export const API_BASE_URL = resolveApiBaseUrl();

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

async function fetchJson<T>(endpoint: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    headers: {
      Accept: 'application/json',
    },
  });

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
    const message = payload?.error || `请求失败：${response.status}`;
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
