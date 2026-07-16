'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

type FlatClass = {
  typeId: number;
  typePid: number;
  typeName: string;
};

type TreeNode = FlatClass & { children: TreeNode[] };

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
}: {
  provider: string;
  baseUrl: string;
  initialTypeIds: number[];
}) {
  const [flat, setFlat] = useState<FlatClass[]>([]);
  const [selected, setSelected] = useState<Set<number>>(
    () => new Set(initialTypeIds),
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loadedFor, setLoadedFor] = useState('');

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
      setLoadedFor(`${provider}|${baseUrl}`);
      if (body.data?.note) setNotice(body.data.note);
      // Keep prior selection if still valid; else suggest JP anime ids.
      setSelected((prev) => {
        if (prev.size > 0) {
          const valid = new Set(
            [...prev].filter((id) => nextFlat.some((c) => c.typeId === id)),
          );
          if (valid.size) return valid;
        }
        const suggested = body.data?.suggestedTypeIds ?? [];
        if (suggested.length) return new Set(suggested);
        return new Set(initialTypeIds);
      });
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
  }, [baseUrl, provider, initialTypeIds]);

  useEffect(() => {
    // Auto-load when provider/base changes and we have a URL.
    if (!baseUrl.trim()) return;
    const key = `${provider}|${baseUrl}`;
    if (key === loadedFor) return;
    void load();
  }, [provider, baseUrl, loadedFor, load]);

  const toggle = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleBranch = (node: TreeNode, on: boolean) => {
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
      <label
        className="flex items-center gap-2 font-ui text-[12px] text-[#333]"
        style={{ paddingLeft: depth * 14 }}
      >
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
        {node.children.length > 0 && (
          <span className="ml-auto flex gap-1 shrink-0">
            <button
              type="button"
              className="text-[11px] text-[#0B57D0] underline"
              onClick={() => toggleBranch(node, true)}
            >
              全选
            </button>
            <button
              type="button"
              className="text-[11px] text-[#787774] underline"
              onClick={() => toggleBranch(node, false)}
            >
              清空
            </button>
          </span>
        )}
      </label>
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
                onClick={() => setSelected(new Set())}
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

      {/* Submitted to form-config as typeIds */}
      <input type="hidden" name="typeIds" value={typeIdsValue} />
      {/* When user has explicitly selected types, disable auto-detect */}
      <input
        type="hidden"
        name="autoDetectTypes"
        value={selected.size > 0 ? '0' : '0'}
      />

      {error && (
        <p className="font-ui text-[12px] text-[#C5221F] normal-case tracking-normal">
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
        {typeIdsValue ? `：${typeIdsValue}` : '（空 = 不采集任何分类）'}
      </p>
    </div>
  );
}
