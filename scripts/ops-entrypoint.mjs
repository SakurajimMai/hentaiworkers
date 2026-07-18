import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const root = process.cwd();
const [command = 'migrate', ...args] = process.argv.slice(2);

function run(script, scriptArgs = []) {
  const result = spawnSync(process.execPath, [resolve(root, script), ...scriptArgs], {
    cwd: root,
    env: process.env,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

switch (command) {
  case 'migrate':
    run('scripts/apply-crawler-migration.mjs', args);
    break;
  case 'setup':
    if (args.length > 0) throw new Error('setup does not accept extra arguments');
    run('scripts/setup-production-baseline.mjs');
    run('scripts/setup-crawler-core.mjs');
    run('scripts/apply-crawler-migration.mjs');
    break;
  case 'seed-admin':
    if (args.length > 0) throw new Error('seed-admin does not accept extra arguments');
    run('scripts/seed-admin-ops.mjs');
    break;
  default:
    throw new Error(`Unknown ops command: ${command}. Use setup, migrate, or seed-admin.`);
}
