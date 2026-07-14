import { AppError } from '../../shared/errors';
import type {
  FavoriteAnimeListItem,
  FavoritesRepository,
} from '../ports/favorites-repository';
import type { IdentityService } from './identity-service';

export class FavoritesService {
  constructor(
    private readonly favorites: FavoritesRepository,
    private readonly identity: IdentityService,
  ) {}

  async listMine(): Promise<ReadonlyArray<FavoriteAnimeListItem>> {
    const user = await this.identity.requireUser();
    return this.favorites.listWithAnime(user.id);
  }

  async isFavorite(animeId: number): Promise<boolean> {
    const user = await this.identity.getCurrentUser();
    if (!user) return false;
    if (!Number.isFinite(animeId) || animeId <= 0) return false;
    return this.favorites.isFavorite(user.id, animeId);
  }

  async add(animeId: number): Promise<void> {
    const user = await this.identity.requireUser();
    if (!Number.isFinite(animeId) || animeId <= 0) {
      throw new AppError('RESULT_INVALID', '无效的作品 ID', 400);
    }
    await this.favorites.add(user.id, animeId);
  }

  async remove(animeId: number): Promise<void> {
    const user = await this.identity.requireUser();
    if (!Number.isFinite(animeId) || animeId <= 0) {
      throw new AppError('RESULT_INVALID', '无效的作品 ID', 400);
    }
    await this.favorites.remove(user.id, animeId);
  }

  async toggle(animeId: number): Promise<{ favorited: boolean }> {
    const user = await this.identity.requireUser();
    if (!Number.isFinite(animeId) || animeId <= 0) {
      throw new AppError('RESULT_INVALID', '无效的作品 ID', 400);
    }
    const exists = await this.favorites.isFavorite(user.id, animeId);
    if (exists) {
      await this.favorites.remove(user.id, animeId);
      return { favorited: false };
    }
    await this.favorites.add(user.id, animeId);
    return { favorited: true };
  }
}
