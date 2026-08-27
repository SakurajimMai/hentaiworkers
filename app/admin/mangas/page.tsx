import Link from 'next/link';
import { ConfirmSubmitButton } from '@/components/confirm-submit-button';
import { AdminPagination } from '@/components/admin/admin-pagination';
import {
  actionDeleteManga,
  actionToggleManga,
} from '../actions';
import { listAdminMangas } from '@/lib/server/manga-admin';

export const dynamic = 'force-dynamic';

function formatDate(value: Date | null) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(value));
}

export default async function AdminMangasPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const q = typeof sp.q === 'string' ? sp.q : '';
  const page = Math.max(1, parseInt(String(sp.page || '1'), 10) || 1);
  const ok = typeof sp.ok === 'string' ? sp.ok : '';
  const error = typeof sp.error === 'string' ? sp.error : '';
  const result = await listAdminMangas({ page, q });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-meta mb-2">漫画</p>
          <h1 className="section-title text-3xl text-ink">漫画管理</h1>
          <p className="mt-2 max-w-2xl font-ui text-sm leading-relaxed text-soft">
            管理 TG 发布的漫画和页面。上架状态会直接影响前台目录与阅读页。
          </p>
        </div>
        <Link href="/manga" target="_blank" className="btn-ghost !text-[13px]">
          打开前台漫画
        </Link>
      </div>

      {ok === 'manga_updated' && (
        <div className="notice-success">
          漫画信息已保存
        </div>
      )}
      {ok === 'deleted' && (
        <div className="notice-success">
          漫画已删除
        </div>
      )}
      {error === 'slug' && (
        <div className="notice-error">
          URL 别名已被其他漫画使用
        </div>
      )}

      <form className="surface-card flex flex-col gap-2 p-3 sm:flex-row sm:p-4" method="get">
        <label htmlFor="manga-search" className="sr-only">搜索漫画</label>
        <input
          id="manga-search"
          name="q"
          defaultValue={q}
          placeholder="搜索标题、URL 别名或来源群组"
          className="admin-input sm:max-w-md"
        />
        <button type="submit" className="btn-ink !text-[13px]">搜索</button>
        {q && <Link href="/admin/mangas" className="btn-ghost !text-[13px]">清除</Link>}
      </form>

      <div className="surface-card overflow-hidden">
        <div className="space-y-2 p-3 md:hidden">
          {result.data.map((manga) => (
            <article key={manga.id} className="admin-mobile-card">
              <div className="flex gap-3">
                {manga.coverUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={manga.coverUrl}
                    alt=""
                    width={40}
                    height={56}
                    className="h-14 w-10 shrink-0 rounded-md border border-border bg-secondary object-cover"
                    loading="lazy"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="h-14 w-10 shrink-0 rounded-md border border-border bg-secondary" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <Link href={`/admin/mangas/${manga.id}`} className="min-w-0 font-ui text-[14px] font-medium leading-snug text-ink hover:underline">
                      {manga.title}
                    </Link>
                    <span className={`status-pill shrink-0 ${manga.isPublished ? 'status-pill-on' : 'status-pill-off'}`}>
                      {manga.isPublished ? '上架' : '下架'}
                    </span>
                  </div>
                  <p className="mt-1 truncate font-mono text-[11px] text-muted-foreground">/{manga.slug}</p>
                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 font-meta text-[10px] normal-case tracking-normal text-soft">
                    <span>P{manga.pageCount ?? 0}</span>
                    <span>{manga.sourceChatTitle || '来源未记录'}</span>
                    <span>{formatDate(manga.updatedAt)}</span>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border pt-3">
                    <Link href={`/admin/mangas/${manga.id}`} className="font-ui text-[12px] text-foreground underline-offset-2 hover:underline">管理</Link>
                    <form action={actionToggleManga}>
                      <input type="hidden" name="id" value={manga.id} />
                      <input type="hidden" name="isPublished" value={manga.isPublished ? '1' : '0'} />
                      <button type="submit" className="font-ui text-[12px] text-foreground underline-offset-2 hover:underline">
                        {manga.isPublished ? '下架' : '上架'}
                      </button>
                    </form>
                    <form action={actionDeleteManga}>
                      <input type="hidden" name="id" value={manga.id} />
                      <ConfirmSubmitButton
                        title="删除漫画确认"
                        message={`确定删除「${manga.title}」及其全部页面？此操作不可恢复。`}
                        className="font-ui text-[12px] text-danger underline-offset-2 hover:underline"
                        confirmLabel="删除"
                      >
                        删除
                      </ConfirmSubmitButton>
                    </form>
                  </div>
                </div>
              </div>
            </article>
          ))}
          {result.data.length === 0 && <p className="px-3 py-8 text-center font-ui text-[13px] text-soft">暂无漫画</p>}
        </div>

        <div className="hidden overflow-x-auto md:block">
          <table className="admin-table">
            <thead>
              <tr>
                <th>漫画</th>
                <th>页面</th>
                <th>来源</th>
                <th>状态</th>
                <th>更新</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {result.data.map((manga) => (
                <tr key={manga.id}>
                  <td className="min-w-[260px]">
                    <div className="flex items-center gap-3">
                      {manga.coverUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={manga.coverUrl}
                          alt=""
                          className="h-14 w-10 shrink-0 rounded-md border border-border object-cover bg-secondary"
                        />
                      ) : (
                        <div className="h-14 w-10 shrink-0 rounded-md border border-border bg-secondary" />
                      )}
                      <div className="min-w-0">
                        <Link
                          href={`/admin/mangas/${manga.id}`}
                          className="font-medium text-ink hover:underline underline-offset-2"
                        >
                          {manga.title}
                        </Link>
                        <p className="mt-1 truncate font-mono text-[11px] text-muted-foreground">/{manga.slug}</p>
                      </div>
                    </div>
                  </td>
                  <td className="whitespace-nowrap text-[13px] text-foreground">
                    <span className="tabular">P{manga.pageCount ?? 0}</span>
                  </td>
                  <td className="max-w-[180px] truncate text-[12px] text-soft">
                    {manga.sourceChatTitle || '—'}
                  </td>
                  <td>
                    <span className={`status-pill ${manga.isPublished ? 'status-pill-on' : 'status-pill-off'}`}>
                      {manga.isPublished ? '上架' : '下架'}
                    </span>
                  </td>
                  <td className="whitespace-nowrap text-[12px] text-muted-foreground">{formatDate(manga.updatedAt)}</td>
                  <td>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <Link
                        href={`/admin/mangas/${manga.id}`}
                        className="text-[12px] text-foreground underline-offset-2 hover:underline"
                      >
                        管理
                      </Link>
                      <form action={actionToggleManga}>
                        <input type="hidden" name="id" value={manga.id} />
                        <input type="hidden" name="isPublished" value={manga.isPublished ? '1' : '0'} />
                        <button type="submit" className="text-[12px] text-foreground underline-offset-2 hover:underline">
                          {manga.isPublished ? '下架' : '上架'}
                        </button>
                      </form>
                      <form action={actionDeleteManga}>
                        <input type="hidden" name="id" value={manga.id} />
                        <ConfirmSubmitButton
                          title="删除漫画确认"
                          message={`确定删除「${manga.title}」及其全部页面？此操作不可恢复。`}
                          className="text-[12px] text-danger underline-offset-2 hover:underline"
                          confirmLabel="删除"
                        >
                          删除
                        </ConfirmSubmitButton>
                      </form>
                    </div>
                  </td>
                </tr>
              ))}
              {result.data.length === 0 && (
                <tr>
                  <td colSpan={6} className="!p-12 text-center">
                    <p className="font-ui text-[14px] text-ink">暂无漫画</p>
                    <p className="mt-1 font-ui text-[12px] text-soft">通过 tg-manga 发布后，漫画会出现在这里。</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <AdminPagination
        page={result.page}
        totalPages={result.totalPages}
        total={result.total}
        basePath="/admin/mangas"
        query={{ q: q || undefined }}
      />
    </div>
  );
}
