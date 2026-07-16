'use client';

import type Artplayer from 'artplayer';
import { useCallback, useEffect, useRef } from 'react';
import { ArtPlayer } from '@/components/art-player';
import type { ClientPlayerConfig } from '@/lib/client/player-config';
import {
  clearLocalWatchProgress,
  isCompletedProgress,
  readLocalWatchProgress,
  upsertLocalWatchProgress,
  type LocalWatchProgress,
} from '@/lib/client/watch-progress-storage';

const FLUSH_INTERVAL_MS = 20_000;
const SEEK_RESUME_THRESHOLD = 5;

type Props = {
  animeId: number;
  videoUrl: string;
  poster?: string | null;
  title: string;
  cover?: string | null;
  /** Server progress when logged in */
  initialPositionSeconds?: number;
  initialDurationSeconds?: number;
  loggedIn: boolean;
  /** Admin player settings (ads / context menu). 里番 uses ArtPlayer only. */
  playerConfig?: ClientPlayerConfig;
};

export function WatchPlayer({
  animeId,
  videoUrl,
  poster,
  title,
  cover,
  initialPositionSeconds = 0,
  initialDurationSeconds = 0,
  loggedIn,
  playerConfig,
}: Props) {
  const artRef = useRef<Artplayer | null>(null);
  const lastFlushAt = useRef(0);
  const startedRef = useRef(false);
  const completedRef = useRef(false);
  const milestonesRef = useRef<Set<number>>(new Set());
  const localSeed = useRef<LocalWatchProgress | null>(null);

  useEffect(() => {
    if (!loggedIn) {
      localSeed.current = readLocalWatchProgress().find((r) => r.animeId === animeId) ?? null;
    }
  }, [animeId, loggedIn]);

  const persist = useCallback(
    async (
      positionSeconds: number,
      durationSeconds: number,
      clientEvent:
        | 'play_start'
        | 'play_progress'
        | 'play_25_percent'
        | 'play_50_percent'
        | 'play_75_percent'
        | 'play_complete'
        | 'pause'
        | null,
      force = false,
    ) => {
      const completed = isCompletedProgress(positionSeconds, durationSeconds, completedRef.current);
      if (completed) completedRef.current = true;

      const payload = {
        animeId,
        positionSeconds: Math.floor(Math.max(0, positionSeconds)),
        durationSeconds: Math.floor(Math.max(0, durationSeconds)),
        completed,
        lastWatchedAt: new Date().toISOString(),
        title,
        cover: cover ?? null,
      };

      if (!loggedIn) {
        upsertLocalWatchProgress(payload);
        return;
      }

      try {
        await fetch(`/api/me/watch-progress/${animeId}`, {
          method: 'PUT',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            positionSeconds: payload.positionSeconds,
            durationSeconds: payload.durationSeconds,
            completed: payload.completed,
            force,
            clientEvent,
          }),
          keepalive: clientEvent === 'play_complete' || clientEvent === 'pause',
        });
      } catch {
        // Offline: keep a local fallback so merge can recover later.
        upsertLocalWatchProgress(payload);
      }
    },
    [animeId, cover, loggedIn, title],
  );

  const flushFromPlayer = useCallback(
    (
      clientEvent:
        | 'play_start'
        | 'play_progress'
        | 'play_25_percent'
        | 'play_50_percent'
        | 'play_75_percent'
        | 'play_complete'
        | 'pause'
        | null,
      forceInterval = false,
    ) => {
      const art = artRef.current;
      if (!art) return;
      const position = Number(art.currentTime) || 0;
      const duration = Number(art.duration) || initialDurationSeconds || 0;
      const now = Date.now();
      if (
        clientEvent === 'play_progress'
        && !forceInterval
        && now - lastFlushAt.current < FLUSH_INTERVAL_MS
      ) {
        return;
      }
      if (clientEvent === 'play_progress' || forceInterval) {
        lastFlushAt.current = now;
      }
      void persist(position, duration, clientEvent);
    },
    [initialDurationSeconds, persist],
  );

  const handleReady = useCallback(
    (art: Artplayer) => {
      artRef.current = art;
      startedRef.current = false;
      completedRef.current = false;
      milestonesRef.current = new Set();
      lastFlushAt.current = 0;

      const resumeFrom = loggedIn
        ? initialPositionSeconds
        : (localSeed.current?.positionSeconds ?? initialPositionSeconds);

      let didResume = false;
      const trySeek = () => {
        if (didResume || art.isDestroy) return;
        const duration =
          Number(art.duration)
          || initialDurationSeconds
          || localSeed.current?.durationSeconds
          || 0;
        if (
          resumeFrom > SEEK_RESUME_THRESHOLD
          && duration > 0
          && resumeFrom < duration * 0.9
          && !completedRef.current
        ) {
          try {
            art.currentTime = resumeFrom;
            didResume = true;
            const mins = Math.floor(resumeFrom / 60);
            const secs = Math.floor(resumeFrom % 60)
              .toString()
              .padStart(2, '0');
            art.notice.show = `已从 ${mins}:${secs} 继续播放`;
          } catch {
            /* ignore seek errors */
          }
        }
      };

      art.on('video:loadedmetadata', trySeek);
      // Some streams expose duration slightly later.
      art.on('video:durationchange', () => {
        if (!didResume && art.currentTime < 1 && resumeFrom > SEEK_RESUME_THRESHOLD) {
          trySeek();
        }
      });
      art.on('ready', trySeek);

      art.on('play', () => {
        if (!startedRef.current) {
          startedRef.current = true;
          flushFromPlayer('play_start', true);
        }
      });

      art.on('video:timeupdate', () => {
        const duration = Number(art.duration) || 0;
        const currentTime = Number(art.currentTime) || 0;
        if (!duration || duration <= 0) {
          flushFromPlayer('play_progress');
          return;
        }
        // Same-session rewatch: unstick completed when user seeks/restarts near the beginning.
        if (
          completedRef.current
          && currentTime < Math.max(30, duration * 0.1)
        ) {
          completedRef.current = false;
          milestonesRef.current.clear();
        }
        const ratio = currentTime / duration;
        for (const [threshold, eventName] of [
          [0.25, 'play_25_percent'],
          [0.5, 'play_50_percent'],
          [0.75, 'play_75_percent'],
        ] as const) {
          if (ratio >= threshold && !milestonesRef.current.has(threshold)) {
            milestonesRef.current.add(threshold);
            flushFromPlayer(eventName, true);
          }
        }
        flushFromPlayer('play_progress');
      });

      art.on('pause', () => flushFromPlayer('pause', true));
      art.on('video:ended', () => {
        completedRef.current = true;
        flushFromPlayer('play_complete', true);
      });

      const onVisibility = () => {
        if (document.visibilityState === 'hidden') flushFromPlayer('pause', true);
      };
      const onPageHide = () => flushFromPlayer('pause', true);
      document.addEventListener('visibilitychange', onVisibility);
      window.addEventListener('pagehide', onPageHide);

      art.on('destroy', () => {
        flushFromPlayer('pause', true);
        document.removeEventListener('visibilitychange', onVisibility);
        window.removeEventListener('pagehide', onPageHide);
        if (artRef.current === art) artRef.current = null;
      });
    },
    [flushFromPlayer, initialDurationSeconds, initialPositionSeconds, loggedIn],
  );

  return (
    <ArtPlayer
      key={`${animeId}:${videoUrl}`}
      id={`anime-${animeId}`}
      url={videoUrl}
      poster={poster}
      title={title}
      autoplay
      // Progress is owned by WatchPlayer (server/local merge); avoid dual resume UI.
      autoPlayback={false}
      // 里番资源是 progressive MP4，不走 HLS/代理。
      mediaKind="progressive"
      useProxy={false}
      playerConfig={playerConfig}
      onReady={handleReady}
      className="h-full w-full bg-black"
    />
  );
}

/** Called after login to push guest history to the server once. */
export async function mergeGuestWatchProgressIfNeeded(): Promise<number> {
  const rows = readLocalWatchProgress();
  if (!rows.length) return 0;
  try {
    const res = await fetch('/api/me/watch-progress', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rows: rows.map((r) => ({
          animeId: r.animeId,
          positionSeconds: r.positionSeconds,
          durationSeconds: r.durationSeconds,
          completed: r.completed,
          lastWatchedAt: r.lastWatchedAt,
        })),
      }),
    });
    if (!res.ok) return 0;
    clearLocalWatchProgress();
    const body = (await res.json()) as { merged?: number };
    return body.merged ?? 0;
  } catch {
    return 0;
  }
}
