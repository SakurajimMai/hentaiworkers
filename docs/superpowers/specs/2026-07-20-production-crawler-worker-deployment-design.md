# 生产 Crawler Worker 双容器部署设计

## 目标

为现有 Next.js 控制面补齐可实际部署的 Python Crawler Worker，使生产环境中的 `queued` 任务能够被独立 Worker 领取和执行，同时保持 App 与 Worker 的权限、凭据和生命周期隔离。

完成后，同一份 `docker-compose.yml` 启动两个独立容器：

- `app`：Next.js 控制面和业务站点，连接远程 MariaDB。
- `worker`：Python 采集运行时，只访问版本化控制面 API，不连接数据库。

后台负责 Worker 身份、凭据和领取状态管理；Docker Compose 负责容器启动、停止与重启。Web 应用不挂载 Docker Socket。

## 非目标

- 不允许后台直接调用 Docker API、启停宿主机容器或执行任意命令。
- 不把 `DATABASE_URL`、数据库账号或应用会话密钥注入 Worker。
- 不把 Worker 合并进 App 镜像或 App 进程。
- 不自动把一次性 Worker 令牌写入服务器文件系统。
- 不删除有历史任务、尝试或事件关联的 Worker 节点。
- 不改变现有任务租约、幂等提交、Catalog 入库和媒体上传协议。

## 部署架构

### App 镜像

继续发布：

```text
sakurajiamai/hentaiworkers-app:<tag>
```

App 使用现有 `Dockerfile`，运行 `node server.js`。App 读取 `.env`，其中包含数据库、站点、会话和应用加密配置。

### Worker 镜像

新增：

```text
sakurajiamai/hentaiworkers-worker:<tag>
```

新增 `Dockerfile.worker`，要求：

- 基础镜像使用受支持的 Python slim 版本。
- 从 `requirements-worker.lock` 安装固定依赖。
- 只复制 `crawler_worker/` 包和运行所需文件。
- 不复制 `.env`、应用源码、数据库迁移、Node 依赖或管理脚本。
- 使用非 root 用户运行。
- 入口命令固定为 `python -u -m crawler_worker.main`。
- 临时目录固定为 `/tmp/crawler-worker`。

Worker 镜像不包含 MySQL 客户端依赖。现有运行时对 `DATABASE_URL`、`MYSQL_HOST`、`MYSQL_USER` 和 `MYSQL_PASSWORD` 的拒绝逻辑继续作为纵深防御。

### Compose 拓扑

根目录和 `deploy/` 下两份 Compose 保持一致，包含：

```text
app
  └─ healthcheck: /api/live

worker
  ├─ depends_on: app healthy
  ├─ control URL: http://app:3000/api/internal/crawler/v1
  └─ restart: unless-stopped
```

Worker 安全约束：

- `env_file` 只引用 `worker.env`，不得引用 App 的 `.env`。
- `read_only: true`。
- `/tmp/crawler-worker` 使用 `tmpfs`。
- `cap_drop: [ALL]`。
- `security_opt: [no-new-privileges:true]`。
- 不发布宿主机端口。
- 不挂载 Docker Socket、源码目录或数据库证书。

`worker.env` 只允许包含 Worker 运行配置，例如：

```env
CRAWLER_WORKER_ID=
CRAWLER_WORKER_TOKEN=
CRAWLER_WORKER_VERSION=1.0.0
```

Compose 直接设置内部控制地址：

```env
CRAWLER_CONTROL_URL=http://app:3000/api/internal/crawler/v1
CRAWLER_TEMP_DIR=/tmp/crawler-worker
```

对于 Hanime 媒体上传，可在 `worker.env` 中按实际驱动增加 S3 或 SFTP 凭据。MacCMS 外链采集不需要存储凭据。

## Worker 管理状态

### 状态模型

现有 `is_enabled` 保留为身份硬禁用开关。新增领取开关 `claim_enabled`：

- `claim_enabled=true`：节点可领取新任务。
- `claim_enabled=false`：节点继续注册、心跳和完成当前任务，但 claim 返回无任务。

后台展示状态根据数据库与最近能力组合计算：

- `online`：最近 90 秒有心跳。
- `offline`：无近期心跳。
- `active`：`claim_enabled=true`。
- `draining`：`claim_enabled=false` 且最近能力中的 `currentLoad > 0`。
- `paused`：`claim_enabled=false` 且 `currentLoad=0` 或节点离线。
- `disabled`：`is_enabled=false`，机器身份被硬禁用。

暂停不是任务取消。暂停后当前租约继续有效，Worker 可继续 heartbeat、提交条目并完成任务；只阻止下一次领取。

### 数据库迁移

新增增量迁移，为 `crawler_workers` 添加：

```sql
claim_enabled TINYINT(1) NOT NULL DEFAULT 1
```

迁移只增加列，不重写历史任务，不删除节点，不改变现有外键。生产环境仍通过受确认保护的迁移命令执行。

### 仓储和应用服务

`WorkerRecord` 增加 `claimEnabled`。Worker 仓储增加以下操作：

- `setClaimEnabled(workerId, enabled)`：暂停或恢复领取。
- `rotateCredential(workerId, tokenHash, scopes)`：原令牌立即失效，新令牌一次性返回。
- `setEnabled(workerId, enabled)`：硬禁用或重新启用身份。

所有管理操作先验证正安全整数 ID 和节点存在性。

`claimForWorker` 在进入任务扫描前读取当前 Worker：

