# Android 客户端与生产服务交互研究

## 研究范围与结论

本文件只覆盖原生 Android 客户端到生产服务的运行时链路，以及 APK 更新发布链路。结论来自当前仓库代码，不把未在仓库中固定的 CDN、视频供应商或主机拓扑当成既成事实。

生产图至少需要表达以下独立节点：

1. `AnimeStream Android`（Kotlin + Compose）
2. Android 本地 `Room`（游客收藏、历史）
3. Android 本地 `Preferences DataStore`（Session Cookie、迁移版本、更新节流状态）
4. `https://www.ixacg.de` 的 Next.js HTTP API
5. 外部 MySQL/MariaDB（目录、账号、云端收藏与进度）
6. 同源图片代理 `/cdn-img/*` 与固定上游 `https://image.ixacg.de`
7. 数据库记录中的外部媒体源（MP4/HLS/图片 URL；具体供应商未固定）
8. GitHub Releases API 与 GitHub Release 下载页
9. GitHub Actions Android 构建/发布工作流
10. 用户浏览器与 Android 系统安装确认

Android 工程是独立客户端，不进入 Next.js Docker 镜像或生产 Compose 服务；这是明确的仓库边界，不应在图中把 APK 画成 App 容器内组件。证据：`.trellis/spec/mobile/native-android.md:5-8`、`docs/mobile.md:3-5`。

## 1. API origin 与 HTTP 客户端

- 正式工作流注入 `ANIMESTREAM_API_BASE_URL=https://www.ixacg.de`；Gradle property 或环境变量均可覆盖，缺省值也是该地址。它被编译为 `BuildConfig.API_BASE_URL`。证据：`.github/workflows/build-android.yml:28-30`、`mobile/android/app/build.gradle.kts:15-20`、`mobile/android/app/build.gradle.kts:41-49`。
- 客户端只保留合法 HTTP(S) origin，主动移除 path、query、fragment；非法值回退至 `https://www.ixacg.de`。Retrofit 最终使用该 origin 加 `/` 作为 base URL。证据：`mobile/android/app/src/main/java/de/ixacg/animestream/core/media/MediaUrlNormalizer.kt:7-24`、`mobile/android/app/src/main/java/de/ixacg/animestream/core/network/AnimeStreamApi.kt:234-243`。
- 所有 JSON API 请求走 Retrofit + OkHttp，发送 `Accept: application/json` 与 `User-Agent: AnimeStream-Android/<versionName>`，CookieJar 为 `SessionCookieStore`。连接、读取、写入、整次调用上限分别是 8、20、20、25 秒，并启用连接失败重试。证据：`mobile/android/app/src/main/java/de/ixacg/animestream/core/network/AnimeStreamApi.kt:221-271`。
- Android Manifest 仅声明网络状态和 Internet 权限；没有静默安装或 `REQUEST_INSTALL_PACKAGES` 权限。证据：`mobile/android/app/src/main/AndroidManifest.xml:1-12`。

### 公开目录与内容 API

Android 当前直接调用这些生产端点（均为相对 API base 的 HTTPS JSON 请求）：

| 用途 | Android 请求 | 服务端数据/行为证据 |
|---|---|---|
| 里番目录 | `GET /api/animes?page=&limit=&tag=&search=&sort=` | `mobile/android/app/src/main/java/de/ixacg/animestream/core/network/AnimeStreamApi.kt:52-59`; 服务端读取 catalog service 并返回带分页对象的结果：`app/api/animes/handler.ts:28-47` |
| 里番详情/相似 | `GET /api/animes/{id}`、`GET /api/animes/{id}/similar` | `mobile/android/app/src/main/java/de/ixacg/animestream/core/network/AnimeStreamApi.kt:61-69`; `app/api/animes/[id]/handler.ts:18-31`; `app/api/animes/[id]/similar/handler.ts:23-35` |
| 标签 | `GET /api/tags?limit=` | `mobile/android/app/src/main/java/de/ixacg/animestream/core/network/AnimeStreamApi.kt:71-74`; 服务端最多返回 100 项：`app/api/tags/handler.ts:5-35` |
| 漫画目录 | `GET /api/mangas?page=&limit=&q=&tag=&rank=` | `mobile/android/app/src/main/java/de/ixacg/animestream/core/network/AnimeStreamApi.kt:76-83`; 数据来自本应用 MySQL 漫画表：`lib/manga-service.ts:1-13`、`lib/manga-service.ts:124-188` |
| 漫画详情/章节 | `GET /api/mangas/{id}`、`GET /api/mangas/{id}/chapters/{number}` | `mobile/android/app/src/main/java/de/ixacg/animestream/core/network/AnimeStreamApi.kt:85-94`; 章节响应携带数据库保存的 page image URL：`app/api/mangas/[id]/chapters/[number]/route.ts:20-32`、`lib/manga-service.ts:260-290` |
| 广告配置 | `GET /api/ads` | `mobile/android/app/src/main/java/de/ixacg/animestream/core/network/AnimeStreamApi.kt:96-97`; 服务端从系统设置读取公开广告配置：`app/api/ads/route.ts:12-31` |

