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
  parseSystemSettings,
  toPublicAuthConfig,
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

test('player settings parse defaults and line parsers', () => {
  const settings = parseSystemSettings({
    player: {
      enableContextMenu: false,
      lineParsers: [
        { match: 'hnm3u8', parserUrl: 'https://www.hnjiexi.com/m3u8/?url=' },
        { match: '红牛', parserUrl: 'https://www.hnjiexi.com/m3u8/?url=', enabled: false },
      ],
    },
  });
  assert.equal(settings.player.enableContextMenu, false);
  assert.equal(settings.player.worksFallbackArtPlayer, true);
  assert.equal(settings.player.lineParsers.length, 2);
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

test('resolveLineParser and buildParserPlaybackUrl', async () => {
  const { resolveLineParser, buildParserPlaybackUrl } = await import(
    '../../lib/server/system/domain/settings'
  );
  const parsers = [
    { match: 'hnm3u8', parserUrl: 'https://www.hnjiexi.com/m3u8/?url=', enabled: true },
    { match: '红牛', parserUrl: 'https://www.hnjiexi.com/m3u8/?url=', enabled: true },
  ];
  const hit = resolveLineParser({ flag: 'hnm3u8', name: '红牛' }, parsers);
  assert.ok(hit);
  assert.equal(hit?.match, 'hnm3u8');
  const src = buildParserPlaybackUrl(
    'https://www.hnjiexi.com/m3u8/?url=',
    'https://cdn.example/a.m3u8',
  );
  assert.equal(src, 'https://www.hnjiexi.com/m3u8/?url=https%3A%2F%2Fcdn.example%2Fa.m3u8');
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
  async markUsed(id: number) {
    const row = this.rows.find((r) => r.id === id);
    if (row) (row as { usedAt: string }).usedAt = new Date().toISOString();
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
  const key = randomBytes(32);
  const cipher = new AesGcmSecretCipher(keyringViewFromRecord('k1', { k1: key }));
  const settings = new MemorySettings();
  const tokens = new MemoryTokens();
  const identity = new IdentityService(
    new MemoryUsers(),
    new MemorySession(),
    new MemoryPasswords(),
  );
  const service = new SystemSettingsService(settings, tokens, cipher, identity, {
    siteUrl: 'https://example.com',
    fetchImpl,
  });
  return { service, settings, identity };
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

  const ok = await service.registerPublic({
    email: 'x@allowed.com',
    password: 'password1',
  });
  assert.equal(ok.needsVerification, false);
  assert.equal(ok.user.username, 'x@allowed.com');
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

test('require email verification without smtp is rejected on update', async () => {
  const { service } = buildService();
  await assert.rejects(
    () =>
      service.update({
        registration: { open: true, requireEmailVerification: true, emailWhitelist: [] },
        smtp: { enabled: false },
      }),
    AppError,
  );
});

test('turnstile required on register calls siteverify', async () => {
  let called = false;
  const fetchImpl: typeof fetch = async () => {
    called = true;
    return new Response(JSON.stringify({ success: true }), { status: 200 });
  };
  const { service } = buildService(fetchImpl);
  await service.update({
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
