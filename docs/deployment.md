# 部署指南

## 1. 架构前提

| 组件 | 说明 |
|------|------|
| 应用 | Next.js standalone（Docker 镜像 `hentaiworkers-app`） |
| 数据库 | **远程 MySQL / MariaDB**（Compose **不**启动 db） |
| 爬虫 Worker | 可选镜像 `hentaiworkers-worker`（无 DB，只调控制面 API） |
| 端口 | 容器内 `3000`，默认映射 `127.0.0.1:3000` |

```
Internet → 反向代理 (TLS) → 127.0.0.1:3000 → app 容器
                                              ↓
                                         远程 MySQL
app ←—— 内网 ——→ crawler-worker（可选，Compose profile）
```

## 2. 环境变量

```bash
cp .env.example .env
# 编辑 .env，chmod 600 .env
```

| 变量 | 必填 | 说明 |
|------|------|------|
| `DATABASE_URL` | 是 | `mysql://USER:PASSWORD@HOST:3306/DATABASE`；密码中 `@` 写成 `%40` |
| `DATABASE_TLS_MODE` | 生产建议 | 远程库用 `required`；仅本机回环可 `disabled` |
| `SESSION_SECRET` | 是 | ≥ 32 字符随机串（会话 Cookie 加密） |
| `SITE_URL` | 建议 | 规范 URL，sitemap / canonical（如 `https://anime.example.com`） |
| `ADMIN_BOOTSTRAP_USER` | 首次 | `npm run seed:admin` 管理员用户名 |
| `ADMIN_BOOTSTRAP_PASSWORD` | 首次 | 引导密码（≥ 8） |
| `DOCKERHUB_USERNAME` | 拉镜像 | Compose `image:` 前缀，如 `myuser` |
| `APP_IMAGE_TAG` | 可选 | 默认 `latest` |
| `APP_HOST_BIND` | 可选 | 默认 `127.0.0.1`（勿对公网裸暴露） |
| `APP_PORT` | 可选 | 宿主机端口，默认 `3000` |
| `CRAWLER_WORKER_ID` | Worker | 默认 `1` |
| `CRAWLER_WORKER_TOKEN` | Worker | 机器令牌明文（服务端只存哈希） |

**切勿**把含真实密码的 `.env` 提交到 Git。

### 健康检查

| 路径 | 语义 |
|------|------|
| `/api/live` | 进程存活，无依赖（Compose healthcheck 用这个） |
| `/api/ready` | 含 DB `SELECT 1` |
| `/api/health` | 兼容旧探针 |

生产反向代理**必须**拒绝公网访问 `/api/internal/crawler/**`。

---

## 3. Docker Compose 部署（推荐）

根目录 `docker-compose.yml` 定义：

- **`app`**：主站 + 管理后台 + Worker 控制面 API  
- **`crawler-worker`**：可选，使用 Compose **profile `worker`**，默认不启动  

### 3.1 首次上线（本地构建）

```bash
# 1) 准备密钥
cp .env.example .env
# 填写 DATABASE_URL、SESSION_SECRET、SITE_URL 等

# 2) MySQL 白名单放行本机出口 IP

# 3)（可选）本机有 Node 时先灌管理员；也可进容器执行
npm ci
npm run seed:admin

# 4) 控制面 + 收藏表迁移（加法，可重复执行）
# 预览：
node scripts/apply-crawler-migration.mjs --dry-run
# 应用到远程库：
CRAWLER_MIGRATE_CONFIRM=yes npm run db:migrate:crawler
# 会创建 crawler_* 控制表 + user_favorites 等，并写入 schema_migrations

# 5) 构建并启动 app
docker compose up -d --build app

# 6) 检查
docker compose ps
curl -sS http://127.0.0.1:3000/api/live
curl -sS http://127.0.0.1:3000/api/ready
curl -sS http://127.0.0.1:3000/api/health
```

期望：`live` 返回 ok；`ready`/`health` 在 DB 可达时 `ok: true`。

### 3.2 使用 Docker Hub 预构建镜像

CI（`.github/workflows/docker-publish.yml`）在 `main` 推送后推送：

- `{DOCKERHUB_USERNAME}/hentaiworkers-app:latest`（及 `main` / commit sha）
- `{DOCKERHUB_USERNAME}/hentaiworkers-worker:latest`

部署机：

```bash
# .env 中设置与 Hub 一致的用户名
echo 'DOCKERHUB_USERNAME=yourhubuser' >> .env
# 可选：APP_IMAGE_TAG=main 或某次 commit sha

docker login   # 私有库需要
docker compose pull app
docker compose up -d app
```

仍会读本地 `Dockerfile` 作为 `build:` 回退；只 pull 时用：

```bash
docker compose up -d --no-build app
```

### 3.3 可选：启动爬虫 Worker

