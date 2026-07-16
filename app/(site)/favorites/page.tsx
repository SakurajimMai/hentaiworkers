import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AnimeCard } from '@/components/AnimeCard';
import { ConfirmSubmitButton } from '@/components/confirm-submit-button';
import { getIdentityService, getListsService } from '@/lib/server/identity';
import {
  actionCreateList,
  actionDeleteList,
  actionPublicLogout,
  actionRemoveFromList,
  actionSetListItemNote,
} from '../auth/actions';

export const dynamic = 'force-dynamic';

export default async function FavoritesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; list?: string; ok?: string }>;
}) {
  const sp = await searchParams;
  const user = await getIdentityService().getCurrentUser();
  if (!user) {
    redirect('/login?next=/favorites');
  }

  const lists = await getListsService().listMine();
  const requestedListId = sp.list ? parseInt(sp.list, 10) : NaN;
  const activeList =
    lists.find((list) => list.id === requestedListId)
    ?? lists.find((list) => list.listType === 'favorites' && list.isSystem)
    ?? lists[0];

  if (!activeList) {
    return (
      <div className="page-shell py-12 pb-20">
        <div className="empty-state">
          <p className="font-ui text-sm text-soft">无法加载列表，请稍后重试。</p>
        </div>
      </div>
    );
  }

  const items = await getListsService().itemsMine(activeList.id);

  return (
    <div className="page-shell py-8 sm:py-12 pb-20 space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <p className="font-meta mb-2">Library</p>
          <h1 className="section-title text-3xl text-ink">我的片单</h1>
          <p className="mt-2 font-ui text-sm text-soft">
            {user.displayName || user.username} · {activeList.name} ·{' '}
            <span className="tabular">{items.length}</span> 部
          </p>
        </div>
        <form action={actionPublicLogout}>
          <button type="submit" className="btn-ghost !text-[13px]">
            退出登录
          </button>
        </form>
      </div>

      {sp.error && (
        <div className="rounded-xl border border-[#f3d4d3] bg-[#fdf2f2] px-4 py-3 font-ui text-sm text-[#9F2F2D]">
          操作失败，请重试。
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {lists.map((list) => {
          const active = list.id === activeList.id;
          return (
            <Link
              key={list.id}
              href={`/favorites?list=${list.id}`}
              className={
                active
                  ? 'rounded-full bg-[#1a1917] px-3.5 py-1.5 font-ui text-[12px] font-medium text-white'
                  : 'rounded-full border border-[#e8e4dc] bg-white px-3.5 py-1.5 font-ui text-[12px] text-[#444] hover:border-[#d0ccc3] hover:bg-[#fbfaf7] transition'
              }
              aria-current={active ? 'page' : undefined}
            >
              {list.name}
              {list.itemCount != null ? ` · ${list.itemCount}` : ''}
            </Link>
          );
        })}
      </div>

      <section className="surface-panel p-4 sm:p-5 space-y-3">
        <h2 className="font-ui text-sm font-semibold text-ink">新建自定义列表</h2>
        <form action={actionCreateList} className="flex flex-col sm:flex-row gap-2">
          <input
            name="name"
            required
            maxLength={64}
            placeholder="例如：周末重温"
            className="admin-input flex-1"
          />
          <button type="submit" className="btn-ink shrink-0 !text-[13px]">
            创建
          </button>
        </form>
        {!activeList.isSystem && activeList.listType === 'custom' && (
          <form action={actionDeleteList} className="pt-1">
            <input type="hidden" name="listId" value={activeList.id} />
            <ConfirmSubmitButton
              title="删除列表"
              message="确定删除该自定义列表？列表内条目会一并移除。"
              className="font-ui text-[12px] text-[#9F2F2D] hover:underline underline-offset-2"
              confirmLabel="删除"
            >
              删除当前自定义列表
            </ConfirmSubmitButton>
          </form>
        )}
      </section>

      {items.length === 0 ? (
        <div className="empty-state space-y-4">
          <p className="font-meta">Empty list</p>
          <p className="section-title text-2xl text-ink">这个列表还是空的</p>
          <p className="font-ui text-sm text-soft">在播放页点收藏或「加入列表」即可添加。</p>
          <Link href="/browse" className="btn-ink inline-flex">
            浏览里番
          </Link>
        </div>
      ) : (
        <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-5">
          {items.map((anime) => (
            <li key={anime.animeId} className="space-y-2">
              <AnimeCard
                anime={{
                  id: anime.animeId,
                  title: anime.title,
                  cover: anime.cover,
                  viewCount: anime.viewCount,
                }}
              />
              <form action={actionSetListItemNote} className="space-y-1.5">
                <input type="hidden" name="listId" value={activeList.id} />
                <input type="hidden" name="animeId" value={anime.animeId} />
                <input
                  name="note"
                  defaultValue={anime.note ?? ''}
                  placeholder="备注（可选）"
                  maxLength={500}
                  className="admin-input !text-[11px] !py-1.5"
                />
                <button
                  type="submit"
                  className="w-full rounded-full py-1.5 font-ui text-[11px] text-soft hover:bg-white hover:text-ink transition"
                >
                  保存备注
                </button>
              </form>
              <form action={actionRemoveFromList}>
                <input type="hidden" name="listId" value={activeList.id} />
                <input type="hidden" name="animeId" value={anime.animeId} />
                <button
                  type="submit"
                  className="w-full rounded-full py-1.5 font-ui text-[12px] text-[#6f6d68] hover:bg-[#fdf2f2] hover:text-[#9F2F2D] transition"
                >
                  从列表移除
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
