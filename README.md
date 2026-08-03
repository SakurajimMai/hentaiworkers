# AnimeStream

AnimeStream 是基于 Next.js 15、React 19、Drizzle ORM 与 MySQL/MariaDB 的里番目录站点，包含公开浏览、播放、账号体系和管理后台。

本仓库当前只包含主站。数据抓取、媒体下载和对象存储搬运不属于主站运行时，也不与主站共享脚本、配置、容器或内部 API。

## 功能

- 公开目录、搜索、标签筛选、详情与 ArtPlayer 播放
- 登录、注册、邮箱验证、密码找回
- 收藏片单、观看历史、继续观看与推荐
- 里番、标签、用户、系统设置和 JSON 导入后台
- 公开只读 API 与健康检查

## 本地启动

要求 Node.js 22+ 和 MySQL/MariaDB。

```bash
npm ci
cp .env.example .env
npm run dev
```

在 `.env` 中至少配置：

- `DATABASE_URL`
- `SESSION_SECRET`
- `APP_ENCRYPTION_KEYRING`
- `APP_ENCRYPTION_CURRENT_KEY_ID`
- `SITE_URL`

打开 `http://localhost:3000`。首次创建管理员前，在 `.env` 增加 `ADMIN_BOOTSTRAP_USER` 与至少 12 位的 `ADMIN_BOOTSTRAP_PASSWORD`，然后运行：

```bash
npm run seed:admin
```

数据库基线位于 `drizzle/baseline/`，主站的增量 SQL 位于 `drizzle/migrations/`。生产数据库迁移应通过受控流程人工审核执行，项目禁止直接运行 `drizzle-kit push`。

## 质量检查

```bash
npm run lint
npm run typecheck
npm run test
npm run check:legacy
npm run check:boundaries
npm run build
```

## Docker

根目录与 `deploy/` 的 Compose 清单都只启动 App：

```bash
cp deploy/.env.example deploy/.env
cd deploy
docker compose up -d
```

默认镜像为 `sakurajiamai/hentaiworkers-app:latest`，默认仅绑定 `127.0.0.1`。生产环境应在前方配置 HTTPS 反向代理。

## 目录

```text
app/                 Next.js 页面、Server Actions 与 Route Handlers
components/          前台和后台组件
lib/server/          catalog、identity、system 业务模块与基础设施
drizzle/             数据库基线和历史迁移
scripts/             主站维护与质量检查脚本
tests/               TypeScript 测试
deploy/              App-only 生产 Compose 清单
docs/                架构、开发、部署、管理与 API 文档
```

更多信息见 [文档索引](./docs/README.md) 和 [变更记录](./docs/CHANGELOG.md)。
