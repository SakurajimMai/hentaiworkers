/**
 * Compatibility facade over IdentityService + iron-session adapter.
 * Prefer `@/lib/server/identity` in new code.
 */
import { getIdentityService, type SessionData } from './server/identity';
import type { UserRecord } from './server/identity/ports/user-repository';

export type { SessionData } from './server/identity';
export type User = UserRecord;
export type UserRole = UserRecord['role'];

export async function getSession(): Promise<SessionData> {
  const { IronSessionAdapter } = await import(
    './server/infrastructure/auth/iron-session-adapter'
  );
  return new IronSessionAdapter().get();
}

export async function requireAdmin(): Promise<UserRecord> {
  return getIdentityService().requireAdmin();
}

export async function loginUser(username: string, password: string) {
  return getIdentityService().login(username, password);
}

export async function loginPublicUser(emailOrUsername: string, password: string) {
  return getIdentityService().loginPublic(emailOrUsername, password);
}

export async function registerPublicUser(input: {
  email: string;
  password: string;
  displayName?: string | null;
}) {
  return getIdentityService().registerWithEmail(input);
}

export async function requireUser(): Promise<UserRecord> {
  return getIdentityService().requireUser();
}

export async function getCurrentUser(): Promise<UserRecord | null> {
  return getIdentityService().getCurrentUser();
}

export async function logoutUser() {
  return getIdentityService().logout();
}

export async function hashPassword(plain: string) {
  const { BcryptPasswordHasher } = await import(
    './server/infrastructure/auth/bcrypt-password-hasher'
  );
  return new BcryptPasswordHasher().hash(plain);
}

export async function verifyPassword(plain: string, hash: string) {
  const { BcryptPasswordHasher } = await import(
    './server/infrastructure/auth/bcrypt-password-hasher'
  );
  return new BcryptPasswordHasher().verify(plain, hash);
}
