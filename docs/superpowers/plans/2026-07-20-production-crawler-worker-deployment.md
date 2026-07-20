# 生产 Crawler Worker 双容器部署实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 补齐可发布的 Python Crawler Worker，使同一份 Compose 启动 App 与 Worker，并让后台安全控制节点领取、凭据与禁用状态。

**Architecture:** App 继续作为唯一数据库控制面；Worker 使用独立 Python 镜像，仅通过 `/api/internal/crawler/v1` 通信。Worker 的 `claim_enabled` 在领取事务内加锁读取，后台只管理机器身份与领取状态，Compose 管理容器进程。

**Tech Stack:** Next.js 15、TypeScript 5.9、Drizzle ORM、MariaDB、Python 3 slim、Node test runner、unittest、Docker Compose、GitHub Actions。

---

## Task 1：建立 Worker 镜像与双容器部署合同

**Files:**
- Modify: `tests/deployment/docker-compose.test.ts`
- Create: `Dockerfile.worker`
- Modify: `docker-compose.yml`
- Modify: `deploy/docker-compose.yml`

- [x] 新增失败测试，要求两份 Compose 只含 `app`、`worker`，Worker 使用独立镜像、独立 `worker.env`、App 健康依赖和完整安全约束。
- [x] 新增失败测试，要求 `Dockerfile.worker` 安装 `requirements-worker.lock`、仅复制 Worker 运行文件、使用非 root 用户并执行 `python -u -m crawler_worker.main`。
- [x] 运行目标部署测试，确认因 Worker 服务和 Dockerfile 合同不符而失败。
- [x] 更新 `Dockerfile.worker`，保留受支持的 Python 3.12 slim、固定临时目录、非 root 用户与 `requirements-worker.lock`。
- [x] 将根目录与 `deploy/` Compose 改为 `app`、`worker` 两个服务；Worker 固定设置：

```yaml
environment:
  CRAWLER_CONTROL_URL: http://app:3000/api/internal/crawler/v1
  CRAWLER_TEMP_DIR: /tmp/crawler-worker
env_file:
  - worker.env
read_only: true
volumes:
  - ./crawler-worker-tmp:/tmp/crawler-worker
cap_drop:
  - ALL
security_opt:
  - no-new-privileges:true
```

- [x] 重新运行部署合同测试，确认通过。

## Task 2：发布 App 与 Worker 两个镜像

**Files:**
- Modify: `tests/deployment/docker-compose.test.ts`
- Modify: `.github/workflows/docker-publish.yml`

- [x] 在部署合同中断言工作流同时声明 `APP_IMAGE`、`WORKER_IMAGE`，且分别使用 `Dockerfile`、`Dockerfile.worker` 和独立缓存 scope。
- [x] 运行目标测试，确认工作流合同失败。
- [x] 扩展发布工作流，为 Worker 增加 metadata 与 build-push 步骤；两个镜像共用 branch、semver、SHA、latest 标签策略。
- [x] 重新运行目标测试，确认通过。

## Task 3：增加 Worker 领取状态与持久化能力

**Files:**
- Create: `drizzle/migrations/0017-crawler-worker-claim-control.sql`
- Modify: `lib/server/infrastructure/database/schema/crawler.ts`
- Modify: `drizzle/core/0001-crawler-core.sql`
- Modify: `lib/server/crawler/ports/worker-repository.ts`
- Modify: `lib/server/crawler/testing/in-memory-worker-repository.ts`
- Modify: `lib/server/infrastructure/database/mariadb-crawler-repositories.ts`
- Modify: `tests/crawler/worker-provisioning.test.ts`
- Modify: `tests/crawler/mariadb-uow.test.ts`
- Modify: `tests/crawler/worker-provisioning.test.ts`

- [x] 先写测试，要求新建 Worker 默认 `claimEnabled=true`，可暂停/恢复、硬禁用/启用、轮换摘要与 scope，并对不存在 ID 报错。
- [x] 写 MariaDB SQL 合同测试，要求映射 `claim_enabled`，管理更新校验节点存在，领取查询使用 `FOR UPDATE`。
- [x] 写 schema/baseline 测试，要求 `claim_enabled TINYINT NOT NULL DEFAULT 1`。
- [x] 运行上述目标测试并确认失败。
- [x] 扩展 `WorkerRecord` 和 `WorkerRepository`：

```ts
claimEnabled: boolean;
getForUpdate(workerId: number): Promise<WorkerClaimControlRecord | null>;
setClaimEnabled(workerId: number, enabled: boolean): Promise<WorkerRecord>;
rotateCredential(workerId: number, tokenHash: Uint8Array, scopes: readonly string[]): Promise<WorkerCredentialRecord>;
setEnabled(workerId: number, enabled: boolean): Promise<WorkerRecord>;
```

- [x] 实现内存与 MariaDB 仓储，并增加增量迁移、Drizzle schema 与生产 baseline。
- [x] 重新运行目标测试，确认通过。

## Task 4：在领取事务内执行暂停门禁

**Files:**
- Modify: `lib/server/crawler/ports/crawler-unit-of-work.ts`
- Modify: `lib/server/crawler/testing/in-memory-crawler-uow.ts`
- Modify: `lib/server/infrastructure/database/mariadb-crawler-repositories.ts`
- Modify: `lib/server/crawler/application/crawler-job-service.ts`
- Modify: `tests/crawler/job-service.test.ts`
- Modify: `tests/crawler/mariadb-uow.test.ts`

- [x] 写失败测试：active Worker 可领取；paused Worker 返回 `null` 且任务仍 queued、Attempt 数不变；恢复后可领取同一任务。
- [x] 写并发测试：暂停事务完成后开始的 claim 不得生成租约。
- [x] 将只读的 `WorkerClaimControlRepository` 加入 `CrawlerRepositories`：

