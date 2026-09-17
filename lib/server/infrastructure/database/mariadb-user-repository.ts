import { desc, eq, sql } from 'drizzle-orm';
import type { RowDataPacket } from 'mysql2';
import { db, pool, withDbRetry } from '@/lib/db';
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

      await db.transaction(async (tx) => {
        await tx.update(users).set({
          ...patch,
          ...(input.bumpSessionVersion ? { sessionVersion: sql`${users.sessionVersion} + 1` } : {}),
        }).where(eq(users.id, id));
        // A pending registration cannot later undo an administrator's role/status decision.
        if (input.role !== undefined || input.isActive !== undefined) {
          await tx.execute(sql`DELETE FROM email_verification_tokens WHERE user_id = ${id}`);
        }
      });
    });
  }

  async deleteRegularUser(id: number): Promise<boolean> {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const [rows] = await connection.query<RowDataPacket[]>(
        'SELECT id FROM users WHERE id = ? AND role = ? FOR UPDATE', [id, 'user'],
      );
      if (!rows.length) {
        await connection.rollback();
        return false;
      }
      await connection.query(
        'DELETE items FROM user_list_items items INNER JOIN user_lists lists ON lists.id = items.list_id WHERE lists.user_id = ?', [id],
      );
      // Fixed application-owned tables; never accept table names from a request.
      for (const table of [
        'user_lists', 'user_favorites', 'user_watch_progress', 'user_events',
        'manga_favorites', 'manga_reading_progress', 'email_verification_tokens', 'password_reset_tokens',
      ]) {
        await connection.query(`DELETE FROM ${table} WHERE user_id = ?`, [id]);
      }
      await connection.query('DELETE FROM users WHERE id = ?', [id]);
      await connection.commit();
      return true;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  list(): Promise<ReadonlyArray<UserRecord>> {
    return withDbRetry(async () => {
      const rows = await db.select().from(users).orderBy(desc(users.id));
      return rows.map(mapUser);
    });
  }
}
