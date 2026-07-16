#!/usr/bin/env node
/**
 * Guard: worker lock must be installable without ResolutionImpossible.
 * Fails fast on the known selenium/typing_extensions pin conflict and
 * optionally dry-runs pip when Python is available.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const lockPath = join(root, 'requirements-worker.lock');
const lock = readFileSync(lockPath, 'utf8');

function pin(name) {
  const re = new RegExp(`^${name}==([^\\s#]+)`, 'm');
  const m = lock.match(re);
  return m ? m[1] : null;
}

/** Parse stable X.Y.Z only (reject prerelease/dev/local/malformed suffixes). */
function parseSemver(version) {
  const m = String(version).match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

/** Compare a.b.c triples: -1 / 0 / 1 */
function cmpSemver(a, b) {
  for (let i = 0; i < 3; i += 1) {
    if (a[i] < b[i]) return -1;
    if (a[i] > b[i]) return 1;
  }
  return 0;
}

const selenium = pin('selenium');
const typing = pin('typing_extensions');
const bs4 = pin('beautifulsoup4');

if (!selenium || !typing) {
  console.error('check-worker-requirements: missing selenium or typing_extensions pin in lock');
  process.exit(1);
}

// selenium 4.33.x requires typing_extensions~=4.13.2 i.e. >=4.13.2,<4.14.0
if (selenium.startsWith('4.33.')) {
  const t = parseSemver(typing);
  const min = [4, 13, 2];
  const max = [4, 14, 0];
  if (!t || cmpSemver(t, min) < 0 || cmpSemver(t, max) >= 0) {
    console.error(
      `check-worker-requirements: incompatible pins selenium==${selenium} with typing_extensions==${typing}; expected typing_extensions >=4.13.2,<4.14.0 for selenium 4.33.x`,
    );
    process.exit(1);
  }
}

console.log(
  `check-worker-requirements: static ok (selenium==${selenium}, typing_extensions==${typing}, beautifulsoup4==${bs4 ?? 'n/a'})`,
);

function findPython() {
  // Probe the exact invocation used later; require Python 3.
  const candidates = [['python'], ['python3'], ['py', '-3']];
  for (const cmd of candidates) {
    const r = spawnSync(cmd[0], [...cmd.slice(1), '--version'], { encoding: 'utf8' });
    if (r.status !== 0) continue;
    const out = `${r.stdout || ''}${r.stderr || ''}`;
    if (!/\bPython\s+3\./i.test(out)) continue;
    return cmd;
  }
  return null;
}

const py = findPython();
if (!py) {
  console.log('check-worker-requirements: python not found; skipped pip dry-run');
  process.exit(0);
}

const dry = spawnSync(
  py[0],
  [
    ...py.slice(1),
    '-m',
    'pip',
    'install',
    '--dry-run',
    '--ignore-installed',
    '-r',
    lockPath,
  ],
  { encoding: 'utf8', cwd: root, maxBuffer: 20 * 1024 * 1024 },
);

if (dry.status !== 0) {
  console.error(dry.stderr || dry.stdout);
  console.error('check-worker-requirements: pip could not resolve requirements-worker.lock');
  process.exit(dry.status || 1);
}

if (/ResolutionImpossible|conflicting dependencies/i.test(`${dry.stdout}\n${dry.stderr}`)) {
  console.error(dry.stdout);
  console.error(dry.stderr);
  console.error('check-worker-requirements: dependency conflict in lock');
  process.exit(1);
}

console.log('check-worker-requirements: pip dry-run ok');
process.exit(0);
