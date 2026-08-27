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

/** Admin-only: whether outbound mail can actually be sent. Never expose to the public site. */
export function isOutboundMailReady(smtp: {
  enabled: boolean;
  host: string;
  fromEmail: string;
  passwordConfigured?: boolean;
  password?: EncryptedField | string | null;
}): boolean {
  if (!smtp.enabled) return false;
  if (!smtp.host.trim() || !smtp.fromEmail.trim()) return false;
  if (typeof smtp.passwordConfigured === 'boolean') return smtp.passwordConfigured;
  return smtp.password != null && smtp.password !== '';
}

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

/** Front-end player behaviour (ArtPlayer for 里番). */
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

export const playerSettingsSchema = z.object({
  /** ArtPlayer right-click menu (browser + player). Default off. */
  enableContextMenu: z.boolean().default(false),
  theme: z.string().max(32).default('#E53935'),
  preRollAd: playerPreRollAdSchema.default({}),
  pauseAd: playerPauseAdSchema.default({}),
});

/**
 * Manga ingest / public catalog.
 * Publish key is set in admin UI (encrypted in DB) — not via app .env.
 * External workers (tg-manga) send X-Manga-Publish-Key matching this secret.
 */
export const mangaSettingsSchema = z.object({
  /** When false, /manga is hidden and publish API rejects. */
  enabled: z.boolean().default(true),
  /** Encrypted shared secret for POST /api/manga/publish. */
  publishSecret: encryptedFieldSchema.nullable().default(null),
  /**
   * Admin-curated manga tag dictionary (independent of 里番 `tags`).
   * Shown in admin 漫画标签 and as quick filters on /manga even before use.
   */
  curatedTags: z.array(z.string().min(1).max(40)).max(200).default([]),
});

export const MAX_FEED_ADS = 12;

/** One native card in /browse and /manga grids. */
export const feedAdSlotSchema = z.object({
  enabled: z.boolean().default(true),
  name: z.string().max(40).default(''),
  /** Insert after every N content items. */
  interval: z.number().int().min(1).max(40).default(5),
  href: z.string().max(1000).default(''),
  /** Empty = default “广告位招租” card. Supports iframe / HTML / script. */
  html: z.string().max(20000).default(''),
});

/** One HTML slot on the manga reader. */
export const readerAdSlotSchema = z.object({
  enabled: z.boolean().default(false),
  html: z.string().max(20000).default(''),
  /** Only used by the mid-chapter slot. */
  interval: z.number().int().min(1).max(50).default(5),
});

export const adsSettingsSchema = z.object({
  feedSlots: z.array(feedAdSlotSchema).max(MAX_FEED_ADS).default([
    { enabled: true, name: '信息流广告 1', interval: 5, href: '', html: '' },
  ]),
  reader: z
    .object({
      top: readerAdSlotSchema.default({}),
      middle: readerAdSlotSchema.default({}),
      bottom: readerAdSlotSchema.default({}),
    })
    .default({}),
});

export function migrateAdsSettings(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object') return {};
  const ads = raw as Record<string, unknown>;
  const next: Record<string, unknown> = { ...ads };

  if (!Array.isArray(ads.feedSlots) && ads.feed && typeof ads.feed === 'object') {
    const feed = ads.feed as Record<string, unknown>;
    next.feedSlots = [
      {
        enabled: feed.enabled !== false,
        name: '信息流广告 1',
        interval: feed.interval,
        href: feed.href,
        html: feed.html,
      },
    ];
  }

  if (!ads.reader && ads.mangaReader && typeof ads.mangaReader === 'object') {
    next.reader = { top: {}, middle: ads.mangaReader, bottom: {} };
  }

  return next;
}

/** One homepage hero slide: a catalog work or a fully custom banner. */
export const heroSlideSchema = z.object({
  /** 'anime' resolves title/cover/link from the catalog; 'custom' uses the fields below. */
  kind: z.enum(['anime', 'custom']).default('anime'),
  animeId: z.number().int().positive().nullable().default(null),
  title: z.string().max(200).default(''),
  /** Custom cover; also overrides the catalog art for anime slides when set. */
  imageUrl: z.string().max(1000).default(''),
  /** Slide target. Custom slides default to '#'; anime slides default to /watch/{id}. */
  linkUrl: z.string().max(1000).default(''),
  description: z.string().max(500).default(''),
});

export const MAX_HERO_SLIDES = 20;

export const siteSettingsSchema = z.object({
  /** Public Android APK / download page. Empty hides the footer link. */
  androidDownloadUrl: z.string().max(1000).default(''),
  androidDownloadLabel: z.string().min(1).max(40).default('下载 App'),
  /** Public Telegram channel / group. Empty hides the footer link. */
  telegramUrl: z.string().max(1000).default(''),
  telegramLabel: z.string().min(1).max(40).default('Telegram'),
});

export const heroSettingsSchema = z.object({
  /** Legacy anime-ID list (pre-slides). Used only when `slides` is empty. */
  animeIds: z.array(z.number().int().positive()).max(MAX_HERO_SLIDES).default([]),
  /** Ordered slides; not limited to three. Empty = fall back to animeIds, then latest works. */
  slides: z.array(heroSlideSchema).max(MAX_HERO_SLIDES).default([]),
  /** Auto-advance interval in seconds. */
  intervalSeconds: z.number().int().min(2).max(60).default(7),
});

