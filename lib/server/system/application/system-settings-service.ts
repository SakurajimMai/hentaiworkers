import { randomBytes } from 'node:crypto';
import type { SecretCipher } from '../../crawler/ports/secret-cipher';
import { sha256Bytes } from '../../crawler/domain/hashing';
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
  decryptSmtpPassword,
  decryptTurnstileSecret,
  encryptSmtpPassword,
  encryptTurnstileSecret,
} from './secret-fields';
import { assertSmtpConfigured, sendSmtpMail, sendSmtpTest } from './mailer';
import { assertTurnstileOk } from './turnstile';
import type { IdentityService } from '../../identity/application/identity-service';
import type { UserRecord } from '../../identity/ports/user-repository';

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
    },
  ) {}

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
    };
  }

  async getPublicAuthConfig(): Promise<PublicAuthConfig> {
    return toPublicAuthConfig(await this.getSettings());
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
  }): Promise<UserRecord | null> {
    await this.assertTurnstileIfRequired('login', input.turnstileToken, input.remoteIp);
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

    const base = (this.options?.siteUrl || process.env.SITE_URL || 'http://127.0.0.1:3000')
      .replace(/\/+$/, '');
    const link = `${base}/verify-email?token=${encodeURIComponent(rawToken)}`;

    await sendSmtpMail(smtp, {
      to: user.username,
      subject: '[AnimeStream] 请验证你的邮箱',
      text: `请打开以下链接完成邮箱验证（${settings.trust.verificationTokenTtlMinutes} 分钟内有效）：\n\n${link}\n`,
      html: `<p>请点击以下链接完成邮箱验证（${settings.trust.verificationTokenTtlMinutes} 分钟内有效）：</p><p><a href="${link}">${link}</a></p>`,
    });
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