公开里番、漫画、标签和广告响应使用进程内 stale-read cache：成功值新鲜 30 秒、可陈旧使用 15 分钟，HTTP 响应声明 `max-age=30, stale-while-revalidate=120, stale-if-error=900`。证据：`lib/server/shared/stale-read-cache.ts:3-8`、`app/api/animes/route.ts:17-37`、`app/api/mangas/route.ts:17-37`、`app/api/tags/route.ts:12-18`、`app/api/ads/route.ts:26-31`。

## 2. 登录与 Session Cookie

### 服务端签发

- `POST /api/auth/login` 接收账号/邮箱与密码，服务端通过 Identity/System service 登录，并返回公开 user envelope。建立 Session 的动作在 Identity service 内完成，响应携带 iron-session Cookie。证据：`app/api/auth/login/route.ts:21-48`、`lib/server/identity/application/identity-service.ts:29-51`、`lib/server/identity/application/identity-service.ts:187-194`、`lib/server/infrastructure/auth/iron-session-adapter.ts:28-35`。
- Cookie 名固定为 `animestream_session`，生产环境为 `Secure`、`HttpOnly`、`SameSite=Lax`，有效期 7 天。Cookie 内会话含用户 ID、用户名、角色和 `sessionVersion`；密码变更导致版本不匹配时，服务端销毁旧 Session。证据：`lib/server/identity/session-config.ts:3-13`、`lib/server/identity/session-config.ts:24-39`、`lib/server/identity/application/identity-service.ts:196-220`。
- `POST /api/auth/logout` 销毁服务端 Cookie；`GET /api/me` 用 Cookie 恢复当前用户，无会话时返回 `{ user: null }`。证据：`app/api/auth/logout/route.ts:6-8`、`app/api/me/route.ts:6-21`。

### Android 保存与发送

- Android CookieJar 只接受 API host 返回、名称为 `animestream_session` 的 Cookie；内存值立即更新，并将单一 `name=value` 写入 `Preferences DataStore`。后续只向同一 API host 发送。证据：`mobile/android/app/src/main/java/de/ixacg/animestream/core/network/SessionCookieStore.kt:20-54`、`mobile/android/app/src/main/java/de/ixacg/animestream/core/network/SessionCookieStore.kt:65-89`、`mobile/android/app/src/main/java/de/ixacg/animestream/core/network/SessionCookieStore.kt:119-124`。
- 登录成功必须等待 Cookie 持久化后才暴露登录态；启动时仅在本地已有 Cookie 时请求 `/api/me`，退出最终会清空本地 Cookie。证据：`mobile/android/app/src/main/java/de/ixacg/animestream/data/repository/SessionRepository.kt:28-49`、`mobile/android/app/src/main/java/de/ixacg/animestream/data/repository/SessionRepository.kt:56-63`。
- 图上应把 Cookie 表示为 `Android <-> Next.js API` 的 HTTPS Cookie 会话，并把 DataStore 画成设备内持久化；不能画成 OAuth/JWT 或独立认证服务。

## 3. 收藏、历史和阅读/观看进度

### 游客与本地持久化

- 未登录时，里番/漫画收藏与历史均写入设备 Room 数据库 `animestream-native.db`。收藏列表不设本地上限；两类历史查询和修剪均限定最近 50 项。证据：`mobile/android/app/src/main/java/de/ixacg/animestream/core/database/LibraryDatabase.kt:19-69`、`mobile/android/app/src/main/java/de/ixacg/animestream/core/database/LibraryDatabase.kt:113-145`。
- 首次原生启动可只读导入旧 `RKStorage/catalystLocalStorage` 中的 Cookie、收藏与历史；迁移版本保存在 DataStore。证据：`mobile/android/app/src/main/java/de/ixacg/animestream/core/database/LegacyStorageMigrator.kt:15-31`、`mobile/android/app/src/main/java/de/ixacg/animestream/core/database/LegacyStorageMigrator.kt:81-85`。

