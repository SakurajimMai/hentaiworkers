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

async function main() {
  // Login id is username; public site uses email-as-username — prefer a real mailbox for admin.
  const username = process.env.ADMIN_BOOTSTRAP_USER || 'admin@ixacg.top';
  const password = process.env.ADMIN_BOOTSTRAP_PASSWORD || 'admin123456';

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
