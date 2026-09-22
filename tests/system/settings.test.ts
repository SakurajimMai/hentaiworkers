import { AuthRateLimiter } from '../../lib/server/identity/application/auth-rate-limit';
import type { SendMailInput } from '../../lib/server/system/application/mailer';
import assert from 'node:assert/strict';
import test from 'node:test';
import { randomBytes } from 'node:crypto';
import {
  AesGcmSecretCipher,
  keyringViewFromRecord,
} from '../../lib/server/infrastructure/crypto/aes-gcm-secret-cipher';
import { IdentityService } from '../../lib/server/identity/application/identity-service';
import type { PasswordHasher } from '../../lib/server/identity/ports/password-hasher';
import type { SessionPort } from '../../lib/server/identity/ports/session';
import type {
  CreateUserInput,
  UpdateUserInput,
  UserRecord,
  UserRepository,
} from '../../lib/server/identity/ports/user-repository';
import type { SessionData } from '../../lib/server/identity/session-config';
import {
  isEmailAllowedByWhitelist,
  isOutboundMailReady,
  parseSystemSettings,
  toPublicAdsConfig,
  toPublicAuthConfig,
  toPublicSiteConfig,
} from '../../lib/server/system/domain/settings';
import { SystemSettingsService } from '../../lib/server/system/application/system-settings-service';
import type {
  EmailVerificationTokenRecord,
  EmailVerificationTokenRepository,
  SystemSettingsRepository,
} from '../../lib/server/system/ports/system-settings-repository';
import type { SystemSettings } from '../../lib/server/system/domain/settings';
import { AppError } from '../../lib/server/shared/errors';

test('email whitelist matches domains and full addresses', () => {
  assert.equal(isEmailAllowedByWhitelist('a@x.com', []), true);
  assert.equal(isEmailAllowedByWhitelist('a@example.com', ['example.com']), true);
  assert.equal(isEmailAllowedByWhitelist('a@sub.example.com', ['example.com']), true);
  assert.equal(isEmailAllowedByWhitelist('a@evil.com', ['example.com']), false);
  assert.equal(isEmailAllowedByWhitelist('alice@co.com', ['alice@co.com']), true);
  assert.equal(isEmailAllowedByWhitelist('bob@co.com', ['alice@co.com']), false);
  assert.equal(isEmailAllowedByWhitelist('a@partner.org', ['@partner.org']), true);
});

test('public auth config hides turnstile without secret', () => {
  const settings = parseSystemSettings({
    turnstile: { enabled: true, siteKey: 'site', secretKey: null },
    trust: { turnstileOnRegister: true, turnstileOnLogin: true },
  });
  const pub = toPublicAuthConfig(settings);
  assert.equal(pub.turnstile.enabled, false);
  assert.equal(pub.turnstile.onRegister, false);
});

test('player settings parse defaults', () => {
  const settings = parseSystemSettings({
    player: {
      enableContextMenu: false,
    },
  });
  assert.equal(settings.player.enableContextMenu, false);
  assert.equal(settings.player.preRollAd.enabled, false);
  assert.equal(settings.player.preRollAd.muted, true);
  assert.equal(settings.player.preRollAd.playDuration, 5);
  assert.equal(settings.player.preRollAd.totalDuration, 10);
  assert.equal(settings.player.pauseAd.enabled, false);
  assert.equal(settings.player.pauseAd.videoUrl, '');
  assert.equal(settings.player.pauseAd.muted, true);
});

test('player ads accept video and image pre-roll and pause configs', () => {
  const settings = parseSystemSettings({
    player: {
      preRollAd: {
        enabled: true,
        videoUrl: 'https://cdn.example/pre.mp4',
        imageUrl: 'https://cdn.example/pre.jpg',
        clickUrl: 'https://example.com/a',
        playDuration: 3,
        totalDuration: 8,
        muted: false,
      },
      pauseAd: {
        enabled: true,
        videoUrl: 'https://cdn.example/pause.mp4',
        imageUrl: 'https://cdn.example/pause.jpg',
        html: '',
        clickUrl: 'https://example.com/b',
        muted: true,
      },
    },
  });
  assert.equal(settings.player.preRollAd.enabled, true);
  assert.equal(settings.player.preRollAd.videoUrl, 'https://cdn.example/pre.mp4');
  assert.equal(settings.player.preRollAd.playDuration, 3);
  assert.equal(settings.player.pauseAd.videoUrl, 'https://cdn.example/pause.mp4');
  assert.equal(settings.player.pauseAd.muted, true);
});