### 登录后的云端 API

Android 暴露的账号库接口如下，全部依赖 `animestream_session`：

| 数据 | 读取 | 写入/合并/删除 |
|---|---|---|
| 里番 + 漫画收藏 | `GET /api/me/favorites` | `POST /api/me/favorites`，body 为 `{kind,id,favorited?}` |
| 观看历史/进度 | `GET /api/me/watch-progress?limit=50` | `PUT /api/me/watch-progress/{animeId}`、`POST /api/me/watch-progress` 合并、单项或全量 `DELETE` |
| 漫画阅读进度 | `GET /api/me/manga-progress?limit=50` | `PUT /api/me/manga-progress/{mangaId}`、`POST /api/me/manga-progress` 合并、单项或全量 `DELETE` |

Android 端 Retrofit 契约证据：`mobile/android/app/src/main/java/de/ixacg/animestream/core/network/AnimeStreamApi.kt:99-165`。服务端路由证据：`app/api/me/favorites/route.ts:10-60`、`app/api/me/watch-progress/route.ts:20-59`、`app/api/me/watch-progress/[animeId]/route.ts:45-96`、`app/api/me/manga-progress/route.ts:11-44`、`app/api/me/manga-progress/[mangaId]/route.ts:17-41`。

- 登录用户打开书架时，Android 并发读取收藏、观看进度和漫画进度；任何云端读取异常都会整体回退到本地 Room snapshot。当前移动收藏响应不分页，而观看/阅读进度默认各取 50 项。证据：`mobile/android/app/src/main/java/de/ixacg/animestream/data/repository/LibraryRepository.kt:40-77`、`mobile/android/app/src/main/java/de/ixacg/animestream/core/network/AnimeStreamApi.kt:110-145`。
- 收藏写入在登录时优先写云端，随后镜像到 Room；401/403 时退化为本地操作。证据：`mobile/android/app/src/main/java/de/ixacg/animestream/data/repository/LibraryRepository.kt:80-138`。
- 登录成功后，Android 尽力把本地收藏逐项写入云端，并分别批量合并观看与漫画进度；同步失败不会使登录失败。证据：`mobile/android/app/src/main/java/de/ixacg/animestream/data/repository/LibraryRepository.kt:223-263`、`mobile/android/app/src/main/java/de/ixacg/animestream/ui/AnimeStreamViewModel.kt:705-717`。
- 播放器当前在取得有效 `videoUrl` 后记录本地观看历史，并向云端写入 `positionSeconds=1` 的观看标记；代码中没有从 Media3 持续回写真实播放位置的路径。证据：`mobile/android/app/src/main/java/de/ixacg/animestream/ui/AnimeStreamViewModel.kt:727-739`、`mobile/android/app/src/main/java/de/ixacg/animestream/data/repository/LibraryRepository.kt:140-158`。
- 阅读器打开章节时立即记录章节/页码，页码变化后以 800ms 防抖再次写 Room 与云端。证据：`mobile/android/app/src/main/java/de/ixacg/animestream/ui/AnimeStreamViewModel.kt:742-799`、`mobile/android/app/src/main/java/de/ixacg/animestream/data/repository/LibraryRepository.kt:161-188`。

云端最终落到外部 MySQL/MariaDB：账号位于 `users`，观看进度位于 `user_watch_progress`，漫画目录/页位于 `mangas`、`manga_chapters`、`manga_pages`，阅读进度位于 `manga_reading_progress`；里番收藏运行时使用 `user_lists/user_list_items`，漫画收藏使用 `manga_favorites`。证据：`lib/schema.ts:62-80`、`lib/schema.ts:105-131`、`lib/schema.ts:182-275`、`drizzle/migrations/0007-lists-and-search.sql:5-30`、`drizzle/migrations/0016-manga-favorites.sql:4-11`。

## 4. 图片、漫画页、视频与广告媒体

媒体 URL 是目录 API 返回的数据，不由 Android 固定到单一 CDN。生产图应分开画三类路径：

