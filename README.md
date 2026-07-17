# AnimeStream

Next.js 全栈动漫视频站：公网站点 + 管理后台 + REST API，对接**远程 MySQL**，支持 **Docker Compose** 部署。

> 完整文档请见 **[docs/README.md](./docs/README.md)**（架构 · API · 部署 · 开发 · 前台/后台手册 · OpenAPI）。

## 技术栈

- **Next.js 15** (App Router) + React 19 + Tailwind
- **Drizzle ORM** + **MySQL / MariaDB**
- **iron-session** + bcrypt 鉴权；AES-GCM 密钥环保护后台密钥字段
- **ArtPlayer**（里番 MP4 + 可选广告）/ 线路解析 iframe（动漫）
- **Docker Compose**：`app` + 可选 `crawler-worker`（无内置数据库）

## 功能一览

| 区域 | 路径 / 组件 | 说明 |
|------|-------------|------|
| 前台 | `/` `/browse` `/works` `/watch/[id]` `/works/[id]` | 里番 + 动漫双片库、搜索、播放、进度、片单 |
| API | `/api/animes` `/api/me/*` … | 公开只读 + 登录用户进度/片单 |
| 后台 | `/admin` | 作品、标签、用户、系统设置、爬虫控制面、存储、播放器广告 |
| Worker | `crawler_worker/` | 无 DB；MacCMS 外链 → `anime_works`；Hanime MP4 → S3/SFTP → `animes` |

## 本地开发

```bash
cp .env.example .env
# 必填：DATABASE_URL、SESSION_SECRET(≥32)、APP_ENCRYPTION_KEYRING、APP_ENCRYPTION_CURRENT_KEY_ID、SITE_URL
# 密钥示例：openssl rand -base64 48   /   openssl rand -base64 32

npm install
# 空库：CRAWLER_MIGRATE_CONFIRM=yes npm run db:setup:crawler
# 已有库：CRAWLER_MIGRATE_CONFIRM=yes npm run db:migrate:crawler
npm run seed:admin
npm run dev
```

- 前台: http://localhost:3000  
- 后台: http://localhost:3000/admin  

`DATABASE_URL` 密码中的 `@` 写成 `%40`。

## 服务器 Docker Compose 部署（摘要）

```bash
# 1) 服务器安装 Docker Compose v2，clone 本仓库
cp .env.example .env && chmod 600 .env
# 填写 DATABASE_URL / SESSION_SECRET / APP_ENCRYPTION_* / SITE_URL / ADMIN_BOOTSTRAP_*

# 2) 迁移 + 管理员（本机 Node 或一次性 node 容器，见 docs/deployment.md §4）
CRAWLER_MIGRATE_CONFIRM=yes npm run db:migrate:crawler   # 或 db:setup:crawler
npm run seed:admin

# 3) 启动
docker compose up -d --build app
curl -sS http://127.0.0.1:3000/api/live
curl -sS http://127.0.0.1:3000/api/ready

# 4) 反代 HTTPS → 127.0.0.1:3000，并禁止公网访问 /api/internal/crawler/**
```

可选 Worker：

```bash
# 后台签发令牌后写入 CRAWLER_WORKER_ID / CRAWLER_WORKER_TOKEN
mkdir -p data/crawler-worker   # 相对路径 bind mount：./data/crawler-worker
docker compose --profile worker up -d --build
```

预构建镜像：设置 `DOCKERHUB_USERNAME` 后  
`docker compose pull app && docker compose up -d --no-build app`。

**完整步骤、环境变量表、Nginx/Caddy、迁移 0001–0016、检查清单与排错 → [docs/deployment.md](./docs/deployment.md)**

## 文档索引

| 文档 | 内容 |
|------|------|
| [docs/README.md](./docs/README.md) | 文档中心 |
| [docs/deployment.md](./docs/deployment.md) | **Compose 生产部署教程** |
| [docs/user-guide.md](./docs/user-guide.md) | 前台使用（播放 / 进度 / 片单） |
| [docs/admin-guide.md](./docs/admin-guide.md) | 后台：采集、存储、播放器广告 |
| [docs/architecture.md](./docs/architecture.md) | 架构与数据流 |
| [docs/development.md](./docs/development.md) | 开发约定与脚本 |
| [docs/api/README.md](./docs/api/README.md) | API 说明 |

## 常用脚本

```bash
npm run dev                 # 开发
npm run build && npm start  # 生产（非 Docker）
npm run seed:admin          # 引导管理员
npm run seed:maccms-profiles
npm run worker:provision    # 本地 Worker 令牌
npm run worker:start
npm run db:setup:crawler    # 全新核心表（需 CRAWLER_MIGRATE_CONFIRM=yes）
npm run db:migrate:crawler  # 加法迁移 0001–0016
npm run test                # 测试入口
```

`npm run db:push` 已禁用；生产只用审查过的 SQL 迁移。

## 目录

```
app/                 # Next 路由（site + admin + api）
components/          # UI / ArtPlayer / 播放面板
lib/                 # db、领域服务、系统设置、爬虫控制面
crawler_worker/      # Python Worker（无 DATABASE_URL）
drizzle/migrations/  # 0001–0016
scripts/             # seed、迁移、worker 运维
docs/                # 项目文档
Dockerfile           # app
Dockerfile.worker    # crawler-worker
docker-compose.yml
```

## 权限模型

`users.role`：

- `admin`：可访问 `/admin`
- `user`：前台注册用户（片单 / 云端进度）

## 相关说明

- 生产路径为 Next 全栈 + 远程 MySQL；不再依赖 Cloudflare Workers / D1。
- MacCMS 与 Hanime 目录分离：外链进 `anime_works`，托管 MP4 进 `animes`。
- `mobile/` 通过同一 `/api` 契约访问（须配置 `EXPO_PUBLIC_API_BASE_URL` / `expo.extra.apiBaseUrl`，无内置域名）；云端片单/进度以前台 Web 为准。
