import { createRequire } from 'node:module';
import { FavoritesService } from './application/favorites-service';
import { IdentityService } from './application/identity-service';
import type { FavoritesRepository } from './ports/favorites-repository';
import type { PasswordHasher } from './ports/password-hasher';
import type { SessionPort } from './ports/session';
import type { UserRepository } from './ports/user-repository';

const require = createRequire(import.meta.url);

let identityService: IdentityService | undefined;
let favoritesService: FavoritesService | undefined;
let overrides: {
  users?: UserRepository;
  sessions?: SessionPort;
  passwords?: PasswordHasher;
  favorites?: FavoritesRepository;
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

function defaultFavorites(): FavoritesRepository {
  const mod = require('../infrastructure/database/mariadb-favorites-repository') as {
    MariaDbFavoritesRepository: new () => FavoritesRepository;
  };
  return new mod.MariaDbFavoritesRepository();
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

export function getFavoritesService(): FavoritesService {
  if (!favoritesService) {
    favoritesService = new FavoritesService(
      overrides.favorites ?? defaultFavorites(),
      getIdentityService(),
    );
  }
  return favoritesService;
}

export function setIdentityServiceForTests(service: IdentityService | undefined) {
  identityService = service;
  favoritesService = undefined;
}

export function setIdentityDependenciesForTests(deps?: {
  users?: UserRepository;
  sessions?: SessionPort;
  passwords?: PasswordHasher;
  favorites?: FavoritesRepository;
}) {
  overrides = deps ?? {};
  identityService = undefined;
  favoritesService = undefined;
}

export { IdentityService } from './application/identity-service';
export { FavoritesService } from './application/favorites-service';
export type { SessionData } from './session-config';
export {
  createSessionOptions,
  isAdminSessionCookie,
  isLoggedInSessionCookie,
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
} from './session-config';
