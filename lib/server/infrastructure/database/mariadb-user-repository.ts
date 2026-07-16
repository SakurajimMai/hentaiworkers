import { desc, eq, sql } from 'drizzle-orm';
import { db, withDbRetry } from '@/lib/db';
import { users } from '@/lib/schema';
import type {
  CreateUserInput,
  UpdateUserInput,
  UserRecord,
  UserRepository,
} from '../../identity/ports/user-repository';

function mapUser(row: typeof users.$inferSelect): UserRecord {
  return {
    id: row.id,
    username: row.username,
    passwordHash: row.passwordHash,
    role: row.role,
    displayName: row.displayName,
    isActive: row.isActive,
    sessionVersion: Number(row.sessionVersion ?? 1),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class MariaDbUserRepository implements UserRepository {
  findById(id: number): Promise<UserRecord | null> {
    return withDbRetry(async () => {
      const [row] = await db.select().from(users).where(eq(users.id, id)).limit(1);
      return row ? mapUser(row) : null;
    });
  }

  findByUsername(username: string): Promise<UserRecord | null> {
    return withDbRetry(async () => {
      const [row] = await db.select().from(users).where(eq(users.username, username)).limit(1);
      return row ? mapUser(row) : null;
    });
  }

  create(input: CreateUserInput): Promise<UserRecord> {
    return withDbRetry(async () => {
      await db.insert(users).values({
        username: input.username,
        passwordHash: input.passwordHash,
        role: input.role,
        displayName: input.displayName ?? null,
        isActive: input.isActive ?? 1,
      });
      const created = await this.findByUsername(input.username);
      if (!created) throw new Error('Failed to create user');
      return created;
    });
  }

  update(id: number, input: UpdateUserInput): Promise<void> {
    return withDbRetry(async () => {
      const patch: Partial<typeof users.$inferInsert> = {};
      if (input.role !== undefined) patch.role = input.role;
      if (input.displayName !== undefined) patch.displayName = input.displayName;
      if (input.isActive !== undefined) patch.isActive = input.isActive;
      if (input.passwordHash !== undefined) patch.passwordHash = input.passwordHash;
      if (Object.keys(patch).length === 0 && !input.bumpSessionVersion) return;

      if (input.bumpSessionVersion) {
        // Atomic bump so concurrent password changes cannot reuse the same epoch.
        await db
          .update(users)
          .set({
            ...patch,
            sessionVersion: sql`${users.sessionVersion} + 1`,
          })
          .where(eq(users.id, id));
        return;
      }

      await db.update(users).set(patch).where(eq(users.id, id));
    });
  }

  list(): Promise<ReadonlyArray<UserRecord>> {
    return withDbRetry(async () => {
      const rows = await db.select().from(users).orderBy(desc(users.id));
      return rows.map(mapUser);
    });
  }
}
