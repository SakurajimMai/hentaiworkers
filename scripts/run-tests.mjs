import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const repositoryRoot = resolve(import.meta.dirname, '..');

function collectTests(directory) {
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) return collectTests(path);
      return entry.isFile() && entry.name.endsWith('.test.ts') ? [path] : [];
    })
    .sort();
}

const tests = collectTests(resolve(repositoryRoot, 'tests'));
if (tests.length === 0) {
  console.error('No TypeScript tests found.');
  process.exit(1);
}

const result = spawnSync(
  process.execPath,
  ['--import', 'tsx', '--test', ...tests],
  { cwd: repositoryRoot, stdio: 'inherit' },
);

if (result.error) throw result.error;
process.exit(result.status ?? 1);