1. **`image.ixacg.de` 图片代理路径**：Android 的 URL normalizer 遇到 `image.ixacg.de` 会改写为 `https://www.ixacg.de/cdn-img/<path>`。Next.js `/cdn-img/*` 再从 `https://image.ixacg.de` 拉取，验证 image content type，并用 30 天 immutable cache header 返回。证据：`mobile/android/app/src/main/java/de/ixacg/animestream/core/media/MediaUrlNormalizer.kt:26-39`、`app/cdn-img/[...path]/route.ts:3-57`。
2. **其他图片 URL 直连**：非该固定 host 的合法 HTTP(S) 图片保留原 URL，由 Coil 直接请求；全局 ImageLoader 增加图片 `Accept` 和生产站 `Referer`。封面组件与阅读器装载前都先调用 normalizer。证据：`mobile/android/app/src/main/java/de/ixacg/animestream/core/media/MediaUrlNormalizer.kt:41-57`、`mobile/android/app/src/main/java/de/ixacg/animestream/AppContainer.kt:41-63`、`mobile/android/app/src/main/java/de/ixacg/animestream/ui/components/CommonComponents.kt:159-186`、`mobile/android/app/src/main/java/de/ixacg/animestream/ui/AnimeStreamViewModel.kt:759-766`。
3. **视频/音频媒体直连**：里番 `videoUrl` 和广告媒体 URL 经合法 HTTP(S) 校验/同 host 图片规则后，Media3 `DefaultHttpDataSource` 直接访问目标 URL，允许跨协议重定向，并发送 `Accept: */*`、站点 `Referer`、`AnimeStream-Android` User-Agent。仓库没有视频反向代理。证据：`mobile/android/app/src/main/java/de/ixacg/animestream/player/PlayerScreen.kt:95-141`、`mobile/android/app/src/main/java/de/ixacg/animestream/player/PlayerScreen.kt:193-205`、`mobile/android/app/src/main/java/de/ixacg/animestream/core/media/MediaUrlNormalizer.kt:59-64`。

数据库只保存 URL 字符串：里番主视频在 `animes.video_url`，漫画页在 `manga_pages.image_url`。具体外部媒体域名由数据内容决定，不能在架构图中虚构一个命名 CDN。证据：`lib/schema.ts:14-34`、`lib/schema.ts:237-252`。

## 5. 非阻塞更新检查与 GitHub Releases

### 运行时检查路径

更新数据流为：

`Android -> GET https://www.ixacg.de/api/android/update -> Next.js -> GitHub Releases REST API`

不是 Android 直接调用 GitHub API。

- 首页里番/漫画加载结束后，ViewModel 独立触发自动检查；失败不会进入首页状态。账号页可强制手动检查。证据：`mobile/android/app/src/main/java/de/ixacg/animestream/ui/AnimeStreamViewModel.kt:251-289`、`mobile/android/app/src/main/java/de/ixacg/animestream/ui/library/LibraryAccountScreens.kt:307-325`。
- Android 对 `/api/android/update` 使用额外 4 秒超时。成功自动检查后 24 小时不重复；失败退避 6 小时；某一版本“稍后提醒”24 小时。时间戳保存在独立更新 DataStore。证据：`mobile/android/app/src/main/java/de/ixacg/animestream/data/repository/UpdateRepository.kt:40-126`、`mobile/android/app/src/main/java/de/ixacg/animestream/data/repository/UpdateRepository.kt:129-151`、`mobile/android/app/src/main/java/de/ixacg/animestream/data/repository/UpdateCheckStore.kt:10-61`。
- 服务端请求 `https://api.github.com/repos/SakurajimMai/hentaiworkers/releases?per_page=100`，5 秒超时；只接受非 draft、目标为 `main`、`build-N` tag、完整五 ABI APK 和 `SHA256SUMS` 且带 GitHub SHA-256 digest 的 Release，并选择最高 versionCode。证据：`lib/server/android-update.ts:7-22`、`lib/server/android-update.ts:93-161`、`lib/server/android-update.ts:164-196`。
- 更新清单服务端缓存 15 分钟新鲜值，最长保留 24 小时 stale 值，失败 5 分钟后重试；外部响应声明 `max-age=300, stale-while-revalidate=900, stale-if-error=86400`。证据：`lib/server/android-update.ts:9-14`、`app/api/android/update/route.ts:13-24`。
- Android 对服务端清单再次做 fail-closed 校验：包名必须为 `de.ixacg.animestream`，tag 必须为 `build-<versionCode>`，Release/APK URL 必须严格属于该 GitHub 仓库，必须有 `arm64-v8a`、`armeabi-v7a`、`x86_64`、`x86`、`universal` 五个 APK，大小为正且 SHA-256 合法。随后按 `Build.SUPPORTED_ABIS` 第一个匹配项选择 APK，否则用 universal。证据：`mobile/android/app/src/main/java/de/ixacg/animestream/data/repository/UpdateRepository.kt:129-209`、`mobile/android/app/src/main/java/de/ixacg/animestream/AppContainer.kt:36-38`。
- 提醒是非阻塞对话框。“立即更新”先用 `ACTION_VIEW` 打开所选 APK URL，失败再打开 Release 页面；“稍后提醒”关闭并记录 snooze。下载与系统安装均需用户确认。证据：`mobile/android/app/src/main/java/de/ixacg/animestream/ui/navigation/AnimeStreamApp.kt:120-160`、`mobile/android/app/src/main/AndroidManifest.xml:3-12`。

