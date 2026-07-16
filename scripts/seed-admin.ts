import 'dotenv/config';
import { eq, sql } from 'drizzle-orm';
import { db, pool } from '../lib/db';
import { users } from '../lib/schema';
import { hashPassword } from '../lib/auth';

async function ensureUsersTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      username VARCHAR(64) NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      role ENUM('user','admin') NOT NULL DEFAULT 'user',
      display_name VARCHAR(128) NULL,
      is_active TINYINT NOT NULL DEFAULT 1,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY users_username_uidx (username)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
}

function requiredBootstrapValue(name: 'ADMIN_BOOTSTRAP_USER' | 'ADMIN_BOOTSTRAP_PASSWORD'): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required; no bootstrap credential defaults are provided`);
  }
  return value;
}

async function main() {
  await ensureUsersTable();

  const [countRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(users)
    .where(eq(users.role, 'admin'));

  if (Number(countRow.count) > 0) {
    console.log('Admin user(s) already exist, skip bootstrap.');
    await pool.end();
    return;
  }

  const username = requiredBootstrapValue('ADMIN_BOOTSTRAP_USER');
  const password = requiredBootstrapValue('ADMIN_BOOTSTRAP_PASSWORD');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(username)) {
    throw new Error('ADMIN_BOOTSTRAP_USER must be a valid email address');
  }
  if (password.length < 12) {
    throw new Error('ADMIN_BOOTSTRAP_PASSWORD must contain at least 12 characters');
  }
  if (/change-?me|replace-?with|admin123|password|example/i.test(password)) {
    throw new Error('ADMIN_BOOTSTRAP_PASSWORD must not be a placeholder or common password');
  }

  const passwordHash = await hashPassword(password);
  await db.insert(users).values({
    username,
    passwordHash,
    role: 'admin',
    displayName: 'Administrator',
    isActive: 1,
  });

  console.log(`Created admin user: ${username}`);
  await pool.end();
}

main().catch(async (e) => {
  console.error(e);
  try {
    await pool.end();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
