# 部署指南

## 1. 架构前提

- 应用：Next.js standalone（Docker 镜像）
- 数据库：**远程 MySQL**（Compose 不启动 db）
- 端口：容器内 `3000`，可映射到宿主机

## 2. 环境变量

复制模板：

```bash
cp .env.example .env
```

| 变量 | 必填 | 说明 |
|------|------|------|
| `DATABASE_URL` | 是 | `mysql://USER:PASSWORD@HOST:3306/DATABASE`；密码中 `@` 写成 `%40` |
| `SESSION_SECRET` | 是 | ≥ 32 字符随机串，用于会话加密 |
| `SITE_URL` | 建议 | 站点规范 URL，用于 sitemap / canonical（如 `https://anime.ixacg.top`） |
| `ADMIN_BOOTSTRAP_USER` | 首次 | `npm run seed:admin` 引导管理员用户名 |
| `ADMIN_BOOTSTRAP_PASSWORD` | 首次 | 引导管理员密码（≥ 8） |
| `CRAWLER_WORKER_ID` | Worker | Compose `crawler-worker` 身份 |
| `CRAWLER_WORKER_TOKEN` | Worker | 机器令牌明文（服务端只存哈希） |

### 健康检查

| 路径 | 语义 |
|------|------|
| `/api/live` | 进程存活，无依赖 |
| `/api/ready` | 依赖就绪（含 DB `SELECT 1`，需 `DATABASE_URL`） |
| `/api/health` | 兼容旧探针 |

Compose 默认探测 `/api/live`。生产反向代理**必须**拒绝公网访问 `/api/internal/crawler/**`。

### Worker 服务

```bash
# .env 中设置 CRAWLER_WORKER_TOKEN 后
docker compose up -d --build app crawler-worker
```

Worker 仅收到控制面 URL / ID / token，**不得**注入 `DATABASE_URL`。镜像见 `Dockerfile.worker`。

### 控制面迁移（MariaDB）

加法迁移（不修改 animes/tags/users 等业务表）：

```bash
# 预览
node scripts/apply-crawler-migration.mjs --dry-run

# 远程库需确认
CRAWLER_MIGRATE_CONFIRM=yes npm run db:migrate:crawler
```

会创建 18 张控制表 + `schema_migrations` 记录。可重复执行（`CREATE IF NOT EXISTS` + checksum）。

DDL 使用 `CURRENT_TIMESTAMP`，并在会话中 `SET time_zone = '+00:00'`（兼容不支持 `DEFAULT UTC_TIMESTAMP()` 的 MariaDB）。

### 遗留爬虫切流

1. 确认新控制面与 `crawler_worker` 可用。
2. 若历史上有**独立**爬虫 MySQL 账号（与 `DATABASE_URL` 用户不同）：

```bash
CRAWLER_DB_USER=legacy_crawler_user CRAWLER_DB_HOST=% node scripts/revoke-legacy-crawler-db.mjs
```

3. 若爬虫与应用共用同一用户（本仓库默认情况）：**不要** DROP 该用户；直写脚本已删除，`scripts/production_config.yml` 中 database 凭据应为空。
4. `npm run check:legacy` 会阻止 `production_crawler.py` / `unified_crawler.py` / `crawler_config.py` 回流。

### DATABASE_URL 示例

```env
# 密码为 507877550@lihao 时：
DATABASE_URL=mysql://user:507877550%40lihao@db.example.com:3306/dbname
```

**切勿**将含真实密码的 `.env` 提交到 Git。

## 3. 首次上线步骤

### 3.1 网络

确认 MySQL 白名单放行**部署服务器出口 IP**。

### 3.2 初始化管理员

在能访问 MySQL 的机器上（通常即部署机源码目录）：

```bash
npm ci
# 确保 .env 已配置
npm run seed:admin
```

若库中已有 `role=admin` 用户，脚本会跳过创建。

### 3.3 启动容器

```bash
docker compose up -d --build
```

检查：

```bash
docker compose ps
curl -s http://127.0.0.1:3000/api/health
```

期望 `{"ok":true,"database":"mysql",...}`。

### 3.4 反向代理（可选）

将 `https://你的域名` 反代到 `127.0.0.1:3000`，并配置：

- TLS 证书
- WebSocket 非必须（本站 API 为普通 HTTP）
- 建议限制 `/admin` 来源 IP 或增加额外鉴权层
- 建议对 `/api` 做基础速率限制

## 4. Docker 说明

### 服务定义

见根目录 `docker-compose.yml`：

- `build: .`
- `ports: "3000:3000"`
- `env_file: .env`
- healthcheck：`GET /api/health`

### 镜像构建

`Dockerfile` 多阶段：

1. `deps` — `npm ci`
2. `builder` — `next build`（`output: 'standalone'`）
3. `runner` — 仅运行 `node server.js`

构建时会注入占位 `DATABASE_URL` / `SESSION_SECRET` 以满足编译；**运行时以 `env_file` 为准**。

## 5. 无 Docker 的生产启动

```bash
npm ci
npm run build
npm run start
# 默认 3000；可用 PORT=3000
```

建议用 systemd 或 process manager 保活。

## 6. 升级与回滚

```bash
git pull
docker compose up -d --build
```

回滚：切换到上一 Git 标签/提交后重新 `docker compose up -d --build`。

数据在远程 MySQL，回滚应用**不会**自动回滚数据库 schema。若执行过 `db:push` 等破坏性变更，需另行备份恢复。

## 7. 运维检查清单

- [ ] `.env` 权限仅部署用户可读
- [ ] `SESSION_SECRET` 与开发环境不同
- [ ] 默认引导密码已修改（后台「账户」或用户管理）
- [ ] `/api/health` 返回 `ok: true`
- [ ] 前台首页可加载列表
- [ ] `/admin/login` 可登录
- [ ] MySQL 连接空闲断开时，应用重试后可恢复（见架构文档可靠性章节）
- [ ] `robots.txt` 已禁止抓取 `/admin`（`app/robots.ts`）

## 8. 常见问题

| 现象 | 可能原因 | 处理 |
|------|----------|------|
| `无法加载内容` / `ECONNRESET` | 远程库断开空闲连接 | 已实现 keep-alive + 重试；检查白名单与库侧限流 |
| `SESSION_SECRET must be set...` | 密钥过短或未设置 | 使用 ≥ 32 字符 |
| 登录后仍回登录页 | Cookie 域名/HTTPS 不一致 | 生产用 HTTPS，检查 `secure` Cookie |
| `seed:admin` 无效果 | 已有 admin | 直接登录或在后台重置密码 |
| 构建时无数据 | 正常 | 构建不连生产库；运行时读 `.env` |

## 9. 相关文档

- [架构](./architecture.md)
- [后台手册](./admin-guide.md)
- [API](./api/README.md)
