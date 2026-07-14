import type { SystemSettings } from '../domain/settings';

export type EmailVerificationTokenRecord = Readonly<{
  id: number;
  userId: number;
  tokenHash: Uint8Array;
  expiresAt: string;
  usedAt: string | null;
  createdAt: string;
}>;

export interface SystemSettingsRepository {
  get(): Promise<SystemSettings | null>;
  save(settings: SystemSettings): Promise<void>;
}

export interface EmailVerificationTokenRepository {
  create(input: {
    userId: number;
    tokenHash: Uint8Array;
    expiresAt: Date;
  }): Promise<void>;
  findByTokenHash(tokenHash: Uint8Array): Promise<EmailVerificationTokenRecord | null>;
  markUsed(id: number): Promise<void>;
  deleteForUser(userId: number): Promise<void>;
}
