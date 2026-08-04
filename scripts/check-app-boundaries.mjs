import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import { parse } from 'yaml';

const root = resolve(import.meta.dirname, '..');
const failures = [];

// Top-level `crawler/` may exist as an independent scripts folder (not part of the app).
// Still forbid crawler control-plane / worker integration inside the Next.js app.
const forbiddenPaths = [
  'crawler_worker',
  'app/admin/crawler',
  'app/api/admin/crawler',
  'app/api/internal/crawler',
  'components/admin/crawler',
  'lib/server/crawler',
  'lib/server/infrastructure/database/mariadb-crawler-catalog-ingestion.ts',
  'lib/server/infrastructure/database/mariadb-crawler-repositories.ts',
  'lib/server/infrastructure/database/schema/crawler.ts',
  'app/api/media/covers',
  'app/api/media/proxy',
  'lib/server/media/local-cover-handler.ts',
  'lib/server/media/local-cover-path.ts',
  'lib/server/media/stream-proxy.ts',
  'drizzle/core',
  'Dockerfile.worker',
  'worker.env.example',
  'deploy/worker.env.example',
  'docs/api/crawler-internal-openapi.yaml',
];

for (const path of forbiddenPaths) {
  if (existsSync(resolve(root, path))) failures.push(`forbidden path exists: ${path}`);
}

const packageJson = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
for (const [name, command] of Object.entries(packageJson.scripts ?? {})) {
  if (/crawler|worker|python/i.test(`${name} ${command}`)) {
    failures.push(`forbidden root npm script: ${name}`);
  }
}

for (const composePath of ['docker-compose.yml', 'deploy/docker-compose.yml']) {
  const compose = parse(readFileSync(resolve(root, composePath), 'utf8'));
  const services = Object.keys(compose?.services ?? {});
  if (services.length !== 1 || services[0] !== 'app') {
    failures.push(`${composePath} must contain only the app service`);
  }
}

const scanRoots = ['app', 'components', 'lib', 'scripts', 'drizzle'];
const allowedExtensions = new Set(['.ts', '.tsx', '.js', '.mjs', '.sql']);
const forbiddenContent = [
  /\/api\/internal\/crawler/i,
  /\/admin\/crawler/i,
  /\/api\/media\/proxy/i,
  /\buseProxy\b/,
  /\bCRAWLER_[A-Z0-9_]+\b/,
  /\b(?:crawler_profiles|crawler_schedules|crawler_jobs|crawler_job_attempts|crawler_job_items|crawler_job_events|crawler_operation_receipts|crawler_workers|crawler_media_uploads|storage_profiles|storage_profile_versions|anime_sources)\b/i,
];

function scan(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      scan(path);
      continue;
    }
    if (!allowedExtensions.has(extname(entry.name))) continue;
    if (path === resolve(root, 'scripts/check-app-boundaries.mjs')) continue;
    const content = readFileSync(path, 'utf8');
    if (forbiddenContent.some((pattern) => pattern.test(content))) {
      failures.push(`forbidden crawler content: ${path.slice(root.length + 1)}`);
    }
  }
}

for (const path of scanRoots) scan(resolve(root, path));

if (failures.length > 0) {
  console.error(`App boundary check failed (${failures.length}):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('App boundary check passed.');