test('outbound mail ready requires enablement, host, sender and password', () => {
  assert.equal(
    isOutboundMailReady({ enabled: false, host: 'smtp.example.com', fromEmail: 'a@b.com', passwordConfigured: true }),
    false,
  );
  assert.equal(
    isOutboundMailReady({ enabled: true, host: '', fromEmail: 'a@b.com', passwordConfigured: true }),
    false,
  );
  assert.equal(
    isOutboundMailReady({ enabled: true, host: 'smtp.example.com', fromEmail: 'a@b.com', passwordConfigured: false }),
    false,
  );
  assert.equal(
    isOutboundMailReady({ enabled: true, host: 'smtp.example.com', fromEmail: 'a@b.com', passwordConfigured: true }),
    true,
  );
});

test('public site config only exposes http(s) android download links', () => {
  const hidden = toPublicSiteConfig(
    parseSystemSettings({
      site: { androidDownloadUrl: 'javascript:alert(1)', androidDownloadLabel: 'App' },
    }),
  );
  assert.equal(hidden.androidDownloadUrl, '');
  assert.equal(hidden.androidDownloadLabel, 'App');

  const shown = toPublicSiteConfig(
    parseSystemSettings({
      site: {
        androidDownloadUrl: 'https://cdn.example/animestream.apk',
        androidDownloadLabel: '  下载安卓  ',
      },
    }),
  );
  assert.equal(shown.androidDownloadUrl, 'https://cdn.example/animestream.apk');
  assert.equal(shown.androidDownloadLabel, '下载安卓');

  const defaults = toPublicSiteConfig(parseSystemSettings({}));
  assert.equal(defaults.androidDownloadUrl, '');
  assert.equal(defaults.androidDownloadLabel, '下载 App');
  assert.equal(defaults.telegramUrl, '');
  assert.equal(defaults.telegramLabel, 'Telegram');
});

test('public site config accepts telegram channel aliases', () => {
  const hidden = toPublicSiteConfig(
    parseSystemSettings({
      site: { telegramUrl: 'javascript:alert(1)', telegramLabel: '频道' },
    }),
  );
  assert.equal(hidden.telegramUrl, '');
  assert.equal(hidden.telegramLabel, '频道');

  const shown = toPublicSiteConfig(
    parseSystemSettings({
      site: { telegramUrl: '@ACGN_Manga', telegramLabel: '  漫画频道  ' },
    }),
  );
  assert.equal(shown.telegramUrl, 'https://t.me/ACGN_Manga');
  assert.equal(shown.telegramLabel, '漫画频道');

  const invite = toPublicSiteConfig(
    parseSystemSettings({
      site: { telegramUrl: 't.me/+AbCdEf' },
    }),
  );
  assert.equal(invite.telegramUrl, 'https://t.me/+AbCdEf');
});

test('toPublicAdsConfig keeps enabled feed/reader slots and player ads', () => {
  const pub = toPublicAdsConfig(
    parseSystemSettings({
      ads: {
        feedSlots: [
          { enabled: true, name: 'A', interval: 4, href: 'https://a.example', html: '<b>a</b>' },
          { enabled: false, name: 'B', interval: 9, href: '', html: '<b>b</b>' },
        ],
        reader: {
          top: { enabled: true, html: '<p>top</p>', interval: 5 },
          bottom: { enabled: false, html: '<p>hidden</p>', interval: 5 },
        },
      },
      player: {
        preRollAd: { enabled: true, videoUrl: 'https://cdn.example/pre.mp4' },
      },
    }),
  );
  assert.equal(pub.feedSlots.length, 1);
  assert.equal(pub.feedSlots[0].html, '<b>a</b>');
  assert.equal('placement' in pub.feedSlots[0], false);
  const inferred = toPublicAdsConfig(
    parseSystemSettings({
      ads: {
        feedSlots: [
          {
            enabled: true,
            html: `<script>atOptions = { 'key': 'x', 'format': 'iframe', 'height': 250, 'width': 300, 'params': {} };</script>`,
          },
        ],
      },
    }),
  );
  assert.equal(inferred.feedSlots[0].width, 300);
  assert.equal(inferred.feedSlots[0].height, 250);
  assert.equal('placement' in inferred.feedSlots[0], false);
  assert.equal(pub.reader.top.html, '<p>top</p>');
  assert.equal(pub.reader.bottom.enabled, false);
  assert.equal(pub.reader.bottom.html, '');
  assert.equal(pub.reader.middle.enabled, false);
  assert.equal(pub.player.preRollAd.videoUrl, 'https://cdn.example/pre.mp4');
});

