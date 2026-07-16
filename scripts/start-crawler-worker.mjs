/**
 * Load .crawler-worker.env and start the Python crawler worker.
 * Usage: node scripts/start-crawler-worker.mjs
 */
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const envFile = resolve(process.cwd(), '.crawler-worker.env');
if (!existsSync(envFile)) {
  console.error('Missing .crawler-worker.env — run: npm run worker:provision');
  process.exit(1);
}

const env = { ...process.env };
for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const eq = trimmed.indexOf('=');
  if (eq <= 0) continue;
  const key = trimmed.slice(0, eq).trim();
  let value = trimmed.slice(eq + 1).trim();
  if (
    (value.startsWith('"') && value.endsWith('"'))
    || (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }
  env[key] = value;
}

// Worker must not receive DB credentials
for (const banned of ['DATABASE_URL', 'MYSQL_HOST', 'MYSQL_USER', 'MYSQL_PASSWORD']) {
  delete env[banned];
}

const required = ['CRAWLER_CONTROL_URL', 'CRAWLER_WORKER_ID', 'CRAWLER_WORKER_TOKEN'];
for (const key of required) {
  if (!env[key]) {
    console.error(`Missing ${key} in .crawler-worker.env`);
    process.exit(1);
  }
}

console.log(
  `Starting worker id=${env.CRAWLER_WORKER_ID} → ${env.CRAWLER_CONTROL_URL}`,
);

if (!env.CRAWLER_TEMP_DIR) {
  env.CRAWLER_TEMP_DIR = resolve(process.cwd(), '.crawler-worker-tmp');
}
env.PYTHONUNBUFFERED = env.PYTHONUNBUFFERED || '1';
env.PYTHONPATH = env.PYTHONPATH || process.cwd();

const python = process.env.PYTHON || 'python';
const child = spawn(python, ['-u', '-m', 'crawler_worker.main'], {
  env,
  stdio: 'inherit',
  cwd: process.cwd(),
  // Avoid shell wrapping so Ctrl+C / signals reach Python reliably on Windows.
  shell: false,
  windowsHide: true,
});

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
