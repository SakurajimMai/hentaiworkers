/** Pure helpers for ArtPlayer pre-roll / pause ads (unit-testable). */

export type PreRollAdInput = {
  enabled: boolean;
  videoUrl: string;
  imageUrl: string;
  html: string;
  clickUrl: string;
  playDuration: number;
  totalDuration: number;
  muted: boolean;
};

export type PauseAdInput = {
  enabled: boolean;
  videoUrl: string;
  imageUrl: string;
  html: string;
  clickUrl: string;
  muted: boolean;
};

export function escapeHtmlAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function clampAdDurations(
  playDuration: number,
  totalDuration: number,
): { playDuration: number; totalDuration: number } {
  const play = Math.max(0, Math.min(120, Math.floor(Number(playDuration) || 0)));
  let total = Math.max(0, Math.min(180, Math.floor(Number(totalDuration) || 0)));
  // Missing/zero total: give a usable window (at least play, and at least 5s).
  if (total <= 0) {
    total = Math.max(play, 5);
  } else if (total < play) {
    // Explicit total shorter than skip lock — raise to play so close can appear.
    total = play;
  }
  return { playDuration: play, totalDuration: total };
}

export function buildPreRollHtml(config: Pick<PreRollAdInput, 'html' | 'imageUrl'>): string {
  if (config.html.trim()) return config.html;
  if (config.imageUrl.trim()) {
    const img = escapeHtmlAttr(config.imageUrl.trim());
    return `<div class="art-preroll-image" style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;background:#000"><img src="${img}" alt="广告" style="max-width:100%;max-height:100%;width:auto;height:auto;object-fit:contain" /></div>`;
  }
  return '';
}

export function shouldEnablePreRollPlugin(config: PreRollAdInput): boolean {
  if (!config.enabled) return false;
  return Boolean(
    config.videoUrl.trim()
    || config.html.trim()
    || config.imageUrl.trim(),
  );
}

export function buildPauseAdBody(pauseAd: PauseAdInput): string {
  const videoUrl = pauseAd.videoUrl.trim();
  if (videoUrl) {
    const src = escapeHtmlAttr(videoUrl);
    const mutedAttr = pauseAd.muted ? ' muted' : '';
    return `<video class="art-pause-ad-video" src="${src}" playsinline loop autoplay${mutedAttr} style="max-width:min(92%,720px);max-height:72%;width:auto;height:auto;border-radius:12px;background:#000"></video>`;
  }
  if (pauseAd.html.trim()) return pauseAd.html;
  if (pauseAd.imageUrl.trim()) {
    const img = escapeHtmlAttr(pauseAd.imageUrl.trim());
    return `<img class="art-pause-ad-image" src="${img}" alt="暂停广告" style="max-width:min(92%,720px);max-height:72%;object-fit:contain;border-radius:12px;box-shadow:0 12px 40px rgba(0,0,0,.45)" />`;
  }
  return '';
}

/** Default grace window after seek activity to avoid pause-ad flashes. */
export const PAUSE_AD_SEEK_GRACE_MS = 350;

export function shouldShowPauseAdOnPause(options: {
  preRollActive: boolean;
  preRollDomVisible: boolean;
  currentTime: number;
  duration: number;
  /** True while the main media element is seeking. */
  seeking?: boolean;
  /**
   * Milliseconds since last seeking/seeked activity.
   * When provided and within seekGraceMs, suppress the pause ad.
   */
  msSinceSeekActivity?: number | null;
  seekGraceMs?: number;
}): boolean {
  if (options.preRollActive || options.preRollDomVisible) return false;
  if (options.seeking) return false;
  const grace = options.seekGraceMs ?? PAUSE_AD_SEEK_GRACE_MS;
  if (
    options.msSinceSeekActivity != null
    && Number.isFinite(options.msSinceSeekActivity)
    && options.msSinceSeekActivity >= 0
    && options.msSinceSeekActivity < grace
  ) {
    return false;
  }
  const duration = Number(options.duration) || 0;
  const current = Number(options.currentTime) || 0;
  // Avoid a flash at natural end / near-end pause.
  if (duration > 0 && duration - current < 0.35) return false;
  return true;
}

export function buildPreRollPluginOption(config: PreRollAdInput) {
  const video = config.videoUrl.trim();
  const html = video ? '' : buildPreRollHtml(config);
  const durations = clampAdDurations(config.playDuration, config.totalDuration);
  return {
    html,
    video: video || undefined,
    url: config.clickUrl.trim() || undefined,
    playDuration: durations.playDuration,
    totalDuration: durations.totalDuration,
    muted: config.muted,
    i18n: {
      close: '关闭广告',
      countdown: '广告剩余 %s 秒',
      detail: '了解详情',
      canBeClosed: '%s 秒后可关闭广告',
    },
  };
}
