import type {
  AnimeWorkDetail,
  AnimeWorkListQuery,
  AnimeWorkPage,
  AnimeWorkUpdateInput,
} from '../domain/models';

export interface WorksRepository {
  list(query: AnimeWorkListQuery): Promise<AnimeWorkPage>;
  getById(id: number, options?: { activeOnly?: boolean }): Promise<AnimeWorkDetail | null>;
  setActive(id: number, isActive: boolean): Promise<void>;
  setActiveMany(ids: readonly number[], isActive: boolean): Promise<number>;
  delete(id: number): Promise<boolean>;
  deleteMany(ids: readonly number[]): Promise<number>;
  update(id: number, input: AnimeWorkUpdateInput): Promise<void>;
}
