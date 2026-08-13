'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { ConfirmSubmitButton } from '@/components/confirm-submit-button';

export function useAdminBatchSelection(rowIds: readonly number[]) {
  const [selected, setSelected] = useState<Set<number>>(() => new Set());
  const allSelected = rowIds.length > 0 && rowIds.every((id) => selected.has(id));
  const count = selected.size;
  const selectedIds = useMemo(() => [...selected], [selected]);

  function toggleAll() {
    setSelected((prev) => {
      if (rowIds.every((id) => prev.has(id))) return new Set();
      return new Set(rowIds);
    });
  }

  function toggleOne(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return { selected, selectedIds, toggleOne, toggleAll, allSelected, count };
}

export function AdminBatchToolbar({
  action,
  selectedIds,
  count,
}: {
  action: (formData: FormData) => void | Promise<void>;
  selectedIds: readonly number[];
  count: number;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="inline-flex items-center rounded-full border border-border bg-card px-3 py-1.5 font-meta text-[11px] normal-case tracking-normal text-soft">
        已选 <span className="ml-1 tabular text-ink font-medium">{count}</span>
      </span>

      <form action={action} className="inline-flex">
        {selectedIds.map((id) => (
          <input key={`a-${id}`} type="hidden" name="ids" value={id} />
        ))}
        <input type="hidden" name="op" value="activate" />
        <button type="submit" disabled={count === 0} className="btn-ghost !py-1.5 !px-3 !text-[12px]">
          批量上架
        </button>
      </form>

      <form action={action} className="inline-flex">
        {selectedIds.map((id) => (
          <input key={`d-${id}`} type="hidden" name="ids" value={id} />
        ))}
        <input type="hidden" name="op" value="deactivate" />
        <button type="submit" disabled={count === 0} className="btn-ghost !py-1.5 !px-3 !text-[12px]">
          批量下架
        </button>
      </form>

      <form action={action} className="inline-flex">
        {selectedIds.map((id) => (
          <input key={`x-${id}`} type="hidden" name="ids" value={id} />
        ))}
        <input type="hidden" name="op" value="delete" />
        <ConfirmSubmitButton
          title="删除确认"
          message={`确定删除选中的 ${count} 条？此操作不可恢复。`}
          className="btn-danger !py-1.5 !px-3 !text-[12px]"
          disabled={count === 0}
          confirmLabel="删除"
        >
          批量删除
        </ConfirmSubmitButton>
      </form>
    </div>
  );
}

export function SelectAllCheckbox({
  allSelected,
  onToggle,
  label = '全选本页',
}: {
  allSelected: boolean;
  onToggle: () => void;
  label?: string;
}) {
  return (
    <input
      type="checkbox"
      checked={allSelected}
      onChange={onToggle}
      aria-label={label}
    />
  );
}

export function RowCheckbox({
  id,
  checked,
  onToggle,
}: {
  id: number;
  checked: boolean;
  onToggle: (id: number) => void;
}) {
  return (
    <input
      type="checkbox"
      checked={checked}
      onChange={() => onToggle(id)}
      aria-label={`选择 ${id}`}
    />
  );
}

export function AdminBatchShell({ children }: { children: ReactNode }) {
  return <div className="space-y-3">{children}</div>;
}
