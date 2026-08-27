import { randomBytes } from 'node:crypto';
import { resolveSiteUrl } from '@/lib/site-url';
import type { SecretCipher } from '../../shared/secret-cipher';
import { sha256Bytes } from '../../shared/hashing';
import { AppError } from '../../shared/errors';
import {
  defaultSystemSettings,
  isEmailAllowedByWhitelist,
  parseSystemSettings,
  toPublicAuthConfig,
  type PublicAuthConfig,
  type SystemSettings,
} from '../domain/settings';
import type {
  EmailVerificationTokenRepository,
  SystemSettingsRepository,
} from '../ports/system-settings-repository';
import {
  decryptMangaPublishSecret,
  decryptSmtpPassword,
  decryptTurnstileSecret,
  encryptMangaPublishSecret,
  encryptSmtpPassword,
  encryptTurnstileSecret,
} from './secret-fields';
import { assertSmtpConfigured, sendSmtpMail, sendSmtpTest } from './mailer';
import { assertTurnstileOk } from './turnstile';
import type { IdentityService } from '../../identity/application/identity-service';
import {
  authRateLimitSubject,
  getAuthRateLimiter,
  type AuthRateLimiter,
} from '../../identity/application/auth-rate-limit';
import type { UserRecord } from '../../identity/ports/user-repository';
import type { PasswordResetRepository } from '../../identity/ports/password-reset-repository';

export type SystemSettingsAdminView = Readonly<{
  registration: SystemSettings['registration'];
  smtp: Readonly<{
    enabled: boolean;
    host: string;
    port: number;
    secure: boolean;
    username: string;
    fromEmail: string;
    fromName: string;
    passwordConfigured: boolean;
  }>;
  turnstile: Readonly<{
    enabled: boolean;
    siteKey: string;
    secretConfigured: boolean;
  }>;
  trust: SystemSettings['trust'];
  player: SystemSettings['player'];
  manga: Readonly<{
    enabled: boolean;
    publishSecretConfigured: boolean;
    curatedTags: ReadonlyArray<string>;
  }>;
  ads: SystemSettings['ads'];
  hero: SystemSettings['hero'];
  site: SystemSettings['site'];
}>;

export type SystemSettingsUpdateInput = Readonly<{
  registration?: Partial<SystemSettings['registration']>;
  smtp?: Partial<{
    enabled: boolean;
    host: string;
    port: number;
    secure: boolean;
    username: string;
    fromEmail: string;
    fromName: string;
    /** Plaintext password; empty/undefined keeps previous. */
    password?: string;
  }>;
  turnstile?: Partial<{
    enabled: boolean;
    siteKey: string;
    /** Plaintext secret; empty/undefined keeps previous. */
    secretKey?: string;
  }>;
  trust?: Partial<SystemSettings['trust']>;
  player?: Partial<SystemSettings['player']> & {
    preRollAd?: Partial<SystemSettings['player']['preRollAd']>;
    pauseAd?: Partial<SystemSettings['player']['pauseAd']>;
  };
  manga?: Partial<{
    enabled: boolean;
    /** Plaintext publish key; empty/undefined keeps previous. */
    publishSecret?: string;
    curatedTags: string[];
  }>;
  ads?: Partial<SystemSettings['ads']> & {
    feedSlots?: SystemSettings['ads']['feedSlots'];
    reader?: Partial<SystemSettings['ads']['reader']> & {
      top?: Partial<SystemSettings['ads']['reader']['top']>;
      middle?: Partial<SystemSettings['ads']['reader']['middle']>;
      bottom?: Partial<SystemSettings['ads']['reader']['bottom']>;
    };
  };
  hero?: Partial<SystemSettings['hero']>;
  site?: Partial<SystemSettings['site']>;
}>;

export class SystemSettingsService {
  constructor(
    private readonly repo: SystemSettingsRepository,
    private readonly tokens: EmailVerificationTokenRepository,
    private readonly cipher: SecretCipher,
    private readonly identity: IdentityService,
    private readonly options?: {
      siteUrl?: string;
      fetchImpl?: typeof fetch;
      passwordResets?: PasswordResetRepository;
      rateLimiter?: AuthRateLimiter;
    },
  ) {}

