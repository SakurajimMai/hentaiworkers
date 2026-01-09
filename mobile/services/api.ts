import { Anime, PaginatedResponse, ApiResponse } from './types';

const API_BASE_URL = 'https://anime.ixacg.top';

class AnimeApiService {
  private async fetchApi<T>(endpoint: string): Promise<T> {
    try {
      const response = await fetch(`${API_BASE_URL}${endpoint}`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error('API fetch error:', error);
      throw error;
    }
  }

  async getAnimeList(page: number = 1, limit: number = 20): Promise<PaginatedResponse<Anime>> {
    return this.fetchApi<PaginatedResponse<Anime>>(`/api/animes?page=${page}&limit=${limit}`);
  }

  async getAnimeDetail(id: number): Promise<ApiResponse<Anime>> {
    return this.fetchApi<ApiResponse<Anime>>(`/api/animes/${id}`);
  }

  async searchAnime(query: string, page: number = 1): Promise<PaginatedResponse<Anime>> {
    return this.fetchApi<PaginatedResponse<Anime>>(`/api/animes/search?q=${encodeURIComponent(query)}&page=${page}`);
  }
}

export const animeApi = new AnimeApiService();
