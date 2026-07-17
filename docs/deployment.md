# 部署指南

面向 **生产服务器** 的 Docker Compose 部署。数据库使用**远程 MySQL / MariaDB**（Compose **不**启动数据库容器）。

---

## 1. 架构前提

| 组件 | 说明 |
|------|------|
| **app** | Next.js standalone：前台 + 管理后台 + 公开 API + Worker 控制面 |
| **数据库** | 远程 MySQL 8+ / MariaDB 10.6+（需本机出口 IP 白名单） |
| **crawler-worker** | 可选；Compose profile `worker`，无 DB 凭据，只调内网控制面 |
| **端口** | 容器内固定 `3000`；宿主机由 `APP_PORT` 映射（默认 `127.0.0.1:3000`，可改为 `13000` 等；须反代 TLS，勿裸暴露公网） |

```
Internet → 反向代理 (HTTPS) → 127.0.0.1:${APP_PORT:-3000} → app 容器 :3000
                                                 ↓
                                            远程 MySQL
app ←—— Compose 内网 ——→ crawler-worker（可选 profile）
```

镜像名：

- App：`{DOCKERHUB_USERNAME}/hentaiworkers-app:{APP_IMAGE_TAG}`
- Worker：`{DOCKERHUB_USERNAME}/hentaiworkers-worker:{WORKER_IMAGE_TAG}`

本地未设置 `DOCKERHUB_USERNAME` 时前缀为 `local/`，走 `build:` 构建。

---

## 2. 服务器准备

| 项 | 要求 |
|----|------|
| 系统 | Linux x86_64（推荐 Ubuntu 22.04+ / Debian 12+） |
| Docker | Docker Engine 24+ 与 Docker Compose v2（`docker compose`） |
| 内存 | 仅 app：建议 ≥ 1 GB；启用 Worker：建议 ≥ 2 GB |
| 磁盘 | app 镜像 + 日志预留 ≥ 5 GB；Worker 临时目录另计 |
| 网络 | 可访问远程 MySQL；拉镜像需访问 Docker Hub（或私有仓库） |
| 域名 / TLS | 生产必须 HTTPS（会话 Cookie `secure`） |

```bash
# 示例：安装 Docker（以官方文档为准）
# https://docs.docker.com/engine/install/

docker version
docker compose version
```

将仓库放到服务器（`git clone` 或 rsync 发布包），后续命令均在**仓库根目录**执行。

---

## 3. 环境变量

```bash
cp .env.example .env
chmod 600 .env
# 用编辑器填写下方必填项
```

### 3.1 必填

| 变量 | 说明 |
|------|------|
| `DATABASE_URL` | `mysql://USER:PASSWORD@HOST:3306/DATABASE`；密码中 `@` → `%40`，`#` → `%23` 等 |
| `DATABASE_TLS_MODE` | 远程库生产用 `required`；仅本机回环库可用 `disabled` |
| `SESSION_SECRET` | **≥ 32** 字符强随机串（会话 Cookie 加密） |
| `APP_ENCRYPTION_KEYRING` | AES-256-GCM 密钥环 JSON；每个密钥为 **32 字节** 的规范 Base64 |
| `APP_ENCRYPTION_CURRENT_KEY_ID` | 当前加密密钥 ID（须存在于 keyring，默认 `primary`） |
| `SITE_URL` | 公网规范 URL，如 `https://anime.example.com`（sitemap / canonical） |

生成密钥示例：

```bash
# 会话密钥
openssl rand -base64 48

# 应用加密主密钥（32 字节 → Base64）
openssl rand -base64 32
```

`.env` 中 keyring 写法示例（把 `REPLACE_WITH_OPENSSL_OUTPUT` 换成上一步输出，**不要**用示例占位值上线）：

```bash
APP_ENCRYPTION_KEYRING={"primary":"REPLACE_WITH_OPENSSL_OUTPUT"}
APP_ENCRYPTION_CURRENT_KEY_ID=primary
```

### 3.2 首次管理员（本机或一次性容器执行 seed）