  private assertNotRateLimited(
    action: 'login' | 'register' | 'password_reset',
    remoteIp: string | null | undefined,
    emailOrUsername: string | null | undefined,
  ): void {
    const limiter = this.options?.rateLimiter ?? getAuthRateLimiter();
    const decision = limiter.consume(action, authRateLimitSubject(remoteIp, emailOrUsername));
    if (!decision.allowed) {
      throw new AppError(
        'SOURCE_RATE_LIMITED',
        `操作过于频繁，请 ${decision.retryAfterSeconds} 秒后重试`,
        429,
        true,
        { field: 'rate_limit', retryAfterSeconds: decision.retryAfterSeconds },
      );
    }
  }

  async getSettings(): Promise<SystemSettings> {
    const stored = await this.repo.get();
    return stored ?? defaultSystemSettings();
  }

  async getAdminView(): Promise<SystemSettingsAdminView> {
    const s = await this.getSettings();
    return {
      registration: s.registration,
      smtp: {
        enabled: s.smtp.enabled,
        host: s.smtp.host,
        port: s.smtp.port,
        secure: s.smtp.secure,
        username: s.smtp.username,
        fromEmail: s.smtp.fromEmail,
        fromName: s.smtp.fromName,
        passwordConfigured: s.smtp.password != null,
      },
      turnstile: {
        enabled: s.turnstile.enabled,
        siteKey: s.turnstile.siteKey,
        secretConfigured: s.turnstile.secretKey != null,
      },
      trust: s.trust,
      player: s.player,
      manga: {
        enabled: s.manga.enabled,
        publishSecretConfigured: s.manga.publishSecret != null,
        curatedTags: s.manga.curatedTags,
      },
      ads: s.ads,
      hero: s.hero,
      site: s.site,
    };
  }

  async getPublicAuthConfig(): Promise<PublicAuthConfig> {
    return toPublicAuthConfig(await this.getSettings());
  }

  async getPublicPlayerConfig() {
    const { toPublicPlayerConfig } = await import('../domain/settings');
    return toPublicPlayerConfig(await this.getSettings());
  }

  async getPublicSiteConfig() {
    const { toPublicSiteConfig } = await import('../domain/settings');
    return toPublicSiteConfig(await this.getSettings());
  }

  async getPublicAdsConfig() {
    const { toPublicAdsConfig } = await import('../domain/settings');
    return toPublicAdsConfig(await this.getSettings());
  }

