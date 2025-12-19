const API_URL = '/api';

export interface Tag {
  id: number;
  name: string;
  description?: string;
}

export interface Anime {
  id: number;
  title: string;
  titleEnglish?: string;
  titleJapanese?: string;
  description?: string;
  cover?: string;
  fanart?: string;
  videoUrl: string;
  viewCount?: number;
  createdAt?: string;
  tags?: Tag[];
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface AnimeListResponse {
  data: Anime[];
  pagination: Pagination;
}

export async function getAnimes(page = 1, limit = 50, tagId?: number, search?: string): Promise<AnimeListResponse> {
  const params = new URLSearchParams({
    page: page.toString(),
    limit: limit.toString(),
  });
  if (tagId) params.append('tag', tagId.toString());
  if (search) params.append('search', search);

  const res = await fetch(`${API_URL}/animes?${params.toString()}`);
  if (!res.ok) throw new Error('Failed to fetch animes');
  return res.json();
}

export async function getAnime(idStr: string): Promise<Anime> {
  const res = await fetch(`${API_URL}/animes/${idStr}`);
  if (!res.ok) throw new Error('Not found');
  return res.json();
}

export async function getSimilarAnimes(idStr: string): Promise<Anime[]> {
  const res = await fetch(`${API_URL}/animes/${idStr}/similar`);
  if (!res.ok) throw new Error('Failed to fetch similar animes');
  return res.json();
}