- 节点不存在或硬禁用：返回稳定的 Worker 鉴权错误。
- `claim_enabled=false`：不创建 Attempt、不修改 queued 任务，返回 204。
- `claim_enabled=true`：继续执行现有能力匹配、CAS 租约和 Attempt 创建流程。

该检查必须与 claim 的事务边界一致，避免暂停与领取并发时在暂停后产生新租约。

### 凭据语义

- 创建节点：生成一个新身份和一次性令牌。
- 轮换凭据：在同一节点上替换令牌摘要，原令牌立即失效；新令牌只显示一次。
- 撤销凭据：立即拒绝该节点的所有后续 API 请求。
- 暂停领取：不撤销令牌，不影响当前任务完成。
- 硬禁用：作为管理员紧急处置操作；应提示可能中断当前任务，默认操作使用暂停而不是硬禁用。

## 后台交互

Worker 页面保留创建节点表单，并为每个节点增加：

- 在线/离线状态。
- active、draining、paused 或 disabled 状态。
- 最近心跳、Worker 版本、当前负载和能力列表。
- “暂停领取”或“恢复领取”操作。
- “轮换令牌”操作，新令牌仅在本次响应中显示。
- “撤销令牌”操作，带危险确认提示。
- “硬禁用节点”操作，带当前任务可能受影响的明确确认提示。

普通暂停操作不需要危险确认；撤销和硬禁用必须使用现有确认对话框。

后台不展示、保存或重新读取令牌明文。刷新页面后明文不可恢复。

## Worker 运行行为

Worker 启动后：

1. 使用 ID 和令牌注册能力。
2. 开启空闲心跳。
3. 长轮询 claim。
4. active 时领取任务并创建 Attempt。
5. paused 时收到空响应，继续空闲心跳并按现有节奏重试。
6. draining 时完成当前任务，下一次 claim 返回空响应，状态自然变为 paused。
7. 令牌被撤销或节点硬禁用时记录明确错误并退出，让 Compose 保持容器状态可观察，避免无限高频鉴权重试。

Worker 不需要访问数据库，也不从 App 容器读取文件。

## 发布工作流

GitHub Actions 扩展为分别构建和推送 App、Worker：

```text
sakurajiamai/hentaiworkers-app
sakurajiamai/hentaiworkers-worker
```

两个镜像使用一致的标签策略：

- `latest`：默认分支最新成功构建。
- `main`：main 分支。
- Git SHA。
- 语义化版本标签。

构建缓存按 `app` 和 `worker` 分离，任一镜像构建失败都会使发布工作流失败。

## 故障处理

- App 未健康：Worker 不启动。
- Worker 缺少 ID、Token 或控制地址：进程立即失败并输出缺失字段，不进入空循环。
- 控制面不可达：Worker 输出连接错误并由运行循环进行有界退避；不得高频刷请求。
- 令牌无效、撤销或节点禁用：Worker 输出稳定错误码并退出。
- Worker 能力不匹配：任务保持 queued，控制面记录 `claimSkipReason`。
- Worker 暂停：任务保持 queued，不增加 Attempt 计数。
- Worker 崩溃：现有租约按控制面规则过期并重试，Compose 重启 Worker。

后台任务详情应展示 `progressJson.claimSkipReason`，避免能力不匹配时只看到 queued 而没有原因。

## 测试策略

### 部署合同

- 两份 Compose 都必须包含且仅包含 `app`、`worker` 两个服务。
- App 使用 App 镜像，Worker 使用 Worker 镜像。
- Worker 不得引用 `.env`、`DATABASE_URL`、数据库配置或 Docker Socket。
- Worker 必须启用只读根文件系统、tmpfs、cap drop 和 no-new-privileges。
- Worker 必须等待 App 健康。
- Docker 发布工作流必须构建并发布两个固定镜像。

### Worker 镜像合同

- `Dockerfile.worker` 使用非 root 用户。
- 安装 `requirements-worker.lock`。
- 入口命令为 `crawler_worker.main`。
- 镜像内容不包含 Node 运行时、应用 `.env` 或数据库迁移工具。

### 控制面测试

- active Worker 可以领取 queued 任务并创建 Attempt。
- paused Worker 返回空任务，不增加 Attempt。
- 暂停与 claim 并发时，暂停提交后不能产生新租约。
- draining Worker 可以完成当前任务，之后不领取新任务。
- 恢复后可领取原有 queued 任务。
- 轮换后旧令牌失败、新令牌成功。
- 撤销或硬禁用后鉴权失败。
- 任务详情展示能力不匹配原因。

### 回归验证

- 完整 TypeScript 测试。
- 完整 Python 测试。
- ESLint。
- TypeScript 类型检查。
- Next.js 生产构建。
- Compose 配置解析。
- Worker 依赖锁 dry-run。
- Docker Worker 镜像构建与非 root 启动检查。

## 验收标准

1. `docker compose up -d` 同时启动健康 App 和持续运行的 Worker。
2. Worker 页面在 90 秒内显示节点 online，能力包含 `ikun` 等 MacCMS 来源。
3. queued 的 iKun 任务被领取后 `attempts` 从 0 增加到 1，状态进入 leased/running。
4. 暂停节点后，新任务保持 queued 且 Attempt 不增加；当前任务仍可完成。
5. 恢复节点后，既有 queued 任务可被领取。
6. 轮换令牌后旧令牌立即失效，新令牌可以注册和心跳。
7. Worker 容器环境中不存在数据库连接变量。
8. App 和 Worker 镜像均由同一发布工作流生成并带一致标签。
9. 任务因能力不匹配保持 queued 时，后台显示具体原因。
10. 所有自动化验证通过，且不需要把 Docker Socket 暴露给 Web 应用。
