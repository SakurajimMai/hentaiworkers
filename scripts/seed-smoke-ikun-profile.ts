/**
 * Create / update a tiny iKun smoke profile and enqueue one job.
 */
import 'dotenv/config';
import type { CrawlerProfileConfig } from '../lib/server/crawler/domain/config';
import { MACCMS_PRESETS } from '../lib/server/crawler/domain/maccms-presets';
import { AdminCrawlerService } from '../lib/server/crawler/application/admin-crawler-service';
import { createMariaDbAdminDeps } from '../lib/server/crawler/interfaces/compose-mariadb-crawler';
import { MariaDbCrawlerConfigRepository } from '../lib/server/infrastructure/database/mariadb-crawler-repositories';
import { pool } from '../lib/db';

async function main() {
  const service = new AdminCrawlerService(createMariaDbAdminDeps());
  const preset = MACCMS_PRESETS.find((p) => p.key === 'ikun');
  if (!preset) throw new Error('ikun preset missing');
  const year = new Date().getUTCFullYear();
  const name = 'SMOKE · iKun 小批量';
  const config: CrawlerProfileConfig = {
    schemaVersion: 1,
    source: {
      baseUrl: preset.baseUrl,
      provider: 'ikun',
      typeIds: [...preset.typeIds],
      playFrom: preset.playFrom,
      maxPages: 1,
      maxItems: 8,
      hours: 720,
      autoDetectTypes: false,
      filterJpKr: true,
    },
    dateFilter: {
      years: [year, year - 1],
      months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    },
    qualityPriority: ['1080', '720', '480'],
    skipKeywords: [],
    concurrency: { download: 1, parse: 1 },
    continueOnError: true,
    maxActiveJobs: 1,
    skipExisting: true,
    requestDelaySeconds: 1,
    media: {
      enableVideo: true,
      enableCover: true,
      enableFanart: true,
      maxFanartImages: 50,
    },
    requiredSource: 'ikun',
  };

  const profiles = await service.listProfiles();
  const existing = profiles.find((p) => p.name === name);
  let versionId: number;
  if (existing) {
    const repo = new MariaDbCrawlerConfigRepository();
    const v = await repo.updateProfile(existing.id, name, config);
    versionId = v.id;
  } else {
    const v = await service.createProfileFromParsed(name, config);
    versionId = v.id;
  }
  const job = await service.startProfileJob(versionId);
  console.log(
    JSON.stringify(
      {
        action: 'seed-smoke-ikun-profile',
        profileName: name,
        versionId,
        jobId: job.id,
        status: job.status,
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
