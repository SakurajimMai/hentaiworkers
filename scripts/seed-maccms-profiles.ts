/**
 * Seed crawler profiles for MacCMS JP/KR anime providers (idempotent by name).
 *
 * Usage:
 *   npx tsx scripts/seed-maccms-profiles.ts
 *   npx tsx scripts/seed-maccms-profiles.ts --force   # append new version if name exists
 *
 * Requires DATABASE_URL (same as app). Does not start jobs.
 */
import 'dotenv/config';
import { pool } from '../lib/db';
import { MACCMS_PRESETS } from '../lib/server/crawler/domain/maccms-presets';
import type { CrawlerProfileConfig } from '../lib/server/crawler/domain/config';
import { MariaDbCrawlerConfigRepository } from '../lib/server/infrastructure/database/mariadb-crawler-repositories';

function buildConfig(preset: (typeof MACCMS_PRESETS)[number]): CrawlerProfileConfig {
  const year = new Date().getUTCFullYear();
  return {
    schemaVersion: 1,
    source: {
      baseUrl: preset.baseUrl,
      provider: preset.key === 'maccms' ? undefined : preset.key,
      typeIds: preset.typeIds.length ? [...preset.typeIds] : undefined,
      playFrom: preset.playFrom,
      maxPages: 3,
      maxItems: 100,
      autoDetectTypes: preset.typeIds.length === 0,
      filterJpKr: true,
    },
    dateFilter: {
      years: [year, year - 1],
      months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    },
    qualityPriority: ['1080', '720', '480'],
    skipKeywords: [],
    concurrency: { download: 2, parse: 2 },
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
    requiredSource: preset.key,
  };
}

async function main() {
  const force = process.argv.includes('--force');
  const repo = new MariaDbCrawlerConfigRepository();
  const existing = await repo.listProfiles();
  const byName = new Map(existing.map((p) => [p.name, p]));

  const created: string[] = [];
  const skipped: string[] = [];
  const updated: string[] = [];

  for (const preset of MACCMS_PRESETS) {
    if (preset.key === 'maccms') continue; // custom-only, no default seed
    const name = `动漫 · ${preset.label}`;
    const config = buildConfig(preset);
    const found = byName.get(name);
    if (found && !force) {
      skipped.push(name);
      continue;
    }
    if (found && force) {
      await repo.updateProfile(found.id, name, config);
      updated.push(name);
      continue;
    }
    await repo.createProfile(name, config);
    created.push(name);
  }

  console.log(
    JSON.stringify(
      {
        action: 'seed-maccms-profiles',
        created,
        updated,
        skipped,
        force,
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
