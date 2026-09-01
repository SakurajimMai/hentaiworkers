# App Runtime Research

## 结论摘要

- 当前主站是一个 **Next.js 15 / React 19 模块化单体**。公开站点、管理后台、Route Handlers、Server Actions、会话鉴权、应用服务与数据库适配器都运行在同一个 Node.js 进程中；`next.config.ts:3-5` 使用 standalone 输出，`Dockerfile:15-30` 将其作为非 root 用户运行并监听容器内 `3000`。
- 生产 Compose 只有 `app` 服务，宿主端口默认绑定回环地址，映射到容器 `3000`；数据库不在 Compose 内，由外部维护。源码证据：`docker-compose.yml:1-30`、`docs/architecture.md:9-21`、`docs/deployment.md:1-10`。
- 对外主路径应画为：**Web Browser / Native Android -> HTTPS reverse proxy -> Next.js App container -> Remote MariaDB**。反向代理终止 TLS 并转发 `Host`、`X-Forwarded-Proto` 与客户端 IP；这是部署契约，不是仓库内另一个 Compose 服务。证据：`docs/architecture.md:9-21`、`docs/deployment.md:42-51`。
- `crawler/`、抓取调度、媒体下载和对象存储上传均在 App 运行边界之外，也不进入 App 镜像；不要把 crawler 画进生产主站容器。证据：`docs/architecture.md:3-7`。

## 可用于架构图的节点与关系

| 节点 | 真实职责 | 主要关系 / 协议 | 证据 |
|---|---|---|---|
| Web Browser | 访问 SSR/CSR 前台、管理后台；播放存储在目录中的 MP4/HLS 地址 | HTTPS 到反向代理；Session Cookie | `app/(site)/**`、`app/admin/**`、`components/watch-player.tsx` |
| Native Android | 消费公开目录、登录用户接口和 Android 更新清单 | HTTPS/JSON 到 `/api/**` | `docs/architecture.md:54-65`、`docs/api/README.md` |
| HTTPS Reverse Proxy | 公网 TLS 终止，转发到回环绑定的 App 端口 | HTTPS -> HTTP `127.0.0.1:${APP_PORT}` | `docs/deployment.md:42-51`、`docker-compose.yml:10-17` |
| Next.js App Container | App Router 页面、Route Handlers、Server Actions、Middleware、UI 与业务模块 | 容器内 Node HTTP `:3000` | `Dockerfile:15-30`、`app/**` |
| Application Services | Catalog、Identity、System Settings 的用例编排和校验 | TypeScript 进程内调用 ports | `lib/server/catalog/**`、`lib/server/identity/**`、`lib/server/system/**` |
| MariaDB Adapters | Drizzle/mysql2 查询、事务、重试和一致分页读取 | MySQL over TLS（默认 `3306`） | `lib/server/infrastructure/database/**`、`lib/db.ts:50-178` |
| Remote MariaDB | 目录、用户、配置、收藏、进度、漫画与统计的持久化 | App 连接外部数据库；不由 Compose 创建或迁移 | `docs/architecture.md:36-52`、`docs/deployment.md:1-21` |
| Process-local Cache | 公开列表 stale-read、Android 更新清单、鉴权限流；随进程重启清空 | 进程内 Map，无 Redis/共享缓存 | `lib/server/shared/stale-read-cache.ts:3-200`、`lib/server/identity/application/auth-rate-limit.ts:1-76` |
| GitHub Releases API | APK 更新元数据唯一上游 | App 发起 HTTPS GET，5 秒超时 | `lib/server/android-update.ts:7-14,164-197` |
| Cloudflare Turnstile | 可选的注册/登录人机校验 | App 发起 HTTPS POST `siteverify` | `lib/server/system/application/turnstile.ts:12-65` |
| SMTP Server | 邮箱验证、密码重置和后台测试邮件 | App 通过 Nodemailer/SMTP 发送 | `lib/server/system/application/mailer.ts:22-84` |
| Image Origin | 固定图片代理上游 `https://image.ixacg.de` | `/cdn-img/**` 发起 HTTPS GET | `app/cdn-img/[...path]/route.ts:3-57` |

图中主路径建议只保留 Browser/Android、Reverse Proxy、Next.js、Application Services、MariaDB Adapters、Remote MariaDB；四个外部集成作为短侧枝，Process-local Cache 放在 Next.js 边界内。

