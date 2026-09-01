# 系统架构

## 1. 系统边界

AnimeStream 主站是一个 Next.js 模块化单体。Node.js 进程和生产 Compose 只包含公开站点、
管理后台、HTTP API 与数据库访问。MySQL/MariaDB、HTTPS 反向代理、媒体源、SMTP、Turnstile、
GitHub 和 Docker Hub 都是进程外依赖。

仓库内 `crawler/` 是独立数据生产空间，不进入主站镜像、依赖、TypeScript/ESLint 范围、
Compose 服务、运行时环境或内部控制 API。主站也不调度抓取、下载或媒体搬运任务。

## 2. 生产架构图

- [交互式 HTML](./diagrams/hentaiworkers-production.architecture.html)
- [Archify JSON 源](./diagrams/hentaiworkers-production.architecture.json)

HTML 可下载后在浏览器离线打开。图中包含生成时审查的仓库 revision 与生产主机配置快照，
包括当时观察到的端口绑定偏差；它不是所有环境永远相同的默认配置。下文描述仓库当前通用
边界。

## 3. 运行拓扑

```text
Browser / Native Kotlin Android
              |
              v
      HTTPS reverse proxy
              |
              v
        Next.js App
         |    |    \
         |    |     +--> GitHub Releases（Android 更新清单）
         |    +--------> SMTP / Turnstile / 外部媒体与图片源
         +-------------> Remote MySQL / MariaDB
```

两个 Compose 清单都只声明 `app` 服务。数据库和反向代理由操作者独立维护；Compose 不创建
数据库、不执行完整迁移链、不 seed 管理员，也不自动配置 HTTPS。

## 4. 交付与所有权

| 环节 | 自动化负责 | 操作者负责 |
|------|------------|------------|
| App 镜像 | GitHub Actions 构建并推送 Docker Hub 标签 | 选择目标标签、迁移、拉取、替换、烟测与回滚 |
| Android APK | Actions 检查、构建、签名校验并生成五种 APK | 验收正式 Artifact，手动授权发布 Release |
| 数据库 | 仓库提供基线和增量 SQL | 备份、审核、按序执行、记录与恢复 |
| HTTPS | 无自动生产部署 | 配置反向代理、证书、转发头与公网边界 |

Actions 工作流没有 SSH 或生产 Compose 步骤，因此镜像发布不等于生产环境已经升级。

## 5. 代码结构与当前例外

| 区域 | 路径 | 当前职责 |
|------|------|----------|
| Web | `app/**` | 页面、Server Actions、Route Handlers 与鉴权入口 |
| UI | `components/**` | 前台与后台复用组件和浏览器交互 |
| 分层业务模块 | `lib/server/{catalog,identity,system}/**` | application、domain、ports 与部分 adapters |
| 基础设施 | `lib/server/infrastructure/**` | MariaDB、Session 与加密实现 |
| 装配 | `lib/server/composition/container.ts` | 配置和依赖装配 |
| 漫画与兼容服务 | `lib/manga-*.ts`、部分 `app/admin/**` | 仍有直接数据库访问的现状 |

新后端逻辑应继续进入 `catalog`、`identity` 或 `system` 的现有边界，Route Handler 和 Server
Action 只做协议、鉴权与用例调用。但“所有页面都不直接访问数据库”目前不是全局事实：漫画
服务与若干后台页面仍是已知例外，后续重构不能靠文档宣称已经完成。

## 6. 数据所有权

| 数据 | 主要表 |
|------|--------|
| 里番目录与标签 | `animes`、`tags`、`anime_tags` |
| 用户、角色和会话版本 | `users` |
| 站点、注册、邮件、广告与发布设置 | `system_settings` |
| 邮箱验证与密码重置 | `email_verification_tokens`、`password_reset_tokens` |
| 里番收藏与观看进度 | `user_lists`、`user_list_items`、`user_watch_progress`、`user_events` |
| 漫画、章节与页面 | `mangas`、`manga_chapters`、`manga_pages` |
| 漫画收藏、阅读进度与榜单 | `manga_favorites`、`manga_reading_progress`、`manga_view_days`、`manga_view_dedup` |

历史迁移 `0010–0013` 可能在旧库留下 works 表，主站代码不得读写它们。处理建议见
[变更记录](./CHANGELOG.md)。

## 7. HTTP 与鉴权分区

- 匿名公开：`/api/live`、`/api/ready`、`/api/health`、`/api/ads`、
  `/api/android/update`、`/api/animes*`、`/api/tags`、`/api/mangas*`
- 网站/Android 会话：`/api/auth/*`、`/api/me*`，使用前台 Session Cookie
- 漫画发布：`POST /api/manga/publish`，使用后台保存的共享发布密钥
- 后台写操作：`app/admin/actions.ts` 的 Server Actions，要求有效管理员会话

匿名公开契约见 [API 参考](./api/README.md)。会话与发布接口不属于公开 OpenAPI。

## 8. 缓存与外部媒体

里番列表、漫画列表、标签和广告读取使用进程内有界 stale-while-revalidate 缓存；成功值短暂
复用，数据库短时失败时可返回最近成功值。详情、章节、身份、收藏、历史、进度和管理读取不
使用这套公共缓存。Android 更新清单有独立、时长不同的单键缓存，数据来自固定 GitHub
Releases 仓库。

主站消费目录中配置的媒体 URL，不负责通用视频代理。`/cdn-img/**` 只代理固定
`image.ixacg.de` 图片来源；不能把它描述成任意图片或视频代理。

## 9. Schema 生命周期与健康检查

应用和 Compose 不运行完整迁移链，生产 SQL 必须人工审核。当前漫画榜单与漫画进度代码仍会
在请求路径中执行 `CREATE TABLE IF NOT EXISTS`，这是与最小权限目标并存的现状；在正式迁移
已经创建相应表前，应用数据库账号可能仍需要 DDL 权限。

| 端点 | 检查内容 | 不证明 |
|------|----------|--------|
| `/api/live` | Node.js Route Handler 能响应 | 数据库或业务可用 |
| `/api/ready` | 配置了数据库时执行 `SELECT 1` | schema 完整或迁移已应用 |
| `/api/health` | 查询数据库并返回诊断信息 | 所有用户流程都正常 |

当前数据库基线的空库外键顺序与跨 MySQL/MariaDB 导入尚未完成验证，详见
[开发指南](./development.md) 和 [部署指南](./deployment.md)。

## 10. 安全边界

- 生产远程数据库要求 TLS 和 DNS 主机名；本地 loopback 才允许关闭 TLS。
- 用户 Session 使用 `iron-session`，修改密码会使旧 Session 失效。
- SMTP 密码、Turnstile Secret 和漫画发布密钥使用 AES-256-GCM keyring 加密后存库。
- 管理后台要求 `role=admin` 且账号启用；生产不提供默认管理员凭据。
- Android 正式密钥只进入受保护的 `Production` environment，并校验固定证书指纹。
- 下载链接只接受 HTTP(S)，APK 安装和更新始终由浏览器与 Android 系统确认。
