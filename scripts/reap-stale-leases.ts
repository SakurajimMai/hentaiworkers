/**
 * Expire stale crawler job leases (requeue / fail per policy).
 *
 * Usage: npx tsx scripts/reap-stale-leases.ts
 */
import 'dotenv/config';
import { CrawlerJobService } from '../lib/server/crawler/application/crawler-job-service';
import { createMariaDbAdminDeps } from '../lib/server/crawler/interfaces/compose-mariadb-crawler';
import { pool } from '../lib/db';

async function main() {
  const deps = createMariaDbAdminDeps();
  const jobs = new CrawlerJobService(deps.uow);
  const expired = await jobs.expireStaleLeases(new Date());
  console.log(JSON.stringify({ action: 'reap-stale-leases', expired }, null, 2));
  await pool.end();
}

main().catch(async (error) => {
  console.error(error);
  try {
    await pool.end();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
