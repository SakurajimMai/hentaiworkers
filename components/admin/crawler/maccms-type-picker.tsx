'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

type FlatClass = {
  typeId: number;
  typePid: number;
  typeName: string;
};

type TreeNode = FlatClass & { children: TreeNode[] };

export function reconcileTypeIdsAfterLoad({
  selected,
  availableTypeIds,
  suggestedTypeIds,
  initialTypeIds,
  preserveCurrent,
}: {
  selected: ReadonlySet<number>;
  availableTypeIds: readonly number[];
  suggestedTypeIds: readonly number[];
  initialTypeIds: readonly number[];
  preserveCurrent: boolean;
}): Set<number> {
  if (preserveCurrent) return new Set(selected);
  if (selected.size > 0) {
    const available = new Set(availableTypeIds);
    const valid = new Set([...selected].filter((id) => available.has(id)));
    if (valid.size > 0) return valid;
  }
  if (suggestedTypeIds.length > 0) return new Set(suggestedTypeIds);
  return new Set(initialTypeIds);
}

function buildTree(flat: FlatClass[]): TreeNode[] {
  const map = new Map<number, TreeNode>();
  for (const row of flat) {
    map.set(row.typeId, { ...row, children: [] });
  }
  const roots: TreeNode[] = [];
  for (const node of map.values()) {
    const parent = map.get(node.typePid);
    if (parent && parent.typeId !== node.typeId) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
}

export function MacCmsTypePicker({
  provider,
  baseUrl,
  initialTypeIds,
  preserveCurrentTypeIds = false,
  autoDetectTypes = false,
}: {
  provider: string;
  baseUrl: string;
  initialTypeIds: number[];
  preserveCurrentTypeIds?: boolean;
  autoDetectTypes?: boolean;
}) {
  const [flat, setFlat] = useState<FlatClass[]>([]);
  const [selected, setSelected] = useState<Set<number>>(
    () => new Set(initialTypeIds),
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [autoDetect, setAutoDetect] = useState(autoDetectTypes);
  const autoLoadedProvider = useRef('');

  const tree = useMemo(() => buildTree(flat), [flat]);
  const typeIdsValue = useMemo(
    () => [...selected].sort((a, b) => a - b).join(','),
    [selected],
  );

  const load = useCallback(async () => {
    if (!baseUrl.trim()) {
      setError('请先填写 API Base URL');
      return;
    }
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      const qs = new URLSearchParams({
        provider,
        baseUrl,
      });
      const res = await fetch(`/api/admin/crawler/maccms-class?${qs}`, {
        credentials: 'same-origin',
      });
      const body = (await res.json()) as {
        data?: {
          flat: FlatClass[];
          suggestedTypeIds?: number[];
          note?: string;
          transport?: string;
        };
        error?: { message?: string };
      };
      if (!res.ok) {
        throw new Error(body.error?.message || `HTTP ${res.status}`);
      }
      const nextFlat = body.data?.flat ?? [];
      setFlat(nextFlat);
      if (body.data?.note) setNotice(body.data.note);
      // Keep prior selection if still valid; else suggest JP anime ids.
      setSelected((prev) => reconcileTypeIdsAfterLoad({
        selected: prev,
        availableTypeIds: nextFlat.map((item) => item.typeId),
        suggestedTypeIds: body.data?.suggestedTypeIds ?? [],
        initialTypeIds,
        preserveCurrent: preserveCurrentTypeIds,
      }));
    } catch (e) {
      const raw = e instanceof Error ? e.message : '加载失败';
      // font-meta uppercases text — keep a human sentence in normal case.
      const friendly = /fetch failed|econnreset|connection reset|aborted/i.test(raw)
        ? '无法连接资源站（连接被重置）。请稍后重试，或确认 API Base URL 可访问。'
        : raw;
      setError(friendly);
      setFlat([]);
    } finally {
      setLoading(false);
    }
  }, [baseUrl, provider, initialTypeIds, preserveCurrentTypeIds]);

  useEffect(() => {
    if (!baseUrl.trim()) return;
    if (provider === autoLoadedProvider.current) return;
    autoLoadedProvider.current = provider;
    void load();
  }, [provider, baseUrl, load]);

  const toggle = (id: number) => {
    setAutoDetect(false);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleBranch = (node: TreeNode, on: boolean) => {
    setAutoDetect(false);
    setSelected((prev) => {
      const next = new Set(prev);
      const walk = (n: TreeNode) => {
        if (on) next.add(n.typeId);
        else next.delete(n.typeId);
        n.children.forEach(walk);
      };
      walk(node);
      return next;
    });
  };

  const selectByNameHint = (hints: string[]) => {
    setAutoDetect(false);
    setSelected(() => {
      const next = new Set<number>();
      for (const row of flat) {
        if (hints.some((h) => row.typeName.includes(h))) next.add(row.typeId);
      }
      return next;
    });
  };

  const renderNode = (node: TreeNode, depth: number) => (
    <div key={node.typeId} className="space-y-1">
      <div
        className="flex min-h-9 items-center gap-2 font-ui text-[12px] text-[#333]"
        style={{ paddingLeft: depth * 14 }}
      >
        <label className="flex min-w-0 flex-1 items-center gap-2">
          <input
            type="checkbox"
            checked={selected.has(node.typeId)}
            onChange={() => toggle(node.typeId)}
          />
          <span className="min-w-0">
            <span className="font-medium">{node.typeName}</span>
            <span className="ml-1 font-mono text-[11px] text-[#787774]">
              #{node.typeId}
            </span>
          </span>
        </label>
        {node.children.length > 0 && (
          <span className="ml-auto flex gap-1 shrink-0">
            <button
              type="button"
              className="min-h-8 px-1 text-[11px] text-[#0B57D0] underline"
              onClick={() => toggleBranch(node, true)}
            >
              全选
            </button>
            <button
              type="button"
              className="min-h-8 px-1 text-[11px] text-[#787774] underline"
              onClick={() => toggleBranch(node, false)}
            >
              清空
            </button>
          </span>
        )}
      </div>
      {node.children.map((child) => renderNode(child, depth + 1))}
    </div>
  );

  return (
    <div className="space-y-2 rounded-lg border border-[#EAEAEA] bg-[#FAFAF8] p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-ui text-sm font-semibold text-[#111]">采集分类勾选</p>
          <p className="font-meta text-[11px] text-[#787774] mt-0.5">
            仅采集勾选的 typeId；未勾选任何分类则不会自动乱采（请点加载后勾选）。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {flat.length > 0 && (
            <>
              <button
                type="button"
                className="btn-ghost !py-1.5 !px-2.5 !text-[11px]"
                onClick={() => selectByNameHint(['日本动漫', '日韩动漫', '里番'])}
              >
                快捷：日本/里番
              </button>
              <button
                type="button"
                className="btn-ghost !py-1.5 !px-2.5 !text-[11px]"
                onClick={() => selectByNameHint(['动漫'])}
              >
                快捷：全部动漫
              </button>
              <button
                type="button"
                className="btn-ghost !py-1.5 !px-2.5 !text-[11px]"
                onClick={() => {
                  setAutoDetect(false);
                  setSelected(new Set());
                }}
              >
                清空勾选
              </button>
            </>
          )}
          <button
            type="button"
            className="btn-ghost !py-1.5 !px-3 !text-[12px]"
            onClick={() => void load()}
            disabled={loading}
          >
            {loading ? '加载中…' : '从 API 加载分类'}
          </button>
        </div>
      </div>

      <input type="hidden" name="typeIds" value={typeIdsValue} />
      <input
        type="hidden"
        name="autoDetectTypes"
        value={autoDetect ? '1' : '0'}
      />

      {error && (
        <p role="alert" className="font-ui text-[12px] text-[#C5221F] normal-case tracking-normal">
          加载失败：{error}
        </p>
      )}
      {!error && notice && (
        <p className="font-ui text-[12px] text-[#8A6D1D] normal-case tracking-normal">
          {notice}
        </p>
      )}

      {flat.length > 0 ? (
        <div className="max-h-72 overflow-auto space-y-1 rounded-md border border-[#EAEAEA] bg-white p-2">
          {tree.map((node) => renderNode(node, 0))}
        </div>
      ) : (
        <p className="font-ui text-[12px] text-[#787774]">
          尚未加载分类列表。切换资源站后会自动请求，也可手动点击「从 API 加载分类」。
        </p>
      )}

      <p className="font-meta text-[11px] text-[#787774]">
        已选 {selected.size} 项
        {typeIdsValue
          ? `：${typeIdsValue}`
          : autoDetect
            ? '（空 = Worker 自动识别分类）'
            : '（空 = 不采集任何分类）'}
      </p>
      {autoDetect ? (
        <label className="field-check text-[12px]">
          <input
            type="checkbox"
            checked={autoDetect}
            onChange={(event) => setAutoDetect(event.target.checked)}
          />
          保留旧模板的自动识别分类策略
        </label>
      ) : null}
    </div>
  );
}