  async update(input: SystemSettingsUpdateInput): Promise<SystemSettingsAdminView> {
    const current = await this.getSettings();
    const next = parseSystemSettings({
      registration: {
        ...current.registration,
        ...input.registration,
        emailWhitelist: input.registration?.emailWhitelist
          ?? current.registration.emailWhitelist,
      },
      smtp: {
        ...current.smtp,
        ...omitUndefined({
          enabled: input.smtp?.enabled,
          host: input.smtp?.host,
          port: input.smtp?.port,
          secure: input.smtp?.secure,
          username: input.smtp?.username,
          fromEmail: input.smtp?.fromEmail,
          fromName: input.smtp?.fromName,
        }),
        password: mergeEncryptedSecret(
          current.smtp.password,
          input.smtp?.password,
          (plain) => encryptSmtpPassword(this.cipher, plain),
        ),
      },
      turnstile: {
        ...current.turnstile,
        ...omitUndefined({
          enabled: input.turnstile?.enabled,
          siteKey: input.turnstile?.siteKey,
        }),
        secretKey: mergeEncryptedSecret(
          current.turnstile.secretKey,
          input.turnstile?.secretKey,
          (plain) => encryptTurnstileSecret(this.cipher, plain),
        ),
      },
      trust: {
        ...current.trust,
        ...input.trust,
      },
      player: {
        ...current.player,
        ...omitUndefined({
          enableContextMenu: input.player?.enableContextMenu,
          theme: input.player?.theme,
        }),
        preRollAd: {
          ...current.player.preRollAd,
          ...input.player?.preRollAd,
        },
        pauseAd: {
          ...current.player.pauseAd,
          ...input.player?.pauseAd,
        },
      },
      manga: {
        ...current.manga,
        ...omitUndefined({
          enabled: input.manga?.enabled,
          curatedTags: input.manga?.curatedTags,
        }),
        publishSecret: mergeEncryptedSecret(
          current.manga.publishSecret,
          input.manga?.publishSecret,
          (plain) => encryptMangaPublishSecret(this.cipher, plain),
        ),
      },
      ads: {
        feedSlots: input.ads?.feedSlots ?? current.ads.feedSlots,
        reader: {
          top: {
            ...current.ads.reader.top,
            ...input.ads?.reader?.top,
          },
          middle: {
            ...current.ads.reader.middle,
            ...input.ads?.reader?.middle,
          },
          bottom: {
            ...current.ads.reader.bottom,
            ...input.ads?.reader?.bottom,
          },
        },
      },
      hero: {
        ...current.hero,
        ...omitUndefined({
          intervalSeconds: input.hero?.intervalSeconds,
        }),
        animeIds: input.hero?.animeIds ?? current.hero.animeIds,
        slides: input.hero?.slides ?? current.hero.slides,
      },
      site: {
        ...current.site,
        ...omitUndefined({
          androidDownloadUrl: input.site?.androidDownloadUrl,
          androidDownloadLabel: input.site?.androidDownloadLabel,
          telegramUrl: input.site?.telegramUrl,
          telegramLabel: input.site?.telegramLabel,
        }),
      },
    });

    if (next.registration.requireEmailVerification && !next.smtp.enabled) {
      throw new AppError(
        'RESULT_INVALID',
        '开启邮箱验证前须启用并配置 SMTP',
        400,
      );
    }

    await this.repo.save(next);
    return this.getAdminView();
  }

  async sendTestEmail(to: string): Promise<void> {
    const settings = await this.getSettings();
    const password = settings.smtp.password
      ? decryptSmtpPassword(this.cipher, settings.smtp.password)
      : null;
    const resolved = assertSmtpConfigured(settings.smtp, password);
    await sendSmtpTest(resolved, to.trim());
  }

  /** Whether public manga pages are enabled (no secret exposed). */
  async isMangaEnabled(): Promise<boolean> {
    const settings = await this.getSettings();
    return settings.manga.enabled;
  }

  /**
   * Validate the shared publish key from tg-manga (or any ingest client).
   * Key is stored encrypted in system_settings via admin UI — not env.
   */
  async assertMangaPublishKey(provided: string | null | undefined): Promise<void> {
    const settings = await this.getSettings();
    if (!settings.manga.enabled) {
      throw new AppError('RESULT_INVALID', '漫画发布已关闭', 403);
    }
    if (!settings.manga.publishSecret) {
      throw new AppError(
        'CONFIG_INVALID',
        '未配置漫画发布密钥：请在管理后台 → 系统设置中填写',
        503,
      );
    }
    const expected = decryptMangaPublishSecret(this.cipher, settings.manga.publishSecret);
    const got = (provided || '').trim();
    if (!got || got !== expected) {
      throw new AppError('AUTH_REQUIRED', '漫画发布密钥无效', 401);
    }
  }

  async assertTurnstileIfRequired(
    purpose: 'register' | 'login',
    token: string | null | undefined,
    remoteIp?: string | null,
  ): Promise<void> {
    const settings = await this.getSettings();
    const publicCfg = toPublicAuthConfig(settings);
    const required =
      purpose === 'register'
        ? publicCfg.turnstile.onRegister
        : publicCfg.turnstile.onLogin;
    if (!required) return;

    if (!settings.turnstile.secretKey) {
      throw new AppError('CONFIG_INVALID', 'Turnstile 密钥未配置', 500);
    }
    const secret = decryptTurnstileSecret(this.cipher, settings.turnstile.secretKey);
    await assertTurnstileOk({
      secret,
      token: token ?? '',
      remoteIp,
      fetchImpl: this.options?.fetchImpl,
    });
  }

