# Docker Hub 双运行时容器部署

本目录是生产服务器的最小部署清单。Compose 运行两个相互隔离的长驻服务，并在启动前执行一次性 `storage-init` 目录初始化：

- `app`：Next.js 控制面和站点，使用 `.env` 连接外部 MariaDB。
- `worker`：Python 采集进程，只使用 `worker.env` 调用内部控制面 API。

数据库、迁移任务和 Docker Socket 都不在 Compose 中。Worker 不得获得 `DATABASE_URL`、`SESSION_SECRET` 或应用密钥环。

## 前提

远程数据库必须提前具备与镜像匹配的 schema、管理员账号、服务器出口 IP 白名单和可信 TLS 证书链。升级本版本前，通过受控迁移流程应用 `0017-crawler-worker-claim-control.sql`；Compose 不自动迁移或 seed。

## 1. 准备文件

```bash
mkdir -p /opt/anime-web
cd /opt/anime-web
```

目录中需要：

```text
docker-compose.yml
.env
worker.env
```

从示例创建两个权限受限的配置文件：

```bash
cp .env.example .env
cp worker.env.example worker.env
```

`storage-init` 会自动创建并修正所有权和权限：`crawler-worker-tmp` 使用 `0700`，`covers` 使用 `0755`，两者均归 UID/GID `10001:10001` 所有。`crawler-worker-tmp` 是相对于本 Compose 目录的 Worker 工作目录，会绑定到容器内 `/tmp/crawler-worker`。

本地封面由 Worker 通过 `./covers:/data/covers` 写入，App 通过 `./covers:/data/covers:ro` 只读。勾选“下载并保存封面”后，图片由 `/api/media/covers/...` 路由提供；`SITE_URL` 用于生成数据库中的完整封面 URL，必须填写用户实际访问的 HTTPS 域名。`covers` 使用 `755` 是为了让 App 的非 root 用户能够读取 Worker 以 `644` 创建的图片。

`.env` 只配置 App：

```env
APP_HOST_BIND=127.0.0.1
APP_PORT=13000
DATABASE_URL=mysql://USER:PASSWORD@HOST:3306/DATABASE
DATABASE_TLS_MODE=required
SITE_URL=https://你的域名
SESSION_SECRET=使用-openssl-rand-base64-48-生成
APP_ENCRYPTION_KEYRING={"primary":"使用-openssl-rand-base64-32-生成"}
APP_ENCRYPTION_CURRENT_KEY_ID=primary
```

先保留空的 `worker.env`，不要写入任何数据库或 App 密钥。

## 2. 启动全部服务

```bash
docker compose up -d
curl -sS "http://127.0.0.1:${APP_PORT:-3000}/api/live"
curl -sS "http://127.0.0.1:${APP_PORT:-3000}/api/ready"
```

Compose 的 `pull_policy: always` 会自动拉取镜像。`storage-init` 成功退出后启动 App，Worker 再等待 App 健康。正常部署只需上述一条启动命令，前提是 `.env` 和有效的 `worker.env` 已准备完成。

首次部署还没有令牌时，先执行 `docker compose up -d` 使 App 可用，登录 `/admin/crawler/workers` 创建节点。后台只显示一次 Worker ID 和令牌，将它们写入 `worker.env`：

```env
CRAWLER_WORKER_ID=1
CRAWLER_WORKER_TOKEN=后台本次显示的一次性令牌
CRAWLER_WORKER_VERSION=1.0.0
```

MacCMS 外链采集（如 iKun）不需要存储凭据。Hanime 上传到 S3/SFTP 时，再按已启用的存储驱动给 Worker 增加对应最小权限凭据。

写入令牌后再次执行同一条命令：

```bash
docker compose up -d
```

## 3. 检查服务

```bash
docker compose ps -a
docker compose logs --tail=100 worker
```

`storage-init` 显示 `Exited (0)` 是正常状态；如果初始化失败，使用 `docker compose logs storage-init` 查看目录权限错误。Worker 等待 App `/api/live` 健康后启动，不发布端口。后台应在 90 秒内显示 `online · active`，能力来源中包含 `ikun`。queued 任务被领取后，attempts 会从 0 增加。

## 4. 节点控制

- 暂停领取：不再领取新任务，当前任务继续执行。
- draining：已暂停但当前负载大于 0，完成后自然变为 paused。
- 恢复领取：重新领取原有 queued 任务。
- 轮换令牌：旧令牌立即失效，新令牌只显示一次；更新 `worker.env` 后重建 Worker 容器。
- 撤销令牌：后续 API 请求立即被拒绝。
- 硬禁用：紧急操作，可能中断当前任务；常规维护应先暂停并排空。

更新 `worker.env` 后执行：

```bash
docker compose up -d --force-recreate worker
```

## 5. 升级与反向代理

确认数据库迁移已应用后：

```bash
docker compose up -d
```

升级和容器重建不会删除宿主机 `./covers`；该目录是持久数据，不要随镜像或临时目录一起清理。

反向代理只指向 `127.0.0.1:${APP_PORT}`。必须使用 HTTPS，并阻止公网访问 `/api/internal/crawler/**`；Worker 通过 Compose 内网地址 `http://app:3000` 访问该路径。
