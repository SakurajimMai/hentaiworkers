import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import { pool } from '@/lib/db';
import { AppError } from '../../shared/errors';
import { VERIFICATION_RESEND_SECONDS } from '../../identity/application/auth-rate-limit';
import type { PendingRegistration, PendingRegistrationRepository } from '../../system/ports/pending-registration-repository';

function date(value: string | Date): Date {
  return value instanceof Date ? value : new Date(`${value.replace(' ', 'T')}Z`);
}

export class MariaDbPendingRegistrationRepository implements PendingRegistrationRepository {
  async findByEmail(email: string): Promise<PendingRegistration | null> {
    const [rows] = await pool.query<RowDataPacket[]>('SELECT * FROM pending_registrations WHERE email = ?', [email]);
    const row = rows[0];
    return row ? {
      email: row.email, passwordHash: row.password_hash, displayName: row.display_name,
      tokenHash: new Uint8Array(row.token_hash), expiresAt: date(row.expires_at),
    } : null;
  }

  async retryAfter(email: string): Promise<number> {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT GREATEST(0, CEIL(? - TIMESTAMPDIFF(MICROSECOND, sent_at, UTC_TIMESTAMP(3)) / 1000000)) AS remaining
       FROM pending_registrations WHERE email = ?`, [VERIFICATION_RESEND_SECONDS, email],
    );
    return Number(rows[0]?.remaining ?? 0);
  }

  async save(input: PendingRegistration): Promise<number> {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      // Reserve the email key before locking, including concurrent first sends.
      await conn.query(
        `INSERT INTO pending_registrations (email, password_hash, display_name, token_hash, expires_at)
         VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE email = VALUES(email)`,
        [input.email, input.passwordHash, input.displayName, Buffer.from(input.tokenHash), input.expiresAt],
      );
      const [rows] = await conn.query<RowDataPacket[]>(
        `SELECT GREATEST(0, CEIL(? - TIMESTAMPDIFF(MICROSECOND, sent_at, UTC_TIMESTAMP(3)) / 1000000)) AS remaining
         FROM pending_registrations WHERE email = ? FOR UPDATE`, [VERIFICATION_RESEND_SECONDS, input.email],
      );
      const remaining = Number(rows[0]?.remaining ?? 0);
      if (remaining > 0) {
        await conn.rollback();
        return remaining;
      }
      await conn.query(
        `UPDATE pending_registrations SET password_hash = ?, display_name = ?, token_hash = ?, expires_at = ?, sent_at = UTC_TIMESTAMP(3)
         WHERE email = ?`, [input.passwordHash, input.displayName, Buffer.from(input.tokenHash), input.expiresAt, input.email],
      );
      await conn.commit();
      return 0;
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
  }

  async complete(tokenHash: Uint8Array): Promise<number | null> {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [rows] = await conn.query<RowDataPacket[]>(
        'SELECT * FROM pending_registrations WHERE token_hash = ? AND expires_at > UTC_TIMESTAMP() FOR UPDATE',
        [Buffer.from(tokenHash)],
      );
      const row = rows[0];
      if (!row) {
        await conn.rollback();
        return null;
      }
      const [created] = await conn.query<ResultSetHeader>(
        `INSERT INTO users (username, password_hash, display_name, role, is_active) VALUES (?, ?, ?, 'user', 1)`,
        [row.email, row.password_hash, row.display_name],
      );
      await conn.query('DELETE FROM pending_registrations WHERE email = ?', [row.email]);
      await conn.commit();
      return created.insertId;
    } catch (error) {
      await conn.rollback();
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ER_DUP_ENTRY') {
        throw new AppError('RESULT_CONFLICT', '该邮箱已注册，请登录', 409);
      }
      throw error;
    } finally {
      conn.release();
    }
  }
}
