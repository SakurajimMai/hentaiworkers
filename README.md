# AnimeStream

AnimeStream 是基于 Next.js 15、React 19、Drizzle ORM 与 MySQL/MariaDB 的里番与漫画站点，
包含公开浏览、媒体播放、漫画阅读、账号、收藏与历史、管理后台，以及
`mobile/android/` 中的原生 Kotlin Android 客户端。

根 Next.js 工程保持 App-only。`crawler/` 是独立数据生产空间，不导入主站私有模块，也不
进入主站依赖、镜像、Compose 服务、运行时配置或控制面 API。

## 文档入口

| 目标 | 从这里开始 |
|------|------------|
| 第一次使用网站 | [Web 快速上手](./docs/tutorials/web-getting-started.md) |
| 下载、安装或更新 APK | [Android 安装与更新](./docs/tutorials/android-install-update.md) |
| 管理内容、账号和系统设置 | [后台管理手册](./docs/admin-guide.md) |
| 本地开发 | [开发指南](./docs/development.md) |
| 发布或升级生产环境 | [生产发布教程](./docs/tutorials/production-rollout.md) |
| 调用匿名公开 API | [API 快速上手](./docs/tutorials/api-quickstart.md) |
| 理解系统边界 | [架构说明](./docs/architecture.md) / [生产架构图](./docs/diagrams/hentaiworkers-production.architecture.html) |

完整入口见 [文档中心](./docs/README.md)。

## 功能

- 里番目录、统一搜索、标签筛选、详情、推荐与 ArtPlayer 播放
- 漫画目录、漫画标签、日/周/月/总榜与纵向连续阅读
- 登录、注册、邮箱验证、密码找回与用户中心
- 里番/漫画收藏、统一云端历史及游客本机观看记录
- 里番、漫画、标签、用户、广告和系统设置后台
- 公开匿名 API、客户端会话 API 与健康检查
- Kotlin + Jetpack Compose Android 客户端及五种 APK

## 本地启动

要求 Node.js 22+、npm，以及一个已经按项目 schema 准备好的 MySQL/MariaDB 数据库。仓库
不提供本地数据库 Compose，也不会在应用启动时自动执行完整迁移链。

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

可分别用 `openssl rand -base64 48` 和 `openssl rand -base64 32` 生成 Session secret 与
32 字节加密密钥。Keyring 是 JSON 对象，例如把生成值放入
`{"primary":"生成的 32 字节 Base64 密钥"}`，并设置
`APP_ENCRYPTION_CURRENT_KEY_ID=primary`。不要提交 `.env` 或复用文档中的示例文本。

打开 `http://localhost:3000`。数据库初始化、TLS、本地配置和管理员创建的安全顺序见
[开发指南](./docs/development.md)。当前数据库基线尚未完成跨 MySQL/MariaDB 的空库导入验证，
不要把它当成无需审核的一键生产建库脚本。

## 质量检查

```bash
npm run lint
npm run typecheck
npm run test
npm run check:legacy
npm run check:boundaries
npm run build
```

## Android APK

公开安装包只从 [GitHub Releases](https://github.com/SakurajimMai/hentaiworkers/releases)
下载。支持 Android 7.0 及以上：

| APK | 适用设备 |
|-----|----------|
| `arm64-v8a` | 大多数现代 Android 手机，推荐 |
| `armeabi-v7a` | 较旧的 32 位 Android 手机 |
| `x86_64` / `x86` | 模拟器和少量 Intel 设备 |
| `universal` | 无法判断架构时的兼容选择，文件更大 |

APK 更新是应用启动后的非阻塞检查与弹窗，不是通知推送、自动下载或静默安装。完整的安装、
旧签名迁移、更新和排障步骤见 [Android 安装与更新](./docs/tutorials/android-install-update.md)。

## Docker

根目录与 `deploy/` 的 Compose 清单都只启动 App。若使用已发布镜像，必须显式选择 tag 与
拉取策略；清单自身的 fallback 是本地 `manga` tag 和 `pull_policy: never`。

```bash
cp deploy/.env.example deploy/.env
cd deploy
IMAGE_TAG=latest PULL_POLICY=always docker compose pull app
IMAGE_TAG=latest PULL_POLICY=always docker compose up -d
```

复制环境模板后默认绑定 `127.0.0.1:13000`。Compose 不迁移数据库、不创建管理员，也不
配置 HTTPS 反向代理。生产环境应优先固定已验证的不可变镜像标签，并按
[部署指南](./docs/deployment.md) 完成迁移审核、烟测与回滚准备。

## 目录

```text
app/                 Next.js 页面、Server Actions 与 Route Handlers
components/          前台和后台组件
lib/                 主站业务、漫画目录、SEO 与 API 适配
lib/server/          catalog、identity、system 及基础设施
drizzle/             数据库基线和历史迁移
mobile/android/      Kotlin / Jetpack Compose Android 客户端
scripts/             主站维护与质量检查脚本
tests/               TypeScript 测试
crawler/             独立数据生产工程，不进入主站构建和部署
deploy/              App-only 生产 Compose 清单
docs/                参考文档、教程、API 与架构图
```

产品与运维行为变化见 [变更记录](./docs/CHANGELOG.md)。
