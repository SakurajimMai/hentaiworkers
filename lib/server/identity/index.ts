import { createRequire } from 'node:module';
import { FavoritesService } from './application/favorites-service';
import { IdentityService } from './application/identity-service';
import { ListsService } from './application/lists-service';
import { WatchProgressService } from './application/watch-progress-service';
import type { FavoritesRepository } from './ports/favorites-repository';
import type { ListsRepository } from './ports/lists-repository';
import type { PasswordHasher } from './ports/password-hasher';
import type { SessionPort } from './ports/session';
import type { UserRepository } from './ports/user-repository';
import type { UserEventsRepository } from './ports/user-events-repository';
import type { WatchProgressRepository } from './ports/watch-progress-repository';

const require = createRequire(import.meta.url);

let identityService: IdentityService | undefined;
let favoritesService: FavoritesService | undefined;
let listsService: ListsService | undefined;
let watchProgressService: WatchProgressService | undefined;
let overrides: {
  users?: UserRepository;
  sessions?: SessionPort;
  passwords?: PasswordHasher;
  favorites?: FavoritesRepository;
  lists?: ListsRepository;
  watchProgress?: WatchProgressRepository;
  userEvents?: UserEventsRepository;
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

function defaultWatchProgress(): WatchProgressRepository {
  const mod = require('../infrastructure/database/mariadb-watch-progress-repository') as {
    MariaDbWatchProgressRepository: new () => WatchProgressRepository;
  };
  return new mod.MariaDbWatchProgressRepository();
}

function defaultUserEvents(): UserEventsRepository {
  const mod = require('../infrastructure/database/mariadb-user-events-repository') as {
    MariaDbUserEventsRepository: new () => UserEventsRepository;
  };
  return new mod.MariaDbUserEventsRepository();
}

export function getWatchProgressService(): WatchProgressService {
  if (!watchProgressService) {
    watchProgressService = new WatchProgressService(
      overrides.watchProgress ?? defaultWatchProgress(),
      getIdentityService(),
      overrides.userEvents ?? defaultUserEvents(),
    );
  }
  return watchProgressService;
}

function defaultLists(): ListsRepository {
  const mod = require('../infrastructure/database/mariadb-lists-repository') as {
    MariaDbListsRepository: new () => ListsRepository;
  };
  return new mod.MariaDbListsRepository();
}

export function getListsService(): ListsService {
  if (!listsService) {
    listsService = new ListsService(
      overrides.lists ?? defaultLists(),
      getIdentityService(),
    );
  }
  return listsService;
}

export function setIdentityServiceForTests(service: IdentityService | undefined) {
  identityService = service;
  favoritesService = undefined;
  listsService = undefined;
  watchProgressService = undefined;
}

export function setIdentityDependenciesForTests(deps?: {
  users?: UserRepository;
  sessions?: SessionPort;
  passwords?: PasswordHasher;
  favorites?: FavoritesRepository;
  lists?: ListsRepository;
  watchProgress?: WatchProgressRepository;
  userEvents?: UserEventsRepository;
}) {
  overrides = deps ?? {};
  identityService = undefined;
  favoritesService = undefined;
  listsService = undefined;
  watchProgressService = undefined;
}

export { IdentityService } from './application/identity-service';
export { FavoritesService } from './application/favorites-service';
export { ListsService } from './application/lists-service';
export { WatchProgressService, deriveCompleted } from './application/watch-progress-service';
export {
  AuthRateLimiter,
  getAuthRateLimiter,
  setAuthRateLimiterForTests,
  authRateLimitSubject,
} from './application/auth-rate-limit';
export type { SessionData } from './session-config';
export {
  createSessionOptions,
  isAdminSessionCookie,
  isLoggedInSessionCookie,
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
} from './session-config';
