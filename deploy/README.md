# Docker Hub 双容器部署

本目录是生产服务器的最小部署清单。Compose 启动两个相互隔离的服务：

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
chmod 600 .env worker.env
```

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

## 2. 启动 App 并创建 Worker 身份

```bash
docker compose pull app worker
docker compose up -d app
curl -sS "http://127.0.0.1:${APP_PORT:-3000}/api/live"
curl -sS "http://127.0.0.1:${APP_PORT:-3000}/api/ready"
```

登录 `/admin/crawler/workers` 创建节点。后台只显示一次 Worker ID 和令牌，将它们写入 `worker.env`：

```env
CRAWLER_WORKER_ID=1
CRAWLER_WORKER_TOKEN=后台本次显示的一次性令牌
CRAWLER_WORKER_VERSION=1.0.0
```

MacCMS 外链采集（如 iKun）不需要存储凭据。Hanime 上传到 S3/SFTP 时，再按已启用的存储驱动给 Worker 增加对应最小权限凭据。

## 3. 启动并检查 Worker

```bash
docker compose up -d worker
docker compose ps
docker compose logs --tail=100 worker
```

Worker 等待 App `/api/live` 健康后启动，不发布端口。后台应在 90 秒内显示 `online · active`，能力来源中包含 `ikun`。queued 任务被领取后，attempts 会从 0 增加。

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
docker compose pull app worker
docker compose up -d --no-build
```

反向代理只指向 `127.0.0.1:${APP_PORT}`。必须使用 HTTPS，并阻止公网访问 `/api/internal/crawler/**`；Worker 通过 Compose 内网地址 `http://app:3000` 访问该路径。
