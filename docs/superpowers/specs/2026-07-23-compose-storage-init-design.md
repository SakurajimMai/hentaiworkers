# Docker Compose 存储目录自动初始化设计

## 目标

生产服务器准备好 `docker-compose.yml`、`.env` 和 `worker.env` 后，只需执行：

```bash
docker compose up -d
```

Compose 自动创建并修正 `./crawler-worker-tmp` 与 `./covers` 的所有权和权限，不再要求宿主机手工执行 `mkdir`、`chown` 或 `chmod`。App 和 Worker 仍保持非 root 常驻运行。

## 初始化服务

新增一次性 `storage-init` 服务，复用公开 Worker 镜像，不增加第三种镜像：

- 以容器 root（`0:0`）启动。
- 绑定与 Worker 相同的两个宿主机相对目录。
- 将临时目录设置为 `0700`，封面目录设置为 `0755`。
- 将两个目录的所有者设置为 Worker 的 UID/GID `10001:10001`。
- 成功后退出，`restart: "no"`。

初始化只修改两个挂载点的根目录，不递归扫描封面文件，避免每次启动随着封面数量增长而变慢。Worker 后续创建的子目录与文件分别使用 `0755` 和 `0644`。

## 权限边界

`storage-init` 不加载 `.env` 或 `worker.env`，不获得数据库、Session、Worker 令牌、Docker Socket 或网络端口。服务设置 `network_mode: none`，根文件系统保持只读，仅两个 bind mount 可写。

容器默认丢弃全部 Linux capabilities，只重新增加初始化所需的：

- `CHOWN`：修改目录所有者。
- `FOWNER`：已有目录归 UID 10001 时仍可重新应用权限。
- `DAC_OVERRIDE`：恢复权限异常的既有挂载点。

`no-new-privileges:true` 保持启用。初始化完成后，App 继续使用只读封面挂载，Worker 继续以 Dockerfile 中的 `crawler:crawler`（UID/GID 10001）运行，不把常驻 Worker 改成 root。

## 启动顺序

App 新增：

```yaml
depends_on:
  storage-init:
    condition: service_completed_successfully
```

Worker 保持等待 App 健康。完整顺序为：

```text
storage-init 成功退出 -> App 健康 -> Worker 启动
```

初始化失败时 App 和 Worker 都不会启动，`docker compose logs storage-init` 能直接显示权限错误，避免 Worker 启动后才因 `PermissionError` 崩溃。

## 部署行为

首次部署仍需创建 `.env` 和 `worker.env`，因为它们包含应用配置和后台签发的一次性 Worker 身份。目录权限不再属于人工部署步骤。

启动、升级和重建统一使用：

```bash
docker compose up -d
```

Compose 中的 `pull_policy: always` 会拉取所需公开镜像。`storage-init` 在每次 `up` 时重新运行且应幂等；已经正确的目录不会影响现有封面内容。

## 验证

部署合同测试同时验证根目录与 `deploy/` 两份 Compose：

1. 服务顺序包含 `storage-init`、`app`、`worker`。
2. 初始化服务使用 Worker 镜像、root 用户、只读根文件系统和最小 capabilities。
3. 初始化服务不加载任何 env 文件、不发布端口、不挂载 Docker Socket且没有容器网络。
4. 两个 bind mount 与权限命令完全一致。
5. App 等待初始化成功，Worker 等待 App 健康。
6. 部署文档只要求 `docker compose up -d`，不再要求手工目录权限命令。

按用户要求不在本地执行 Docker Compose；使用 YAML 解析测试、静态安全断言和现有全量测试验证。
