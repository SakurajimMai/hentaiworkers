import assert from 'node:assert/strict';
import test from 'node:test';
import { randomBytes } from 'node:crypto';
import { SystemSettingsService } from '../../lib/server/system/application/system-settings-service';
import type {
  EmailVerificationTokenRepository,
  SystemSettingsRepository,
} from '../../lib/server/system/ports/system-settings-repository';
import type {
  PasswordResetRepository,
  PasswordResetTokenRecord,
} from '../../lib/server/identity/ports/password-reset-repository';
import type { UserRecord } from '../../lib/server/identity/ports/user-repository';
import {
  AesGcmSecretCipher,
  keyringViewFromRecord,
} from '../../lib/server/infrastructure/crypto/aes-gcm-secret-cipher';
import { defaultSystemSettings } from '../../lib/server/system/domain/settings';
import { encryptSmtpPassword } from '../../lib/server/system/application/secret-fields';
import { sha256Bytes } from '../../lib/server/crawler/domain/hashing';
import { AppError } from '../../lib/server/shared/errors';
import { AuthRateLimiter } from '../../lib/server/identity/application/auth-rate-limit';

class MemorySettings implements SystemSettingsRepository {
  value = defaultSystemSettings();
  async get() {
    return this.value;
  }
  async save(next: typeof this.value) {
    this.value = next;
  }
}

class MemoryTokens implements EmailVerificationTokenRepository {
  async create() {}
  async findByTokenHash() {
    return null;
  }
  async markUsed() {}
  async deleteForUser() {}
}

class MemoryResets implements PasswordResetRepository {
  rows = new Map<string, {
    id: number;
    userId: number;
    tokenHash: Uint8Array;
    expiresAt: string;
    usedAt: string | null;
    createdAt: string;
  }>();
  seq = 1;

  async deleteForUser(userId: number) {
    for (const [k, v] of this.rows) {
      if (v.userId === userId) this.rows.delete(k);
    }
  }

  async create(input: { userId: number; tokenHash: Uint8Array; expiresAt: Date }) {
    const key = Buffer.from(input.tokenHash).toString('hex');
    this.rows.set(key, {
      id: this.seq++,
      userId: input.userId,
      tokenHash: input.tokenHash,
      expiresAt: input.expiresAt.toISOString(),
      usedAt: null,
      createdAt: new Date().toISOString(),
    });
  }

  async findByTokenHash(tokenHash: Uint8Array) {
    return this.rows.get(Buffer.from(tokenHash).toString('hex')) ?? null;
  }

  async markUsed(id: number) {
    for (const row of this.rows.values()) {
      if (row.id === id) {
        if (row.usedAt) throw new Error('Password reset token already used or missing');
        row.usedAt = new Date().toISOString();
        return;
      }
    }
    throw new Error('Password reset token already used or missing');
  }

  async consumeValidToken(
    tokenHash: Uint8Array,
    now: Date = new Date(),
  ): Promise<PasswordResetTokenRecord | null> {
    const key = Buffer.from(tokenHash).toString('hex');
    const row = this.rows.get(key);
    if (!row || row.usedAt) return null;
    if (new Date(row.expiresAt).getTime() < now.getTime()) return null;
    row.usedAt = now.toISOString();
    return { ...row, usedAt: row.usedAt };
  }
}

function buildService(opts?: {
  user?: UserRecord | null;
  rateLimiter?: AuthRateLimiter;
  smtpEnabled?: boolean;
}) {
  const cipher = new AesGcmSecretCipher(
    keyringViewFromRecord('k1', { k1: randomBytes(32) }),
  );
  const settings = new MemorySettings();
  settings.value = {
    ...defaultSystemSettings(),
    smtp: {
      enabled: opts?.smtpEnabled !== false,
      host: 'smtp.example.com',
      port: 587,
      secure: false,
      username: 'u',
      password: encryptSmtpPassword(cipher, 'secret'),
      fromEmail: 'noreply@example.com',
      fromName: 'AnimeStream',
    },
  };

  const user: UserRecord = opts?.user === null
    ? null as never
    : opts?.user ?? {
      id: 9,
      username: 'user@example.com',
      passwordHash: 'old',
      sessionVersion: 1,
      role: 'user',
      displayName: 'U',
      isActive: 1,
    };

  let newPassword: string | null = null;
  let sessionBumps = 0;
  const mutableUser = user
    ? {
        passwordHash: user.passwordHash,
        sessionVersion: user.sessionVersion,
      }
    : null;
  const identity = {
    async getUserByUsername(username: string) {
      if (!user) return null;
      return username === user.username ? user : null;
    },
    async setPassword(_id: number, next: string) {
      newPassword = next;
      sessionBumps += 1;
      if (mutableUser) {
        mutableUser.passwordHash = next;
        mutableUser.sessionVersion += 1;
      }
    },
  };

  const resets = new MemoryResets();
  const service = new SystemSettingsService(
    settings,
    new MemoryTokens(),
    cipher,
    identity as never,
    {
      passwordResets: resets,
      siteUrl: 'https://example.com',
      rateLimiter: opts?.rateLimiter,
    },
  );

  return { service, resets, user, getNewPassword: () => newPassword, getSessionBumps: () => sessionBumps };
}