| 变量 | 说明 |
|------|------|
| `ADMIN_BOOTSTRAP_USER` | 首次管理员登录邮箱；运行 seed 时必填，不提供默认账号 |
| `ADMIN_BOOTSTRAP_PASSWORD` | ≥ 12 位随机密码；运行 seed 时必填，**上线后立刻在后台改密** |

### 3.3 Docker / 端口（可选）

| 变量 | 默认 | 说明 |
|------|------|------|
| `DOCKERHUB_USERNAME` | `local` | Hub 命名空间；本地构建可省略 |
| `APP_IMAGE_TAG` | `latest` | App 镜像标签 |
| `WORKER_IMAGE_TAG` | `latest` | Worker 镜像标签 |
| `APP_HOST_BIND` | `127.0.0.1` | 宿主机绑定地址；**勿**改为 `0.0.0.0` 除非已有防火墙与反代策略 |
| `APP_PORT` | `3000` | **仅宿主机**发布端口。容器内仍为 `3000`。可设为 `13000` 等任意空闲端口；反代/健康检查请对齐该值 |

### 3.4 可选 Worker

| 变量 | 说明 |
|------|------|
| `CRAWLER_WORKER_ID` | 后台签发的 Worker 节点 ID（默认 `1`） |
| `CRAWLER_WORKER_TOKEN` | 机器令牌**明文**（服务端只存哈希；启用 profile 时必填） |

Hanime 上传到 S3/SFTP 时，密钥**只放 Worker 环境**，不入库：

| 变量 | 说明 |
|------|------|
| `CRAWLER_S3_ACCESS_KEY_ID` / `CRAWLER_S3_SECRET_ACCESS_KEY` | S3 |
| `CRAWLER_S3_SESSION_TOKEN` | 可选临时会话 |
| `CRAWLER_SFTP_PASSWORD` 或 `CRAWLER_SFTP_PRIVATE_KEY` | SFTP |
| `CRAWLER_STORAGE_DRIVERS` | 可选覆盖，如 `s3,sftp` |

### 3.5 连接池（可选）

见 `.env.example`：`DATABASE_POOL_*`、`DATABASE_CONNECT_TIMEOUT_MS`、`DATABASE_TLS_CA_FILE`。

**切勿**把含真实密码的 `.env` 提交到 Git。

---

## 4. 数据库迁移

迁移目录：`drizzle/migrations/`（`0001`–`0016`）与全新核心 `drizzle/core/0001-crawler-core.sql`。

| 场景 | 命令 |
|------|------|
| **全新空库** | `CRAWLER_MIGRATE_CONFIRM=yes npm run db:setup:crawler` |
| **已有库 / 升级** | `CRAWLER_MIGRATE_CONFIRM=yes npm run db:migrate:crawler` |
| 旧 19 表审计 | `CRAWLER_MIGRATE_CONFIRM=yes npm run db:compact:crawler` |
| 确认后删遗留表 | 额外 `CRAWLER_COMPACT_CONFIRM=drop-legacy-tables`（先备份） |

非本机数据库**必须**设置 `CRAWLER_MIGRATE_CONFIRM=yes`，否则脚本拒绝执行。

### 4.1 迁移覆盖（摘要）

| 编号 | 内容 |
|------|------|
| 核心 / 0001–0002 / 0005 | 爬虫控制面 |
| 0003 | 历史收藏表（仅回填） |
| 0004 | 系统设置（SMTP / Turnstile 等） |
| 0006–0008 | 观看进度、片单、系统片单唯一 |
| 0009 | `session_version`（改密踢会话） |
| 0010–0013 | `anime_works` 外链、线路、标签、演职 |
| 0014–0016 | 存储配置、媒体预留、调度绑定存储 |

### 4.2 在服务器上跑迁移的两种方式

**方式 A — 本机有 Node 22+（推荐运维机 / 跳板）：**

```bash
# 需已安装 Node 22+ 与 npm；使用与生产相同的 .env
npm ci
node scripts/apply-crawler-migration.mjs --dry-run   # 或 setup-crawler-core.mjs
CRAWLER_MIGRATE_CONFIRM=yes npm run db:migrate:crawler
npm run seed:admin
```

