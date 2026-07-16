'use client';

import { useMemo, useState } from 'react';

export type EditableEpisode = {
  name: string;
  url: string;
};

export type EditablePlayLine = {
  name: string;
  flag: string;
  episodes: EditableEpisode[];
};

type Props = {
  initialLines: ReadonlyArray<EditablePlayLine>;
  /** Hidden form field name consumed by actionSaveWork. */
  fieldName?: string;
};

function cloneLines(lines: ReadonlyArray<EditablePlayLine>): EditablePlayLine[] {
  return lines.map((line) => ({
    name: line.name,
    flag: line.flag,
    episodes: line.episodes.map((ep) => ({ name: ep.name, url: ep.url })),
  }));
}

function toJson(lines: EditablePlayLine[]): string {
  const cleaned = lines
    .map((line) => {
      const name = line.name.trim();
      const flag = (line.flag.trim() || name).trim();
      const episodes = line.episodes
        .map((ep) => ({ name: ep.name.trim(), url: ep.url.trim() }))
        .filter((ep) => ep.name && ep.url);
      if (!name || episodes.length === 0) return null;
      return { name, flag, episodes };
    })
    .filter((x): x is { name: string; flag: string; episodes: EditableEpisode[] } => !!x);
  return JSON.stringify(cleaned, null, 2);
}

