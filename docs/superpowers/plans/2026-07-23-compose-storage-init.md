# Docker Compose 存储目录自动初始化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让生产服务器无需手工创建目录或修改权限，配置文件就绪后只执行 `docker compose up -d` 即可启动 App 与 Worker。

**Architecture:** 新增一次性 `storage-init` 服务，复用 Worker 镜像，以受限 root 权限修正两个 bind mount 根目录后退出。App 等待初始化成功，Worker 继续等待 App 健康，两个常驻服务仍保持原有非 root 与只读边界。

**Tech Stack:** Docker Compose、YAML、TypeScript Node test runner。

---

## 文件结构

- `tests/deployment/docker-compose.test.ts`：三服务、权限、启动顺序、隔离和文档合同。
- `docker-compose.yml`：仓库根目录生产部署配置。
- `deploy/docker-compose.yml`：服务器最小部署清单。
- `docs/deployment.md`：完整生产部署指南。
- `deploy/README.md`：服务器清单快速说明。

### Task 1: 锁定一次性初始化服务合同

**Files:**
- Modify: `tests/deployment/docker-compose.test.ts`

- [ ] **Step 1: 扩展 Compose 类型并写入失败断言。**

```ts
type ComposeService = {
  image?: string;
  pull_policy?: string;
  user?: string;
  entrypoint?: string[];
  command?: string[];
  env_file?: string[];
  environment?: Record<string, string>;
  volumes?: string[];
  read_only?: boolean;
  network_mode?: string;
  cap_drop?: string[];
  cap_add?: string[];
  security_opt?: string[];
  depends_on?: Record<string, { condition?: string }>;
  restart?: string;
  ports?: string[];
};

assert.deepEqual(Object.keys(compose.services), ['storage-init', 'app', 'worker']);
const init = compose.services['storage-init'];
assert.equal(init.image, 'sakurajiamai/hentaiworkers-worker:latest');
assert.equal(init.pull_policy, 'always');
assert.equal(init.user, '0:0');
assert.deepEqual(init.entrypoint, ['/bin/sh', '-ec']);
assert.match(init.command?.[0] ?? '', /chown 10001:10001/);
assert.match(init.command?.[0] ?? '', /chmod 0700 \/tmp\/crawler-worker/);
assert.match(init.command?.[0] ?? '', /chmod 0755 \/data\/covers/);
assert.deepEqual(init.volumes, [
  './crawler-worker-tmp:/tmp/crawler-worker',
  './covers:/data/covers',
]);
assert.equal(init.read_only, true);
assert.equal(init.network_mode, 'none');
assert.deepEqual(init.cap_drop, ['ALL']);
assert.deepEqual(init.cap_add, ['CHOWN', 'FOWNER', 'DAC_OVERRIDE']);
assert.deepEqual(init.security_opt, ['no-new-privileges:true']);
assert.equal(init.env_file, undefined);
assert.equal(init.ports, undefined);
assert.equal(init.restart, 'no');
assert.equal(app.depends_on?.['storage-init']?.condition, 'service_completed_successfully');
assert.equal(worker.depends_on?.app?.condition, 'service_healthy');
```

- [ ] **Step 2: 运行测试并确认现有两服务配置失败。**

Run: `cmd /c pnpm exec tsx --test tests/deployment/docker-compose.test.ts`

Expected: FAIL，服务列表仍为 `app`、`worker`。

### Task 2: 实现 Compose 自动初始化

**Files:**
- Modify: `docker-compose.yml`
- Modify: `deploy/docker-compose.yml`
- Test: `tests/deployment/docker-compose.test.ts`

- [ ] **Step 1: 在两份 Compose 中新增完全一致的初始化服务。**

```yaml
services:
  storage-init:
    image: sakurajiamai/hentaiworkers-worker:latest
    pull_policy: always
    user: "0:0"
    entrypoint: ["/bin/sh", "-ec"]
    command:
      - |
        mkdir -p /tmp/crawler-worker /data/covers
        chown 10001:10001 /tmp/crawler-worker /data/covers
        chmod 0700 /tmp/crawler-worker
        chmod 0755 /data/covers
    volumes:
      - ./crawler-worker-tmp:/tmp/crawler-worker
      - ./covers:/data/covers
    read_only: true
    network_mode: none
    cap_drop:
      - ALL
    cap_add:
      - CHOWN
      - FOWNER
      - DAC_OVERRIDE
    security_opt:
      - no-new-privileges:true
    restart: "no"
```