  async assertRegistrationAllowed(email: string): Promise<void> {
    const settings = await this.getSettings();
    if (!settings.registration.open) {
      throw new AppError('RESULT_INVALID', '当前未开放注册', 403, false, {
        field: 'registration',
      });
    }
    if (!isEmailAllowedByWhitelist(email, settings.registration.emailWhitelist)) {
      throw new AppError('RESULT_INVALID', '该邮箱不在允许注册的白名单中', 403, false, {
        field: 'whitelist',
      });
    }
  }

  /**
   * Public registration with whitelist + optional Turnstile + optional email verification.
   */
  async registerPublic(input: {
    email: string;
    password: string;
    displayName?: string | null;
    turnstileToken?: string | null;
    remoteIp?: string | null;
  }): Promise<Readonly<{ user: UserRecord; needsVerification: boolean }>> {
    this.assertNotRateLimited('register', input.remoteIp, input.email);
    await this.assertRegistrationAllowed(input.email);
    await this.assertTurnstileIfRequired('register', input.turnstileToken, input.remoteIp);

    const settings = await this.getSettings();
    const needsVerification = settings.registration.requireEmailVerification;

    if (needsVerification && !settings.smtp.enabled) {
      throw new AppError('CONFIG_INVALID', '邮箱验证已开启但 SMTP 未配置', 500);
    }

    const user = await this.identity.registerWithEmail({
      email: input.email,
      password: input.password,
      displayName: input.displayName,
      isActive: needsVerification ? 0 : 1,
      autoLogin: !needsVerification,
    });

    if (needsVerification) {
      await this.issueAndSendVerification(user);
    }

    return { user, needsVerification };
  }

  async loginPublic(input: {
    emailOrUsername: string;
    password: string;
    turnstileToken?: string | null;
    remoteIp?: string | null;
    skipTurnstile?: boolean;
  }): Promise<UserRecord | null> {
    this.assertNotRateLimited('login', input.remoteIp, input.emailOrUsername);
    if (!input.skipTurnstile) {
      await this.assertTurnstileIfRequired('login', input.turnstileToken, input.remoteIp);
    }
    return this.identity.loginPublic(input.emailOrUsername, input.password);
  }

  async issueAndSendVerification(user: UserRecord): Promise<void> {
    const settings = await this.getSettings();
    const password = settings.smtp.password
      ? decryptSmtpPassword(this.cipher, settings.smtp.password)
      : null;
    const smtp = assertSmtpConfigured(settings.smtp, password);

    await this.tokens.deleteForUser(user.id);
    const rawToken = randomBytes(32).toString('base64url');
    const tokenHash = sha256Bytes(rawToken);
    const ttlMs = settings.trust.verificationTokenTtlMinutes * 60_000;
    const expiresAt = new Date(Date.now() + ttlMs);
    await this.tokens.create({ userId: user.id, tokenHash, expiresAt });

    const base = resolveSiteUrl(this.options?.siteUrl || process.env.SITE_URL);
    const link = `${base}/verify-email?token=${encodeURIComponent(rawToken)}`;

    await sendSmtpMail(smtp, {
      to: user.username,
      subject: '[AnimeStream] 请验证你的邮箱',
      text: `请打开以下链接完成邮箱验证（${settings.trust.verificationTokenTtlMinutes} 分钟内有效）：\n\n${link}\n`,
      html: `<p>请点击以下链接完成邮箱验证（${settings.trust.verificationTokenTtlMinutes} 分钟内有效）：</p><p><a href="${link}">${link}</a></p>`,
    });
  }