**方式 B — 服务器仅有 Docker（一次性 Node 容器）：**

```bash
docker run --rm -it \
  --env-file .env \
  -v "$PWD":/app -w /app \
  node:22-bookworm \
  bash -lc 'npm ci && CRAWLER_MIGRATE_CONFIRM=yes npm run db:migrate:crawler && npm run seed:admin'
```

全新库把 `db:migrate:crawler` 换成 `db:setup:crawler`。

---

## 5. Docker Compose 部署（推荐）

根目录 [`docker-compose.yml`](../docker-compose.yml)：

- **`app`**：主站（默认启动）
- **`crawler-worker`**：profile `worker`，默认不启动

### 5.1 首次上线（服务器本地构建）

```bash
cd /path/to/anime-web

cp .env.example .env
chmod 600 .env
# 编辑 DATABASE_URL / SESSION_SECRET / APP_ENCRYPTION_* / SITE_URL / ADMIN_BOOTSTRAP_*

# 1) 远程 MySQL：放行本机出口 IP；建好空库与账号

# 2) 迁移 + 管理员（见第 4 节方式 A 或 B）
# CRAWLER_MIGRATE_CONFIRM=yes npm run db:setup:crawler   # 或 db:migrate:crawler
# npm run seed:admin

# 3) 构建并启动 app
# 可选：.env 中设置 APP_PORT=13000 将宿主机端口改为 13000（容器内仍 3000）
docker compose up -d --build app

# 4) 健康检查（端口与 APP_PORT 一致，默认 3000）
docker compose ps
curl -sS "http://127.0.0.1:${APP_PORT:-3000}/api/live"
curl -sS "http://127.0.0.1:${APP_PORT:-3000}/api/ready"
# live → 进程 OK；ready → 含 DB SELECT 1，应 ok: true
```

### 5.2 使用预构建镜像（Docker Hub / CI）

CI 推送标签：`latest` / `main` / commit sha（见 `.github/workflows/docker-publish.yml`）。

```bash
# .env
DOCKERHUB_USERNAME=yourhubuser
APP_IMAGE_TAG=latest          # 或 main / 具体 sha
# WORKER_IMAGE_TAG=latest

docker login                  # 私有库需要
docker compose pull app
docker compose up -d --no-build app
```

未配置 Hub 时 Compose 仍可用 `build:` 本地构建。

### 5.3 可选：爬虫 Worker

1. 先保证 **app 健康**。
2. 浏览器登录 `/admin` → **爬虫 → Worker** → 创建节点，复制**一次性**机器令牌。
3. 写入 `.env`：

```bash
CRAWLER_WORKER_ID=后台显示的数字 ID
CRAWLER_WORKER_TOKEN=一次性令牌明文
```

4. 准备相对路径 bind mount 目录并启动：

```bash
mkdir -p data/crawler-worker
docker compose --profile worker up -d --build
# 或仅 worker：
docker compose --profile worker up -d crawler-worker
```

Worker 环境：

- `CRAWLER_CONTROL_URL=http://app:3000/api/internal/crawler/v1`（Compose 已写死内网）
- **不会**注入 `DATABASE_URL`
- 临时目录使用**相对路径 bind mount**（非 named volume）：`./data/crawler-worker` → `/var/tmp/crawler-worker`
- 目录在仓库根下，已由 `.gitignore` 忽略；Compose 也可在缺失时自动创建宿主机路径

本机开发也可用：

```bash
npm run worker:provision   # → .crawler-worker.env（gitignore）
npm run worker:start
```

### 5.4 常用运维命令

```bash
docker compose logs -f app
docker compose logs -f crawler-worker   # 若启用
docker compose ps
docker compose restart app
docker compose down                     # 停容器；远程库数据保留
docker compose up -d --build app        # 拉代码后重建升级
docker compose pull app && docker compose up -d --no-build app
```

### 5.5 资源与安全（Compose 已部分加固）

Worker 默认：`read_only`、`no-new-privileges`、`cap_drop: ALL`、`pids_limit`、`mem_limit`、`cpus`。  
App 以非 root 用户跑 Next standalone。

生产反向代理**必须**拒绝公网访问：

