'use client';

import Link from 'next/link';
import { ConfirmSubmitButton } from '@/components/confirm-submit-button';
import {
  AdminBatchShell,
  AdminBatchToolbar,
  RowCheckbox,
  SelectAllCheckbox,
  useAdminBatchSelection,
} from '@/components/admin/batch-table';

export type AdminWorkRow = {
  id: number;
  title: string;
  streamUrl: string;
  streamFormat: string;
  isActive: boolean;
  playLineCount: number;
  episodeCount: number;
  sourcesLabel: string;
};

export function WorksBatchList({
  rows,
  batchAction,
  toggleAction,
  deleteAction,
}: {
  rows: readonly AdminWorkRow[];
  batchAction: (formData: FormData) => void | Promise<void>;
  toggleAction: (formData: FormData) => void | Promise<void>;
  deleteAction: (formData: FormData) => void | Promise<void>;
}) {
  const ids = rows.map((r) => r.id);
  const { selected, selectedIds, toggleOne, toggleAll, allSelected, count } =
    useAdminBatchSelection(ids);

  return (
    <AdminBatchShell>
      <AdminBatchToolbar action={batchAction} selectedIds={selectedIds} count={count} />

      <div className="surface-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="admin-table">
            <thead>
              <tr>
                <th className="w-10">
                  <SelectAllCheckbox allSelected={allSelected} onToggle={toggleAll} />
                </th>
                <th>ID</th>
                <th>标题</th>
                <th>来源</th>
                <th>线路/集</th>
                <th>格式</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className={selected.has(row.id) ? '!bg-[#f7f4ec]' : undefined}>
                  <td>
                    <RowCheckbox
                      id={row.id}
                      checked={selected.has(row.id)}
                      onToggle={toggleOne}
                    />
                  </td>
                  <td className="font-mono text-[12px] text-[#6f6d68] tabular">{row.id}</td>
                  <td className="min-w-[16rem]">
                    <Link
                      href={`/admin/works/${row.id}`}
                      className="font-medium text-[#111] hover:underline underline-offset-2"
                    >
                      {row.title}
                    </Link>
                    <div className="mt-1 font-mono text-[11px] text-[#9a978f] break-all line-clamp-1">
                      {row.streamUrl}
                    </div>
                  </td>
                  <td className="font-meta text-[11px] normal-case tracking-normal">
                    {row.sourcesLabel || '—'}
                  </td>
                  <td className="whitespace-nowrap text-[12px] text-[#555]">
                    {row.playLineCount} 线 / {row.episodeCount} 集
                  </td>
                  <td>
                    <span className="admin-chip">{row.streamFormat || '—'}</span>
                  </td>
                  <td>
                    <span
                      className={`status-pill ${row.isActive ? 'status-pill-on' : 'status-pill-off'}`}
                    >
                      {row.isActive ? '上架' : '下架'}
                    </span>
                  </td>
                  <td className="whitespace-nowrap">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <Link
                        href={`/admin/works/${row.id}`}
                        className="text-[12px] text-[#333] underline-offset-2 hover:underline"
                      >
                        编辑
                      </Link>
                      <Link
                        href={`/works/${row.id}`}
                        className="text-[12px] text-[#333] underline-offset-2 hover:underline"
                        target="_blank"
                      >
                        前台
                      </Link>
                      <form action={toggleAction} className="inline">
                        <input type="hidden" name="id" value={row.id} />
                        <input type="hidden" name="isActive" value={row.isActive ? '0' : '1'} />
                        <button
                          type="submit"
                          className="text-[12px] text-[#333] underline-offset-2 hover:underline"
                        >
                          {row.isActive ? '下架' : '上架'}
                        </button>
                      </form>
                      <form action={deleteAction} className="inline">
                        <input type="hidden" name="id" value={row.id} />
                        <ConfirmSubmitButton
                          title="删除确认"
                          message={`确定删除「${row.title}」？此操作不可恢复。`}
                          className="text-[12px] text-[#9F2F2D] underline-offset-2 hover:underline"
                          confirmLabel="删除"
                        >
                          删除
                        </ConfirmSubmitButton>
                      </form>
                    </div>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="!p-12 text-center">
                    <p className="font-ui text-[14px] text-[#111]">暂无外链作品</p>
                    <p className="mt-1 font-meta text-[12px] normal-case tracking-normal">
                      请运行 MacCMS 采集任务
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AdminBatchShell>
  );
}