test('toPublicPlayerConfig preserves preRoll and pause ad video/muted fields', async () => {
  const { toPublicPlayerConfig } = await import('../../lib/server/system/domain/settings');
  const settings = parseSystemSettings({
    player: {
      preRollAd: {
        enabled: true,
        videoUrl: 'https://cdn.example/pre.mp4',
        muted: false,
      },
      pauseAd: {
        enabled: true,
        videoUrl: 'https://cdn.example/pause.mp4',
        muted: false,
      },
    },
  });
  const pub = toPublicPlayerConfig(settings);
  assert.equal(pub.preRollAd.videoUrl, 'https://cdn.example/pre.mp4');
  assert.equal(pub.preRollAd.muted, false);
  assert.equal(pub.pauseAd.videoUrl, 'https://cdn.example/pause.mp4');
  assert.equal(pub.pauseAd.muted, false);
});

class MemorySettings implements SystemSettingsRepository {
  data: SystemSettings | null = null;
  async get() {
    return this.data;
  }
  async save(s: SystemSettings) {
    this.data = s;
  }
}

class MemoryTokens implements EmailVerificationTokenRepository {
  constructor(private users: MemoryUsers) {}
  rows: EmailVerificationTokenRecord[] = [];
  async create(input: { userId: number; tokenHash: Uint8Array; expiresAt: Date }) {
    this.rows.push({
      id: this.rows.length + 1,
      userId: input.userId,
      tokenHash: input.tokenHash,
      expiresAt: input.expiresAt.toISOString(),
      usedAt: null,
      createdAt: new Date().toISOString(),
    });
  }
  async findByTokenHash(tokenHash: Uint8Array) {
    const key = Buffer.from(tokenHash).toString('hex');
    return (
      this.rows.find((r) => Buffer.from(r.tokenHash).toString('hex') === key) ?? null
    );
  }
  async hasPendingForUser(userId: number) {
    return this.rows.some((row) => row.userId === userId && !row.usedAt);
  }
  async consumeAndActivate(id: number) {
    const row = this.rows.find((r) => r.id === id);
    if (!row || row.usedAt || Date.parse(row.expiresAt) <= Date.now()) return false;
    const user = await this.users.findById(row.userId);
    if (!user || user.isActive || user.role !== 'user') return false;
    // Test double mirrors the atomic adapter contract; mark before the next await.
    if (row.usedAt) return false;
    (row as { usedAt: string }).usedAt = new Date().toISOString();
    await this.users.update(row.userId, { isActive: 1 });
    return true;
  }
  async deleteForUser(userId: number) {
    this.rows = this.rows.filter((r) => r.userId !== userId);
  }
}

class MemoryUsers implements UserRepository {
  private seq = 1;
  private readonly rows = new Map<number, UserRecord>();
  async findById(id: number) {
    return this.rows.get(id) ?? null;
  }
  async findByUsername(username: string) {
    return [...this.rows.values()].find((r) => r.username === username) ?? null;
  }
  async create(input: CreateUserInput): Promise<UserRecord> {
    const id = this.seq++;
    const row: UserRecord = {
      id,
      username: input.username,
      passwordHash: input.passwordHash,
      role: input.role,
      displayName: input.displayName ?? null,
      isActive: input.isActive ?? 1,
      sessionVersion: 1,
    };
    this.rows.set(id, row);
    return row;
  }
  async update(id: number, input: UpdateUserInput) {
    const cur = this.rows.get(id);
    if (!cur) return;
    this.rows.set(id, {
      ...cur,
      role: input.role ?? cur.role,
      displayName: input.displayName === undefined ? cur.displayName : input.displayName,
      isActive: input.isActive ?? cur.isActive,
      passwordHash: input.passwordHash ?? cur.passwordHash,
      sessionVersion: input.bumpSessionVersion
        ? cur.sessionVersion + 1
        : cur.sessionVersion,
    });
  }
  async deleteRegularUser(id: number) {
    const user = await this.findById(id);
    if (!user || user.role !== 'user') return false;
    this.rows.delete(id);
    return true;
  }
  async list() {
    return [...this.rows.values()];
  }
}

