'use client';

import type Artplayer from 'artplayer';
import type HlsType from 'hls.js';
import { useEffect, useRef, useState } from 'react';
import {
  DEFAULT_CLIENT_PLAYER_CONFIG,
  type ClientPlayerConfig,
} from '@/lib/client/player-config';
import {
  buildPauseAdBody,
  buildPreRollPluginOption,
  PAUSE_AD_SEEK_GRACE_MS,
  shouldEnablePreRollPlugin,
  shouldShowPauseAdOnPause,
} from '@/lib/client/player-ads';

export type ArtPlayerProps = {
  url: string;
  poster?: string | null;
  /** Accessible label for the player surface (not an ArtPlayer option). */
  title?: string;
  /** Stable id for autoPlayback memory (defaults to url). */
  id?: string;
  /**
   * Built-in ArtPlayer resume toast / local memory.
   * Disable when a parent (e.g. WatchPlayer) owns progress persistence.
   */
  autoPlayback?: boolean;
  autoplay?: boolean;
  className?: string;
  /** Theme accent color (progress bar / highlights). Overrides config.theme when set. */
  theme?: string;
  /**
   * Force media kind when the URL has no reliable extension
   * (common for some MacCMS CDN links).
   */
  mediaKind?: 'auto' | 'hls' | 'progressive';
  /**
   * Route HLS (and optionally progressive) through the same-origin media proxy.
   * Required for many MacCMS CDNs with expired TLS certs that browsers reject.
   */
  useProxy?: boolean;
  /**
   * Admin-configured player behaviour (ads, context menu, theme).
   * ArtPlayer is primarily for 里番; works pages may also fall back here.
   */
  playerConfig?: ClientPlayerConfig;
  /** Called once after ArtPlayer is constructed. */
  onReady?: (art: Artplayer) => void;
};

type HlsConstructor = typeof HlsType;

function normalizeMediaUrl(url: string): string | null {
  const value = url.trim();
  if (!value) return null;
  try {
    return new URL(value).toString();
  } catch {
    try {
      return encodeURI(value);
    } catch {
      return value;
    }
  }
}

