import { z } from 'zod';

/** Encrypted blob stored in JSON (AES-GCM via app keyring). */
export const encryptedFieldSchema = z.object({
  keyId: z.string().min(1),
  ciphertextB64: z.string().min(1),
  nonceB64: z.string().min(1),
  authTagB64: z.string().min(1),
});

export type EncryptedField = z.infer<typeof encryptedFieldSchema>;

export const registrationSettingsSchema = z.object({
  /** When false, public registration is closed. */
  open: z.boolean().default(true),
  /**
   * Allowed emails / domains. Empty = allow any valid email when open.
   * Entries: full email (`a@b.com`) or domain (`example.com` / `@example.com`).
   */
  emailWhitelist: z.array(z.string().min(1).max(128)).default([]),
  /** Create inactive user until verification link is opened. Requires SMTP. */
  requireEmailVerification: z.boolean().default(false),
});

export const smtpSettingsSchema = z.object({
  enabled: z.boolean().default(false),
  host: z.string().max(255).default(''),
  port: z.number().int().min(1).max(65535).default(587),
  /** true = TLS (typically 465); false = STARTTLS (typically 587). */
  secure: z.boolean().default(false),
  username: z.string().max(255).default(''),
  /** Encrypted password; omitted/null means no password or leave unchanged on update. */
  password: encryptedFieldSchema.nullable().default(null),
  fromEmail: z.string().max(255).default(''),
  fromName: z.string().max(128).default('AnimeStream'),
});

export const turnstileSettingsSchema = z.object({
  enabled: z.boolean().default(false),
  siteKey: z.string().max(128).default(''),
  secretKey: encryptedFieldSchema.nullable().default(null),
});

/** Trust / security policy (registration & captcha gates). */
export const trustSettingsSchema = z.object({
  turnstileOnRegister: z.boolean().default(true),
  turnstileOnLogin: z.boolean().default(false),
  verificationTokenTtlMinutes: z.number().int().min(5).max(7 * 24 * 60).default(60),
});

/** Front-end player behaviour (ArtPlayer for 里番 + optional external parsers for 动漫). */
export const playerPreRollAdSchema = z.object({
  enabled: z.boolean().default(false),
  /** Prefer video when set; otherwise image/html. */
  videoUrl: z.string().max(1000).default(''),
  imageUrl: z.string().max(1000).default(''),
  html: z.string().max(4000).default(''),
  clickUrl: z.string().max(1000).default(''),
  /** Seconds before the close button becomes active. */
  playDuration: z.number().int().min(0).max(120).default(5),
  /** Total ad duration before auto-skip. */
  totalDuration: z.number().int().min(0).max(180).default(10),
  muted: z.boolean().default(true),
});

export const playerPauseAdSchema = z.object({
  enabled: z.boolean().default(false),
  /** Prefer video when set; otherwise image/html. */
  videoUrl: z.string().max(1000).default(''),
  imageUrl: z.string().max(1000).default(''),
  html: z.string().max(4000).default(''),
  clickUrl: z.string().max(1000).default(''),
  /** Pause ad video muted by default (autoplay policies). */
  muted: z.boolean().default(true),
});

export const playerLineParserSchema = z.object({
  /** Match against play-line flag or name (substring, case-insensitive). e.g. hnm3u8 / 红牛 */
  match: z.string().min(1).max(64),
  /**
   * Official / third-party 解析播放器 base URL. Episode URL is appended (encoded).
   * Example: https://www.hnjiexi.com/m3u8/?url=
   */
  parserUrl: z.string().min(1).max(500),
  enabled: z.boolean().default(true),
});

export const playerSettingsSchema = z.object({
  /** ArtPlayer right-click menu (browser + player). Default off. */
  enableContextMenu: z.boolean().default(false),
  theme: z.string().max(32).default('#E53935'),
  preRollAd: playerPreRollAdSchema.default({}),
  pauseAd: playerPauseAdSchema.default({}),
  /**
   * Per-line external 解析播放器 for 动漫馆 (MacCMS lines).
   * ArtPlayer is intended for 里番; anime lines prefer these parsers when matched.
   */
  lineParsers: z.array(playerLineParserSchema).max(50).default([]),
  /** If no parser matches a works line, fall back to ArtPlayer+proxy. */
  worksFallbackArtPlayer: z.boolean().default(true),
});

export const systemSettingsSchema = z.object({
  registration: registrationSettingsSchema.default({}),
  smtp: smtpSettingsSchema.default({}),
  turnstile: turnstileSettingsSchema.default({}),
  trust: trustSettingsSchema.default({}),
  player: playerSettingsSchema.default({}),
});

