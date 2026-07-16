/**
 * Enqueue a crawl job for a profile (by id, name substring, or requiredSource).
 *
 * Usage:
 *   npx tsx scripts/enqueue-crawler-job.ts --source ikun
 *   npx tsx scripts/enqueue-crawler-job.ts --profile 2
 *   npx tsx scripts/enqueue-crawler-job.ts --name iKun
 */
import 'dotenv/config';
import { createMariaDbAdminDeps } from '../lib/server/crawler/interfaces/compose-mariadb-crawler';
import { AdminCrawlerService } from '../lib/server/crawler/application/admin-crawler-service';
import { pool } from '../lib/db';

function parseArgs(argv: string[]) {
  let profileId: number | null = null;
  let source: string | null = null;
  let name: string | null = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--profile' && argv[i + 1]) profileId = parseInt(argv[++i], 10);
    else if (a.startsWith('--profile=')) profileId = parseInt(a.slice(10), 10);
    else if (a === '--source' && argv[i + 1]) source = argv[++i];
    else if (a.startsWith('--source=')) source = a.slice(9);
    else if (a === '--name' && argv[i + 1]) name = argv[++i];
    else if (a.startsWith('--name=')) name = a.slice(7);
  }
  return { profileId, source, name };
}

async function main() {
  const { profileId, source, name } = parseArgs(process.argv.slice(2));
  if (profileId == null && !source && !name) {
    throw new Error('Pass --profile <id>, --source <requiredSource>, or --name <substring>');
  }

  const service = new AdminCrawlerService(createMariaDbAdminDeps());
  const profiles = await service.listProfiles();
  const enabled = profiles.filter((p) => p.isEnabled && p.currentVersionId != null);

  let match = enabled.find((p) => profileId != null && p.id === profileId) ?? null;
  if (!match && (source || name)) {
    for (const p of enabled) {
      const version = await service.getProfileVersion(p.currentVersionId!);
      const req = version?.config?.requiredSource;
      const n = p.name;
      if (source && req === source) {
        match = p;
        break;
      }
      if (name && n.toLowerCase().includes(name.toLowerCase())) {
        match = p;
        break;
      }
    }
  }

  if (!match?.currentVersionId) {
    throw new Error(
      `No matching enabled profile. Available: ${enabled.map((p) => `#${p.id} ${p.name}`).join('; ')}`,
    );
  }

  const job = await service.startProfileJob(match.currentVersionId);
  const version = await service.getProfileVersion(match.currentVersionId);
  console.log(
    JSON.stringify(
      {
        action: 'enqueue-crawler-job',
        jobId: job.id,
        status: job.status,
        profileId: match.id,
        profileName: match.name,
        requiredSource: version?.config?.requiredSource,
        detailPath: `/admin/crawler/jobs/${job.id}`,
      },
      null,
      2,
    ),
  );
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