```bash
# .env
CRAWLER_WORKER_TOKEN=换成足够长的随机串
# 并在后台「爬虫 → Workers」登记同 ID + 令牌哈希后的 worker

docker compose --profile worker up -d --build
# 或仅 worker：
docker compose --profile worker up -d crawler-worker
```

Worker **不会**注入 `DATABASE_URL`，只访问 `http://app:3000/api/internal/crawler/v1`。

### 3.4 常用运维命令

```bash
docker compose logs -f app
docker compose logs -f crawler-worker   # 若启用
docker compose restart app
docker compose down                     # 停服务，不删远程库数据
docker compose up -d --build app        # 升级：拉代码后重建
```

### 3.5 反向代理（必须做 TLS）

将 `https://你的域名` 反代到 `127.0.0.1:3000`：

- 开启 HTTPS（Cookie `secure` 在 `NODE_ENV=production` 时生效）
- 禁止外网访问 `/api/internal/crawler/`
- 建议对 `/admin`、`/api` 做来源限制或限流
- WebSocket 非必须

Nginx 片段示例：

```nginx
location /api/internal/ {
  return 403;
}
location / {
  proxy_pass http://127.0.0.1:3000;
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto $scheme;
}
```

---

## 4. 镜像与构建说明

`Dockerfile` 多阶段：

1. `deps` — `npm ci`
2. `builder` — `next build`（`output: 'standalone'`），构建期占位 `DATABASE_URL` / `SESSION_SECRET`
3. `runner` — 非 root 用户运行 `node server.js`

**运行时**以 `env_file: .env` 为准，与构建占位无关。

`Dockerfile.worker`：Python + Chromium，无数据库客户端。

GitHub Actions 使用 Secrets：`DOCKERHUB_USERNAME`、`DOCKERHUB_TOKEN`。

---

## 5. 数据库迁移

| 迁移 | 内容 |
|------|------|
| `0001` / `0002` | 爬虫控制面表 |
| `0003` | `user_favorites`（前台收藏云同步） |

```bash
CRAWLER_MIGRATE_CONFIRM=yes npm run db:migrate:crawler
```

脚本拒绝 `DROP` / 对业务表 `ALTER`，可重复执行。

---

## 6. 无 Docker 的生产启动

```bash
npm ci
npm run build
NODE_ENV=production npm run start
# PORT=3000
```

建议用 systemd 保活。

---

## 7. 升级与回滚

```bash
git pull
# 如有新迁移
CRAWLER_MIGRATE_CONFIRM=yes npm run db:migrate:crawler
docker compose up -d --build app
# 或 pull 新镜像
docker compose pull app && docker compose up -d --no-build app
```

回滚：切换到上一 Git 标签/镜像 tag 后重新 `up`。  
数据在远程 MySQL，回滚应用**不会**自动回滚 schema。

---

## 8. 运维检查清单

- [ ] `.env` 权限仅部署用户可读（`chmod 600`）
- [ ] `SESSION_SECRET` 与开发环境不同
- [ ] 已执行迁移（含 `user_favorites`）
- [ ] `seed:admin` 或已有管理员；默认密码已改
- [ ] `/api/live`、`/api/ready` 正常
- [ ] 前台首页可加载；`/login` 可注册登录；收藏可写入
- [ ] `/admin/login` 可登录
- [ ] 公网无法访问 `/api/internal/crawler/**`
- [ ] `robots.txt` 禁止抓取 `/admin`（`app/robots.ts`）

---

## 9. 常见问题

| 现象 | 可能原因 | 处理 |
|------|----------|------|
| healthcheck 失败 | 旧 compose 用了 alpine 无 wget | 使用当前 compose（Node `fetch` 探测 `/api/live`） |
| `无法加载内容` / `ECONNRESET` | 远程库断开 | keep-alive + 重试；查白名单与库限流 |
| `SESSION_SECRET must be set` | 过短或未设置 | ≥ 32 字符 |
| 登录后 Cookie 丢失 | HTTP 生产环境 | 用 HTTPS；`secure` Cookie |
| Docker 构建 Type 错误 | 旧提交 | 拉最新 `main` 重建 |
| `CRAWLER_WORKER_TOKEN` 报错 | 启用了 worker profile 未设令牌 | 写入 `.env` 或不要 `--profile worker` |
| Hub pull 失败 | 未 login / 用户名错 | `docker login`；核对 `DOCKERHUB_USERNAME` |

---

## 10. 前台账号说明（与部署相关）

- 用户使用**邮箱 + 密码**注册/登录（邮箱存为 `users.username`）
- 收藏数据在表 `user_favorites`（迁移 `0003`）
- 管理员仍用后台 `/admin/login`（`role=admin`）；前台登录若为管理员会跳转后台

---

## 11. 相关文档

- [架构](./architecture.md)
- [后台手册](./admin-guide.md)
- [用户指南](./user-guide.md)
- [API](./api/README.md)
