export type PasswordResetTokenRecord = Readonly<{
  id: number;
  userId: number;
  tokenHash: Uint8Array;
  expiresAt: string;
  usedAt: string | null;
  createdAt: string;
}>;

export interface PasswordResetRepository {
  deleteForUser(userId: number): Promise<void>;
  create(input: {
    userId: number;
    tokenHash: Uint8Array;
    expiresAt: Date;
  }): Promise<void>;
  findByTokenHash(tokenHash: Uint8Array): Promise<PasswordResetTokenRecord | null>;
  markUsed(id: number): Promise<void>;
  /**
   * Atomically load + mark a still-valid unused token.
   * Returns null when missing, already used, or expired.
   */
  consumeValidToken(tokenHash: Uint8Array, now?: Date): Promise<PasswordResetTokenRecord | null>;
}
