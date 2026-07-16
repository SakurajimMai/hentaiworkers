'use client';

import { useMemo, useState } from 'react';
import { ArtPlayer } from '@/components/art-player';
import { ParserPlayer } from '@/components/parser-player';
import {
  buildClientParserPlaybackUrl,
  DEFAULT_CLIENT_PLAYER_CONFIG,
  resolveClientLineParser,
  type ClientPlayerConfig,
} from '@/lib/client/player-config';
import type { WorkPlayLine } from '@/lib/server/works/domain/models';

export function WorksPlayPanel({
  title,
  coverUrl,
  streamUrl,
  playLines,
  playerConfig,
}: {
  title: string;
  coverUrl?: string | null;
  streamUrl: string;
  playLines: ReadonlyArray<WorkPlayLine>;
  playerConfig?: ClientPlayerConfig;
}) {
  const config = playerConfig ?? DEFAULT_CLIENT_PLAYER_CONFIG;

  const lines = useMemo(() => {
    if (playLines.length > 0) return [...playLines];
    if (!streamUrl) return [] as WorkPlayLine[];
    return [
      {
        name: '默认',
        flag: 'default',
        episodes: [{ name: '正片', url: streamUrl }],
      },
    ];
  }, [playLines, streamUrl]);

  const [lineIndex, setLineIndex] = useState(0);
  const safeLineIndex = Math.min(lineIndex, Math.max(0, lines.length - 1));
  const currentLine = lines[safeLineIndex];
  const [episodeIndex, setEpisodeIndex] = useState(() =>
    Math.max(0, (currentLine?.episodes.length ?? 1) - 1),
  );

  const episodes = currentLine?.episodes ?? [];
  const safeEpisodeIndex = Math.min(episodeIndex, Math.max(0, episodes.length - 1));
  const current = episodes[safeEpisodeIndex];

  const matchedParser = currentLine
    ? resolveClientLineParser(currentLine, config.lineParsers)
    : null;
  const parserSrc =
    matchedParser && current?.url
      ? buildClientParserPlaybackUrl(matchedParser.parserUrl, current.url)
      : '';

  const useExternalParser = Boolean(parserSrc);
  const canUseArtFallback = config.worksFallbackArtPlayer;
  const showArt = !useExternalParser && canUseArtFallback && Boolean(current?.url);

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-2xl border border-[#e8e4dc] bg-[#1a1917] shadow-ink">
        <div className="relative w-full" style={{ paddingBottom: '56.25%' }}>
          <div className="absolute inset-0">
            {useExternalParser ? (
              <ParserPlayer
                key={parserSrc}
                src={parserSrc}
                title={`${title} · ${currentLine?.name ?? ''} · ${current?.name ?? ''}`}
                className="h-full w-full border-0 bg-black"
              />
            ) : showArt ? (
              <ArtPlayer
                key={current!.url}
                id={`work-${currentLine?.flag ?? 'default'}-${safeEpisodeIndex}-${current!.url}`}
                url={current!.url}
                poster={coverUrl}
                title={`${title} · ${currentLine?.name ?? ''} · ${current!.name}`}
                autoplay={false}
                // Episode-scoped local resume for MacCMS ArtPlayer fallback.
                autoPlayback
                mediaKind={
                  /\.m3u8(\?|#|$)/i.test(current!.url)
                  || /m3u8/i.test(current!.url)
                  || /m3u8/i.test(currentLine?.flag ?? '')
                  || /m3u8/i.test(currentLine?.name ?? '')
                    ? 'hls'
                    : 'auto'
                }
                useProxy
                playerConfig={config}
                className="h-full w-full bg-black"
              />
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center">
                <p className="font-ui text-sm text-white/70">
                  {current?.url
                    ? '该线路未配置解析播放器，且已关闭 ArtPlayer 回退'
                    : '暂无可用播放地址'}
                </p>
                {current?.url ? (
                  <a
                    href={current.url}
                    target="_blank"
                    rel="noreferrer"
                    className="font-meta text-[12px] text-[#ff8a80] underline break-all"
                  >
                    打开原始地址
                  </a>
                ) : null}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-[#ece8e0] bg-[#171717] text-[#E8E8E8] p-4 sm:p-5 space-y-4 shadow-[0_8px_30px_rgba(17,17,17,0.08)]">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-ui text-sm font-medium text-[#F2F2F2] inline-flex items-center gap-2">
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-white text-[10px] text-[#1a1917]">
              ▶
            </span>
            在线播放
          </p>
          <p className="font-meta text-[11px] normal-case tracking-normal text-[#9A9A9A]">
            {useExternalParser
              ? `解析：${matchedParser?.match}`
              : showArt
                ? 'ArtPlayer · 支持记忆播放 / 旋转 / 横屏'
                : '视频如果未正常播放或者卡顿，请切换播放源'}
          </p>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {lines.map((line, idx) => {
            const active = idx === safeLineIndex;
            const parser = resolveClientLineParser(line, config.lineParsers);
            return (
              <button
                key={`${line.flag}-${idx}`}
                type="button"
                onClick={() => {
                  setLineIndex(idx);
                  setEpisodeIndex(Math.max(0, line.episodes.length - 1));
                }}
                className={`rounded-full px-3.5 py-1.5 font-ui text-[12px] font-medium transition-colors ${
                  active
                    ? 'bg-white text-[#1a1917]'
                    : 'bg-white/8 text-[#B8B8B8] hover:bg-white/12 hover:text-white'
                }`}
                title={parser ? `解析：${parser.parserUrl}` : line.flag}
              >
                {parser ? (
                  <span className="mr-1.5 inline-flex items-center rounded-full bg-[#E53935] px-1.5 py-0.5 text-[10px] font-medium leading-none text-white">
                    解析
                  </span>
                ) : null}
                {line.name}
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
          {episodes.map((ep, idx) => {
            const active = idx === safeEpisodeIndex;
            return (
              <button
                key={`${ep.name}-${idx}`}
                type="button"
                onClick={() => setEpisodeIndex(idx)}
                className={`rounded-xl border px-2 py-2.5 font-ui text-[12px] transition-colors ${
                  active
                    ? 'border-white/40 bg-white text-[#1a1917]'
                    : 'border-white/10 bg-white/5 text-[#D0D0D0] hover:border-white/20 hover:text-white'
                }`}
                title={ep.url}
              >
                {ep.name}
              </button>
            );
          })}
        </div>

        {current?.url && (
          <p className="font-meta text-[11px] normal-case tracking-normal text-[#8A8A8A] break-all">
            当前：{title} · {currentLine?.name} · {current.name}
            {useExternalParser ? ' · 外部解析' : ' · ArtPlayer'}
          </p>
        )}
      </div>
    </div>
  );
}