```ts
export interface WorkerClaimControlRepository {
  getForUpdate(workerId: number): Promise<{
    id: number;
    isEnabled: boolean;
    claimEnabled: boolean;
  } | null>;
}
```

- [x] 在 `claimOnce` 的事务开头、扫描 queued 任务之前读取 Worker；不存在/硬禁用抛稳定鉴权错误，暂停直接返回 `null`。
- [x] MariaDB 使用同一事务连接执行 `SELECT ... FOR UPDATE`；内存 UOW 使用现有串行事务模拟锁。
- [x] 运行 job service 与 MariaDB UOW 目标测试，确认全部通过。

## Task 5：实现 Worker 管理服务与 Server Actions

**Files:**
- Modify: `lib/server/crawler/application/admin-crawler-service.ts`
- Modify: `lib/server/crawler/interfaces/admin-crawler-actions.ts`
- Modify: `app/admin/crawler/actions.ts`
- Modify: `tests/crawler/admin-actions.test.ts`
- Modify: `tests/crawler/worker-provisioning.test.ts`

- [x] 写失败测试，覆盖暂停、恢复、轮换、撤销、硬禁用和重新启用；所有 ID 必须是正安全整数，Worker 不存在返回 404。
- [x] 在 `AdminCrawlerService` 增加 `setWorkerClaimEnabled`、`rotateWorkerCredential`、`setWorkerEnabled`；轮换使用 `randomBytes(32)`，只返回一次明文 token。
- [x] Server Action 使用现有管理员鉴权、统一结果类型和页面刷新模式；撤销与禁用保留危险确认语义。
- [x] 运行 admin actions 与 provisioning 测试，确认通过。

## Task 6：完成后台 Worker 控件和领取原因展示

**Files:**
- Create: `components/admin/crawler/worker-actions.tsx`
- Modify: `components/admin/crawler/worker-provision-form.tsx`
- Modify: `app/admin/crawler/workers/page.tsx`
- Modify: `app/admin/crawler/jobs/[id]/page.tsx`
- Create: `tests/crawler/admin-worker-page.test.ts`
- Modify: `tests/crawler/admin-job-page.test.ts`

- [x] 写静态/渲染合同测试，要求 Worker 页面展示 online/offline 与 active/draining/paused/disabled，并提供暂停/恢复、轮换、撤销、硬禁用/启用操作。
- [x] 写任务详情失败测试，要求解析并显示 `progressJson.claimSkipReason`，无效 JSON 安全降级。
- [x] 实现客户端操作组件；轮换后的 token 只保存在当前组件状态，刷新后不可恢复。
- [x] 从 `capabilitiesJson.currentLoad` 推导 draining/paused，90 秒心跳阈值沿用服务约定。
- [x] 用现有确认对话框保护撤销和硬禁用；暂停/恢复直接操作。
- [x] 运行两个页面目标测试并确认通过。

## Task 7：实现 Worker 控制面错误分类与有界退避

**Files:**
- Modify: `crawler_worker/runtime/runner.py`
- Modify: `crawler_worker/transport/control_client.py`
- Modify: `crawler_worker/tests/test_runner.py`
- Modify: `crawler_worker/tests/test_control_client.py`

- [x] 写失败测试：401/403 或 Worker 禁用错误应记录稳定错误并终止；连接失败和 5xx 使用有上限的指数退避；204 claim 保持心跳并继续空闲循环。
- [x] 在 ControlClient 保留 HTTP 状态和稳定错误码；Runner 只重试可恢复的网络/5xx 错误，退避上限固定且成功请求后重置。
- [x] 不捕获任务执行期的租约协议错误为无限重试；鉴权失败直接向上抛出并退出进程。
- [x] 运行 `cmd /c npm run test:python -- crawler_worker.tests.test_runner crawler_worker.tests.test_control_client`，确认通过。

## Task 8：补齐部署环境示例与操作文档

**Files:**
- Modify: `.env.example`
- Modify: `deploy/.env.example`
- Create: `worker.env.example`
- Create: `deploy/worker.env.example`
- Modify: `README.md`
- Modify: `deploy/README.md`

- [x] 明确 `.env` 仅供 App，`worker.env` 仅供 Worker，示例不得包含真实 token、数据库密码或会话密钥。
- [x] 文档写明后台创建节点、一次性复制 ID/token、生成 `worker.env`、执行受确认迁移、拉取两个镜像并 `docker compose up -d` 的顺序。
- [x] 写明暂停、排空、轮换、撤销、硬禁用的差异，以及 Worker 不应获得数据库变量。
- [x] 运行敏感信息与部署合同测试，确认示例和文档没有破坏隔离约束。

## Task 9：完整验证与交付检查

**Files:**
- Verify only unless修复测试发现的问题。

- [x] 运行 `cmd /c npm run test:ts`。
- [x] 运行 `cmd /c npm run test:python`。
- [x] 运行 `cmd /c npm run check:worker-requirements`。
- [x] 运行 `cmd /c npm run lint`。
- [x] 运行 `cmd /c pnpm exec tsc --noEmit`。
- [x] 运行 `cmd /c npm run build`，不启动开发服务。
- [x] 按用户明确要求不在本地运行 Compose；服务器部署时执行配置解析。
- [x] 按用户明确要求不在本地构建或测试 Docker 镜像；由发布工作流和服务器验证镜像。
- [x] 检查 `git diff --check`、`git status --short` 和完整 diff，确保没有明文凭据、无关改动或 UTF-8 编码退化。
- [x] 按功能拆分原子提交；用户已明确要求 commit 和 push。
