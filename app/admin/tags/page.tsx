import { inArray, like, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { animeTags, tags } from '@/lib/schema';
import { actionDeleteTag, actionSaveTag } from '../actions';
import { AdminPagination } from '@/components/admin/admin-pagination';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 30;

export default async function AdminTagsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const q = typeof sp.q === 'string' ? sp.q.trim() : '';
  const error = typeof sp.error === 'string' ? sp.error : '';
  const linkedCount = typeof sp.count === 'string' ? sp.count : '';
  const page = Math.max(1, parseInt(String(sp.page || '1'), 10) || 1);
  const offset = (page - 1) * PAGE_SIZE;

  const where = q ? like(tags.name, `%${q}%`) : undefined;
  const rows = await db
    .select()
    .from(tags)
    .where(where)
    .orderBy(tags.name)
    .limit(PAGE_SIZE)
    .offset(offset);
  const [countRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(tags)
    .where(where);
  const total = Number(countRow.count);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const tagIds = rows.map((t) => t.id);
  const counts =
    tagIds.length === 0
      ? []
      : await db
          .select({
            tagId: animeTags.tagId,
            count: sql<number>`count(*)`,
          })
          .from(animeTags)
          .where(inArray(animeTags.tagId, tagIds))
          .groupBy(animeTags.tagId);
  const countMap = new Map(counts.map((c) => [c.tagId, Number(c.count)]));

  return (
    <div className="space-y-8">
      <div>
        <p className="font-meta mb-2">Anime tags</p>
        <h1 className="font-serif text-3xl">里番标签</h1>
        <p className="mt-2 font-ui text-sm text-soft max-w-2xl">
          管理里番标签字典 `tags`，并查看关联作品数量。漫画标签存在漫画作品上，不会出现在这里。
        </p>
      </div>

      {error === 'name' && <div className="notice-error">标签名不能为空</div>}
      {error === 'linked' && (
        <div className="notice-error">
          该标签仍关联 {linkedCount || '若干'} 部里番，先移除关联再删除。
        </div>
      )}

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
      </form>

      <form
        action={actionSaveTag}
        className="surface-card p-5 flex flex-col sm:flex-row gap-3 sm:items-end"
      >
        <div className="flex-1">
          <label className="admin-label">新标签名</label>
          <input name="name" className="admin-input" required />
        </div>
        <div className="flex-1">
          <label className="admin-label">描述</label>
          <input name="description" className="admin-input" />
        </div>
        <button type="submit" className="btn-ink">
          添加
        </button>
      </form>

      <div className="surface-card overflow-x-auto">
        <table className="w-full text-left font-ui text-sm">
          <thead className="border-b border-border text-soft">
            <tr>
              <th className="p-3">ID</th>
              <th className="p-3">名称</th>
              <th className="p-3">关联里番</th>
              <th className="p-3">操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((tag) => (
              <tr key={tag.id} className="border-b border-border last:border-0">
                <td className="p-3 tabular text-soft">{tag.id}</td>
                <td className="p-3">
                  <form action={actionSaveTag} className="flex flex-wrap gap-2 items-center">
                    <input type="hidden" name="id" value={tag.id} />
                    <input
                      name="name"
                      defaultValue={tag.name}
                      className="admin-input max-w-[160px]"
                    />
                    <input
                      name="description"
                      defaultValue={tag.description || ''}
                      className="admin-input max-w-[200px]"
                      placeholder="描述"
                    />
                    <button type="submit" className="text-[12px] underline">
                      保存
                    </button>
                  </form>
                </td>
                <td className="p-3 tabular">{countMap.get(tag.id) || 0}</td>
                <td className="p-3">
                  <form action={actionDeleteTag}>
                    <input type="hidden" name="id" value={tag.id} />
                    <button type="submit" className="text-[12px] text-danger underline">
                      删除
                    </button>
                  </form>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="p-6 text-center text-soft">
                  暂无标签
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <AdminPagination
        page={page}
        totalPages={totalPages}
        total={total}
        basePath="/admin/tags"
        query={{ q: q || undefined }}
      />
    </div>
  );
}
