import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ConfirmSubmitButton } from '@/components/confirm-submit-button';
import { AdminPagination } from '@/components/admin/admin-pagination';
import {
  actionDeleteManga,
  actionDeleteMangaChapter,
  actionDeleteMangaPage,
  actionSaveManga,
  actionSaveMangaPage,
  actionSaveMangaPageUrls,
  actionToggleMangaChapter,
} from '../../actions';
import {
  getAdminManga,
  listAdminMangaChapters,
  listAdminMangaPages,
  listAdminRelatedMangas,
} from '@/lib/server/manga-admin';
import { parseMangaTags } from '@/lib/manga-tags';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 24;

function formatDate(value: Date | null) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(value));
}

function mangaContentHref(
  mangaId: number,
  opts?: { pages?: number; chapter?: number; view?: 'thumbs' | 'links' },
) {
  const params = new URLSearchParams();
  if (opts?.pages && opts.pages > 1) params.set('pages', String(opts.pages));
  if (opts?.chapter) params.set('chapter', String(opts.chapter));
  if (opts?.view === 'links') params.set('view', 'links');
  const query = params.toString();
  return query ? `/admin/mangas/${mangaId}?${query}` : `/admin/mangas/${mangaId}`;
}

export default async function AdminMangaDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id: idString } = await params;
  if (!/^\d+$/.test(idString)) notFound();
  const id = Number(idString);
  if (!Number.isSafeInteger(id) || id <= 0) notFound();

  const [manga, sp] = await Promise.all([getAdminManga(id), searchParams]);
  if (!manga) notFound();

  const ok = typeof sp.ok === 'string' ? sp.ok : '';
  const error = typeof sp.error === 'string' ? sp.error : '';
  const pagesPage = Math.max(1, parseInt(String(sp.pages || '1'), 10) || 1);
  const chapterFilter = parseInt(String(sp.chapter || ''), 10);
  const selectedChapterId = Number.isSafeInteger(chapterFilter) && chapterFilter > 0
    ? chapterFilter
    : undefined;
  const view = sp.view === 'links' ? 'links' : 'thumbs';

  const tags = parseMangaTags(manga.tags);
  const tagsText = tags.join(', ');
  const [chapters, pages, related] = await Promise.all([
    listAdminMangaChapters(id),
    listAdminMangaPages(id, {
      page: pagesPage,
      limit: PAGE_SIZE,
      chapterId: selectedChapterId,
      all: view === 'links',
    }),
    listAdminRelatedMangas(id, tags),
  ]);

  const publicHref = `/manga/${manga.id}`;
  const readerHref = chapters[0]
    ? `/manga/${manga.id}/read/${chapters[0].number}`
    : publicHref;

  const statusMessage = {
    manga_updated: '漫画信息已保存',
    chapter_deleted: '章节已删除',
    chapter_updated: '章节状态已更新',
    page_deleted: '页面已删除',
    page_updated: '页面链接已保存',
    pages_updated: '全部链接已保存',
  }[ok];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Link href="/admin/mangas" className="font-ui text-[12px] text-soft hover:text-ink">
            ← 返回漫画管理
          </Link>
          <p className="font-meta mb-2 mt-4">manga #{manga.id}</p>
          <h1 className="section-title text-3xl text-ink">{manga.title}</h1>
          <p className="mt-2 font-ui text-[13px] text-soft">
            {manga.author ? `作者 ${manga.author} · ` : ''}
            {chapters.length} 个章节 · P{manga.pageCount ?? 0}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={publicHref} target="_blank" className="btn-ghost !text-[13px]">查看前台</Link>
          <Link href={readerHref} target="_blank" className="btn-ghost !text-[13px]">阅读</Link>
          <form action={actionDeleteManga}>
            <input type="hidden" name="id" value={manga.id} />
            <ConfirmSubmitButton
              title="删除漫画确认"
              message={`确定删除「${manga.title}」及其全部页面？此操作不可恢复。`}
              className="btn-ghost !border-[hsl(var(--danger-border))] !text-danger !text-[13px]"
              confirmLabel="删除"
            >
              删除漫画
            </ConfirmSubmitButton>
          </form>
        </div>
      </div>

      {statusMessage && (
        <div className="notice-success">
          {statusMessage}
        </div>
      )}
      {error === 'required' && (
        <div className="notice-error">
          标题和 URL 别名不能为空
        </div>
      )}
      {error === 'slug' && (
        <div className="notice-error">
          URL 别名已被其他漫画使用
        </div>
      )}
      {error === 'page_url' && (
        <div className="notice-error">
          页面链接不能为空，且不能超过 1000 个字符
        </div>
      )}
      {error === 'page_count' && (
        <div className="notice-error">
          链接行数必须与全部页面数量一致
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_280px]">
        <form action={actionSaveManga} className="surface-card space-y-5 p-6">
          <input type="hidden" name="id" value={manga.id} />
          <div>
            <label htmlFor="title" className="admin-label">标题 *</label>
            <input id="title" name="title" className="admin-input" required defaultValue={manga.title} />
          </div>
          <div>
            <label htmlFor="slug" className="admin-label">URL 别名 *</label>
            <input id="slug" name="slug" className="admin-input font-mono text-[12px]" required defaultValue={manga.slug} />
            <p className="mt-1 font-ui text-[11px] text-soft">修改后，前台访问地址会变为 /manga/新的别名。</p>
          </div>
          <div>
            <label htmlFor="author" className="admin-label">作者</label>
            <input id="author" name="author" className="admin-input" defaultValue={manga.author || ''} />
          </div>
          <div>
            <label htmlFor="tags" className="admin-label">漫画标签</label>
            <input id="tags" name="tags" className="admin-input" defaultValue={tagsText} placeholder="多个漫画标签用逗号分隔" />
            <p className="mt-1 font-ui text-[11px] text-soft">只属于这部漫画，不会写入里番标签字典，前台点击后也只筛选漫画。</p>
          </div>
          <div>
            <label htmlFor="coverUrl" className="admin-label">封面 URL</label>
            <input id="coverUrl" name="coverUrl" className="admin-input" defaultValue={manga.coverUrl || ''} />
          </div>
          <div>
            <label htmlFor="sourceChatTitle" className="admin-label">来源群组名称</label>
            <input id="sourceChatTitle" name="sourceChatTitle" className="admin-input" defaultValue={manga.sourceChatTitle || ''} />
          </div>
          <div>
            <label htmlFor="description" className="admin-label">简介</label>
            <textarea id="description" name="description" rows={5} className="admin-input resize-y" defaultValue={manga.description || ''} />
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="isPublished" name="isPublished" value="1" defaultChecked={!!manga.isPublished} />
            <label htmlFor="isPublished" className="font-ui text-sm">上架显示</label>
          </div>
          <div className="flex flex-wrap items-center gap-4 border-t border-border pt-4">
            <button type="submit" className="btn-ink">保存漫画</button>
            <span className="font-ui text-[12px] text-soft">最后更新：{formatDate(manga.updatedAt)}</span>
          </div>
        </form>

        <aside className="space-y-4">
          <div className="surface-card overflow-hidden">
            {manga.coverUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={manga.coverUrl}
                alt=""
                className="aspect-[2/3] w-full object-cover bg-secondary"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="grid aspect-[2/3] place-items-center bg-secondary font-ui text-[13px] text-muted-foreground">
                暂无封面
              </div>
            )}
            <div className="space-y-2 px-4 py-3 font-ui text-[13px] text-soft">
              <p>状态：{manga.isPublished ? '上架' : '下架'}</p>
              <p>来源：{manga.sourceChatTitle || '-'}</p>
              <p>内容：P{manga.pageCount ?? 0}</p>
            </div>
          </div>

          {related.length > 0 && (
            <section className="surface-card overflow-hidden">
              <div className="border-b border-border px-4 py-3">
                <h2 className="font-ui text-sm font-semibold text-ink">相关漫画</h2>
                <p className="mt-1 font-ui text-[12px] text-soft">按相同漫画标签匹配</p>
              </div>
              <ul className="divide-y divide-border/70">
                {related.map((item) => (
                  <li key={item.id}>
                    <Link
                      href={`/admin/mangas/${item.id}`}
                      className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2"
                    >
                      {item.coverUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={item.coverUrl}
                          alt=""
                          className="h-12 w-9 shrink-0 rounded-md border border-border object-cover bg-secondary"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className="h-12 w-9 shrink-0 rounded-md border border-border bg-secondary" />
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-ui text-[13px] text-ink">{item.title}</span>
                        <span className="mt-0.5 block font-ui text-[11px] text-muted-foreground">
                          P{item.pageCount} · {item.isPublished ? '上架' : '下架'}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </aside>
      </div>

      <section className="surface-card overflow-hidden">
        <div className="border-b border-border px-5 py-4">
          <h2 className="font-ui text-sm font-semibold text-ink">章节</h2>
          <p className="mt-1 font-ui text-[12px] text-soft">共 {chapters.length} 个章节</p>
        </div>
        {chapters.length === 0 ? (
          <p className="px-5 py-10 text-center font-ui text-[13px] text-soft">还没有章节内容</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>章节</th>
                  <th>页面</th>
                  <th>状态</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {chapters.map((chapter) => (
                  <tr key={chapter.id}>
                    <td className="min-w-[220px]">
                      <p className="font-medium text-ink">
                        第 {chapter.number} 话
                        {chapter.title ? ` · ${chapter.title}` : ''}
                      </p>
                      <p className="mt-1 font-mono text-[11px] text-muted-foreground">{chapter.sourceKey}</p>
                    </td>
                    <td className="whitespace-nowrap text-[13px] text-foreground">P{chapter.pageCount}</td>
                    <td>
                      <span className={`status-pill ${chapter.isPublished ? 'status-pill-on' : 'status-pill-off'}`}>
                        {chapter.isPublished ? '上架' : '下架'}
                      </span>
                    </td>
                    <td>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <Link
                          href={mangaContentHref(manga.id, { chapter: chapter.id, view })}
                          className="text-[12px] text-foreground underline-offset-2 hover:underline"
                        >
                          查看页面
                        </Link>
                        <Link
                          href={`/manga/${manga.id}/read/${chapter.number}`}
                          target="_blank"
                          className="text-[12px] text-foreground underline-offset-2 hover:underline"
                        >
                          阅读
                        </Link>
                        <form action={actionToggleMangaChapter}>
                          <input type="hidden" name="mangaId" value={manga.id} />
                          <input type="hidden" name="chapterId" value={chapter.id} />
                          <input type="hidden" name="isPublished" value={chapter.isPublished ? '1' : '0'} />
                          {selectedChapterId ? <input type="hidden" name="chapter" value={selectedChapterId} /> : null}
                          {view === 'links' ? <input type="hidden" name="view" value="links" /> : null}
                          <button type="submit" className="text-[12px] text-foreground underline-offset-2 hover:underline">
                            {chapter.isPublished ? '下架' : '上架'}
                          </button>
                        </form>
                        <form action={actionDeleteMangaChapter}>
                          <input type="hidden" name="mangaId" value={manga.id} />
                          <input type="hidden" name="chapterId" value={chapter.id} />
                          {view === 'links' ? <input type="hidden" name="view" value="links" /> : null}
                          <ConfirmSubmitButton
                            title="删除章节确认"
                            message={`确定删除第 ${chapter.number} 话及其 ${chapter.pageCount} 页？`}
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
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="font-ui text-sm font-semibold text-ink">页面内容</h2>
            <p className="mt-1 font-ui text-[12px] text-soft">
              {selectedChapterId
                ? `当前章节 ${pages.total} 页`
                : `全部 ${pages.total} 页`}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center rounded-full border border-border bg-card p-1">
              <Link
                href={mangaContentHref(manga.id, { pages: pagesPage, chapter: selectedChapterId, view: 'thumbs' })}
                className={`rounded-full px-3 py-1.5 font-ui text-[12px] ${
                  view === 'thumbs' ? 'bg-primary text-primary-foreground' : 'text-foreground hover:text-ink'
                }`}
              >
                缩略图
              </Link>
              <Link
                href={mangaContentHref(manga.id, { chapter: selectedChapterId, view: 'links' })}
                className={`rounded-full px-3 py-1.5 font-ui text-[12px] ${
                  view === 'links' ? 'bg-primary text-primary-foreground' : 'text-foreground hover:text-ink'
                }`}
              >
                链接
              </Link>
            </div>
            {selectedChapterId ? (
              <Link href={mangaContentHref(manga.id, { view })} className="btn-ghost !text-[12px]">
                查看全部页面
              </Link>
            ) : null}
          </div>
        </div>

        {pages.data.length === 0 ? (
          <div className="surface-card px-5 py-10 text-center font-ui text-[13px] text-soft">
            这个范围没有页面
          </div>
        ) : view === 'links' ? (
          <div className="space-y-4">
            <form action={actionSaveMangaPageUrls} className="surface-card space-y-3 p-4">
              <input type="hidden" name="mangaId" value={manga.id} />
              {selectedChapterId ? <input type="hidden" name="chapter" value={selectedChapterId} /> : null}
              <input type="hidden" name="view" value="links" />
              {pages.data.map((page) => (
                <input key={page.id} type="hidden" name="pageIds" value={page.id} />
              ))}
              <label htmlFor="page-urls" className="admin-label">全部链接</label>
              <textarea
                id="page-urls"
                name="urls"
                rows={Math.min(28, Math.max(10, pages.data.length))}
                className="admin-input resize-y font-mono text-[12px]"
                defaultValue={pages.data.map((page) => page.imageUrl).join('\n')}
              />
              <div className="flex flex-wrap items-center gap-3">
                <button type="submit" className="btn-ink !text-[13px]">保存全部链接</button>
                <p className="font-ui text-[12px] text-soft">
                  一行一个地址，行数必须等于全部 {pages.data.length} 张图。
                </p>
              </div>
            </form>

            <div className="surface-card overflow-x-auto">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>页</th>
                    <th>链接</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {pages.data.map((page) => (
                    <tr key={page.id}>
                      <td className="whitespace-nowrap font-ui text-[12px] text-foreground">
                        {page.chapterNumber}-{page.index + 1}
                      </td>
                      <td className="min-w-[280px]">
                        <form action={actionSaveMangaPage} className="flex flex-col gap-2 lg:flex-row lg:items-center">
                          <input type="hidden" name="mangaId" value={manga.id} />
                          <input type="hidden" name="pageId" value={page.id} />
                          {selectedChapterId ? <input type="hidden" name="chapter" value={selectedChapterId} /> : null}
                          <input type="hidden" name="view" value="links" />
                          <input
                            name="imageUrl"
                            defaultValue={page.imageUrl}
                            className="admin-input font-mono text-[12px]"
                          />
                          <button type="submit" className="text-[12px] text-foreground underline-offset-2 hover:underline">
                            保存
                          </button>
                        </form>
                      </td>
                      <td className="whitespace-nowrap">
                        <div className="flex items-center gap-3">
                          <a
                            href={page.imageUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[12px] text-foreground underline-offset-2 hover:underline"
                          >
                            打开
                          </a>
                          <form action={actionDeleteMangaPage}>
                            <input type="hidden" name="mangaId" value={manga.id} />
                            <input type="hidden" name="pageId" value={page.id} />
                            {selectedChapterId ? <input type="hidden" name="chapter" value={selectedChapterId} /> : null}
                            <input type="hidden" name="view" value="links" />
                            <ConfirmSubmitButton
                              title="删除页面确认"
                              message={`确定删除第 ${page.chapterNumber} 话的第 ${page.index + 1} 页？`}
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
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
            {pages.data.map((page) => (
              <article key={page.id} className="surface-card overflow-hidden">
                <a href={page.imageUrl} target="_blank" rel="noreferrer" className="block">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={page.imageUrl}
                    alt={`第 ${page.chapterNumber} 话 P${page.index + 1}`}
                    className="aspect-[2/3] w-full object-cover bg-secondary"
                    loading="lazy"
                    referrerPolicy="no-referrer"
                  />
                </a>
                <div className="flex items-center justify-between gap-2 px-2.5 py-2">
                  <p className="truncate font-ui text-[11px] text-soft">
                    {page.chapterNumber}-{page.index + 1}
                  </p>
                  <form action={actionDeleteMangaPage}>
                    <input type="hidden" name="mangaId" value={manga.id} />
                    <input type="hidden" name="pageId" value={page.id} />
                    <input type="hidden" name="pages" value={String(pages.page)} />
                    {selectedChapterId ? <input type="hidden" name="chapter" value={selectedChapterId} /> : null}
                    <ConfirmSubmitButton
                      title="删除页面确认"
                      message={`确定删除第 ${page.chapterNumber} 话的第 ${page.index + 1} 页？`}
                      className="font-ui text-[11px] text-danger underline-offset-2 hover:underline"
                      confirmLabel="删除"
                    >
                      删除
                    </ConfirmSubmitButton>
                  </form>
                </div>
              </article>
            ))}
          </div>
        )}

        {view === 'thumbs' ? (
          <AdminPagination
            page={pages.page}
            totalPages={pages.totalPages}
            total={pages.total}
            basePath={`/admin/mangas/${manga.id}`}
            query={{
              chapter: selectedChapterId ? String(selectedChapterId) : undefined,
            }}
            pageParam="pages"
          />
        ) : null}
      </section>
    </div>
  );
}