## Next.js 进程内部边界

1. **Web/UI 层**：`app/**` 提供 App Router 页面、Route Handlers 和 Server Actions；`components/**` 是前后台共享 UI。站点页面包括 `/`、`/browse`、`/search`、`/watch/[id]`、`/manga/**`、`/favorites`、`/history`、`/account` 与认证页面；后台位于 `/admin/**`。
2. **应用层与 ports**：
   - `lib/server/catalog/index.ts:14-34` 将 `CatalogQueryService` / `CatalogCommandService` 连接到 MariaDB catalog repository。
   - `lib/server/identity/index.ts` 将 `IdentityService`、`FavoritesService`、`ListsService`、`WatchProgressService` 连接到用户、Session、密码、收藏、列表、进度和事件 ports。
   - `lib/server/system/index.ts:26-67` 将 `SystemSettingsService` 连接到 settings/token/password-reset repositories、Identity 与 AES-GCM cipher。
3. **基础设施层**：`lib/server/infrastructure/database/**` 实现 MariaDB repositories；`lib/server/infrastructure/auth/iron-session-adapter.ts:10-41` 实现 Session port；`lib/server/infrastructure/crypto/aes-gcm-secret-cipher.ts` 保护存库的 SMTP、Turnstile 和漫画发布密钥。
4. **配置组合**：`lib/server/composition/container.ts` 只延迟创建配置、时钟与脱敏 logger；各业务模块自己的 `index.ts` 才负责延迟创建服务和默认 adapters，不应把 container 误画成独立运行服务。
5. **尚未完全 ports 化的路径**：漫画目录/发布、漫画收藏/进度/浏览统计，以及少数后台页面仍通过 `lib/manga-service.ts`、`lib/server/manga-*.ts` 或 `lib/db.ts` 直接使用 Drizzle/mysql2。`lib/manga-client.ts:1-17` 明确漫画数据来自本 App 的 MySQL，不是远程 Manga API。因此图可统一归入“应用服务 + DB adapters”，但说明文案不要声称所有查询都已经经过 domain ports。
6. SSR 页面直接调用这些进程内服务，而不是回环调用自己的 `/api`。例如首页从 `lib/anime-service.ts`、`lib/manga-client.ts`、Identity 和 System Settings 并行读取；公开 API 是供 Android 和外部客户端使用的另一入口。证据：`app/(site)/page.tsx`。

## API 与鉴权边界

| 边界 | 端点 / 入口 | 处理链 |
|---|---|---|
| 匿名公开读取 | `GET /api/animes*`、`/api/tags`、`/api/mangas*`、`/api/ads` | Route Handler ->（列表端点）进程内 stale-read cache -> catalog/system/manga service -> MariaDB |
| APK 更新 | `GET /api/android/update` | Route Handler -> 独立进程缓存 -> GitHub Releases API；不访问数据库 |
| 健康检查 | `/api/live`、`/api/ready`、`/api/health` | live 仅进程；ready/health 执行数据库 `SELECT 1` |
| 前台认证 | `POST /api/auth/login|logout` 与 `app/(site)/auth/actions.ts` | System Settings/Identity -> bcrypt + iron-session；Web 注册/登录可调用 Turnstile，邮箱流程调用 SMTP |
| 登录用户 | `/api/me`、`/api/me/watch-progress*`、`/api/me/favorites`、`/api/me/manga-progress*` | Cookie -> Identity `requireUser` -> DB 校验 user active + `session_version` -> 用户数据 repositories；响应 `Cache-Control: no-store` |
| 管理后台 | `/admin/**` + `app/admin/actions.ts` | Middleware 检查签名 admin Cookie 形状；所有敏感写动作及部分页面再通过 `requireAdmin` 查询 DB 校验 active、role 和 `session_version` |
| 漫画入库 | `POST /api/manga/publish` | `X-Manga-Publish-Key` 或 Bearer -> 解密并核对 `system_settings` 中共享密钥 -> `publishMangaChapter` -> MariaDB；不是用户 Session |

关键证据：`docs/architecture.md:54-63`、`middleware.ts:9-57`、`app/api/me/**`、`app/api/manga/publish/route.ts:32-76`、`app/admin/actions.ts`。

