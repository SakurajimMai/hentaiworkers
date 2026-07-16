import Link from 'next/link';
import { inArray, like, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { animeTags, animeWorkTags, tags, workTags } from '@/lib/schema';
import { actionDeleteTag, actionDeleteWorkTag, actionSaveTag, actionSaveWorkTag } from '../actions';
import { AdminPagination } from '@/components/admin/admin-pagination';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 30;

type Scope = 'rifan' | 'anime';

export default async function AdminTagsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const q = typeof sp.q === 'string' ? sp.q.trim() : '';
  const page = Math.max(1, parseInt(String(sp.page || '1'), 10) || 1);
  const offset = (page - 1) * PAGE_SIZE;
  const scope: Scope = sp.scope === 'anime' ? 'anime' : 'rifan';
  const isAnime = scope === 'anime';

  if (isAnime) {
    const where = q ? like(workTags.name, `%${q}%`) : undefined;
    const rows = await db
      .select()
      .from(workTags)
      .where(where)
      .orderBy(workTags.name)
      .limit(PAGE_SIZE)
      .offset(offset);
    const [countRow] = await db
      .select({ count: sql<number>`count(*)` })
      .from(workTags)
      .where(where);
    const total = Number(countRow.count);
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const tagIds = rows.map((t) => t.id);
    const counts =
      tagIds.length === 0
        ? []
        : await db
            .select({
              tagId: animeWorkTags.tagId,
              count: sql<number>`count(*)`,
            })
            .from(animeWorkTags)
            .where(inArray(animeWorkTags.tagId, tagIds))
            .groupBy(animeWorkTags.tagId);
    const countMap = new Map(counts.map((c) => [c.tagId, Number(c.count)]));

    return (
      <TagsAdminShell
        scope={scope}
        q={q}
        page={page}
        total={total}
        totalPages={totalPages}
        rows={rows.map((t) => ({
          id: t.id,
          name: t.name,
          description: t.description,
          links: countMap.get(t.id) || 0,
        }))}
        saveAction={actionSaveWorkTag}
        deleteAction={actionDeleteWorkTag}
        dictionaryLabel="动漫标签（work_tags）"
        linkLabel="关联动漫"
      />
    );
  }

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
    <TagsAdminShell
      scope={scope}
      q={q}
      page={page}
      total={total}
      totalPages={totalPages}
      rows={rows.map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        links: countMap.get(t.id) || 0,
      }))}
      saveAction={actionSaveTag}
      deleteAction={actionDeleteTag}
      dictionaryLabel="里番标签（tags）"
      linkLabel="关联里番"
    />
  );
}

function TagsAdminShell({
  scope,
  q,
  page,
  total,
  totalPages,
  rows,
  saveAction,
  deleteAction,
  dictionaryLabel,
  linkLabel,
}: {
  scope: Scope;
  q: string;
  page: number;
  total: number;
  totalPages: number;
  rows: Array<{ id: number; name: string; description: string | null; links: number }>;
  saveAction: (formData: FormData) => Promise<void>;
  deleteAction: (formData: FormData) => Promise<void>;
  dictionaryLabel: string;
  linkLabel: string;
}) {
  return (
    <div className="space-y-8">
      <div>
        <p className="font-meta mb-2">Tags</p>
        <h1 className="font-serif text-3xl">标签管理</h1>
        <p className="mt-2 font-ui text-sm text-[#787774] max-w-2xl">
          一个页面管理两套标签字典：里番用 `tags`，动漫用 `work_tags`。下方 Tab
          切换范围，数据永不混写。当前：{dictionaryLabel}
        </p>
      </div>

      <div
        role="tablist"
        aria-label="标签范围"
        className="inline-flex flex-wrap gap-1 rounded-full border border-[#EAEAEA] bg-white p-1"
      >
        <Link
          role="tab"
          aria-selected={scope === 'rifan'}
          href={`/admin/tags?scope=rifan${q ? `&q=${encodeURIComponent(q)}` : ''}`}
          className={
            scope === 'rifan'
              ? 'rounded-full bg-[#111] px-4 py-1.5 font-ui text-[13px] text-white'
              : 'rounded-full px-4 py-1.5 font-ui text-[13px] text-[#787774] hover:text-[#111]'
          }
        >
          里番
        </Link>
        <Link
          role="tab"
          aria-selected={scope === 'anime'}
          href={`/admin/tags?scope=anime${q ? `&q=${encodeURIComponent(q)}` : ''}`}
          className={
            scope === 'anime'
              ? 'rounded-full bg-[#111] px-4 py-1.5 font-ui text-[13px] text-white'
              : 'rounded-full px-4 py-1.5 font-ui text-[13px] text-[#787774] hover:text-[#111]'
          }
        >
          动漫
        </Link>
      </div>

      <form className="flex gap-2">
        <input type="hidden" name="scope" value={scope} />
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
        action={saveAction}
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
          <thead className="border-b border-[#EAEAEA] text-[#787774]">
            <tr>
              <th className="p-3">ID</th>
              <th className="p-3">名称</th>
              <th className="p-3">{linkLabel}</th>
              <th className="p-3">操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((tag) => (
              <tr key={tag.id} className="border-b border-[#EAEAEA] last:border-0">
                <td className="p-3 tabular text-[#787774]">{tag.id}</td>
                <td className="p-3">
                  <form action={saveAction} className="flex flex-wrap gap-2 items-center">
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
                <td className="p-3 tabular">{tag.links}</td>
                <td className="p-3">
                  <form action={deleteAction}>
                    <input type="hidden" name="id" value={tag.id} />
                    <button type="submit" className="text-[12px] text-[#9F2F2D] underline">
                      删除
                    </button>
                  </form>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="p-6 text-center text-[#787774]">
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
        query={{ q: q || undefined, scope }}
      />
    </div>
  );
}
