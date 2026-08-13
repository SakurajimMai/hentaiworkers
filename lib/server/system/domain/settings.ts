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
  hero: heroSettingsSchema.default({}),
  site: siteSettingsSchema.default({}),
});

export type RegistrationSettings = z.infer<typeof registrationSettingsSchema>;
export type SmtpSettings = z.infer<typeof smtpSettingsSchema>;
export type TurnstileSettings = z.infer<typeof turnstileSettingsSchema>;
export type TrustSettings = z.infer<typeof trustSettingsSchema>;
export type PlayerSettings = z.infer<typeof playerSettingsSchema>;
export type MangaSettings = z.infer<typeof mangaSettingsSchema>;
export type HeroSettings = z.infer<typeof heroSettingsSchema>;
export type SiteSettings = z.infer<typeof siteSettingsSchema>;
export type SystemSettings = z.infer<typeof systemSettingsSchema>;

export type PublicSiteConfig = Readonly<{
  androidDownloadUrl: string;
  androidDownloadLabel: string;
}>;

export function toPublicSiteConfig(settings: SystemSettings): PublicSiteConfig {
  const url = settings.site.androidDownloadUrl.trim();
  return {
    androidDownloadUrl: /^https?:\/\//i.test(url) ? url : '',
    androidDownloadLabel: settings.site.androidDownloadLabel.trim() || '下载 App',
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