export type RegistrationSettings = z.infer<typeof registrationSettingsSchema>;
export type SmtpSettings = z.infer<typeof smtpSettingsSchema>;
export type TurnstileSettings = z.infer<typeof turnstileSettingsSchema>;
export type TrustSettings = z.infer<typeof trustSettingsSchema>;
export type PlayerSettings = z.infer<typeof playerSettingsSchema>;
export type PlayerLineParser = z.infer<typeof playerLineParserSchema>;
export type SystemSettings = z.infer<typeof systemSettingsSchema>;

/** Public player config safe to embed in site pages (no secrets). */
export type PublicPlayerConfig = Readonly<PlayerSettings>;

export function toPublicPlayerConfig(settings: SystemSettings): PublicPlayerConfig {
  return settings.player;
}

export function resolveLineParser(
  line: { flag?: string | null; name?: string | null },
  parsers: readonly PlayerLineParser[],
): PlayerLineParser | null {
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

/** Build iframe src for an external 解析播放器. */
export function buildParserPlaybackUrl(parserUrl: string, mediaUrl: string): string {
  const base = parserUrl.trim();
  const target = mediaUrl.trim();
  if (!base || !target) return '';
  // If the template already ends with url= / url= empty, append encoded media.
  if (/[?&]url=$/i.test(base) || /[?&]url=$/i.test(base.replace(/\s+$/, ''))) {
    return `${base}${encodeURIComponent(target)}`;
  }
  if (base.includes('{url}')) {
    return base.replaceAll('{url}', encodeURIComponent(target));
  }
  // Common MacCMS 解析 style: prefix + raw or encoded url.
  if (base.endsWith('=') || base.endsWith('?') || base.endsWith('&')) {
    return `${base}${encodeURIComponent(target)}`;
  }
  const join = base.includes('?') ? (base.endsWith('&') ? '' : '&url=') : '?url=';
  if (join === '&url=' || join === '?url=') {
    return `${base}${join}${encodeURIComponent(target)}`;
  }
  return `${base}${encodeURIComponent(target)}`;
}

export const SYSTEM_SETTINGS_KEY = 'system' as const;

export function defaultSystemSettings(): SystemSettings {
  return systemSettingsSchema.parse({});
}

export function parseSystemSettings(value: unknown): SystemSettings {
  return systemSettingsSchema.parse(value ?? {});
}

/** Public, non-secret view for login/register pages. */
export type PublicAuthConfig = Readonly<{
  registrationOpen: boolean;
  emailWhitelistEnabled: boolean;
  requireEmailVerification: boolean;
  turnstile: Readonly<{
    enabled: boolean;
    siteKey: string;
    onRegister: boolean;
    onLogin: boolean;
  }>;
}>;

export function toPublicAuthConfig(settings: SystemSettings): PublicAuthConfig {
  const turnstileReady =
    settings.turnstile.enabled &&
    settings.turnstile.siteKey.length > 0 &&
    settings.turnstile.secretKey != null;

  return {
    registrationOpen: settings.registration.open,
    emailWhitelistEnabled: settings.registration.emailWhitelist.length > 0,
    requireEmailVerification: settings.registration.requireEmailVerification,
    turnstile: {
      enabled: turnstileReady,
      siteKey: turnstileReady ? settings.turnstile.siteKey : '',
      onRegister: turnstileReady && settings.trust.turnstileOnRegister,
      onLogin: turnstileReady && settings.trust.turnstileOnLogin,
    },
  };
}

/**
 * Whitelist: empty list allows all. Domain rules match the email host;
 * full addresses match exactly (case-insensitive).
 */
export function isEmailAllowedByWhitelist(
  email: string,
  whitelist: readonly string[],
): boolean {
  if (!whitelist.length) return true;
  const normalized = email.trim().toLowerCase();
  const at = normalized.lastIndexOf('@');
  if (at < 0) return false;
  const domain = normalized.slice(at + 1);

  for (const raw of whitelist) {
    const entry = raw.trim().toLowerCase();
    if (!entry) continue;
    if (entry.includes('@') && !entry.startsWith('@')) {
      if (entry === normalized) return true;
      continue;
    }
    const host = entry.startsWith('@') ? entry.slice(1) : entry;
    if (host && (domain === host || domain.endsWith(`.${host}`))) {
      return true;
    }
  }
  return false;
}
