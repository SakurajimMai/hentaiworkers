import Link from 'next/link';
import { getWorksQueryService } from '@/lib/server/works';
import { requireAdmin } from '@/lib/auth';
import {
  actionBatchWorks,
  actionDeleteWork,
  actionToggleWork,
} from '../actions';
import { WorksBatchList } from '@/components/admin/works-batch-list';

export const dynamic = 'force-dynamic';

export default async function AdminWorksPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const q = typeof sp.q === 'string' ? sp.q : '';
  const source = typeof sp.source === 'string' ? sp.source : '';
  const page = Math.max(1, parseInt(String(sp.page || '1'), 10) || 1);
  const ok = typeof sp.ok === 'string' ? sp.ok : '';
  const err = typeof sp.error === 'string' ? sp.error : '';
  const n = typeof sp.n === 'string' ? sp.n : '';
  const result = await getWorksQueryService().list({
    page,
    limit: 30,
    search: q || undefined,
    source: source || undefined,
    activeOnly: false,
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <p className="font-meta mb-2">动漫 · anime_works</p>
          <h1 className="section-title text-3xl text-[#111]">动漫管理</h1>
          <p className="mt-2 font-ui text-sm text-[#6f6d68] max-w-2xl leading-relaxed">
            MacCMS 外链动漫独立表，只存 m3u8/直链与 work_tags 标签；不写入里番 animes，也不下载文件。
            支持单条删除与批量上架/下架/删除。
          </p>
        </div>
        <Link href="/works" className="btn-ghost !text-[13px]">
          前台动漫馆
        </Link>
      </div>

      {ok === 'deleted' && (
        <div className="rounded-xl border border-[#d8ebda] bg-[#edf7ee] px-4 py-3 font-ui text-[13px] text-[#346538]">
          已删除
        </div>
      )}
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
      {err === 'id' && (
        <div className="rounded-xl border border-[#f3d4d3] bg-[#fdf2f2] px-4 py-3 font-ui text-[13px] text-[#9F2F2D]">
          条目不存在或 ID 无效
        </div>
      )}

      <form className="surface-card p-3 sm:p-4 flex flex-col sm:flex-row flex-wrap gap-2">
        <input
          name="q"
          defaultValue={q}
          placeholder="搜索标题"
          className="admin-input sm:max-w-sm"
        />
        <input
          name="source"
          defaultValue={source}
          placeholder="source（如 ikun）"
          className="admin-input sm:max-w-[11rem]"
        />
        <button type="submit" className="btn-ink !text-[13px]">
          搜索
        </button>
      </form>

      <WorksBatchList
        rows={result.data.map((row) => ({
          id: row.id,
          title: row.title,
          streamUrl: row.streamUrl,
          streamFormat: row.streamFormat,
          isActive: row.isActive,
          playLineCount: row.playLineCount,
          episodeCount: row.episodeCount,
          sourcesLabel: row.sources.map((s) => `${s.source}:${s.sourceId}`).join(', '),
        }))}
        batchAction={actionBatchWorks}
        toggleAction={actionToggleWork}
        deleteAction={actionDeleteWork}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-meta text-[12px] normal-case tracking-normal text-[#6f6d68]">
          共 {result.total} 条 · 第 {result.page}/{result.totalPages} 页
        </p>
        {result.totalPages > 1 && (
          <div className="flex gap-2">
            {page > 1 && (
              <Link
                href={`/admin/works?page=${page - 1}${q ? `&q=${encodeURIComponent(q)}` : ''}${source ? `&source=${encodeURIComponent(source)}` : ''}`}
                className="btn-ghost !py-1.5 !px-3 !text-[12px]"
              >
                上一页
              </Link>
            )}
            {page < result.totalPages && (
              <Link
                href={`/admin/works?page=${page + 1}${q ? `&q=${encodeURIComponent(q)}` : ''}${source ? `&source=${encodeURIComponent(source)}` : ''}`}
                className="btn-ghost !py-1.5 !px-3 !text-[12px]"
              >
                下一页
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