class MemorySession implements SessionPort {
  data: SessionData = { isLoggedIn: false };
  async get() {
    return { ...this.data };
  }
  async save(data: SessionData) {
    this.data = { ...data };
  }
  async destroy() {
    this.data = { isLoggedIn: false };
  }
}

class MemoryPasswords implements PasswordHasher {
  async hash(p: string) {
    return `hash:${p}`;
  }
  async verify(p: string, h: string) {
    return h === `hash:${p}`;
  }
}

function buildService(fetchImpl?: typeof fetch) {
  let now = Date.now();
  const key = randomBytes(32);
  const cipher = new AesGcmSecretCipher(keyringViewFromRecord('k1', { k1: key }));
  const settings = new MemorySettings();
  const users = new MemoryUsers();
  const sessions = new MemorySession();
  const tokens = new MemoryTokens(users);
  const sent: SendMailInput[] = [];
  let failMail = false;
  const identity = new IdentityService(
    users,
    sessions,
    new MemoryPasswords(),
  );
  const service = new SystemSettingsService(settings, tokens, cipher, identity, {
    siteUrl: 'https://example.com',
    fetchImpl,
    rateLimiter: new AuthRateLimiter({ now: () => now }),
    sendMail: async (_smtp, message) => {
      if (failMail) throw new Error('SMTP unavailable');
      sent.push(message);
    },
  });
  return { service, settings, identity, users, sessions, tokens, sent, setMailFailure: (fail: boolean) => { failMail = fail; }, advance: (ms: number) => { now += ms; } };
}

test('registration closed and whitelist enforced', async () => {
  const { service } = buildService();
  await service.update({
    registration: { open: false, emailWhitelist: [], requireEmailVerification: false },
  });
  await assert.rejects(
    () =>
      service.registerPublic({
        email: 'a@b.com',
        password: 'password1',
      }),
    (e: unknown) => e instanceof AppError && e.details?.field === 'registration',
  );

  await service.update({
    registration: {
      open: true,
      emailWhitelist: ['allowed.com'],
      requireEmailVerification: false,
    },
  });
  await assert.rejects(
    () =>
      service.registerPublic({
        email: 'x@other.com',
        password: 'password1',
      }),
    (e: unknown) => e instanceof AppError && e.details?.field === 'whitelist',
  );

  await service.update({ smtp: { enabled: true, host: 'smtp.example.com', fromEmail: 'sender@example.com' } });
  const ok = await service.registerPublic({
    email: 'x@allowed.com',
    password: 'password1',
  });
  assert.equal(ok.needsVerification, true);
  assert.equal(ok.user.username, 'x@allowed.com');
});

test('global meta settings round-trip, survive unrelated updates and can be removed', async () => {
  const { service } = buildService();
  const metaTags = [{ attribute: 'name' as const, key: 'ad-network-verification', content: 'public-token' }];
  await service.update({ site: { metaTags, telegramUrl: '@channel' } });
  assert.deepEqual((await service.getAdminView()).site.metaTags, metaTags);
  assert.deepEqual(await service.getPublicMetaTags(), metaTags);
  await service.update({ site: { androidDownloadLabel: 'Android' } });
  assert.deepEqual(await service.getPublicMetaTags(), metaTags);
  assert.equal((await service.getAdminView()).site.telegramUrl, '@channel');
  await service.update({ site: { metaTags: [] } });
  assert.deepEqual(await service.getPublicMetaTags(), []);
});

test('indexnow key persists through unrelated updates, can be cleared and stays out of public config', async () => {
  const { service } = buildService();
  const key = 'f00dbabe1234567890abcdef12345678';
  await service.update({ site: { indexNowKey: key } });
  assert.equal((await service.getSettings()).site.indexNowKey, key);
  assert.equal((await service.getAdminView()).site.indexNowKey, key);

  await service.update({ site: { telegramLabel: '群组' } });
  assert.equal((await service.getSettings()).site.indexNowKey, key, 'unrelated site updates keep the key');
  assert.equal('indexNowKey' in toPublicSiteConfig(await service.getSettings()), false);

  await service.update({ site: { indexNowKey: '' } });
  assert.equal((await service.getSettings()).site.indexNowKey, '');
  assert.equal(parseSystemSettings({}).site.indexNowKey, '');
});

test('parseSystemSettings does not rewrite stored smtp usernames', () => {
  const settings = parseSystemSettings({
    smtp: { username: 'apikey', fromEmail: 'no-reply@ixacg.de' },
  });
  assert.equal(settings.smtp.username, 'apikey');
});