```text
/api/internal/crawler/**
```

---

## 6. 反向代理与 TLS（必须）

将 `https://你的域名` 反代到 `127.0.0.1:${APP_PORT}`（默认 `3000`；若 `.env` 写了 `APP_PORT=13000` 则反代到 `13000`）。

要点：

- 开启 HTTPS（生产 `NODE_ENV=production` 时 Cookie `secure`）
- 禁止外网访问 `/api/internal/crawler/`
- 建议对 `/admin`、`/api` 做来源限制或限流
- 传递 `Host`、`X-Forwarded-For`、`X-Forwarded-Proto`
- WebSocket **非必须**（当前播放不依赖）
- 反代 upstream **只跟宿主机 `APP_PORT` 对齐**；不要改容器内 `PORT=3000`

### Nginx 示例

```nginx
server {
  listen 443 ssl http2;
  server_name anime.example.com;

  # ssl_certificate     /path/fullchain.pem;
  # ssl_certificate_key /path/privkey.pem;

  client_max_body_size 20m;

  location /api/internal/ {
    return 403;
  }

  location / {
    # 与 .env 的 APP_PORT 一致：默认 3000；若 APP_PORT=13000 则改为 13000
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 300s;
  }
}
```

### Caddy 示例

```caddy
anime.example.com {
  @internal path /api/internal/*
  respond @internal 403

  # 与 .env 的 APP_PORT 一致：默认 3000；若 APP_PORT=13000 则改为 13000
  reverse_proxy 127.0.0.1:3000
}
```

将 `.env` 中 `SITE_URL` 设为与证书域名一致的 `https://...`。

---

## 7. 镜像构建说明

`Dockerfile` 多阶段：

1. `deps` — `npm ci`
2. `builder` — `next build`（`output: 'standalone'`），构建期占位 `DATABASE_URL` / `SESSION_SECRET`
3. `runner` — 非 root，`node server.js`

**运行时**以 `env_file: .env` 为准，与构建占位无关。

`Dockerfile.worker`：Python + Chromium 运行时，**无**数据库客户端；Hanime 为 **MP4 直传**，镜像**不含** ffmpeg。

GitHub Actions Secrets：`DOCKERHUB_USERNAME`、`DOCKERHUB_TOKEN`。

---

## 8. 无 Docker 的生产启动

```bash
npm ci
npm run build
NODE_ENV=production npm run start
# 默认 PORT=3000；可用反向代理同样拦截 /api/internal/
```

建议 systemd 保活，并单独进程跑 Worker（`npm run worker:start`）。

---

## 9. 升级与回滚

```bash
git pull   # 或拉取新镜像 tag

# 有新 SQL 时（先 dry-run 再确认）
node scripts/apply-crawler-migration.mjs --dry-run
CRAWLER_MIGRATE_CONFIRM=yes npm run db:migrate:crawler

docker compose up -d --build app
# 或
docker compose pull app && docker compose up -d --no-build app

# Worker 同步升级（若使用）
docker compose --profile worker up -d --build crawler-worker
```

回滚：切换到上一 Git 标签或镜像 tag 后重新 `up`。  
**数据在远程 MySQL**，回滚应用**不会**自动回滚 schema；破坏性迁移前务必备份。

---

## 10. 上线后配置清单

应用起来后建议按序配置：

1. **改管理员密码**：`/admin/account`
2. **系统设置** `/admin/settings`  
   - 注册开关 / 邮箱白名单 / SMTP / Turnstile  
   - **播放器**：线路解析、片头/暂停广告、右键、动漫 ArtPlayer 回退
3. **（动漫采集）** Worker 在线 → `npm run seed:maccms-profiles` 或后台建模板 → 勾选分类 → 任务/调度  
4. **（里番 Hanime）** `/admin/crawler/storage` 配置 S3/SFTP → 测试通过并激活 → 模板绑定存储；Worker 环境注入对象存储密钥  
5. 前台冒烟：`/`、`/browse`、`/works`、注册登录、片单、播放

MacCMS 写入 `anime_works`（外链 only）；Hanime 写入 `animes` 并上传 MP4 到对象存储。详见 [admin-guide.md](./admin-guide.md)。