  /**
   * Request password reset email. Always returns ok-shaped result to avoid account enumeration.
   */
  async requestPasswordReset(
    email: string,
    remoteIp?: string | null,
  ): Promise<{ accepted: true }> {
    const normalized = email.trim().toLowerCase();
    if (!normalized) {
      throw new AppError('RESULT_INVALID', '请输入邮箱', 400, false, { field: 'email' });
    }

    this.assertNotRateLimited('password_reset', remoteIp, normalized);

    const resets = this.options?.passwordResets;
    if (!resets) {
      throw new AppError('CONFIG_INVALID', '密码重置未配置', 500);
    }

    const settings = await this.getSettings();
    const user = await this.identity.getUserByUsername(normalized);

    // Enumeration-safe: only send when user exists, SMTP is enabled, and active.
    if (user && user.isActive && user.role !== 'admin') {
      try {
        const password = settings.smtp.password
          ? decryptSmtpPassword(this.cipher, settings.smtp.password)
          : null;
        // Fail before writing a token if SMTP is not usable.
        const smtp = assertSmtpConfigured(settings.smtp, password);
        await resets.deleteForUser(user.id);
        const rawToken = randomBytes(32).toString('base64url');
        const tokenHash = sha256Bytes(rawToken);
        const ttlMs = 60 * 60 * 1000;
        await resets.create({
          userId: user.id,
          tokenHash,
          expiresAt: new Date(Date.now() + ttlMs),
        });
        const base = resolveSiteUrl(this.options?.siteUrl || process.env.SITE_URL);
        const link = `${base}/reset-password?token=${encodeURIComponent(rawToken)}`;
        try {
          await sendSmtpMail(smtp, {
            to: user.username,
            subject: '[AnimeStream] 重置密码',
            text: `请在 60 分钟内打开链接重置密码：\n\n${link}\n\n若非本人操作请忽略。`,
            html: `<p>请在 60 分钟内打开链接重置密码：</p><p><a href="${link}">${link}</a></p><p>若非本人操作请忽略。</p>`,
          });
        } catch (sendError) {
          // Do not leave a usable reset token if the mail never went out.
          await resets.deleteForUser(user.id);
          throw sendError;
        }
      } catch {
        // Enumeration-safe: still return accepted to the client.
      }
    }

    return { accepted: true };
  }

  async resetPasswordWithToken(rawToken: string, nextPassword: string): Promise<void> {
    const resets = this.options?.passwordResets;
    if (!resets) {
      throw new AppError('CONFIG_INVALID', '密码重置未配置', 500);
    }
    if (nextPassword.length < 8) {
      throw new AppError('RESULT_INVALID', '密码至少 8 位', 400, false, { field: 'password' });
    }
    const token = rawToken.trim();
    if (!token) {
      throw new AppError('RESULT_INVALID', '重置链接无效', 400);
    }
    // Atomic single-use consume (SELECT … FOR UPDATE + conditional mark).
    const record = await resets.consumeValidToken(sha256Bytes(token));
    if (!record) {
      throw new AppError('RESULT_INVALID', '重置链接无效、已使用或已过期', 400);
    }
    await this.identity.setPassword(record.userId, nextPassword);
    // Drop remaining outstanding reset tokens for this user (including the used row).
    await resets.deleteForUser(record.userId);
  }

  async verifyEmailToken(rawToken: string): Promise<UserRecord> {
    const token = rawToken.trim();
    if (!token) {
      throw new AppError('RESULT_INVALID', '验证链接无效', 400);
    }
    const tokenHash = sha256Bytes(token);
    const record = await this.tokens.findByTokenHash(tokenHash);
    if (!record || record.usedAt) {
      throw new AppError('RESULT_INVALID', '验证链接无效或已使用', 400);
    }
    if (new Date(record.expiresAt).getTime() < Date.now()) {
      throw new AppError('RESULT_INVALID', '验证链接已过期，请重新注册或联系管理员', 400);
    }

    await this.identity.activateUser(record.userId);
    await this.tokens.markUsed(record.id);
    const user = await this.identity.getUserById(record.userId);
    if (!user) {
      throw new AppError('RESULT_INVALID', '用户不存在', 404);
    }
    await this.identity.establishSession(user);
    return user;
  }
}

function omitUndefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v;
  }
  return out as Partial<T>;
}

function mergeEncryptedSecret<T>(
  current: T | null,
  plain: string | undefined,
  encrypt: (plain: string) => T,
): T | null {
  if (plain === undefined) return current;
  const trimmed = plain.trim();
  if (!trimmed) return current;
  return encrypt(trimmed);
}
