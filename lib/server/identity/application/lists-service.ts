import { AppError } from '../../shared/errors';
import type { IdentityService } from './identity-service';
import type {
  ListsRepository,
  UserListItemAnime,
  UserListRecord,
} from '../ports/lists-repository';

export class ListsService {
  constructor(
    private readonly lists: ListsRepository,
    private readonly identity: IdentityService,
  ) {}

  async listMine(): Promise<ReadonlyArray<UserListRecord>> {
    const user = await this.identity.requireUser();
    return this.lists.listForUser(user.id);
  }

  async itemsMine(listId: number): Promise<ReadonlyArray<UserListItemAnime>> {
    const user = await this.identity.requireUser();
    this.assertId(listId, '列表');
    const list = await this.lists.getList(user.id, listId);
    if (!list) throw new AppError('RESULT_INVALID', '列表不存在', 404);
    return this.lists.listItems(user.id, listId);
  }

  async createCustom(name: string): Promise<UserListRecord> {
    const user = await this.identity.requireUser();
    const trimmed = name.trim().slice(0, 64);
    if (trimmed.length < 1) {
      throw new AppError('RESULT_INVALID', '列表名称不能为空', 400);
    }
    return this.lists.createCustomList(user.id, trimmed);
  }

  async deleteCustom(listId: number): Promise<void> {
    const user = await this.identity.requireUser();
    this.assertId(listId, '列表');
    await this.lists.deleteCustomList(user.id, listId);
  }

  async addItem(listId: number, animeId: number, note?: string | null): Promise<void> {
    const user = await this.identity.requireUser();
    this.assertId(listId, '列表');
    this.assertId(animeId, '作品');
    const list = await this.lists.getList(user.id, listId);
    if (!list) throw new AppError('RESULT_INVALID', '列表不存在', 404);
    try {
      await this.lists.addItem(user.id, listId, animeId, note?.trim().slice(0, 500) || null);
    } catch (error) {
      if (error instanceof Error && error.message === 'LIST_NOT_FOUND') {
        throw new AppError('RESULT_INVALID', '列表不存在', 404);
      }
      throw error;
    }
  }

  async removeItem(listId: number, animeId: number): Promise<void> {
    const user = await this.identity.requireUser();
    this.assertId(listId, '列表');
    this.assertId(animeId, '作品');
    try {
      await this.lists.removeItem(user.id, listId, animeId);
    } catch (error) {
      if (error instanceof Error && error.message === 'LIST_NOT_FOUND') {
        throw new AppError('RESULT_INVALID', '列表不存在', 404);
      }
      throw error;
    }
  }

  async setNote(listId: number, animeId: number, note: string | null): Promise<void> {
    const user = await this.identity.requireUser();
    this.assertId(listId, '列表');
    this.assertId(animeId, '作品');
    await this.lists.setItemNote(
      user.id,
      listId,
      animeId,
      note == null ? null : note.trim().slice(0, 500) || null,
    );
  }

  private assertId(id: number, label: string): void {
    if (!Number.isFinite(id) || id <= 0) {
      throw new AppError('RESULT_INVALID', `无效的${label} ID`, 400);
    }
  }
}
