# AnimeStream

AnimeStream 是基于 Next.js 15、React 19、Drizzle ORM 与 MySQL/MariaDB 的里番与漫画站点，包含公开浏览、MP4 播放、漫画阅读、账号体系、管理后台，以及 `mobile/android/` 中的原生 Kotlin Android 客户端。

本仓库包含主站与 `crawler/` 独立工程空间。数据抓取和媒体下载不属于主站运行时，也不与主站共享依赖、配置、容器或内部 API。

## 功能

- 公开里番目录、统一搜索、标签筛选、详情与 ArtPlayer 播放
- 漫画目录、漫画标签、日/周/月/总榜与滚动阅读
- 登录、注册、邮箱验证、密码找回
- 里番与漫画收藏、观看历史、继续观看
- 里番、漫画、标签、用户和系统设置后台
- 后台可配置页脚 Android 下载地址
- 公开只读 API（里番 + 漫画）与健康检查
- `mobile/android/` Kotlin + Jetpack Compose 客户端；APK 只由 GitHub Actions 构建并发布到 Release

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

## 移动端

移动端源码位于 `mobile/android/`。开发机只编辑 Kotlin、Compose 和资源文件，不要求安装 JDK、Gradle 或 Android SDK，也不要在本机运行 Android 编译。推送分支或提交 Pull Request 后，**Build Android APK** 会在 GitHub Actions 完成格式检查、Lint、单元测试和 Release APK 构建；只有 `main` 上通过验证、使用正式签名的非 Pull Request 运行会创建 `build-<run>` 预发布 Release。未配置签名 Secrets 时只上传明确标记为内部测试的 Actions Artifact。

[GitHub Releases](https://github.com/SakurajimMai/hentaiworkers/releases) 同时提供 `arm64-v8a`、`armeabi-v7a`、`x86_64`、`x86` 和 universal APK；现代 Android 手机推荐 `arm64-v8a`，无法判断架构时使用 universal。把选定 APK 的 Release 地址填进后台「系统设置 → 移动端下载」，页脚「浏览」栏就会出现下载入口。详见 [移动端文档](./docs/mobile.md)。

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
lib/                 主站业务、漫画目录、SEO 与公开 API 适配
lib/server/          catalog、identity、system 业务模块与基础设施
drizzle/             数据库基线和历史迁移（含 0014–0017 漫画表）
mobile/android/      Kotlin / Jetpack Compose Android 客户端
scripts/             主站维护与质量检查脚本
tests/               TypeScript 测试
crawler/             独立数据采集工程；不进入主站构建和部署
deploy/              App-only 生产 Compose 清单
docs/                架构、开发、部署、管理、API 与移动端文档
```

更多信息见 [文档索引](./docs/README.md) 和 [变更记录](./docs/CHANGELOG.md)。
