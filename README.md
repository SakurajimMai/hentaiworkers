# AnimeStream

Next.js 全栈动漫视频站：公网站点 + 管理后台 + REST API，对接远程 MySQL，支持 Docker 部署。

> 完整文档请见 **[docs/README.md](./docs/README.md)**（架构 · API · 部署 · 开发 · 前台/后台手册 · OpenAPI）。

## 技术栈

- **Next.js 15** (App Router) + React 19 + Tailwind
- **Drizzle ORM** + **MySQL**
- **iron-session** + bcrypt 管理员鉴权
- **Docker** 单服务部署（不内置数据库）

## 功能

| 区域 | 路径 | 说明 |
|------|------|------|
| 前台 | `/` `/browse` `/watch/[id]` | 片库、搜索、播放 |
| API | `/api/animes` `/api/tags` … | 公开只读，兼容移动端 |
| 后台 | `/admin` | 作品 / 标签 / 导入 / 用户 / **爬虫控制面** |
| Worker | `crawler_worker/` | 无数据库爬虫容器，经内部 API 领取任务 |

## 本地开发

```bash
cp .env.example .env
# 编辑 DATABASE_URL / SESSION_SECRET / SITE_URL 等

npm install
npm run seed:admin
npm run dev
```

- 前台: http://localhost:3000  
- 后台: http://localhost:3000/admin  

密码中的 `@` 在 `DATABASE_URL` 里需写成 `%40`。

## Docker Compose 部署

```bash
cp .env.example .env   # 填写 DATABASE_URL、SESSION_SECRET 等
npm ci && npm run seed:admin
CRAWLER_MIGRATE_CONFIRM=yes npm run db:migrate:crawler   # 控制面 + 收藏表

docker compose up -d --build app
curl -s http://127.0.0.1:3000/api/live
curl -s http://127.0.0.1:3000/api/ready
```

- 可选 Worker：`CRAWLER_WORKER_TOKEN=...` 后 `docker compose --profile worker up -d`
- 预构建镜像：设置 `DOCKERHUB_USERNAME` 后 `docker compose pull app && docker compose up -d --no-build app`
- 前台注册/登录/收藏：`/register`、`/login`、`/favorites`（见 [user-guide](./docs/user-guide.md)）

完整步骤、反代与排错：[docs/deployment.md](./docs/deployment.md)

## 文档索引

| 文档 | 内容 |
|------|------|
| [docs/README.md](./docs/README.md) | 文档中心 |
| [docs/architecture.md](./docs/architecture.md) | 架构与数据流 |
| [docs/api/README.md](./docs/api/README.md) | API 说明 |
| [docs/api/openapi.yaml](./docs/api/openapi.yaml) | OpenAPI 3.0 |
| [docs/admin-guide.md](./docs/admin-guide.md) | 后台操作手册 |
| [docs/user-guide.md](./docs/user-guide.md) | 前台使用说明 |
| [docs/development.md](./docs/development.md) | 开发约定 |

## 常用脚本

```bash
npm run dev          # 开发
npm run build        # 构建
npm run start        # 生产启动
npm run seed:admin   # 无管理员时创建引导账号
npm run test         # 测试入口
npm run db:push      # Drizzle 推送 schema（慎用生产）
```

## 目录

```
app/           # Next 路由（site + admin + api）
components/    # UI 组件
lib/           # db / schema / auth / 业务查询
scripts/       # seed-admin、采集工具等
mobile/        # Expo 客户端
docs/          # 项目文档
Dockerfile
docker-compose.yml
```

## 权限模型

`users.role`：

- `admin`：可访问 `/admin`
- `user`：预留；本阶段前台匿名观看

## 相关说明

- 已不依赖 Cloudflare Workers / D1 作为生产路径。
- `mobile/` 通过同一 `/api` 契约访问。
- Python 采集脚本直写 MySQL，与 Web 进程解耦。
