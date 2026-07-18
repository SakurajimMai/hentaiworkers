import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import { config as loadEnv } from 'dotenv';
import mysql from 'mysql2/promise';
import { buildDatabaseConnectionSettings } from './lib/migration-connection.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function requiredValue(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required; no bootstrap credential defaults are provided`);
  return value;
}

function validateCredentials(username, password) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(username)) {
    throw new Error('ADMIN_BOOTSTRAP_USER must be a valid email address');
  }
  if (password.length < 12) {
    throw new Error('ADMIN_BOOTSTRAP_PASSWORD must contain at least 12 characters');
  }
  if (/change-?me|replace-?with|admin123|password|example/i.test(password)) {
    throw new Error('ADMIN_BOOTSTRAP_PASSWORD must not be a placeholder or common password');
  }
}

async function main() {
  loadEnv({ path: resolve(root, '.env'), quiet: true });
  const settings = buildDatabaseConnectionSettings(process.env, root);
  const connection = await mysql.createConnection(settings.connectionOptions);
  try {
    const [tables] = await connection.query(
      `SELECT 1 FROM information_schema.tables
       WHERE table_schema = DATABASE() AND table_name = 'users' LIMIT 1`,
    );
    if (tables.length === 0) {
      throw new Error('users table is missing; run the ops setup/migrate command first');
    }

    const [admins] = await connection.query(
      "SELECT id FROM users WHERE role = 'admin' LIMIT 1",
    );
    if (admins.length > 0) {
      console.log(JSON.stringify({ action: 'already_present', role: 'admin' }));
      return;
    }

    const username = requiredValue('ADMIN_BOOTSTRAP_USER');
    const password = requiredValue('ADMIN_BOOTSTRAP_PASSWORD');
    validateCredentials(username, password);
    const passwordHash = await bcrypt.hash(password, 10);

    await connection.query(
      `INSERT INTO users
       (username, password_hash, role, display_name, is_active)
       VALUES (?, ?, 'admin', 'Administrator', 1)`,
      [username, passwordHash],
    );
    console.log(JSON.stringify({ action: 'created', username }));
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