- [ ] **Step 2: 让 App 等待初始化成功。**

```yaml
app:
  depends_on:
    storage-init:
      condition: service_completed_successfully
```

Worker 保留 `depends_on.app.condition: service_healthy`，形成 `storage-init -> app -> worker` 顺序。

- [ ] **Step 3: 运行部署合同测试。**

Run: `cmd /c pnpm exec tsx --test tests/deployment/docker-compose.test.ts`

Expected: PASS。

- [ ] **Step 4: 提交 Compose 改动。**

Run: `git add tests/deployment/docker-compose.test.ts docker-compose.yml deploy/docker-compose.yml`

Run: `git commit -m "feat(deploy): initialize bind mount permissions automatically"`

### Task 3: 将文档改为单命令部署

**Files:**
- Modify: `tests/deployment/docker-compose.test.ts`
- Modify: `docs/deployment.md`
- Modify: `deploy/README.md`

- [ ] **Step 1: 先修改文档合同测试。**

```ts
for (const source of [deploymentGuide, deployReadme]) {
  assert.match(source, /docker compose up -d/);
  assert.match(source, /storage-init/);
  assert.match(source, /自动[^\n]*(?:权限|所有权)/);
  assert.doesNotMatch(source, /^mkdir -p crawler-worker-tmp covers$/m);
  assert.doesNotMatch(source, /^chown 10001:10001 crawler-worker-tmp covers$/m);
  assert.doesNotMatch(source, /^chmod 700 crawler-worker-tmp$/m);
  assert.doesNotMatch(source, /^chmod 755 covers$/m);
}
```

- [ ] **Step 2: 运行测试并确认旧文档仍要求手工命令。**

Run: `cmd /c pnpm exec tsx --test tests/deployment/docker-compose.test.ts`

Expected: FAIL。

- [ ] **Step 3: 更新两份部署文档。**

删除人工目录权限命令，明确 `.env`、`worker.env` 配置完成后执行：

```bash
docker compose up -d
```

说明 `storage-init` 会自动设置临时目录 `0700`、封面目录 `0755` 和 UID/GID `10001:10001`；它成功退出是正常状态，可用 `docker compose logs storage-init` 排查失败。升级同样使用 `docker compose up -d`，现有 `./covers` 内容不会被删除。

- [ ] **Step 4: 运行部署合同测试确认通过。**

Run: `cmd /c pnpm exec tsx --test tests/deployment/docker-compose.test.ts`

Expected: PASS。

- [ ] **Step 5: 提交文档改动。**

Run: `git add tests/deployment/docker-compose.test.ts docs/deployment.md deploy/README.md`

Run: `git commit -m "docs: simplify compose deployment to one command"`

### Task 4: 完整验证与推送

**Files:**
- Verify: 上述全部文件

- [ ] **Step 1: 运行全部 TypeScript 测试。**

Run: `cmd /c pnpm run test:ts`

Expected: 0 failed。

- [ ] **Step 2: 运行全部 Python 测试。**

Run: `cmd /c pnpm run test:python`

Expected: 0 failed。

- [ ] **Step 3: 运行类型、旧栈和 Worker 依赖检查。**

Run: `cmd /c pnpm exec tsc --noEmit`

Run: `cmd /c pnpm run check:legacy`

Run: `cmd /c pnpm run check:worker-requirements`

Expected: 全部退出码为 0。

- [ ] **Step 4: 检查提交和工作区。**

Run: `git diff --check origin/main...HEAD`

Run: `git status --short --branch`

Expected: 工作区干净，当前分支仅领先本次设计、计划、实现和文档提交。

- [ ] **Step 5: 推送当前 main。**

Run: `git push origin main`

Expected: `origin/main` 与本地 `HEAD` 一致。
