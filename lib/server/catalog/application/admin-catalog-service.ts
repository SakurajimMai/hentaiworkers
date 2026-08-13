import { AppError } from '../../shared/errors';
import type { CatalogWriteAnimeInput } from '../ports/catalog-write-repository';

export type AdminAnimeSaveInput = CatalogWriteAnimeInput & Readonly<{
  id?: number | null;
}>;

export type AdminTagSaveInput = Readonly<{
  id?: number | null;
  name: string;
  description?: string | null;
}>;

export type AdminAnimeListItem = Readonly<{
  id: number;
  title: string;
  cover: string | null;
  isActive: number | null;
  viewCount: number | null;
  videoUrl: string;
}>;

/**
 * Port for transactional admin catalog operations.
 * Implemented by MariaDB adapter with real transactions.
 */
export interface AdminCatalogRepository {
  saveAnimeTransactional(input: AdminAnimeSaveInput): Promise<number>;
  deleteAnimeTransactional(id: number): Promise<void>;
  setAnimeActive(id: number, isActive: number): Promise<void>;
  saveTag(input: AdminTagSaveInput): Promise<number>;
  deleteTagIfUnlinked(id: number): Promise<void>;
  searchAnimes(q: string, page: number): Promise<{ data: AdminAnimeListItem[]; total: number }>;
  countTagLinks(tagId: number): Promise<number>;
}

export class AdminCatalogService {
  constructor(private readonly repository: AdminCatalogRepository) {}

  async saveAnime(input: AdminAnimeSaveInput): Promise<number> {
    const title = input.title.trim();
    const videoUrl = input.videoUrl.trim();
    if (!title || !videoUrl) {
      throw new AppError('RESULT_INVALID', '标题与视频地址必填', 400);
    }
    return this.repository.saveAnimeTransactional({
      ...input,
      title,
      videoUrl,
    });
  }

  deleteAnime(id: number): Promise<void> {
    if (!Number.isFinite(id)) {
      throw new AppError('RESULT_INVALID', '无效 ID', 400);
    }
    return this.repository.deleteAnimeTransactional(id);
  }

  setAnimeActive(id: number, isActive: number): Promise<void> {
    return this.repository.setAnimeActive(id, isActive);
  }

  async saveTag(input: AdminTagSaveInput): Promise<number> {
    const name = input.name.trim();
    if (!name) {
      throw new AppError('RESULT_INVALID', '名称必填', 400);
    }
    return this.repository.saveTag({ ...input, name });
  }

  async deleteTag(id: number): Promise<void> {
    const linked = await this.repository.countTagLinks(id);
    if (linked > 0) {
      throw new AppError('RESULT_CONFLICT', `仍有 ${linked} 部作品使用该标签`, 409, false, {
        count: linked,
      });
    }
    return this.repository.deleteTagIfUnlinked(id);
  }

  searchAnimes(q: string, page: number) {
    return this.repository.searchAnimes(q, page);
  }
}