### APK 构建与发布路径

发布数据流为：

`explicit main workflow_dispatch -> build + signed APK validation -> run-scoped Actions Artifact -> GitHub prerelease build-N`

- `mobile/**` 或工作流改动的 push/PR 会构建；`ANIMESTREAM_API_BASE_URL` 固定注入生产域名。`main` 使用受保护 `Production` environment，其他分支使用 `CI`。证据：`.github/workflows/build-android.yml:3-18`、`.github/workflows/build-android.yml:28-42`。
- 远程执行格式、Android Lint、单元测试与 release assemble，并校验包名、versionCode、launcher、签名、资源、无 JS/React Native 残留及 ABI 内容。证据：`.github/workflows/build-android.yml:99-108`、`.github/workflows/build-android.yml:117-247`。
- 工作流产出五个 APK：`arm64-v8a`、`armeabi-v7a`、`x86_64`、`x86`、`universal`，以及 `SHA256SUMS`。证据：`mobile/android/app/build.gradle.kts:85-96`、`.github/workflows/build-android.yml:249-279`。
- 创建 GitHub Release 必须同时满足：`main`、手动 `workflow_dispatch`、明确 `publish_release=true`、生产签名；发布 tag 为 `build-<run number>`，Release 为 prerelease，附五个 APK 和校验文件。证据：`.github/workflows/build-android.yml:293-300`、`.github/workflows/build-android.yml:317-375`。

## 6. 适合 Archify 主图的边与标签

建议把以下边保留为主图语义关系，避免把所有 REST 端点拆成节点：

| From | To | 建议标签 |
|---|---|---|
| AnimeStream Android | Next.js API | `HTTPS JSON · catalog/auth/library/update manifest` |
| AnimeStream Android | Room | `guest favorites + latest 50 histories` |
| AnimeStream Android | DataStore | `session cookie + migration/update state` |
| Next.js API | MySQL/MariaDB | `catalog, users, favorites, progress, settings` |
| AnimeStream Android | `/cdn-img/*` | `proxied image.ixacg.de assets` |
| `/cdn-img/*` | image.ixacg.de | `image fetch · 30d immutable response` |
| AnimeStream Android | External media origins | `direct Coil / Media3 HTTPS · MP4/HLS/images` |
| Next.js update endpoint | GitHub Releases API | `validated latest complete build-N manifest` |
| GitHub Actions | GitHub Releases | `5 signed ABI APKs + SHA256SUMS` |
| Update dialog | Browser / system installer | `user-confirmed APK download and install` |

建议把 `Room`、`DataStore` 放在 Android 设备边界中；把 Next.js、同源 `/cdn-img` 路由放在应用运行时边界中；MySQL、外部媒体域名、`image.ixacg.de`、GitHub API/Releases 均放在外部依赖边界。GitHub Actions 属于交付控制面，不属于用户请求数据面。

## 7. 不应在图中做出的推断

- 仓库没有固定视频 CDN/对象存储供应商；应标为“External media origins (data-provided URLs)”。
- Android 不直接连接数据库，也不直接调用 GitHub Releases API。
- APK 不在 Next.js 容器内构建或托管；正式安装包托管于 GitHub Releases。
- 更新机制不执行静默下载/静默安装，也没有相应 Manifest 权限。
- 当前移动 `GET /api/me/favorites` 是完整列表响应，不应误画成移动端分页 API；网站 `/favorites` 的页面分页是另一条 UI 路径。