function detectHls(url: string): boolean {
  const lower = url.toLowerCase();
  if (/\.m3u8(\?|#|$)/i.test(lower)) return true;
  if (lower.includes('m3u8')) return true;
  if (/[?&](type|format|file)=(hls|m3u8)\b/i.test(lower)) return true;
  return false;
}

function toProxyUrl(url: string): string {
  if (url.startsWith('/api/media/proxy')) return url;
  return `/api/media/proxy?url=${encodeURIComponent(url)}`;
}

function resolveHlsConstructor(mod: unknown): HlsConstructor | null {
  if (!mod || typeof mod !== 'object') return null;
  const record = mod as Record<string, unknown>;
  const candidates = [record.default, record.Hls, mod];
  for (const candidate of candidates) {
    if (
      typeof candidate === 'function'
      && typeof (candidate as HlsConstructor).isSupported === 'function'
    ) {
      return candidate as HlsConstructor;
    }
  }
  return null;
}

function destroyHls(art: Artplayer | null | undefined) {
  if (!art) return;
  const hls = art.hls as HlsType | null | undefined;
  if (hls && typeof hls.destroy === 'function') {
    try {
      hls.destroy();
    } catch {
      /* ignore */
    }
  }
  art.hls = undefined;
}

function attachHlsSync(
  video: HTMLMediaElement,
  url: string,
  art: Artplayer,
  HlsCtor: HlsConstructor,
): string | null {
  destroyHls(art);

  const preferHlsJs = url.startsWith('/') || url.includes('/api/media/proxy');

  if (!preferHlsJs && video.canPlayType('application/vnd.apple.mpegurl')) {
    video.src = url;
    return null;
  }

  if (!HlsCtor.isSupported()) {
    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = url;
      return null;
    }
    return '当前浏览器不支持 MSE/HLS 播放';
  }

  const hls = new HlsCtor({
    enableWorker: true,
    maxBufferLength: 30,
    xhrSetup(xhr) {
      xhr.withCredentials = false;
    },
  });
  hls.loadSource(url);
  hls.attachMedia(video as HTMLVideoElement);
  art.hls = hls;
  art.once('destroy', () => destroyHls(art));
  return null;
}

function safeDestroy(art: Artplayer | null) {
  if (!art || art.isDestroy) return;
  try {
    destroyHls(art);
  } catch {
    /* ignore */
  }
  try {
    (art.constructor as typeof Artplayer).REMOVE_SRC_WHEN_DESTROY = false;
  } catch {
    /* ignore */
  }
  try {
    art.destroy(false);
  } catch {
    /* ignore */
  }
}

function isEmptySourceNotSupported(err: unknown, video?: HTMLVideoElement | null): boolean {
  const message = err instanceof Error ? err.message : String(err ?? '');
  if (
    !/no supported source/i.test(message)
    && !/The element has no supported sources/i.test(message)
  ) {
    return false;
  }
  if (!video) return true;
  return !video.currentSrc && !video.src;
}

function isPreRollAdsDomVisible(art: Artplayer): boolean {
  const adsEl = (art.template as { $ads?: HTMLElement }).$ads;
  if (!adsEl) return false;
  if (adsEl.style.display === 'none') return false;
  // Plugin keeps the node mounted after create; treat non-none as active overlay.
  return true;
}

type OrientationLockType =
  | 'any'
  | 'natural'
  | 'landscape'
  | 'portrait'
  | 'portrait-primary'
  | 'portrait-secondary'
  | 'landscape-primary'
  | 'landscape-secondary';

type ScreenOrientationWithLock = ScreenOrientation & {
  lock?: (orientation: OrientationLockType) => Promise<void>;
  unlock?: () => void;
};

function applyVideoTransform(art: Artplayer, rotateDeg: number) {
  const video = art.video as HTMLVideoElement | undefined;
  if (!video) return;
  // Prefer ArtPlayer's flip API; fall back to data-flip attribute.
  const flipAttr = String(art.template.$player?.getAttribute('data-flip') || '');
  const flip = (art.flip || flipAttr || 'normal') as string;
  const scaleX = flip === 'horizontal' ? -1 : 1;
  const scaleY = flip === 'vertical' ? -1 : 1;
  const deg = ((rotateDeg % 360) + 360) % 360;
  video.style.transformOrigin = 'center center';
  video.style.transition = 'transform 0.2s ease';
  video.style.transform = `rotate(${deg}deg) scale(${scaleX}, ${scaleY})`;
  // Keep contain when rotated 90/270 so the frame stays fully visible.
  if (deg === 90 || deg === 270) {
    video.style.width = '100%';
    video.style.height = '100%';
    video.style.objectFit = 'contain';
  } else {
    video.style.objectFit = '';
  }
}

function installRotateSetting(art: Artplayer) {
  let rotateDeg = 0;
  const labelFor = (deg: number) => `${deg}°`;
  art.setting.add({
    name: 'video-rotate',
    html: '旋转',
    tooltip: labelFor(rotateDeg),
    selector: [
      { html: '0°', value: 0, default: true },
      { html: '90°', value: 90 },
      { html: '180°', value: 180 },
      { html: '270°', value: 270 },
    ],
    onSelect(item) {
      const value = Number((item as { value?: number }).value ?? 0);
      rotateDeg = ((value % 360) + 360) % 360;
      applyVideoTransform(art, rotateDeg);
      art.notice.show = `旋转 ${labelFor(rotateDeg)}`;
      return labelFor(rotateDeg);
    },
  });

  // Keep rotation when the built-in flip setting changes.
  art.on('flip', () => applyVideoTransform(art, rotateDeg));
}

async function lockLandscapeIfPossible() {
  try {
    const orientation = window.screen?.orientation as ScreenOrientationWithLock | undefined;
    if (!orientation?.lock) return;
    await orientation.lock('landscape');
  } catch {
    /* browsers may deny orientation lock outside fullscreen / user gesture */
  }
}

function unlockOrientationIfPossible() {
  try {
    const orientation = window.screen?.orientation as ScreenOrientationWithLock | undefined;
    orientation?.unlock?.();
  } catch {
    /* ignore */
  }
}

function installMobileLandscape(art: Artplayer) {
  // Prefer OS landscape lock while fullscreen (especially mobile).
  art.on('fullscreen', (state) => {
    if (state) void lockLandscapeIfPossible();
    else unlockOrientationIfPossible();
  });
  art.on('fullscreenWeb', (state) => {
    if (state) void lockLandscapeIfPossible();
    else unlockOrientationIfPossible();
  });

  // ArtPlayer autoOrientation rotates the player chrome on mobile fullscreen;
  // surface a one-time notice when it engages.
  let noticed = false;
  const maybeNoticeRotate = () => {
    if (noticed || !art.isRotate) return;
    noticed = true;
    art.notice.show = '已自动横屏观看';
  };
  art.on('resize', maybeNoticeRotate);
  art.on('fullscreen', (state) => {
    if (state) maybeNoticeRotate();
  });
  art.on('fullscreenWeb', (state) => {
    if (state) maybeNoticeRotate();
  });
}

function mountPauseAd(
  art: Artplayer,
  pauseAd: ClientPlayerConfig['pauseAd'],
  isPreRollActive: () => boolean,
) {
  if (!pauseAd.enabled) return;
  const content = buildPauseAdBody(pauseAd);
  if (!content) return;

  const clickUrl = pauseAd.clickUrl.trim();
  const hasVideo = Boolean(pauseAd.videoUrl.trim());
  let lastSeekActivityAt = 0;

  art.layers.add({
    name: 'pause-ad',
    html: `<div class="art-pause-ad" style="display:none;position:absolute;inset:0;z-index:40;background:rgba(0,0,0,.78);align-items:center;justify-content:center;padding:16px;box-sizing:border-box;cursor:${clickUrl ? 'pointer' : 'default'}"><div class="art-pause-ad-inner" style="position:relative;display:flex;align-items:center;justify-content:center;max-width:100%;max-height:100%">${content}<button type="button" data-close="1" aria-label="关闭广告" style="position:absolute;top:8px;right:8px;border:0;border-radius:999px;background:rgba(0,0,0,.72);color:#fff;font-size:12px;line-height:1;padding:8px 12px;cursor:pointer;z-index:2">关闭</button>${clickUrl ? '<span style="position:absolute;left:8px;bottom:8px;border-radius:999px;background:rgba(0,0,0,.55);color:#fff;font-size:11px;padding:6px 10px;pointer-events:none">点击了解详情</span>' : ''}</div></div>`,
    mounted(el: HTMLElement) {
      const root = el.querySelector('.art-pause-ad') as HTMLElement | null;
      if (!root) return;
      const video = root.querySelector('.art-pause-ad-video') as HTMLVideoElement | null;
      const mainVideo = art.video as HTMLVideoElement | undefined;

      const markSeekActivity = () => {
        lastSeekActivityAt = Date.now();
      };
      if (mainVideo) {
        mainVideo.addEventListener('seeking', markSeekActivity);
        mainVideo.addEventListener('seeked', markSeekActivity);
      }

      const show = () => {
        root.style.display = 'flex';
        if (video) {
          try {
            video.currentTime = 0;
            void video.play().catch(() => {
              /* autoplay may be blocked for unmuted video */
            });
          } catch {
            /* ignore */
          }
        }
      };
      const hide = () => {
        root.style.display = 'none';
        if (video) {
          try {
            video.pause();
          } catch {
            /* ignore */
          }
        }
      };

      art.on('pause', () => {
        const msSinceSeek =
          lastSeekActivityAt > 0 ? Date.now() - lastSeekActivityAt : null;
        if (
          !shouldShowPauseAdOnPause({
            preRollActive: isPreRollActive(),
            preRollDomVisible: isPreRollAdsDomVisible(art),
            currentTime: Number(art.currentTime) || 0,
            duration: Number(art.duration) || 0,
            seeking: Boolean(mainVideo?.seeking),
            msSinceSeekActivity: msSinceSeek,
            seekGraceMs: PAUSE_AD_SEEK_GRACE_MS,
          })
        ) {
          return;
        }
        show();
      });
      art.on('play', hide);
      art.on('video:playing', hide);
      art.on('video:ended', hide);
      art.on('destroy', () => {
        hide();
        if (mainVideo) {
          mainVideo.removeEventListener('seeking', markSeekActivity);
          mainVideo.removeEventListener('seeked', markSeekActivity);
        }
      });

      root.addEventListener('click', (event) => {
        const target = event.target as HTMLElement | null;
        if (target?.closest('[data-close="1"]')) {
          event.preventDefault();
          event.stopPropagation();
          hide();
          // Resume main video after closing pause ad.
          void Promise.resolve(art.play()).catch(() => {
            /* ignore */
          });
          return;
        }
        if (hasVideo && target?.closest('video')) {
          if (clickUrl) window.open(clickUrl, '_blank', 'noopener,noreferrer');
          return;
        }
        if (clickUrl) window.open(clickUrl, '_blank', 'noopener,noreferrer');
      });
    },
  });
}

/**
 * Thin ArtPlayer host. Dimensions come from the parent (must be non-zero).
 * Primarily used for 里番 progressive MP4; works pages may fall back here.
 */
export function ArtPlayer({
  url,
  poster,
  title,
  id,
  autoPlayback = true,
  autoplay = false,
  className,
  theme,
  mediaKind = 'auto',
  useProxy = false,
  playerConfig,
  onReady,
}: ArtPlayerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const artRef = useRef<Artplayer | null>(null);
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  const config = playerConfig ?? DEFAULT_CLIENT_PLAYER_CONFIG;
  const effectiveTheme = theme || config.theme || '#E53935';
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    const mediaUrl = normalizeMediaUrl(url);
    if (!container || !mediaUrl) {
      setError(!url?.trim() ? '暂无播放地址' : '播放地址无效');
      return;
    }

    let cancelled = false;
    let art: Artplayer | null = null;
    let restoreContextMenu: boolean | null = null;
    let preRollClearTimers: number[] = [];
    setError(null);

    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      if (isEmptySourceNotSupported(event.reason, art?.video ?? artRef.current?.video)) {
        event.preventDefault();
      }
    };
    window.addEventListener('unhandledrejection', onUnhandledRejection);

    const blockBrowserContextMenu = (event: Event) => {
      event.preventDefault();
    };

    (async () => {
      const wantsHls =
        mediaKind === 'hls'
        || (mediaKind === 'auto' && detectHls(mediaUrl));

      // External MacCMS HLS almost always needs the proxy (expired certs / CORS).
      // 里番 hosted MP4 should stay direct (useProxy=false).
      const shouldProxy = useProxy || (wantsHls && /^https?:\/\//i.test(mediaUrl));
      const playUrl = shouldProxy ? toProxyUrl(mediaUrl) : mediaUrl;

      const preRoll = config.preRollAd;
      const wantsAdsPlugin = shouldEnablePreRollPlugin(preRoll);
      let preRollActive = wantsAdsPlugin;

      const [{ default: ArtplayerCtor }, hlsMod, adsMod] = await Promise.all([
        import('artplayer'),
        wantsHls ? import('hls.js') : Promise.resolve(null),
        wantsAdsPlugin ? import('artplayer-plugin-ads') : Promise.resolve(null),
      ]);
      if (cancelled || !containerRef.current) return;

      const HlsCtor = wantsHls ? resolveHlsConstructor(hlsMod) : null;
      if (wantsHls && !HlsCtor) {
        setError('HLS 播放库加载失败（hls.js）');
        return;
      }

      ArtplayerCtor.REMOVE_SRC_WHEN_DESTROY = false;
      restoreContextMenu = ArtplayerCtor.CONTEXTMENU;
      ArtplayerCtor.CONTEXTMENU = config.enableContextMenu;

      const useHlsCustomType = Boolean(wantsHls && HlsCtor);
      const plugins: Array<(art: Artplayer) => unknown> = [];

      if (wantsAdsPlugin && adsMod) {
        const adsFactory =
          (adsMod as { default?: (opt: Record<string, unknown>) => (art: Artplayer) => unknown })
            .default
          ?? (adsMod as unknown as (opt: Record<string, unknown>) => (art: Artplayer) => unknown);
        if (typeof adsFactory === 'function') {
          plugins.push(adsFactory(buildPreRollPluginOption(preRoll)));
        } else {
          preRollActive = false;
        }
      } else {
        preRollActive = false;
      }

      art = new ArtplayerCtor({
        container,
        url: playUrl,
        poster: poster || undefined,
        // Stable id powers built-in autoPlayback memory across sessions.
        id: id || mediaUrl,
        theme: effectiveTheme,
        volume: 0.7,
        autoplay: false,
        muted: false,
        pip: true,
        screenshot: false,
        setting: true,
        playbackRate: true,
        aspectRatio: true,
        // Horizontal / vertical flip from the settings panel.
        flip: true,
        // Remember last playback position (ArtPlayer localStorage + resume toast).
        autoPlayback,
        fullscreen: true,
        fullscreenWeb: true,
        miniProgressBar: true,
        mutex: true,
        backdrop: true,
        playsInline: true,
        // Mobile: rotate player UI when device is landscape / fullscreen.
        autoOrientation: true,
        gesture: true,
        fastForward: true,
        lock: true,
        hotkey: true,
        lang: 'zh-cn',
        contextmenu: config.enableContextMenu ? undefined : [],
        plugins,
        moreVideoAttr: {
          preload: 'none',
          playsInline: true,
          controls: false,
        },
        type: useHlsCustomType ? 'm3u8' : '',
        customType: useHlsCustomType && HlsCtor
          ? {
              m3u8: (
                video: HTMLMediaElement,
                src: string,
                instance: Artplayer,
              ) => {
                const attachError = attachHlsSync(video, src, instance, HlsCtor);
                if (attachError) setError(attachError);
              },
              hls: (
                video: HTMLMediaElement,
                src: string,
                instance: Artplayer,
              ) => {
                const attachError = attachHlsSync(video, src, instance, HlsCtor);
                if (attachError) setError(attachError);
              },
            }
          : {},
      });

      if (cancelled) {
        safeDestroy(art);
        art = null;
        return;
      }

      try {
        art.video.setAttribute('webkit-playsinline', 'true');
        art.video.setAttribute('playsinline', 'true');
        art.video.setAttribute('controlsList', 'nodownload');
      } catch {
        /* ignore */
      }

      if (!config.enableContextMenu) {
        container.addEventListener('contextmenu', blockBrowserContextMenu);
        art.template.$player?.addEventListener('contextmenu', blockBrowserContextMenu);
      }

      // Track pre-roll lifecycle so pause ads never cover the ad plugin.
      // Local non-null alias: art is constructed above and only nulled on cancel/destroy.
      const player = art;
      const clearPreRollIfIdle = () => {
        if (cancelled || player.isDestroy) return;
        if (!isPreRollAdsDomVisible(player)) {
          preRollActive = false;
        }
      };
      const schedulePreRollClear = (delayMs: number) => {
        const id = window.setTimeout(() => {
          preRollClearTimers = preRollClearTimers.filter((t) => t !== id);
          clearPreRollIfIdle();
        }, delayMs);
        preRollClearTimers.push(id);
      };

      player.on('artplayerPluginAds:skip' as never, () => {
        preRollActive = false;
      });
      // When content is actually playing and ads DOM is gone, drop the flag.
      // Plugin may issue transient pause/play cycles; a short delay avoids races.
      player.on('video:playing', () => {
        schedulePreRollClear(50);
      });
      player.on('play', () => {
        schedulePreRollClear(50);
      });

      mountPauseAd(player, config.pauseAd, () => preRollActive);
      installRotateSetting(player);
      installMobileLandscape(player);

      art.on('error', (err) => {
        if (isEmptySourceNotSupported(err, art?.video)) return;
        const message =
          err instanceof Error
            ? err.message
            : typeof err === 'string'
              ? err
              : '视频加载失败';
        setError(message || '视频加载失败');
      });

      art.on('video:error', () => {
        if (cancelled || !art || art.isDestroy) return;
        const mediaError = art.video?.error;
        if (!mediaError) return;
        if (isEmptySourceNotSupported(mediaError, art.video)) return;
        if (mediaError.code === mediaError.MEDIA_ERR_SRC_NOT_SUPPORTED) {
          setError(
            wantsHls
              ? '无法播放该 HLS 流（浏览器不支持或源地址无效）'
              : '无法播放该视频源（格式不支持或地址失效）',
          );
        } else if (mediaError.code === mediaError.MEDIA_ERR_NETWORK) {
          setError('网络错误，视频加载失败（可能是源站证书/防盗链/跨域限制）');
        }
      });

      if (useHlsCustomType && HlsCtor && art.hls) {
        const hls = art.hls as HlsType;
        hls.on(HlsCtor.Events.ERROR, (_event, data) => {
          if (!data?.fatal || cancelled) return;
          if (data.type === HlsCtor.ErrorTypes.NETWORK_ERROR) {
            setError(
              shouldProxy
                ? 'HLS 网络错误：代理拉取播放列表失败（源站不可达）'
                : 'HLS 网络错误：无法拉取播放列表（源站证书过期、防盗链或跨域限制）',
            );
            try {
              hls.startLoad();
            } catch {
              /* ignore */
            }
          } else if (data.type === HlsCtor.ErrorTypes.MEDIA_ERROR) {
            try {
              hls.recoverMediaError();
            } catch {
              setError('HLS 媒体解码失败');
            }
          } else {
            setError('HLS 播放失败');
          }
        });
      }

      artRef.current = art;
      onReadyRef.current?.(art);

      if (autoplay) {
        const tryPlay = () => {
          if (cancelled || !art || art.isDestroy) return;
          void Promise.resolve(art.play()).catch(() => {
            /* autoplay may be blocked; ignore */
          });
        };
        if (art.isReady) tryPlay();
        else art.once('ready', tryPlay);
      }
    })().catch((err: unknown) => {
      if (cancelled) return;
      setError(err instanceof Error ? err.message : '播放器初始化失败');
    });

    return () => {
      cancelled = true;
      for (const timerId of preRollClearTimers) {
        window.clearTimeout(timerId);
      }
      preRollClearTimers = [];
      window.removeEventListener('unhandledrejection', onUnhandledRejection);
      container.removeEventListener('contextmenu', blockBrowserContextMenu);
      if (restoreContextMenu != null) {
        try {
          const ArtplayerCtor = (art?.constructor ?? null) as typeof Artplayer | null;
          if (ArtplayerCtor) ArtplayerCtor.CONTEXTMENU = restoreContextMenu;
        } catch {
          /* ignore */
        }
      }
      safeDestroy(art ?? artRef.current);
      artRef.current = null;
      art = null;
    };
  }, [url, poster, id, autoPlayback, autoplay, effectiveTheme, mediaKind, useProxy, config, playerConfig]);

  return (
    <div className={className ?? 'relative h-full w-full bg-black'} data-player="artplayer">
      <div
        ref={containerRef}
        className="h-full w-full bg-black"
        aria-label={title || undefined}
      />
      {error ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/75 p-4 text-center">
          <div className="space-y-2">
            <p className="font-ui text-sm text-white/90">{error}</p>
            <p className="font-meta text-[11px] text-white/50 break-all max-w-md mx-auto">
              {url}
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
