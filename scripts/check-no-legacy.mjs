import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const failures = [];

const forbiddenPaths = [
  'legacy',
  'functions',
  'server',
  'wrangler.toml',
  'wrangler.toml.example',
  'tsconfig.app.json',
  'tsconfig.node.json',
  'public/vite.svg',
  'public/robots.txt',
  'IMPLEMENTATION_PLAN.md',
  'npm',
  'scripts/d1_direct_client.py',
  'scripts/production_crawler.py',
  'scripts/unified_crawler.py',
  'scripts/crawler_config.py',
];

const requiredPaths = [
  'mobile',
  'app/sitemap.ts',
  'app/robots.ts',
  'components.json',
  'package-lock.json',
];

for (const path of forbiddenPaths) {
  if (existsSync(resolve(root, path))) failures.push(`旧路径仍存在：${path}`);
}

for (const path of requiredPaths) {
  if (!existsSync(resolve(root, path))) failures.push(`应保留的路径缺失：${path}`);
}

for (const environmentPath of ['.env', 'deploy/.env']) {
  try {
    execFileSync('git', ['check-ignore', '--quiet', '--', environmentPath], {
      cwd: root,
      stdio: 'ignore',
    });
  } catch {
    failures.push(`敏感配置未被 Git 忽略：${environmentPath}`);
  }
}

const forbiddenLockPackages = new Set([
  '@types/better-sqlite3',
  '@types/sql.js',
  'better-sqlite3',
  'libsql',
  'sql.js',
  'sqlite3',
]);

try {
  const packageLock = JSON.parse(readFileSync(resolve(root, 'package-lock.json'), 'utf8'));
  for (const packagePath of Object.keys(packageLock.packages ?? {})) {
    const match = packagePath.match(/(?:^|\/)node_modules\/((?:@[^/]+\/)?[^/]+)$/);
    const packageName = match?.[1];
    if (packageName && (packageName.startsWith('@libsql/') || forbiddenLockPackages.has(packageName))) {
      failures.push(`package-lock.json 仍包含旧 SQLite/libSQL 依赖：${packageName}`);
    }
  }
} catch (error) {
  failures.push(`package-lock.json 不是有效 JSON：${error.message}`);
}

try {
  const components = JSON.parse(readFileSync(resolve(root, 'components.json'), 'utf8'));
  if (components.rsc !== true) failures.push('components.json 的 rsc 必须为 true');
  if (components.tailwind?.css !== 'app/globals.css') {
    failures.push('components.json 的 tailwind.css 必须为 app/globals.css');
  }
} catch (error) {
  failures.push(`components.json 不是有效 JSON：${error.message}`);
}

if (failures.length > 0) {
  console.error(`旧栈回流检查失败（${failures.length} 项）：`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('旧栈回流检查通过。');
