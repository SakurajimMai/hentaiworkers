import { createRequire } from 'node:module';
import {
  AesGcmSecretCipher,
  keyringViewFromRecord,
} from '../infrastructure/crypto/aes-gcm-secret-cipher';
import { container } from '../composition/container';
import { getIdentityService } from '../identity';
import type { SecretCipher } from '../shared/secret-cipher';
import type { PasswordResetRepository } from '../identity/ports/password-reset-repository';
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
  passwordResets?: PasswordResetRepository;
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

function defaultPasswordResets(): PasswordResetRepository {
  const mod = require('../infrastructure/database/mariadb-password-reset-repository') as {
    MariaDbPasswordResetRepository: new () => PasswordResetRepository;
  };
  return new mod.MariaDbPasswordResetRepository();
}

function defaultSecretCipher(): SecretCipher {
  const { encryption } = container.getConfig();
  return new AesGcmSecretCipher(
    keyringViewFromRecord(encryption.currentKeyId, encryption.keys),
  );
}

export function getSystemSettingsService(): SystemSettingsService {
  if (!service) {
    service = new SystemSettingsService(
      overrides.settings ?? defaultSettingsRepo(),
      overrides.tokens ?? defaultTokenRepo(),
      overrides.cipher ?? defaultSecretCipher(),
      getIdentityService(),
      {
        siteUrl: process.env.SITE_URL,
        passwordResets: overrides.passwordResets ?? defaultPasswordResets(),
      },
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
  passwordResets?: PasswordResetRepository;
}): void {
  overrides = deps ?? {};
  service = undefined;
}

export { SystemSettingsService } from './application/system-settings-service';
export {
  defaultSystemSettings,
  isEmailAllowedByWhitelist,
  toPublicAdsConfig,
  toPublicAuthConfig,
  toPublicPlayerConfig,
  type PlayerSettings,
  type PublicAdsConfig,
  type PublicAuthConfig,
  type PublicPlayerConfig,
  type SystemSettings,
} from './domain/settings';
