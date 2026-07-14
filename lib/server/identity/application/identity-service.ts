import { AppError } from '../../shared/errors';
import type { PasswordHasher } from '../ports/password-hasher';
import type { SessionPort } from '../ports/session';
import type {
  CreateUserInput,
  UpdateUserInput,
  UserRecord,
  UserRepository,
  UserRole,
} from '../ports/user-repository';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  return email.length <= 64 && EMAIL_RE.test(email);
}

export class IdentityService {
  constructor(
    private readonly users: UserRepository,
    private readonly sessions: SessionPort,
    private readonly passwords: PasswordHasher,
  ) {}

  async login(username: string, password: string): Promise<UserRecord | null> {
    const user = await this.users.findByUsername(username.trim());
    if (!user || !user.isActive) return null;
    const ok = await this.passwords.verify(password, user.passwordHash);
    if (!ok) return null;

    await this.sessions.save({
      userId: user.id,
      username: user.username,
      role: user.role,
      isLoggedIn: true,
    });
    return user;
  }

  async logout(): Promise<void> {
    await this.sessions.destroy();
  }

  async requireAdmin(): Promise<UserRecord> {
    const session = await this.sessions.get();
    if (!session.isLoggedIn || !session.userId || session.role !== 'admin') {
      throw new AppError('WORKER_FORBIDDEN', '未授权', 401);
    }
    const user = await this.users.findById(session.userId);
    if (!user || !user.isActive || user.role !== 'admin') {
      throw new AppError('WORKER_FORBIDDEN', '未授权', 401);
    }
    return user;
  }

  async changePassword(userId: number, current: string, next: string): Promise<void> {
    if (next.length < 8) {
      throw new AppError('RESULT_INVALID', '新密码至少 8 位', 400, false, { field: 'next' });
    }
    const user = await this.users.findById(userId);
    if (!user) {
      throw new AppError('WORKER_FORBIDDEN', '未授权', 401);
    }
    const ok = await this.passwords.verify(current, user.passwordHash);
    if (!ok) {
      throw new AppError('RESULT_INVALID', '当前密码不正确', 400, false, { field: 'current' });
    }
    await this.users.update(userId, {
      passwordHash: await this.passwords.hash(next),
    });
  }

  async createUser(input: {
    username: string;
    password: string;
    role: UserRole;
    displayName?: string | null;
    isActive?: number;
  }): Promise<UserRecord> {
    const username = input.username.trim();
    if (!username || input.password.length < 8) {
      throw new AppError('RESULT_INVALID', '用户名与至少 8 位密码必填', 400);
    }
    const existing = await this.users.findByUsername(username);
    if (existing) {
      throw new AppError('RESULT_CONFLICT', '用户名已存在', 409);
    }
    const create: CreateUserInput = {
      username,
      passwordHash: await this.passwords.hash(input.password),
      role: input.role,
      displayName: input.displayName ?? null,
      isActive: input.isActive ?? 1,
    };
    return this.users.create(create);
  }

  async updateUser(id: number, input: {
    role?: UserRole;
    displayName?: string | null;
    isActive?: number;
    password?: string;
  }): Promise<void> {
    let passwordHash: string | undefined;
    if (input.password !== undefined && input.password !== '') {
      if (input.password.length < 8) {
        throw new AppError('RESULT_INVALID', '密码至少 8 位', 400);
      }
      passwordHash = await this.passwords.hash(input.password);
    }
    const patch: UpdateUserInput = {
      role: input.role,
      displayName: input.displayName,
      isActive: input.isActive,
      ...(passwordHash !== undefined ? { passwordHash } : {}),
    };
    await this.users.update(id, patch);
  }

  /**
   * Public site registration: email is stored as username (unique login id).
   * Role is always `user` — cannot self-elevate to admin.
   */
  async registerWithEmail(input: {
    email: string;
    password: string;
    displayName?: string | null;
  }): Promise<UserRecord> {
    const email = normalizeEmail(input.email);
    if (!isValidEmail(email)) {
      throw new AppError('RESULT_INVALID', '请输入有效邮箱', 400, false, { field: 'email' });
    }
    if (input.password.length < 8) {
      throw new AppError('RESULT_INVALID', '密码至少 8 位', 400, false, { field: 'password' });
    }
    const existing = await this.users.findByUsername(email);
    if (existing) {
      throw new AppError('RESULT_CONFLICT', '该邮箱已注册', 409, false, { field: 'email' });
    }
    const user = await this.users.create({
      username: email,
      passwordHash: await this.passwords.hash(input.password),
      role: 'user',
      displayName: input.displayName?.trim() || email.split('@')[0] || null,
      isActive: 1,
    });
    await this.sessions.save({
      userId: user.id,
      username: user.username,
      role: user.role,
      isLoggedIn: true,
    });
    return user;
  }

  /** Public login: email or username + password. */
  async loginPublic(emailOrUsername: string, password: string): Promise<UserRecord | null> {
    const key = emailOrUsername.trim().toLowerCase().includes('@')
      ? normalizeEmail(emailOrUsername)
      : emailOrUsername.trim();
    const user = await this.login(key, password);
    return user;
  }

  async requireUser(): Promise<UserRecord> {
    const session = await this.sessions.get();
    if (!session.isLoggedIn || !session.userId) {
      throw new AppError('WORKER_FORBIDDEN', '请先登录', 401);
    }
    const user = await this.users.findById(session.userId);
    if (!user || !user.isActive) {
      throw new AppError('WORKER_FORBIDDEN', '请先登录', 401);
    }
    return user;
  }

  async getCurrentUser(): Promise<UserRecord | null> {
    const session = await this.sessions.get();
    if (!session.isLoggedIn || !session.userId) return null;
    const user = await this.users.findById(session.userId);
    if (!user || !user.isActive) return null;
    return user;
  }

  listUsers(): Promise<ReadonlyArray<UserRecord>> {
    return this.users.list();
  }

  async getSessionInfo() {
    const s = await this.sessions.get();
    return {
      isLoggedIn: !!s.isLoggedIn,
      username: s.username,
      role: s.role,
    };
  }
}
