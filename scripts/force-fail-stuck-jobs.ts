/**
 * Ops helper: force-fail crawler jobs stuck in running/leased/retry_wait.
 * Prefer `npm run worker:reap` first; use this only when a worker is dead.
 *
 * Usage:
 *   npx tsx scripts/force-fail-stuck-jobs.ts
 *   npx tsx scripts/force-fail-stuck-jobs.ts --ids 4,5
 */
import 'dotenv/config';
import mysql from 'mysql2/promise';

function parseIds(argv: string[]): number[] | null {
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--ids' && argv[i + 1]) {
      return argv[++i]
        .split(',')
        .map((s) => parseInt(s.trim(), 10))
        .filter((n) => Number.isInteger(n) && n > 0);
    }
    if (a.startsWith('--ids=')) {
      return a
        .slice(6)
        .split(',')
        .map((s) => parseInt(s.trim(), 10))
        .filter((n) => Number.isInteger(n) && n > 0);
    }
  }
  return null;
}

async function main() {
  const u = process.env.DATABASE_URL;
  if (!u) throw new Error('DATABASE_URL required');
  const url = new URL(u.replace(/^mysql:\/\//, 'http://'));
  const conn = await mysql.createConnection({
    host: url.hostname,
    port: Number(url.port || 3306),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.replace(/^\//, ''),
    ssl:
      process.env.DATABASE_TLS_MODE === 'disabled'
        ? undefined
        : { rejectUnauthorized: false },
  });

  const ids = parseIds(process.argv.slice(2));
  let jobsResult;
  if (ids?.length) {
    const [r] = await conn.query(
      `UPDATE crawler_jobs
       SET status = 'failed',
           lease_worker_id = NULL,
           lease_expires_at = NULL,
           finished_at = UTC_TIMESTAMP(),
           updated_at = UTC_TIMESTAMP()
       WHERE id IN (?) AND status IN ('running','leased','retry_wait','queued')`,
      [ids],
    );
    jobsResult = r;
  } else {
    const [r] = await conn.query(
      `UPDATE crawler_jobs
       SET status = 'failed',
           lease_worker_id = NULL,
           lease_expires_at = NULL,
           finished_at = UTC_TIMESTAMP(),
           updated_at = UTC_TIMESTAMP()
       WHERE status IN ('running','leased','retry_wait')`,
    );
    jobsResult = r;
  }
  const [attempts] = await conn.query(
    `UPDATE crawler_job_attempts
     SET result_status = 'failed',
         finished_at = COALESCE(finished_at, UTC_TIMESTAMP())
     WHERE finished_at IS NULL`,
  );
  const [jobs] = await conn.query(
    'SELECT id, status, attempt_count FROM crawler_jobs ORDER BY id DESC LIMIT 20',
  );
  console.log(
    JSON.stringify(
      {
        action: 'force-fail-stuck-jobs',
        jobsAffected: (jobsResult as { affectedRows?: number }).affectedRows ?? null,
        attemptsClosed: (attempts as { affectedRows?: number }).affectedRows ?? null,
        recent: jobs,
      },
      null,
      2,
    ),
  );
  await conn.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
