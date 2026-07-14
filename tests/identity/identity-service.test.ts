import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
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
  createSessionOptions,
  isAdminSessionCookie,
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
} from '../../lib/server/identity/session-config';
import { AppError } from '../../lib/server/shared/errors';

class MemoryUsers implements UserRepository {
  private seq = 1;
  private readonly rows = new Map<number, UserRecord>();

  async findById(id: number) {
    return this.rows.get(id) ?? null;
  }

  async findByUsername(username: string) {
    return [...this.rows.values()].find((row) => row.username === username) ?? null;
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
    };
    this.rows.set(id, row);
    return row;
  }

  async update(id: number, input: UpdateUserInput): Promise<void> {
    const current = this.rows.get(id);
    if (!current) return;
    this.rows.set(id, {
      ...current,
      role: input.role ?? current.role,
      displayName: input.displayName === undefined ? current.displayName : input.displayName,
      isActive: input.isActive ?? current.isActive,
      passwordHash: input.passwordHash ?? current.passwordHash,
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

class PlainHasher implements PasswordHasher {
  async hash(plain: string) {
    return `hash:${plain}`;
  }

  async verify(plain: string, hash: string) {
    return hash === `hash:${plain}`;
  }
}

function build() {
  const users = new MemoryUsers();
  const sessions = new MemorySession();
  const passwords = new PlainHasher();
  const service = new IdentityService(users, sessions, passwords);
  return { users, sessions, service };
}

test('session config is shared shape for middleware and node adapter', () => {
  const options = createSessionOptions({
    SESSION_SECRET: 'x'.repeat(32),
    NODE_ENV: 'production',
  });
  assert.equal(options.cookieName, SESSION_COOKIE_NAME);
  assert.equal(options.cookieOptions?.httpOnly, true);
  assert.equal(options.cookieOptions?.sameSite, 'lax');
  assert.equal(options.cookieOptions?.secure, true);
  assert.equal(options.cookieOptions?.maxAge, SESSION_MAX_AGE_SECONDS);

  assert.equal(
    isAdminSessionCookie({ isLoggedIn: true, role: 'admin', userId: 1 }),
    true,
  );
  assert.equal(
    isAdminSessionCookie({ isLoggedIn: true, role: 'user', userId: 1 }),
    false,
  );
  assert.equal(isAdminSessionCookie({ isLoggedIn: false }), false);
});

test('login rejects inactive users and requireAdmin rechecks database', async () => {
  const { users, sessions, service } = build();
  const admin = await users.create({
    username: 'admin',
    passwordHash: 'hash:secret',
    role: 'admin',
    isActive: 1,
  });

  const loggedIn = await service.login('admin', 'secret');
  assert.equal(loggedIn?.id, admin.id);
  assert.equal(sessions.data.isLoggedIn, true);

  await users.update(admin.id, { isActive: 0 });
  await assert.rejects(() => service.requireAdmin(), (error: unknown) => {
    assert.ok(error instanceof AppError);
    assert.equal(error.code, 'WORKER_FORBIDDEN');
    return true;
  });
});

test('login fails for bad password and non-admin cannot pass requireAdmin', async () => {
  const { users, service } = build();
  await users.create({
    username: 'bob',
    passwordHash: 'hash:pw',
    role: 'user',
    isActive: 1,
  });

  assert.equal(await service.login('bob', 'wrong'), null);
  const user = await service.login('bob', 'pw');
  assert.equal(user?.role, 'user');
  await assert.rejects(() => service.requireAdmin(), AppError);
});

test('changePassword requires current password and min length', async () => {
  const { users, service } = build();
  const admin = await users.create({
    username: 'admin',
    passwordHash: 'hash:old-pass',
    role: 'admin',
    isActive: 1,
  });

  await assert.rejects(
    () => service.changePassword(admin.id, 'old-pass', 'short'),
    AppError,
  );
  await assert.rejects(
    () => service.changePassword(admin.id, 'not-old', 'long-enough'),
    (error: unknown) => {
      assert.ok(error instanceof AppError);
      assert.equal(error.details?.field, 'current');
      return true;
    },
  );

  await service.changePassword(admin.id, 'old-pass', 'long-enough');
  const updated = await users.findById(admin.id);
  assert.equal(updated?.passwordHash, 'hash:long-enough');
});

test('middleware and iron adapter source share session-config module', () => {
  const middlewareSource = readFileSync('middleware.ts', 'utf8');
  const ironSource = readFileSync(
    'lib/server/infrastructure/auth/iron-session-adapter.ts',
    'utf8',
  );
  assert.match(middlewareSource, /createSessionOptions/);
  assert.match(middlewareSource, /isAdminSessionCookie/);
  assert.match(ironSource, /createSessionOptions/);
  assert.doesNotMatch(middlewareSource, /cookieName:\s*['\"]animestream_session['\"]/);
});

test('registerWithEmail normalizes email, sets user role, and logs in', async () => {
  const { sessions, service } = build();
  const user = await service.registerWithEmail({
    email: '  Alice@Example.COM ',
    password: 'password1',
    displayName: 'Alice',
  });
  assert.equal(user.username, 'alice@example.com');
  assert.equal(user.role, 'user');
  assert.equal(user.displayName, 'Alice');
  assert.equal(sessions.data.isLoggedIn, true);
  assert.equal(sessions.data.userId, user.id);

  await assert.rejects(
    () => service.registerWithEmail({ email: 'alice@example.com', password: 'password1' }),
    (error: unknown) => {
      assert.ok(error instanceof AppError);
      assert.equal(error.code, 'RESULT_CONFLICT');
      return true;
    },
  );

  await assert.rejects(
    () => service.registerWithEmail({ email: 'not-an-email', password: 'password1' }),
    (error: unknown) => {
      assert.ok(error instanceof AppError);
      assert.equal(error.details?.field, 'email');
      return true;
    },
  );
});

test('loginPublic accepts email case-insensitively', async () => {
  const { service } = build();
  await service.registerWithEmail({
    email: 'bob@example.com',
    password: 'password1',
  });
  await service.logout();
  const user = await service.loginPublic('Bob@Example.com', 'password1');
  assert.equal(user?.username, 'bob@example.com');
  assert.equal(await service.loginPublic('bob@example.com', 'wrong'), null);
});

test('requireUser and getCurrentUser honor session', async () => {
  const { service } = build();
  await assert.rejects(() => service.requireUser(), AppError);
  assert.equal(await service.getCurrentUser(), null);

  const created = await service.registerWithEmail({
    email: 'c@example.com',
    password: 'password1',
  });
  const me = await service.requireUser();
  assert.equal(me.id, created.id);
  assert.equal((await service.getCurrentUser())?.id, created.id);
});