test('saving smtp qualifies a local-part username with the from-email domain', async () => {
  const { service } = buildService();
  await service.update({
    smtp: {
      enabled: true,
      host: 'eu1.workspace.org',
      port: 465,
      secure: true,
      username: 'admin',
      fromEmail: 'no-reply@ixacg.de',
      fromName: 'no-reply',
      password: 'secret-pass',
    },
  });
  const view = await service.getAdminView();
  // A bare mailbox name is what some providers authenticate with, so it round-trips untouched
  // instead of being qualified with the From domain.
  assert.equal(view.smtp.username, 'admin');

  await service.update({ smtp: { username: '  no-reply  ' } });
  assert.equal((await service.getAdminView()).smtp.username, 'no-reply');

  await service.update({ smtp: { username: 'postmaster@ixacg.de' } });
  assert.equal((await service.getAdminView()).smtp.username, 'postmaster@ixacg.de');
});

test('smtp password and turnstile secret persist encrypted and stay masked in admin view', async () => {
  const { service } = buildService();
  await service.update({
    smtp: {
      enabled: true,
      host: 'smtp.example.com',
      port: 465,
      secure: true,
      username: 'u',
      fromEmail: 'n@example.com',
      password: 'secret-pass',
    },
    turnstile: {
      enabled: true,
      siteKey: 'site-key',
      secretKey: 'turnstile-secret',
    },
  });
  const view = await service.getAdminView();
  assert.equal(view.smtp.passwordConfigured, true);
  assert.equal(view.turnstile.secretConfigured, true);
  assert.equal(view.smtp.host, 'smtp.example.com');

  const pub = await service.getPublicAuthConfig();
  assert.equal(pub.turnstile.enabled, true);
  assert.equal(pub.turnstile.siteKey, 'site-key');
  assert.equal(pub.turnstile.onRegister, true);
});

test('missing SMTP closes public registration and cannot create users', async () => {
  const { service, identity } = buildService();
  await service.update({ registration: { requireEmailVerification: false }, smtp: { enabled: false } });
  assert.equal((await service.getPublicAuthConfig()).registrationOpen, false);
  assert.equal((await service.getPublicAuthConfig()).requireEmailVerification, true);
  await assert.rejects(() => service.registerPublic({ email: 'no@example.com', password: 'password1' }));
  assert.equal((await identity.listUsers()).length, 0);
});

test('turnstile required on register calls siteverify', async () => {
  let called = false;
  const fetchImpl: typeof fetch = async () => {
    called = true;
    return new Response(JSON.stringify({ success: true }), { status: 200 });
  };
  const { service } = buildService(fetchImpl);
  await service.update({
    smtp: { enabled: true, host: 'smtp.example.com', fromEmail: 'sender@example.com' },
    turnstile: { enabled: true, siteKey: 's', secretKey: 'sec' },
    trust: { turnstileOnRegister: true, turnstileOnLogin: false },
    registration: { open: true, emailWhitelist: [], requireEmailVerification: false },
  });
  await service.registerPublic({
    email: 't@example.com',
    password: 'password1',
    turnstileToken: 'token',
  });
  assert.equal(called, true);
});

test('site SEO saves, survives partial updates and supports explicit clearing', async () => {
  const { service } = buildService();
  await service.update({ site: { seo: { title: '新站点', subtitle: '副标题', description: '摘要', keywords: '动画,漫画' } } });
  await service.update({ site: { telegramLabel: '群组' } });
  assert.equal((await service.getAdminView()).site.seo.title, '新站点');
  await service.update({ site: { seo: { subtitle: '', keywords: '' } } });
  assert.deepEqual((await service.getSettings()).site.seo, {
    title: '新站点', subtitle: '', description: '摘要', keywords: '',
  });
});

async function pendingRegistration(email = 'code@example.com') {
  const fixture = buildService();
  await fixture.service.update({ smtp: { enabled: true, host: 'smtp.example.com', fromEmail: 'sender@example.com' } });
  const result = await fixture.service.registerPublic({ email, password: 'password1' });
  const code = fixture.sent[0].text.match(/\d{6}/)?.[0];
  assert.ok(code);
  return { ...fixture, result, code, email };
}