---

## 11. 健康检查与探针

| 路径 | 语义 |
|------|------|
| `GET /api/live` | 进程存活，无 DB（Compose healthcheck） |
| `GET /api/ready` | 含 `SELECT 1` |
| `GET /api/health` | 兼容旧探针 |

---

## 12. 运维检查清单

- [ ] `.env` 权限 `chmod 600`，未进 Git
- [ ] `SESSION_SECRET`、`APP_ENCRYPTION_KEYRING` 为生产随机值（非示例）
- [ ] `DATABASE_TLS_MODE=required`（远程库）
- [ ] 迁移已执行至当前最新（含 `0010`–`0016` 若使用动漫/存储）
- [ ] `seed:admin` 完成且一次性引导密码已改
- [ ] `curl` live / ready 正常
- [ ] HTTPS 反代生效；`SITE_URL` 与域名一致
- [ ] 公网 **403** `/api/internal/crawler/**`
- [ ] 前台首页、登录、片单可写
- [ ] `/admin/login` 可登录
- [ ] （可选）Worker 已上报 sources（`ikun` / `hanime` 等）
- [ ] （可选）Worker 使用相对路径 bind mount：`./data/crawler-worker` 已存在且可写
- [ ] `robots.txt` 禁止抓取 `/admin`

---

## 13. 常见问题

| 现象 | 可能原因 | 处理 |
|------|----------|------|
| healthcheck 失败 | 启动未完成 / 端口错 | 看 `docker compose logs app`；确认 `start_period` |
| 本机访问端口不通 | `APP_PORT` 与 curl/反代不一致 | 用 `127.0.0.1:$APP_PORT`；`docker compose ps` 看 `0.0.0.0:13000->3000/tcp` 一类映射 |
| 宿主机 3000 被占用 | 默认 `APP_PORT=3000` 冲突 | `.env` 设 `APP_PORT=13000`（或其它空闲端口）后 `docker compose up -d app` |
| ready 失败 | DB 不可达、TLS、白名单 | 查 `DATABASE_URL`、云厂商 IP 白名单、`DATABASE_TLS_MODE` |
| `SESSION_SECRET must be set` | 过短或未设置 | ≥ 32 字符 |
| 加密 / keyring 报错 | `APP_ENCRYPTION_*` 非法 | 用 `openssl rand -base64 32` 生成 32 字节密钥 |
| 登录后 Cookie 丢失 | 生产用 HTTP | 上 HTTPS；检查 `X-Forwarded-Proto` |
| `CRAWLER_WORKER_TOKEN` 报错 | 开了 worker profile 未设令牌 | 写入 `.env` 或不要 `--profile worker` |
| Worker 临时目录权限错误 | 相对 bind mount 目录不存在或不可写 | `mkdir -p data/crawler-worker`；检查宿主机目录属主/权限 |
| Hub pull 失败 | 未 login / 用户名错 | `docker login`；核对 `DOCKERHUB_USERNAME` |
| 动漫 m3u8 证书错误 | 源站证书过期 | 配置线路解析或 ArtPlayer 代理回退 |
| 迁移被拒 | 未设确认变量 | `CRAWLER_MIGRATE_CONFIRM=yes` |
| Worker 领不到任务 | 能力/source 不匹配 | 查模板 `requiredSource` 与 Worker 上报 sources |

---

## 14. 前台账号与数据说明（与部署相关）

- 用户：**邮箱 + 密码**（邮箱存 `users.username`）
- 片单：`user_lists` / `user_list_items`；`user_favorites` 仅历史回填
- 观看进度：`user_watch_progress`；游客 localStorage，登录 merge
- 改密/重置提升 `session_version`，旧 Cookie 失效
- 管理员：`role=admin`，入口 `/admin/login`

---

## 15. 相关文档

- [架构](./architecture.md)
- [后台手册](./admin-guide.md)
- [用户指南](./user-guide.md)
- [开发指南](./development.md)
- [API](./api/README.md)
- 环境模板：[.env.example](../.env.example)
- Compose：[docker-compose.yml](../docker-compose.yml)
