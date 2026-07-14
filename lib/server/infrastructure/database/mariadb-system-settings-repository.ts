import type { RowDataPacket } from 'mysql2';
import { pool, withDbRetry } from '@/lib/db';
import {
  parseSystemSettings,
  SYSTEM_SETTINGS_KEY,
  type SystemSettings,
} from '../../system/domain/settings';
import type {
  EmailVerificationTokenRecord,
  EmailVerificationTokenRepository,
  SystemSettingsRepository,
} from '../../system/ports/system-settings-repository';

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

export class MariaDbSystemSettingsRepository implements SystemSettingsRepository {
  async get(): Promise<SystemSettings | null> {
    return withDbRetry(async () => {
      const [rows] = await pool.query<RowDataPacket[]>(
        'SELECT value_json FROM system_settings WHERE setting_key = ? LIMIT 1',
        [SYSTEM_SETTINGS_KEY],
      );
      const row = rows[0];
      if (!row) return null;
      const raw = row.value_json;
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      return parseSystemSettings(parsed);
    });
  }

  async save(settings: SystemSettings): Promise<void> {
    return withDbRetry(async () => {
      const json = JSON.stringify(settings);
      await pool.query(
        `INSERT INTO system_settings (setting_key, value_json)
         VALUES (?, CAST(? AS JSON))
         ON DUPLICATE KEY UPDATE value_json = CAST(? AS JSON)`,
        [SYSTEM_SETTINGS_KEY, json, json],
      );
    });
  }
}

export class MariaDbEmailVerificationTokenRepository
  implements EmailVerificationTokenRepository
{
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
        `INSERT INTO email_verification_tokens (user_id, token_hash, expires_at)
         VALUES (?, ?, ?)`,
        [input.userId, Buffer.from(input.tokenHash), expires],
      );
    });
  }

  async findByTokenHash(
    tokenHash: Uint8Array,
  ): Promise<EmailVerificationTokenRecord | null> {
    return withDbRetry(async () => {
      const [rows] = await pool.query<RowDataPacket[]>(
        'SELECT * FROM email_verification_tokens WHERE token_hash = ? LIMIT 1',
        [Buffer.from(tokenHash)],
      );
      const row = rows[0];
      if (!row) return null;
      return {
        id: Number(row.id),
        userId: Number(row.user_id),
        tokenHash: buf(row.token_hash),
        expiresAt: asIso(row.expires_at),
        usedAt: row.used_at == null ? null : asIso(row.used_at),
        createdAt: asIso(row.created_at),
      };
    });
  }

  async markUsed(id: number): Promise<void> {
    return withDbRetry(async () => {
      await pool.query(
        'UPDATE email_verification_tokens SET used_at = UTC_TIMESTAMP() WHERE id = ?',
        [id],
      );
    });
  }

  async deleteForUser(userId: number): Promise<void> {
    return withDbRetry(async () => {
      await pool.query('DELETE FROM email_verification_tokens WHERE user_id = ?', [
        userId,
      ]);
    });
  }
}