test('registration requires an email-bound code before activation and session creation', async () => {
  const { service, result, sessions, tokens, code, email } = await pendingRegistration();
  assert.equal(result.needsVerification, true);
  assert.equal(result.user.isActive, 0);
  assert.equal(sessions.data.isLoggedIn, false);
  await assert.rejects(() => service.loginPublic({ emailOrUsername: email, password: 'password1' }));
  assert.equal(tokens.rows[0].tokenHash.length, 32);
  await assert.rejects(() => service.verifyEmailCode('other@example.com', code));
  const user = await service.verifyEmailCode(email.toUpperCase(), code);
  assert.equal(user.isActive, 1);
  assert.equal(sessions.data.userId, user.id);
  await assert.rejects(() => service.verifyEmailCode(email, code));
});

test('expired codes fail; resend replaces old credentials and verifies only once', async () => {
  const { service, tokens, sent, email, advance } = await pendingRegistration();
  tokens.rows[0] = { ...tokens.rows[0], expiresAt: new Date(0).toISOString() };
  const expiredCode = sent[0].text.match(/\d{6}/)![0];
  await assert.rejects(() => service.verifyEmailCode(email, expiredCode));
  advance(120_000);
  await service.resendVerification(email);
  assert.equal(tokens.rows.length, 1);
  assert.equal(sent.length, 2);
  const code = sent[1].text.match(/\d{6}/)![0];
  const results = await Promise.allSettled([service.verifyEmailCode(email, code), service.verifyEmailCode(email, code)]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  await service.resendVerification(email);
  assert.equal(sent.length, 2, 'active accounts cannot request activation codes');
});

test('verification limits attempts by email even when the source IP changes', async () => {
  const { service, email, code } = await pendingRegistration();
  for (let index = 0; index < 10; index++) {
    await assert.rejects(() => service.verifyEmailCode(email, 'invalid', `192.0.2.${index}`));
  }
  await assert.rejects(() => service.verifyEmailCode(email, code, '192.0.2.99'),
    (error: unknown) => error instanceof AppError && error.code === 'SOURCE_RATE_LIMITED');
});

test('resend ignores deleted, active and non-pending disabled accounts', async () => {
  const { service, identity, sent } = buildService();
  await identity.createUser({ username: 'disabled@example.com', password: 'password1', role: 'user', isActive: 0 });
  await service.resendVerification('disabled@example.com');
  await service.resendVerification('missing@example.com');
  assert.equal(sent.length, 0);
});

test('legacy token endpoint cannot bypass the email-code attempt limit', async () => {
  const { service, email, code, sessions } = await pendingRegistration();
  await assert.rejects(() => service.verifyEmailToken(`email-code:${email}:${code}`));
  assert.equal(sessions.data.isLoggedIn, false);
});


test('initial verification and resends share a 120 second cooldown across IPs', async () => {
  const { service, email, sent, advance } = await pendingRegistration();
  assert.equal(service.verificationRetryAfter(email), 120);
  advance(119_000);
  await assert.rejects(() => service.resendVerification(email.toUpperCase(), '192.0.2.10'),
    (error: unknown) => error instanceof AppError && error.details?.retryAfterSeconds === 1);
  assert.equal(sent.length, 1);
  advance(1000);
  await service.resendVerification(email, '192.0.2.11');
  assert.equal(sent.length, 2);
  assert.equal(service.verificationRetryAfter(email), 120);
  await assert.rejects(() => service.resendVerification(email, '192.0.2.12'),
    (error: unknown) => error instanceof AppError && error.code === 'SOURCE_RATE_LIMITED');
});


test('failed initial delivery leaves a recoverable pending account and enforces cooldown', async () => {
  const { service, setMailFailure, advance, sent, tokens } = buildService();
  await service.update({ smtp: { enabled: true, host: 'smtp.example.com', fromEmail: 'sender@example.com' } });
  setMailFailure(true);
  await assert.rejects(() => service.registerPublic({ email: 'retry@example.com', password: 'password1' }),
    (error: unknown) => error instanceof AppError && error.details?.field === 'verificationMail');
  assert.equal(tokens.rows.length, 1);
  assert.equal(service.verificationRetryAfter('retry@example.com'), 120);
  await assert.rejects(() => service.resendVerification('retry@example.com'),
    (error: unknown) => error instanceof AppError && error.code === 'SOURCE_RATE_LIMITED');
  setMailFailure(false);
  advance(120_000);
  await service.resendVerification('retry@example.com');
  assert.equal(sent.length, 1);
  const code = sent[0].text.match(/\d{6}/)![0];
  assert.equal((await service.verifyEmailCode('retry@example.com', code)).isActive, 1);
});
