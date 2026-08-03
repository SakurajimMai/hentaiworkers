import Link from 'next/link';
import { sql, like, or, desc } from 'drizzle-orm';
import { db } from '@/lib/db';
import { animes } from '@/lib/schema';
import {
  actionBatchAnimes,
  actionDeleteAnime,
  actionToggleAnime,
} from '../actions';
import { AnimesBatchList } from '@/components/admin/animes-batch-list';

export const dynamic = 'force-dynamic';

export default async function AdminAnimesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const q = typeof sp.q === 'string' ? sp.q : '';
  const page = Math.max(1, parseInt(String(sp.page || '1'), 10) || 1);
  const ok = typeof sp.ok === 'string' ? sp.ok : '';
  const err = typeof sp.error === 'string' ? sp.error : '';
  const n = typeof sp.n === 'string' ? sp.n : '';
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
          <p className="font-meta mb-2">里番 · animes / tags</p>
          <h1 className="section-title text-3xl text-[#111]">里番管理</h1>
          <p className="mt-2 font-ui text-sm text-[#6f6d68] leading-relaxed">
            里番片库与标签（tags）。支持批量上架/下架/删除。
          </p>
        </div>
        <Link href="/admin/animes/new" className="btn-ink !text-[13px]">
          新建里番
        </Link>
      </div>

      {ok.startsWith('batch_') && (
        <div className="rounded-xl border border-[#d8ebda] bg-[#edf7ee] px-4 py-3 font-ui text-[13px] text-[#346538]">
          批量操作完成{n ? `（${n} 条）` : ''}
        </div>
      )}
      {err === 'batch_empty' && (
        <div className="rounded-xl border border-[#f3d4d3] bg-[#fdf2f2] px-4 py-3 font-ui text-[13px] text-[#9F2F2D]">
          请先勾选条目
        </div>
      )}

      <form className="surface-card p-3 sm:p-4 flex flex-col sm:flex-row gap-2">
        <input
          name="q"
          defaultValue={q}
          placeholder="搜索标题"
          className="admin-input sm:max-w-sm"
        />
        <button type="submit" className="btn-ink !text-[13px]">
          搜索
        </button>
      </form>

      <AnimesBatchList
        rows={rows.map((row) => ({
          id: row.id,
          title: row.title,
          isActive: !!row.isActive,
          viewCount: Number(row.viewCount ?? 0),
        }))}
        batchAction={actionBatchAnimes}
        toggleAction={actionToggleAnime}
        deleteAction={actionDeleteAnime}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-meta text-[12px] normal-case tracking-normal text-[#6f6d68]">
          第 {page}/{totalPages} 页 · 共 {total} 条
        </p>
        <div className="flex gap-2">
          {page > 1 && (
            <Link
              href={`/admin/animes?page=${page - 1}${q ? `&q=${encodeURIComponent(q)}` : ''}`}
              className="btn-ghost !py-1.5 !px-3 !text-[12px]"
            >
              上一页
            </Link>
          )}
          {page < totalPages && (
            <Link
              href={`/admin/animes?page=${page + 1}${q ? `&q=${encodeURIComponent(q)}` : ''}`}
              className="btn-ghost !py-1.5 !px-3 !text-[12px]"
            >
              下一页
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