注意：当前没有实际的 `app/api/admin/**` Route Handler，Middleware matcher 对该前缀只是预留门禁；不要在图上画出不存在的 Admin API 服务。

## Session、安全与持久化

- Session 使用 Cookie 名 `animestream_session`，有效期 7 天；生产为 Secure，同时 HttpOnly、SameSite=Lax。Cookie 保存 `userId`、角色和 `sessionVersion`。证据：`lib/server/identity/session-config.ts:3-39`。
- Middleware 只做无数据库的粗粒度 admin Cookie 检查；所有后台敏感 Server Actions 和部分后台页面还会调用 `IdentityService.requireAdmin`。登录用户 API 通过 `requireUser` 或 `getCurrentUser` 读取 `users` 表并校验启用状态与 `session_version`；密码变更会递增版本并销毁当前 Cookie。部分只读后台页面依赖 Middleware 门禁，因此不要将数据库二次校验画成每个 `/admin/**` 请求都必经的统一网关。证据：`lib/server/identity/session-config.ts:42-49`、`lib/server/identity/application/identity-service.ts:66-99,196-221`、`app/admin/actions.ts`。
- 数据库通过懒加载 mysql2 pool + Drizzle 使用；默认连接池 8、max idle 4、连接超时 5 秒，瞬时连接错误最多重试 2 次。远程连接默认要求 TLS 1.2+、证书校验和 DNS 主机名。证据：`lib/server/shared/config.ts:62-96,127-167`、`lib/db.ts:50-78,121-178`。
- 主要持久化分组：目录 `animes/tags/anime_tags`；身份与设置 `users/system_settings/*tokens`；用户库 `user_lists/user_list_items/user_watch_progress/user_events`；漫画 `mangas/manga_chapters/manga_pages/manga_favorites/manga_reading_progress/manga_view_*`。权威列表见 `docs/architecture.md:36-52` 与 `lib/schema.ts`。

## 缓存与故障行为

- `/api/animes`（64 keys）、`/api/mangas`（64）、`/api/tags`（1）、`/api/ads`（1）使用有界进程内 cache。fresh 30 秒，之后可立即返回最多 15 分钟内 stale 值并在后台刷新；HTTP 头为 `public, max-age=30, stale-while-revalidate=120, stale-if-error=900`。证据：`lib/server/shared/stale-read-cache.ts:3-8,33-86,183-200` 及对应 `app/api/*/route.ts`。
- `/api/android/update` 使用独立单键缓存：fresh 15 分钟、stale 24 小时、失败后 5 分钟再试；对 GitHub 的单次读取 5 秒超时。证据：`app/api/android/update/route.ts:13-26`、`lib/server/android-update.ts:7-14,164-197`。
- `/api/me/**` 是动态、`no-store`，不经过公开 stale cache。证据：`app/api/me/route.ts:4-20`、`app/api/me/watch-progress/route.ts:5-58`、`app/api/me/http.ts`。
- `/cdn-img/**` 只允许固定上游 `image.ixacg.de`，Next fetch revalidate 与公开响应均为 30 天。证据：`app/cdn-img/[...path]/route.ts:6-50`。
- 登录、注册、密码重置使用进程内限流，默认 15 分钟窗口最多 10 次；它不是跨实例 WAF。证据：`lib/server/identity/application/auth-rate-limit.ts:1-76`。
- 所有这些进程内状态在容器重启或多实例之间不共享；仓库中没有 Redis/message bus。生产部署文档要求升级后预热四个公开目录端点。证据：`docs/deployment.md:19-21`。

## 架构图必须避免的错误

- 不要把 MariaDB、crawler、Android APK 构建器或反向代理画进 `app` Compose 服务；Compose 只有一个 App 容器。
- 不要画 Redis、消息队列、独立 Auth 服务、独立 Catalog 服务或远程 Manga API；它们不存在。
- 不要画视频流代理：播放器使用目录中的媒体 URL，主站只有固定图片代理 `/cdn-img/**`。
- 不要把 Cookie 粗检查与数据库二次校验合并成一个虚构网关：登录用户 API 以及后台敏感写动作会查询 MariaDB 校验用户与 Session 版本，但部分只读后台页面仅依赖 Middleware 门禁。
- 不要声称所有数据库访问均已 ports 化；Catalog/Identity/System 主要按 ports/adapters 分层，漫画和少数后台读取仍直接使用 Drizzle/mysql2。