export function WorksPlayLinesEditor({
  initialLines,
  fieldName = 'playLinesJson',
}: Props) {
  const [lines, setLines] = useState<EditablePlayLine[]>(() =>
    cloneLines(initialLines.length ? initialLines : [{ name: '', flag: '', episodes: [{ name: '', url: '' }] }]),
  );
  const [showRaw, setShowRaw] = useState(false);
  const [rawText, setRawText] = useState(() => toJson(cloneLines(initialLines)));
  const [rawError, setRawError] = useState<string | null>(null);

  const jsonValue = useMemo(() => (showRaw ? rawText : toJson(lines)), [showRaw, rawText, lines]);
  const lineCount = lines.filter((l) => l.name.trim()).length;
  const episodeCount = lines.reduce(
    (sum, line) => sum + line.episodes.filter((ep) => ep.name.trim() && ep.url.trim()).length,
    0,
  );

  function updateLine(index: number, patch: Partial<EditablePlayLine>) {
    setLines((prev) =>
      prev.map((line, i) => (i === index ? { ...line, ...patch } : line)),
    );
  }

  function updateEpisode(
    lineIndex: number,
    episodeIndex: number,
    patch: Partial<EditableEpisode>,
  ) {
    setLines((prev) =>
      prev.map((line, i) => {
        if (i !== lineIndex) return line;
        return {
          ...line,
          episodes: line.episodes.map((ep, j) =>
            j === episodeIndex ? { ...ep, ...patch } : ep,
          ),
        };
      }),
    );
  }

  function addLine() {
    setLines((prev) => [
      ...prev,
      { name: `线路${prev.length + 1}`, flag: `line${prev.length + 1}`, episodes: [{ name: '第01集', url: '' }] },
    ]);
  }

  function removeLine(index: number) {
    setLines((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)));
  }

  function addEpisode(lineIndex: number) {
    setLines((prev) =>
      prev.map((line, i) => {
        if (i !== lineIndex) return line;
        const n = line.episodes.length + 1;
        const label = `第${String(n).padStart(2, '0')}集`;
        return { ...line, episodes: [...line.episodes, { name: label, url: '' }] };
      }),
    );
  }

  function removeEpisode(lineIndex: number, episodeIndex: number) {
    setLines((prev) =>
      prev.map((line, i) => {
        if (i !== lineIndex) return line;
        if (line.episodes.length <= 1) return line;
        return {
          ...line,
          episodes: line.episodes.filter((_, j) => j !== episodeIndex),
        };
      }),
    );
  }

  function switchToRaw() {
    setRawText(toJson(lines));
    setRawError(null);
    setShowRaw(true);
  }

  function applyRaw() {
    const text = rawText.trim();
    if (!text) {
      setLines([{ name: '', flag: '', episodes: [{ name: '', url: '' }] }]);
      setRawError(null);
      setShowRaw(false);
      return;
    }
    if (text === '[]') {
      setLines([{ name: '', flag: '', episodes: [{ name: '', url: '' }] }]);
      setRawError(null);
      setShowRaw(false);
      return;
    }
    try {
      const data = JSON.parse(text) as unknown;
      if (!Array.isArray(data)) {
        setRawError('顶层必须是数组');
        return;
      }
      const next: EditablePlayLine[] = [];
      for (const item of data) {
        if (!item || typeof item !== 'object') continue;
        const rec = item as Record<string, unknown>;
        const name = String(rec.name ?? rec.flag ?? '').trim();
        const flag = String(rec.flag ?? rec.name ?? '').trim() || name;
        const episodesRaw = Array.isArray(rec.episodes) ? rec.episodes : [];
        const episodes = episodesRaw
          .map((ep) => {
            if (!ep || typeof ep !== 'object') return null;
            const e = ep as Record<string, unknown>;
            return {
              name: String(e.name ?? '').trim(),
              url: String(e.url ?? '').trim(),
            };
          })
          .filter((x): x is EditableEpisode => !!x && (!!x.name || !!x.url));
        if (!name && episodes.length === 0) continue;
        next.push({
          name,
          flag,
          episodes: episodes.length ? episodes : [{ name: '', url: '' }],
        });
      }
      if (next.length === 0) {
        setRawError('没有有效线路');
        return;
      }
      setLines(next);
      setRawError(null);
      setShowRaw(false);
    } catch {
      setRawError('JSON 解析失败');
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <label className="admin-label mb-0">播放线路 / 分集</label>
          <p className="font-ui text-[11px] text-[#787774]">
            当前约 {lineCount} 条线路 · {episodeCount} 集（空行保存时会被忽略）
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!showRaw ? (
            <>
              <button type="button" className="btn-ghost text-[12px]" onClick={addLine}>
                + 线路
              </button>
              <button type="button" className="btn-ghost text-[12px]" onClick={switchToRaw}>
                高级 JSON
              </button>
            </>
          ) : (
            <>
              <button type="button" className="btn-ghost text-[12px]" onClick={applyRaw}>
                应用 JSON
              </button>
              <button
                type="button"
                className="btn-ghost text-[12px]"
                onClick={() => {
                  setShowRaw(false);
                  setRawError(null);
                }}
              >
                返回表单
              </button>
            </>
          )}
        </div>
      </div>

      {/* Always submitted with the parent form */}
      <input type="hidden" name={fieldName} value={jsonValue} />

      {showRaw ? (
        <div className="space-y-2">
          <textarea
            className="admin-input min-h-[240px] font-mono text-[12px]"
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            spellCheck={false}
          />
          {rawError && (
            <p className="font-ui text-[12px] text-red-700">{rawError}</p>
          )}
          <p className="font-ui text-[11px] text-[#787774]">
            保存前请先点「应用 JSON」。填写 <code>[]</code> 可清空全部线路。
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {lines.map((line, lineIndex) => (
            <div
              key={lineIndex}
              className="rounded-lg border border-[#EAEAEA] bg-[#FCFCFB] p-3 space-y-3"
            >
              <div className="flex flex-wrap items-end gap-2">
                <div className="min-w-[8rem] flex-1">
                  <label className="admin-label">线路名称</label>
                  <input
                    className="admin-input"
                    value={line.name}
                    onChange={(e) => updateLine(lineIndex, { name: e.target.value })}
                    placeholder="例如 线路1 / 高清"
                  />
                </div>
                <div className="min-w-[6rem] w-40">
                  <label className="admin-label">flag</label>
                  <input
                    className="admin-input"
                    value={line.flag}
                    onChange={(e) => updateLine(lineIndex, { flag: e.target.value })}
                    placeholder="line1"
                  />
                </div>
                <button
                  type="button"
                  className="btn-ghost text-[12px] text-red-700"
                  onClick={() => removeLine(lineIndex)}
                  disabled={lines.length <= 1}
                >
                  删除线路
                </button>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="font-meta text-[11px] text-[#787774]">分集</p>
                  <button
                    type="button"
                    className="btn-ghost text-[12px]"
                    onClick={() => addEpisode(lineIndex)}
                  >
                    + 分集
                  </button>
                </div>
                {line.episodes.map((ep, episodeIndex) => (
                  <div
                    key={episodeIndex}
                    className="grid gap-2 sm:grid-cols-[7rem_1fr_auto]"
                  >
                    <input
                      className="admin-input"
                      value={ep.name}
                      onChange={(e) =>
                        updateEpisode(lineIndex, episodeIndex, { name: e.target.value })
                      }
                      placeholder="第01集"
                    />
                    <input
                      className="admin-input font-mono text-[12px]"
                      value={ep.url}
                      onChange={(e) =>
                        updateEpisode(lineIndex, episodeIndex, { url: e.target.value })
                      }
                      placeholder="https://.../01.m3u8"
                    />
                    <button
                      type="button"
                      className="btn-ghost text-[12px]"
                      onClick={() => removeEpisode(lineIndex, episodeIndex)}
                      disabled={line.episodes.length <= 1}
                    >
                      删
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
