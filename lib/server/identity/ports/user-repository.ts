export type UserRole = 'user' | 'admin';

export type UserRecord = Readonly<{
  id: number;
  username: string;
  passwordHash: string;
  role: UserRole;
  displayName: string | null;
  isActive: number;
  /** Cookie session epoch; mismatch invalidates old sessions. */
  sessionVersion: number;
  createdAt?: unknown;
  updatedAt?: unknown;
}>;

export type CreateUserInput = Readonly<{
  username: string;
  passwordHash: string;
  role: UserRole;
  displayName?: string | null;
  isActive?: number;
}>;

export type UpdateUserInput = Readonly<{
  role?: UserRole;
  displayName?: string | null;
  isActive?: number;
  passwordHash?: string;
  /** When true, session_version is incremented (password change / reset). */
  bumpSessionVersion?: boolean;
}>;

export interface UserRepository {
  findById(id: number): Promise<UserRecord | null>;
  findByUsername(username: string): Promise<UserRecord | null>;
  create(input: CreateUserInput): Promise<UserRecord>;
  update(id: number, input: UpdateUserInput): Promise<void>;
  list(): Promise<ReadonlyArray<UserRecord>>;
}
