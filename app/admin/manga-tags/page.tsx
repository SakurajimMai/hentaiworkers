import Link from 'next/link';
import { requireAdmin } from '@/lib/auth';
import { listAdminMangaTagUsage } from '@/lib/server/manga-admin';
import { getSystemSettingsService } from '@/lib/server/system';
import { AdminPagination } from '@/components/admin/admin-pagination';
import { paginateItems } from '@/components/admin/admin-pagination-model';
import { ConfirmSubmitButton } from '@/components/confirm-submit-button';
import {
  actionAddMangaTag,
  actionDeleteMangaTag,
  actionRenameMangaTag,
} from '../actions';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 30;

export default async function AdminMangaTagsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const q = typeof sp.q === 'string' ? sp.q.trim() : '';
  const page = Math.max(1, parseInt(String(sp.page || '1'), 10) || 1);
  const ok = typeof sp.ok === 'string' ? sp.ok : '';
  const error = typeof sp.error === 'string' ? sp.error : '';
  const okTag = typeof sp.tag === 'string' ? sp.tag : '';
  const affected = typeof sp.n === 'string' ? sp.n : '';

  const [usage, settings] = await Promise.all([
    listAdminMangaTagUsage(),
    getSystemSettingsService().getSettings(),
  ]);
  const curated = new Set(settings.manga.curatedTags);
  const usageMap = new Map(usage.map((item) => [item.tag, item]));

  type Row = {
    tag: string;
    count: number;
    publishedCount: number;
    curated: boolean;
  };
  const rows: Row[] = [
    ...usage.map((item) => ({ ...item, curated: curated.has(item.tag) })),
    ...settings.manga.curatedTags
      .filter((tag) => !usageMap.has(tag))
      .map((tag) => ({ tag, count: 0, publishedCount: 0, curated: true })),
  ];
  const filtered = q ? rows.filter((row) => row.tag.includes(q)) : rows;
  const paged = paginateItems(filtered, page, PAGE_SIZE);

  const statusMessage = {
    added: `已新增标签「${okTag}」`,
    renamed: `标签已重命名为「${okTag}」，${affected || 0} 部漫画同步更新`,
    deleted: `标签「${okTag}」已删除，${affected || 0} 部漫画同步更新`,
  }[ok];

  return (
    <div className="space-y-8">
      <div className="admin-page-intro">
        <p className="font-meta mb-2">漫画标签</p>
        <h1 className="section-title text-3xl text-ink">漫画标签</h1>
        <p className="mt-2 font-ui text-sm text-soft max-w-2xl leading-relaxed">
          漫画标签保存在每部漫画的记录上，与里番标签互不相通。这里可以新增常用标签、
          重命名或删除已使用的标签；重命名与删除会同步更新所有漫画。
        </p>
      </div>

      {statusMessage && <div className="notice-success">{statusMessage}</div>}
      {error === 'name' && <div className="notice-error">标签名不能为空（最长 40 字符）</div>}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <form className="flex gap-2">
          <input
            name="q"
            defaultValue={q}
            placeholder="搜索标签名"
            className="admin-input max-w-sm"
          />
          <button type="submit" className="btn-ghost">
            搜索
          </button>
          {q && (
            <Link href="/admin/manga-tags" className="btn-ghost !text-[13px]">
              清除
            </Link>
          )}
        </form>
        <form action={actionAddMangaTag} className="flex gap-2">
          <input
            name="name"
            required
            maxLength={40}
            placeholder="新增常用标签"
            className="admin-input"
          />
          <button type="submit" className="btn-ink shrink-0">
            新增
          </button>
        </form>
      </div>

      <div className="surface-card overflow-x-auto">
        <table className="admin-table">
          <thead>
            <tr>
              <th>标签</th>
              <th>使用中 / 已上架</th>
              <th>来源</th>
              <th className="min-w-[260px]">重命名</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {paged.items.map((row) => (
              <tr key={row.tag}>
                <td>
                  <Link
                    href={`/manga?tag=${encodeURIComponent(row.tag)}`}
                    target="_blank"
                    className="font-medium text-ink underline-offset-2 hover:underline"
                  >
                    {row.tag}
                  </Link>
                </td>
                <td className="whitespace-nowrap tabular text-[13px] text-foreground">
                  {row.count} / {row.publishedCount}
                </td>
                <td>
                  <span className="admin-chip">{row.curated ? '常用标签' : '作品使用'}</span>
                </td>
                <td>
                  <form action={actionRenameMangaTag} className="flex flex-wrap items-center gap-2">
                    <input type="hidden" name="from" value={row.tag} />
                    <input
                      name="to"
                      defaultValue={row.tag}
                      maxLength={40}
                      className="admin-input max-w-[180px]"
                    />
                    <button type="submit" className="text-[12px] text-foreground underline underline-offset-2">
                      保存
                    </button>
                  </form>
                </td>
                <td>
                  <form action={actionDeleteMangaTag}>
                    <input type="hidden" name="name" value={row.tag} />
                    <ConfirmSubmitButton
                      title="删除漫画标签"
                      message={`确定删除标签「${row.tag}」？${row.count > 0 ? `${row.count} 部漫画会同步移除该标签。` : ''}`}
                      className="text-[12px] text-danger underline underline-offset-2"
                      confirmLabel="删除"
                    >
                      删除
                    </ConfirmSubmitButton>
                  </form>
                </td>
              </tr>
            ))}
            {paged.items.length === 0 && (
              <tr>
                <td colSpan={5} className="!p-8 text-center text-soft">
                  {q ? '没有匹配的标签' : '还没有漫画标签，先在上方新增一个常用标签。'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <AdminPagination
        page={paged.page}
        totalPages={paged.totalPages}
        total={paged.total}
        basePath="/admin/manga-tags"
        query={{ q: q || undefined }}
      />

      <p className="font-ui text-[12px] text-soft leading-relaxed max-w-2xl">
        「常用标签」保存在系统设置中，即使还没有作品使用也会保留，供 TG 发布与后台编辑时参考；
        「作品使用」标签来自漫画记录本身。前台 /manga 页会展示这里的常用标签作为快捷筛选。
      </p>
    </div>
  );
}
