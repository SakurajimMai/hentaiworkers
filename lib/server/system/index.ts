import { createRequire } from 'node:module';
import { resolveSecretCipher } from '../crawler/interfaces/compose-mariadb-crawler';
import { getIdentityService } from '../identity';
import type { SecretCipher } from '../crawler/ports/secret-cipher';
import { SystemSettingsService } from './application/system-settings-service';
import type {
  EmailVerificationTokenRepository,
  SystemSettingsRepository,
} from './ports/system-settings-repository';

const require = createRequire(import.meta.url);

let service: SystemSettingsService | undefined;
let overrides: {
  settings?: SystemSettingsRepository;
  tokens?: EmailVerificationTokenRepository;
  cipher?: SecretCipher;
} = {};

function defaultSettingsRepo(): SystemSettingsRepository {
  const mod = require('../infrastructure/database/mariadb-system-settings-repository') as {
    MariaDbSystemSettingsRepository: new () => SystemSettingsRepository;
  };
  return new mod.MariaDbSystemSettingsRepository();
}

function defaultTokenRepo(): EmailVerificationTokenRepository {
  const mod = require('../infrastructure/database/mariadb-system-settings-repository') as {
    MariaDbEmailVerificationTokenRepository: new () => EmailVerificationTokenRepository;
  };
  return new mod.MariaDbEmailVerificationTokenRepository();
}

export function getSystemSettingsService(): SystemSettingsService {
  if (!service) {
    service = new SystemSettingsService(
      overrides.settings ?? defaultSettingsRepo(),
      overrides.tokens ?? defaultTokenRepo(),
      overrides.cipher ?? resolveSecretCipher(),
      getIdentityService(),
      { siteUrl: process.env.SITE_URL },
    );
  }
  return service;
}

export function setSystemSettingsServiceForTests(
  next: SystemSettingsService | undefined,
): void {
  service = next;
}

export function setSystemSettingsDependenciesForTests(deps?: {
  settings?: SystemSettingsRepository;
  tokens?: EmailVerificationTokenRepository;
  cipher?: SecretCipher;
}): void {
  overrides = deps ?? {};
  service = undefined;
}

export { SystemSettingsService } from './application/system-settings-service';
export {
  defaultSystemSettings,
  isEmailAllowedByWhitelist,
  toPublicAuthConfig,
  type PublicAuthConfig,
  type SystemSettings,
} from './domain/settings';
