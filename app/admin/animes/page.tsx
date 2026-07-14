import Link from 'next/link';
import { sql, like, or, desc } from 'drizzle-orm';
import { db } from '@/lib/db';
import { animes } from '@/lib/schema';
import { actionDeleteAnime, actionToggleAnime } from '../actions';

export const dynamic = 'force-dynamic';

export default async function AdminAnimesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const q = typeof sp.q === 'string' ? sp.q : '';
  const page = Math.max(1, parseInt(String(sp.page || '1'), 10) || 1);
  const limit = 30;
  const offset = (page - 1) * limit;
  const where = q
    ? or(like(animes.title, `%${q}%`), like(animes.titleJapanese, `%${q}%`))
    : undefined;

  const rows = await db
    .select({
      id: animes.id,
      title: animes.title,
      isActive: animes.isActive,
      viewCount: animes.viewCount,
      cover: animes.cover,
    })
    .from(animes)
    .where(where)
    .orderBy(desc(animes.id))
    .limit(limit)
    .offset(offset);

  const [countRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(animes)
    .where(where);
  const total = Number(countRow.count);
  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <p className="font-meta mb-2">Animes</p>
          <h1 className="font-serif text-3xl">作品管理</h1>
        </div>
        <Link href="/admin/animes/new" className="btn-ink">
          新建作品
        </Link>
      </div>

      <form className="flex gap-2">
        <input
          name="q"
          defaultValue={q}
          placeholder="搜索标题"
          className="admin-input max-w-sm"
        />
        <button type="submit" className="btn-ghost">
          搜索
        </button>
      </form>

      <div className="surface-card overflow-x-auto">
        <table className="w-full text-left font-ui text-sm">
          <thead className="border-b border-[#EAEAEA] text-[#787774]">
            <tr>
              <th className="p-3 font-medium">ID</th>
              <th className="p-3 font-medium">标题</th>
              <th className="p-3 font-medium">播放</th>
              <th className="p-3 font-medium">状态</th>
              <th className="p-3 font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-[#EAEAEA] last:border-0">
                <td className="p-3 tabular text-[#787774]">{row.id}</td>
                <td className="p-3">
                  <Link href={`/admin/animes/${row.id}`} className="hover:underline">
                    {row.title}
                  </Link>
                </td>
                <td className="p-3 tabular">{row.viewCount ?? 0}</td>
                <td className="p-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] ${
                      row.isActive
                        ? 'bg-[#EDF3EC] text-[#346538]'
                        : 'bg-[#FDEBEC] text-[#9F2F2D]'
                    }`}
                  >
                    {row.isActive ? '上架' : '下架'}
                  </span>
                </td>
                <td className="p-3">
                  <div className="flex flex-wrap gap-2">
                    <Link href={`/admin/animes/${row.id}`} className="text-[12px] underline">
                      编辑
                    </Link>
                    <form action={actionToggleAnime}>
                      <input type="hidden" name="id" value={row.id} />
                      <input type="hidden" name="isActive" value={row.isActive ? '1' : '0'} />
                      <button type="submit" className="text-[12px] underline">
                        {row.isActive ? '下架' : '上架'}
                      </button>
                    </form>
                    <form action={actionDeleteAnime}>
                      <input type="hidden" name="id" value={row.id} />
                      <button type="submit" className="text-[12px] text-[#9F2F2D] underline">
                        删除
                      </button>
                    </form>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-3 font-ui text-sm text-[#787774]">
        <span>
          第 {page}/{totalPages} 页 · 共 {total} 条
        </span>
        {page > 1 && (
          <Link href={`/admin/animes?page=${page - 1}${q ? `&q=${encodeURIComponent(q)}` : ''}`}>
            上一页
          </Link>
        )}
        {page < totalPages && (
          <Link href={`/admin/animes?page=${page + 1}${q ? `&q=${encodeURIComponent(q)}` : ''}`}>
            下一页
          </Link>
        )}
      </div>
    </div>
  );
}
