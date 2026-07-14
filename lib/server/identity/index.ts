import { createRequire } from 'node:module';
import { IdentityService } from './application/identity-service';
import type { PasswordHasher } from './ports/password-hasher';
import type { SessionPort } from './ports/session';
import type { UserRepository } from './ports/user-repository';

const require = createRequire(import.meta.url);

let identityService: IdentityService | undefined;
let overrides: {
  users?: UserRepository;
  sessions?: SessionPort;
  passwords?: PasswordHasher;
} = {};

function defaultUsers(): UserRepository {
  const mod = require('../infrastructure/database/mariadb-user-repository') as {
    MariaDbUserRepository: new () => UserRepository;
  };
  return new mod.MariaDbUserRepository();
}

function defaultSessions(): SessionPort {
  const mod = require('../infrastructure/auth/iron-session-adapter') as {
    IronSessionAdapter: new () => SessionPort;
  };
  return new mod.IronSessionAdapter();
}

function defaultPasswords(): PasswordHasher {
  const mod = require('../infrastructure/auth/bcrypt-password-hasher') as {
    BcryptPasswordHasher: new () => PasswordHasher;
  };
  return new mod.BcryptPasswordHasher();
}

export function getIdentityService(): IdentityService {
  if (!identityService) {
    identityService = new IdentityService(
      overrides.users ?? defaultUsers(),
      overrides.sessions ?? defaultSessions(),
      overrides.passwords ?? defaultPasswords(),
    );
  }
  return identityService;
}

export function setIdentityServiceForTests(service: IdentityService | undefined) {
  identityService = service;
}

export function setIdentityDependenciesForTests(deps?: {
  users?: UserRepository;
  sessions?: SessionPort;
  passwords?: PasswordHasher;
}) {
  overrides = deps ?? {};
  identityService = undefined;
}

export { IdentityService } from './application/identity-service';
export type { SessionData } from './session-config';
export {
  createSessionOptions,
  isAdminSessionCookie,
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
} from './session-config';
