import { NextRequest } from 'next/server';
import { getFavoritesService, getIdentityService } from '@/lib/server/identity';
import { listMangaFavorites, toggleMangaFavorite, isMangaFavorite } from '@/lib/server/manga-favorites';
import { AppError } from '@/lib/server/shared/errors';
import { meError, meJson } from '../http';
import { buildMobileFavoritesResponse } from './response';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await getIdentityService().requireUser();
    const [animes, mangas] = await Promise.all([
      getFavoritesService().listMine(),
      listMangaFavorites(),
    ]);
    return meJson(buildMobileFavoritesResponse(animes, mangas));
  } catch (error) {
    return meError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      kind?: string;
      id?: number;
      favorited?: boolean;
    };
    const kind = body.kind === 'manga' ? 'manga' : body.kind === 'anime' ? 'anime' : null;
    const id = Number(body.id);
    if (!kind || !Number.isInteger(id) || id <= 0) {
      throw new AppError('RESULT_INVALID', '无效的收藏对象', 400);
    }

    let favorited: boolean;
    if (kind === 'anime') {
      if (typeof body.favorited === 'boolean') {
        const current = await getFavoritesService().isFavorite(id);
        if (current !== body.favorited) {
          await getFavoritesService().toggle(id);
        }
        favorited = body.favorited;
      } else {
        favorited = (await getFavoritesService().toggle(id)).favorited;
      }
    } else if (typeof body.favorited === 'boolean') {
      const current = await isMangaFavorite(id);
      if (current !== body.favorited) {
        await toggleMangaFavorite(id);
      }
      favorited = body.favorited;
    } else {
      favorited = (await toggleMangaFavorite(id)).favorited;
    }

    return meJson({ kind, id, favorited });
  } catch (error) {
    return meError(error);
  }
}
