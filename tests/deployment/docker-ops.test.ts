import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = process.cwd();
const dockerfile = readFileSync(join(root, 'Dockerfile.ops'), 'utf8');
const entrypoint = readFileSync(join(root, 'scripts/ops-entrypoint.mjs'), 'utf8');
const workflow = readFileSync(join(root, '.github/workflows/docker-publish.yml'), 'utf8');
const opsPackage = JSON.parse(readFileSync(join(root, 'ops/package.json'), 'utf8')) as {
  dependencies: Record<string, string>;
};
const opsLock = JSON.parse(readFileSync(join(root, 'ops/package-lock.json'), 'utf8')) as {
  packages: Record<string, { dependencies?: Record<string, string> }>;
};

test('ops image contains only reviewed database operations', () => {
  assert.match(dockerfile, /FROM node:22-alpine/);
  assert.match(dockerfile, /npm ci --omit=dev --ignore-scripts/);
  assert.match(dockerfile, /USER ops:ops/);
  assert.match(dockerfile, /ENTRYPOINT \["node", "scripts\/ops-entrypoint\.mjs"\]/);
  assert.match(dockerfile, /scripts\/lib\/sql-compat\.mjs/);
  assert.doesNotMatch(dockerfile, /COPY \. /);
  assert.deepEqual(Object.keys(opsPackage.dependencies).sort(), [
    'bcryptjs',
    'dotenv',
    'mysql2',
  ]);
  assert.equal(opsLock.packages['..'], undefined);
  assert.equal(opsLock.packages['']?.dependencies?.['anime-web'], undefined);
});

test('ops entrypoint exposes setup, migrate, and seed-admin only', () => {
  for (const command of ['setup', 'migrate', 'seed-admin']) {
    assert.match(entrypoint, new RegExp(`case '${command}'`));
  }
  assert.match(entrypoint, /Unknown ops command/);
  assert.match(entrypoint, /setup-production-baseline\.mjs/);
  assert.match(entrypoint, /setup-crawler-core\.mjs/);
  assert.match(entrypoint, /apply-crawler-migration\.mjs/);
  assert.match(entrypoint, /seed-admin-ops\.mjs/);
});

test('GitHub Actions publishes the ops image to Docker Hub', () => {
  assert.match(workflow, /OPS_IMAGE:.*hentaiworkers-ops/);
  assert.match(workflow, /Check ops requirements lock/);
  assert.match(workflow, /npm ci --omit=dev --ignore-scripts --prefix ops/);
  assert.match(workflow, /Docker metadata \(ops\)/);
  assert.match(workflow, /file: \.\/Dockerfile\.ops/);
  assert.match(workflow, /tags: \$\{\{ steps\.meta-ops\.outputs\.tags \}\}/);
});
