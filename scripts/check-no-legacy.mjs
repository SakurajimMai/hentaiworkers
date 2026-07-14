import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];

const legacyPaths = [
  "legacy",
  "functions",
  "server",
  "wrangler.toml",
  "wrangler.toml.example",
  "tsconfig.app.json",
  "tsconfig.node.json",
  "public/vite.svg",
  "public/robots.txt",
  "IMPLEMENTATION_PLAN.md",
  "npm",
  "scripts/d1_direct_client.py",
  "scripts/CRAWLER_UPDATE.md",
  // Direct-DB crawler cut over to crawler_worker + control plane.
  "scripts/production_crawler.py",
  "scripts/unified_crawler.py",
  "scripts/crawler_config.py",
  "scripts/tests/test_crawler_config.py",
];

const requiredPaths = [
  "mobile",
  "crawler_worker/main.py",
  "crawler_worker/transport/control_client.py",
  "scripts/run-python-tests.mjs",
  "scripts/revoke-legacy-crawler-db.mjs",
  "app/sitemap.ts",
  "app/robots.ts",
];

function pathExists(relativePath) {
  return existsSync(resolve(repositoryRoot, relativePath));
}

function readRepositoryFile(relativePath) {
  return readFileSync(resolve(repositoryRoot, relativePath), "utf8");
}

function walkPyFiles(dir, onFile) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (name === "__pycache__") continue;
      walkPyFiles(full, onFile);
      continue;
    }
    if (name.endsWith(".py")) onFile(full);
  }
}

for (const relativePath of legacyPaths) {
  if (pathExists(relativePath)) {
    failures.push(`旧路径仍存在：${relativePath}`);
  }
}

for (const relativePath of requiredPaths) {
  if (!pathExists(relativePath)) {
    failures.push(`应保留的路径缺失：${relativePath}`);
  }
}

const sensitiveConfigPaths = [
  "production_config.yml",
  "config.yml",
  "scripts/production_config.yml",
  "scripts/config.yml",
];

for (const relativePath of sensitiveConfigPaths) {
  try {
    execFileSync("git", ["check-ignore", "--quiet", "--", relativePath], {
      cwd: repositoryRoot,
      stdio: "ignore",
    });
  } catch {
    failures.push(`敏感配置未被 Git 忽略：${relativePath}`);
  }
}

if (!pathExists(".dockerignore")) {
  failures.push("配置文件缺失：.dockerignore");
} else {
  const dockerIgnore = new Set(
    readRepositoryFile(".dockerignore")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean),
  );

  for (const relativePath of sensitiveConfigPaths) {
    if (!dockerIgnore.has(relativePath)) {
      failures.push(`敏感配置未被 Docker 忽略：${relativePath}`);
    }
  }
}

const forbiddenContent = [
  {
    path: "scripts/production_config.yml.example",
    values: ["d1_sync", "CF_ACCOUNT_ID", "CF_D1_DATABASE_ID", "CF_API_TOKEN"],
  },
  {
    path: "scripts/production_config.yml",
    values: ["d1_sync", "CF_ACCOUNT_ID", "CF_D1_DATABASE_ID", "CF_API_TOKEN"],
  },
];

const forbiddenLockPackages = new Set([
  "@types/better-sqlite3",
  "@types/sql.js",
  "better-sqlite3",
  "libsql",
  "sql.js",
  "sqlite3",
]);

if (!pathExists("package-lock.json")) {
  failures.push("依赖锁文件缺失：package-lock.json");
} else {
  try {
    const packageLock = JSON.parse(readRepositoryFile("package-lock.json"));
    const lockedPackages = packageLock.packages;

    if (!lockedPackages || typeof lockedPackages !== "object") {
      failures.push("package-lock.json 缺少 packages 依赖索引");
    } else {
      const legacyDependencies = new Set();

      for (const packagePath of Object.keys(lockedPackages)) {
        const match = packagePath.match(
          /(?:^|\/)node_modules\/((?:@[^/]+\/)?[^/]+)$/,
        );
        const packageName = match?.[1];

        if (
          packageName &&
          (packageName.startsWith("@libsql/") ||
            forbiddenLockPackages.has(packageName))
        ) {
          legacyDependencies.add(packageName);
        }
      }

      for (const packageName of [...legacyDependencies].sort()) {
        failures.push(`package-lock.json 仍包含旧 SQLite/libSQL 依赖：${packageName}`);
      }
    }
  } catch (error) {
    failures.push(`package-lock.json 不是有效 JSON：${error.message}`);
  }
}

for (const { path, values } of forbiddenContent) {
  if (!pathExists(path)) {
    continue;
  }

  const content = readRepositoryFile(path);
  for (const value of values) {
    if (content.includes(value)) {
      failures.push(`${path} 仍包含禁用内容：${value}`);
    }
  }
}

if (pathExists("crawler_worker")) {
  walkPyFiles(resolve(repositoryRoot, "crawler_worker"), (full) => {
    const rel = relative(repositoryRoot, full).replace(/\\/g, "/");
    const content = readFileSync(full, "utf8");
    if (/\bimport\s+pymysql\b|\bfrom\s+pymysql\b/.test(content)) {
      failures.push(`${rel} 仍 import pymysql`);
    }
    if (/\bINSERT\s+INTO\s+animes\b/i.test(content)) {
      failures.push(`${rel} 仍包含直写 animes`);
    }
  });
}

if (pathExists("scripts/production_config.yml")) {
  const content = readRepositoryFile("scripts/production_config.yml");
  const passwordMatch = content.match(/password:\s*"([^"]*)"/i);
  if (passwordMatch && passwordMatch[1].length > 0) {
    failures.push("scripts/production_config.yml 仍包含非空 database.password");
  }
  const userMatch = content.match(/^\s*user:\s*"([^"]*)"/im);
  if (userMatch && userMatch[1].length > 0) {
    failures.push("scripts/production_config.yml 仍包含非空 database.user");
  }
}

if (!pathExists("components.json")) {
  failures.push("配置文件缺失：components.json");
} else {
  try {
    const components = JSON.parse(readRepositoryFile("components.json"));

    if (components.rsc !== true) {
      failures.push("components.json 的 rsc 必须为 true");
    }

    if (components.tailwind?.css !== "app/globals.css") {
      failures.push("components.json 的 tailwind.css 必须为 app/globals.css");
    }
  } catch (error) {
    failures.push(`components.json 不是有效 JSON：${error.message}`);
  }
}

if (failures.length > 0) {
  console.error(`旧栈回流检查失败（${failures.length} 项）：`);
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exitCode = 1;
} else {
  console.log(
    "旧栈回流检查通过：遗留直写爬虫已删除，Worker 无 pymysql，敏感配置已隔离。",
  );
}