test('requestPasswordReset is enumeration-safe and resetPasswordWithToken updates password', async () => {
  const { service, resets, getNewPassword } = buildService();

  const unknown = await service.requestPasswordReset('missing@example.com');
  assert.equal(unknown.accepted, true);
  assert.equal(resets.rows.size, 0);

  const known = await service.requestPasswordReset('user@example.com');
  assert.equal(known.accepted, true);

  const raw = 'test-reset-token-value';
  await resets.create({
    userId: 9,
    tokenHash: sha256Bytes(raw),
    expiresAt: new Date(Date.now() + 60_000),
  });

  await service.resetPasswordWithToken(raw, 'new-password-123');
  assert.equal(getNewPassword(), 'new-password-123');
  const used = await resets.findByTokenHash(sha256Bytes(raw));
  assert.equal(used, null);
});

test('reset rejects short password, reused token, and expired token', async () => {
  const { service, resets } = buildService();
  const raw = 'once-token';
  await resets.create({
    userId: 9,
    tokenHash: sha256Bytes(raw),
    expiresAt: new Date(Date.now() + 60_000),
  });

  await assert.rejects(
    () => service.resetPasswordWithToken(raw, 'short'),
    (error: unknown) => {
      assert.ok(error instanceof AppError);
      assert.equal(error.code, 'RESULT_INVALID');
      return true;
    },
  );

  await service.resetPasswordWithToken(raw, 'long-enough');
  await assert.rejects(
    () => service.resetPasswordWithToken(raw, 'another-long'),
    (error: unknown) => {
      assert.ok(error instanceof AppError);
      assert.equal(error.code, 'RESULT_INVALID');
      return true;
    },
  );

  const expiredRaw = 'expired-token';
  await resets.create({
    userId: 9,
    tokenHash: sha256Bytes(expiredRaw),
    expiresAt: new Date(Date.now() - 1000),
  });
  await assert.rejects(
    () => service.resetPasswordWithToken(expiredRaw, 'long-enough'),
    AppError,
  );
});

test('password reset rate limit blocks after max attempts', async () => {
  const limiter = new AuthRateLimiter({ maxAttempts: 2, windowMs: 60_000 });
  const { service } = buildService({ rateLimiter: limiter });
  assert.equal((await service.requestPasswordReset('a@b.com', '1.1.1.1')).accepted, true);
  assert.equal((await service.requestPasswordReset('a@b.com', '1.1.1.1')).accepted, true);
  await assert.rejects(
    () => service.requestPasswordReset('a@b.com', '1.1.1.1'),
    (error: unknown) => {
      assert.ok(error instanceof AppError);
      assert.equal(error.code, 'SOURCE_RATE_LIMITED');
      return true;
    },
  );
});

test('admin and inactive users do not receive reset tokens', async () => {
  const admin = {
    id: 1,
    username: 'admin@example.com',
    passwordHash: 'x',
    sessionVersion: 1,
    role: 'admin' as const,
    displayName: 'A',
    isActive: 1,
  };
  const { service, resets } = buildService({ user: admin });
  const r = await service.requestPasswordReset('admin@example.com');
  assert.equal(r.accepted, true);
  assert.equal(resets.rows.size, 0);

  const inactive = { ...admin, id: 2, username: 'dead@example.com', role: 'user' as const, isActive: 0 };
  const b = buildService({ user: inactive });
  await b.service.requestPasswordReset('dead@example.com');
  assert.equal(b.resets.rows.size, 0);
});
