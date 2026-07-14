import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AnimeCard } from '@/components/AnimeCard';
import { getFavoritesService, getIdentityService } from '@/lib/server/identity';
import { actionPublicLogout, actionRemoveFavorite } from '../auth/actions';

export const dynamic = 'force-dynamic';

export default async function FavoritesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const sp = await searchParams;
  const user = await getIdentityService().getCurrentUser();
  if (!user) {
    redirect('/login?next=/favorites');
  }

  const items = await getFavoritesService().listMine();

  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 py-8 sm:py-12 space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <p className="font-meta mb-2">Library</p>
          <h1 className="font-serif text-3xl">我的收藏</h1>
          <p className="mt-2 font-ui text-sm text-[#787774]">
            {user.displayName || user.username} · 共 {items.length} 部
          </p>
        </div>
        <form action={actionPublicLogout}>
          <button type="submit" className="btn-ghost">
            退出登录
          </button>
        </form>
      </div>

      {sp.error && (
        <p className="font-ui text-sm text-[#C5221F]">操作失败，请重试。</p>
      )}

      {items.length === 0 ? (
        <div className="surface-card p-10 text-center space-y-3">
          <p className="font-ui text-[#787774]">还没有收藏，去片库看看吧。</p>
          <Link href="/browse" className="btn-ink inline-flex">
            浏览片库
          </Link>
        </div>
      ) : (
        <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-5">
          {items.map((anime) => (
            <li key={anime.id} className="space-y-2">
              <AnimeCard
                anime={{
                  id: anime.id,
                  title: anime.title,
                  cover: anime.cover,
                  viewCount: anime.viewCount,
                }}
              />
              <form action={actionRemoveFavorite}>
                <input type="hidden" name="animeId" value={anime.id} />
                <button
                  type="submit"
                  className="w-full font-ui text-[12px] text-[#787774] hover:text-[#C5221F] py-1"
                >
                  取消收藏
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
