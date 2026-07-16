import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import { pool, withDbRetry } from '@/lib/db';
import type {
  PasswordResetRepository,
  PasswordResetTokenRecord,
} from '../../identity/ports/password-reset-repository';

function asIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (value == null) return new Date().toISOString();
  const s = String(value);
  if (s.includes('T')) return s;
  return `${s.replace(' ', 'T')}Z`;
}

function buf(value: unknown): Uint8Array {
  if (value instanceof Uint8Array) return new Uint8Array(value);
  if (Buffer.isBuffer(value)) return new Uint8Array(value);
  return new Uint8Array(Buffer.from(value as ArrayBuffer));
}

function mapRow(row: RowDataPacket): PasswordResetTokenRecord {
  return {
    id: Number(row.id),
    userId: Number(row.user_id),
    tokenHash: buf(row.token_hash),
    expiresAt: asIso(row.expires_at),
    usedAt: row.used_at == null ? null : asIso(row.used_at),
    createdAt: asIso(row.created_at),
  };
}

export class MariaDbPasswordResetRepository implements PasswordResetRepository {
  async deleteForUser(userId: number): Promise<void> {
    return withDbRetry(async () => {
      await pool.query('DELETE FROM password_reset_tokens WHERE user_id = ?', [userId]);
    });
  }

  async create(input: {
    userId: number;
    tokenHash: Uint8Array;
    expiresAt: Date;
  }): Promise<void> {
    return withDbRetry(async () => {
      const expires = input.expiresAt
        .toISOString()
        .replace('T', ' ')
        .replace(/\.\d{3}Z$/, '')
        .replace('Z', '');
      await pool.query(
        `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
         VALUES (?, ?, ?)`,
        [input.userId, Buffer.from(input.tokenHash), expires],
      );
    });
  }

  async findByTokenHash(tokenHash: Uint8Array): Promise<PasswordResetTokenRecord | null> {
    return withDbRetry(async () => {
      const [rows] = await pool.query<RowDataPacket[]>(
        'SELECT * FROM password_reset_tokens WHERE token_hash = ? LIMIT 1',
        [Buffer.from(tokenHash)],
      );
      const row = rows[0];
      return row ? mapRow(row) : null;
    });
  }

  async markUsed(id: number): Promise<void> {
    return withDbRetry(async () => {
      const [result] = await pool.query<ResultSetHeader>(
        `UPDATE password_reset_tokens
         SET used_at = UTC_TIMESTAMP()
         WHERE id = ? AND used_at IS NULL`,
        [id],
      );
      if (Number(result.affectedRows ?? 0) !== 1) {
        throw new Error('Password reset token already used or missing');
      }
    });
  }

  async consumeValidToken(
    tokenHash: Uint8Array,
    now: Date = new Date(),
  ): Promise<PasswordResetTokenRecord | null> {
    return withDbRetry(async () => {
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        const [rows] = await conn.query<RowDataPacket[]>(
          `SELECT * FROM password_reset_tokens
           WHERE token_hash = ?
           LIMIT 1
           FOR UPDATE`,
          [Buffer.from(tokenHash)],
        );
        const row = rows[0];
        if (!row) {
          await conn.rollback();
          return null;
        }
        if (row.used_at != null) {
          await conn.rollback();
          return null;
        }
        const expiresAt = new Date(asIso(row.expires_at));
        if (expiresAt.getTime() < now.getTime()) {
          await conn.rollback();
          return null;
        }

        const [result] = await conn.query<ResultSetHeader>(
          `UPDATE password_reset_tokens
           SET used_at = UTC_TIMESTAMP()
           WHERE id = ? AND used_at IS NULL`,
          [Number(row.id)],
        );
        if (Number(result.affectedRows ?? 0) !== 1) {
          await conn.rollback();
          return null;
        }

        await conn.commit();
        return {
          ...mapRow(row),
          usedAt: now.toISOString(),
        };
      } catch (error) {
        try {
          await conn.rollback();
        } catch {
          /* ignore */
        }
        throw error;
      } finally {
        conn.release();
      }
    });
  }
}