export type HeroSlide = z.infer<typeof heroSlideSchema>;

/** Slides to render, honouring the legacy animeIds config. */
export function effectiveHeroSlides(hero: z.infer<typeof heroSettingsSchema>): HeroSlide[] {
  if (hero.slides.length) return hero.slides;
  return hero.animeIds.map((animeId) => ({
    kind: 'anime' as const,
    animeId,
    title: '',
    imageUrl: '',
    linkUrl: '',
    description: '',
  }));
}

export const systemSettingsSchema = z.object({
  registration: registrationSettingsSchema.default({}),
  smtp: smtpSettingsSchema.default({}),
  turnstile: turnstileSettingsSchema.default({}),
  trust: trustSettingsSchema.default({}),
  player: playerSettingsSchema.default({}),
  manga: mangaSettingsSchema.default({}),
  ads: adsSettingsSchema.default({}),
  hero: heroSettingsSchema.default({}),
  site: siteSettingsSchema.default({}),
});

export type RegistrationSettings = z.infer<typeof registrationSettingsSchema>;
export type SmtpSettings = z.infer<typeof smtpSettingsSchema>;
export type TurnstileSettings = z.infer<typeof turnstileSettingsSchema>;
export type TrustSettings = z.infer<typeof trustSettingsSchema>;
export type PlayerSettings = z.infer<typeof playerSettingsSchema>;
export type MangaSettings = z.infer<typeof mangaSettingsSchema>;
export type AdsSettings = z.infer<typeof adsSettingsSchema>;
export type FeedAdSlot = z.infer<typeof feedAdSlotSchema>;
export type ReaderAdSlot = z.infer<typeof readerAdSlotSchema>;
export type HeroSettings = z.infer<typeof heroSettingsSchema>;
export type SiteSettings = z.infer<typeof siteSettingsSchema>;
export type SystemSettings = z.infer<typeof systemSettingsSchema>;

export type PublicAdsConfig = Readonly<{
  feedSlots: ReadonlyArray<FeedAdSlot>;
  reader: AdsSettings['reader'];
  player: Readonly<{
    preRollAd: PlayerSettings['preRollAd'];
    pauseAd: PlayerSettings['pauseAd'];
  }>;
}>;

function publicReaderSlot(slot: ReaderAdSlot): ReaderAdSlot {
  if (!slot.enabled) {
    return { enabled: false, html: '', interval: slot.interval };
  }
  return slot;
}

export function toPublicAdsConfig(settings: SystemSettings): PublicAdsConfig {
  return {
    feedSlots: settings.ads.feedSlots.filter((slot) => slot.enabled),
    reader: {
      top: publicReaderSlot(settings.ads.reader.top),
      // Mid-chapter interval ads were removed from the reader UX.
      middle: { enabled: false, html: '', interval: 5 },
      bottom: publicReaderSlot(settings.ads.reader.bottom),
    },
    player: {
      preRollAd: settings.player.preRollAd,
      pauseAd: settings.player.pauseAd,
    },
  };
}

export type PublicSiteConfig = Readonly<{
  androidDownloadUrl: string;
  androidDownloadLabel: string;
  telegramUrl: string;
  telegramLabel: string;
}>;

const TELEGRAM_HTTPS =
  /^https?:\/\/(?:t\.me|telegram\.me|telegram\.dog)\//i;
const TELEGRAM_HOST = /^(?:t\.me|telegram\.me|telegram\.dog)\//i;
const TELEGRAM_USERNAME = /^@?[a-zA-Z][a-zA-Z0-9_]{3,31}$/;

export function normalizePublicTelegramUrl(raw: string): string {
  const value = raw.trim();
  if (!value) return '';
  if (TELEGRAM_HTTPS.test(value)) return value;
  if (TELEGRAM_HOST.test(value)) return `https://${value}`;
  if (TELEGRAM_USERNAME.test(value)) {
    return `https://t.me/${value.replace(/^@/, '')}`;
  }
  return '';
}

export function toPublicSiteConfig(settings: SystemSettings): PublicSiteConfig {
  const url = settings.site.androidDownloadUrl.trim();
  return {
    androidDownloadUrl: /^https?:\/\//i.test(url) ? url : '',
    androidDownloadLabel: settings.site.androidDownloadLabel.trim() || '下载 App',
    telegramUrl: normalizePublicTelegramUrl(settings.site.telegramUrl),
    telegramLabel: settings.site.telegramLabel.trim() || 'Telegram',
  };
}

/** Public player config safe to embed in site pages (no secrets). */
export type PublicPlayerConfig = Readonly<PlayerSettings>;

export function toPublicPlayerConfig(settings: SystemSettings): PublicPlayerConfig {
  return settings.player;
}

export const SYSTEM_SETTINGS_KEY = 'system' as const;

export function defaultSystemSettings(): SystemSettings {
  return systemSettingsSchema.parse({});
}

export function parseSystemSettings(value: unknown): SystemSettings {
  const raw =
    value && typeof value === 'object'
      ? { ...(value as Record<string, unknown>) }
      : {};
  if ('ads' in raw) {
    raw.ads = migrateAdsSettings(raw.ads);
  }
  return systemSettingsSchema.parse(raw);
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
