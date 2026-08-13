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

export type AdminAnimeRow = {
  id: number;
  title: string;
  isActive: boolean;
  viewCount: number;
};

export function AnimesBatchList({
  rows,
  batchAction,
  toggleAction,
  deleteAction,
}: {
  rows: readonly AdminAnimeRow[];
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
        <div className="space-y-2 p-3 md:hidden">
          {rows.map((row) => (
            <article key={row.id} className={`admin-mobile-card ${selected.has(row.id) ? '!bg-accent-soft/60' : ''}`}>
              <div className="flex items-start gap-3">
                <RowCheckbox id={row.id} checked={selected.has(row.id)} onToggle={toggleOne} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <Link href={`/admin/animes/${row.id}`} className="min-w-0 font-ui text-[14px] font-medium leading-snug text-ink hover:underline">
                      {row.title}
                    </Link>
                    <span className={`status-pill shrink-0 ${row.isActive ? 'status-pill-on' : 'status-pill-off'}`}>
                      {row.isActive ? '上架' : '下架'}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center gap-3 font-meta text-[10px] normal-case tracking-normal text-soft">
                    <span>ID {row.id}</span>
                    <span>{row.viewCount ?? 0} 次播放</span>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border pt-3">
                    <Link href={`/admin/animes/${row.id}`} className="font-ui text-[12px] text-foreground underline-offset-2 hover:underline">编辑</Link>
                    <form action={toggleAction}>
                      <input type="hidden" name="id" value={row.id} />
                      <input type="hidden" name="isActive" value={row.isActive ? '1' : '0'} />
                      <button type="submit" className="font-ui text-[12px] text-foreground underline-offset-2 hover:underline">
                        {row.isActive ? '下架' : '上架'}
                      </button>
                    </form>
                    <form action={deleteAction}>
                      <input type="hidden" name="id" value={row.id} />
                      <ConfirmSubmitButton
                        title="删除确认"
                        message={`确定删除「${row.title}」？此操作不可恢复。`}
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
          {rows.length === 0 && <p className="px-3 py-8 text-center font-ui text-[13px] text-soft">暂无里番</p>}
        </div>

        <div className="hidden overflow-x-auto md:block">
          <table className="admin-table">
            <thead>
              <tr>
                <th className="w-10">
                  <SelectAllCheckbox allSelected={allSelected} onToggle={toggleAll} />
                </th>
                <th>ID</th>
                <th>标题</th>
                <th>播放</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className={selected.has(row.id) ? '!bg-accent-soft/60' : undefined}>
                  <td>
                    <RowCheckbox
                      id={row.id}
                      checked={selected.has(row.id)}
                      onToggle={toggleOne}
                    />
                  </td>
                  <td className="font-mono text-[12px] text-soft tabular">{row.id}</td>
                  <td>
                    <Link
                      href={`/admin/animes/${row.id}`}
                      className="font-medium text-ink hover:underline underline-offset-2"
                    >
                      {row.title}
                    </Link>
                  </td>
                  <td className="tabular text-[13px] text-foreground">{row.viewCount ?? 0}</td>
                  <td>
                    <span
                      className={`status-pill ${row.isActive ? 'status-pill-on' : 'status-pill-off'}`}
                    >
                      {row.isActive ? '上架' : '下架'}
                    </span>
                  </td>
                  <td>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <Link
                        href={`/admin/animes/${row.id}`}
                        className="text-[12px] text-foreground underline-offset-2 hover:underline"
                      >
                        编辑
                      </Link>
                      <form action={toggleAction}>
                        <input type="hidden" name="id" value={row.id} />
                        <input type="hidden" name="isActive" value={row.isActive ? '1' : '0'} />
                        <button
                          type="submit"
                          className="text-[12px] text-foreground underline-offset-2 hover:underline"
                        >
                          {row.isActive ? '下架' : '上架'}
                        </button>
                      </form>
                      <form action={deleteAction}>
                        <input type="hidden" name="id" value={row.id} />
                        <ConfirmSubmitButton
                          title="删除确认"
                          message={`确定删除「${row.title}」？此操作不可恢复。`}
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
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="!p-12 text-center">
                    <p className="font-ui text-[14px] text-ink">暂无里番</p>
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
