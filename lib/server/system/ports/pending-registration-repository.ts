export type PendingRegistration = Readonly<{
  email: string;
  passwordHash: string;
  displayName: string | null;
  tokenHash: Uint8Array;
  expiresAt: Date;
}>;

export interface PendingRegistrationRepository {
  findByEmail(email: string): Promise<PendingRegistration | null>;
  /** Atomically replace the challenge, or return the remaining persistent send cooldown. */
  save(input: PendingRegistration): Promise<number>;
  retryAfter(email: string): Promise<number>;
  /** Create the user and delete the valid challenge in one transaction. No session is created. */
  complete(tokenHash: Uint8Array): Promise<number | null>;
}
