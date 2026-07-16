/** Client-safe mirror of PublicPlayerConfig (no server imports). */

export type ClientPlayerPreRollAd = {
  enabled: boolean;
  videoUrl: string;
  imageUrl: string;
  html: string;
  clickUrl: string;
  playDuration: number;
  totalDuration: number;
  muted: boolean;
};

export type ClientPlayerPauseAd = {
  enabled: boolean;
  videoUrl: string;
  imageUrl: string;
  html: string;
  clickUrl: string;
  muted: boolean;
};

export type ClientPlayerLineParser = {
  match: string;
  parserUrl: string;
  enabled: boolean;
};

export type ClientPlayerConfig = {
  enableContextMenu: boolean;
  theme: string;
  preRollAd: ClientPlayerPreRollAd;
  pauseAd: ClientPlayerPauseAd;
  lineParsers: ClientPlayerLineParser[];
  worksFallbackArtPlayer: boolean;
};

export const DEFAULT_CLIENT_PLAYER_CONFIG: ClientPlayerConfig = {
  enableContextMenu: false,
  theme: '#E53935',
  preRollAd: {
    enabled: false,
    videoUrl: '',
    imageUrl: '',
    html: '',
    clickUrl: '',
    playDuration: 5,
    totalDuration: 10,
    muted: true,
  },
  pauseAd: {
    enabled: false,
    videoUrl: '',
    imageUrl: '',
    html: '',
    clickUrl: '',
    muted: true,
  },
  lineParsers: [],
  worksFallbackArtPlayer: true,
};

export function resolveClientLineParser(
  line: { flag?: string | null; name?: string | null },
  parsers: readonly ClientPlayerLineParser[],
): ClientPlayerLineParser | null {
  const flag = String(line.flag ?? '').toLowerCase();
  const name = String(line.name ?? '').toLowerCase();
  for (const parser of parsers) {
    if (!parser.enabled) continue;
    const needle = parser.match.trim().toLowerCase();
    if (!needle) continue;
    if (flag.includes(needle) || name.includes(needle)) return parser;
  }
  return null;
}

export function buildClientParserPlaybackUrl(parserUrl: string, mediaUrl: string): string {
  const base = parserUrl.trim();
  const target = mediaUrl.trim();
  if (!base || !target) return '';
  if (base.includes('{url}')) {
    return base.replaceAll('{url}', encodeURIComponent(target));
  }
  if (/[?&]url=$/i.test(base) || base.endsWith('=') || base.endsWith('?') || base.endsWith('&')) {
    return `${base}${encodeURIComponent(target)}`;
  }
  const join = base.includes('?') ? '&url=' : '?url=';
  return `${base}${join}${encodeURIComponent(target)}`;
}
