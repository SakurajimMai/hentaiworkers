// API 响应类型定义

export interface Anime {
  id: number;
  title: string;
  poster?: string;
  fanart?: string;
  plot?: string;
  year?: number;
  rating?: number;
  genre?: string[];
  episodes?: Episode[];
}

export interface Episode {
  id: number;
  title: string;
  episode: number;
  season?: number;
  videoUrl?: string;
  thumbnail?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  page: number;
  totalPages: number;
  total: number;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}
