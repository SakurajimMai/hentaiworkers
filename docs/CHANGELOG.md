# 变更记录

面向运维与开发的产品范围变更说明。细粒度历史以 Git 为准。

## 2026-08 — 原生 Kotlin Android 客户端

- `mobile/android/` 改为单 Activity 的 Kotlin + Jetpack Compose 应用，包名、`animestream` scheme、图标、最低 Android 版本和现有服务端契约保持不变。
- 目录、搜索筛选、详情、收藏/历史、账号同步、Media3 MP4/HLS 播放、全部广告位和纵向漫画阅读均迁移到原生实现；阅读页使用支持子采样的图片缩放组件，避免长章节一次性解码。
- 首次覆盖安装会幂等、只读地迁移旧 `RKStorage` 的会话、里番/漫画收藏和历史；损坏条目单独跳过，旧数据库不删除。未登录时在新客户端新增的本地数据不保证旧版本可见。
- Android 格式检查、Lint、单元测试、Release 构建和 APK 身份/签名检查只在 GitHub Actions 执行。原生依赖包含四种 ABI 的 `.so`，因此 Actions 和正式 Release 会生成真实的 `arm64-v8a`、`armeabi-v7a`、`x86_64`、`x86` split 以及 universal APK；分支和 Pull Request 只验证，`main` 也只有使用正式签名时才公开发布。
- API origin 继续默认为 `https://www.ixacg.de`；空值、非法值、非 HTTP(S) 值或带路径/查询的配置会规范化或回退到默认站点。
- 修复原生客户端沿用 OkHttp 默认 10 秒读取超时导致弱网首页显示 `Read timed out` 且内容被清空的问题；API 现在使用显式的有界弱网超时、中文可重试提示，并在刷新失败时保留已经加载的首页内容。

## 2026-08 — Android 构建解阻

- CI 不再用无 KVM 的 x86 模拟器跑 ARM64 冒烟（会误杀构建、也测不出真机）。改为校验 APK 完整性与启动必需的原生库。
- 恢复 `usesCleartextTraffic`，并清理会让旧 Android 构建配置失配的重复配置。

## 2026-08 — Android APK 闪退

- 补上旧客户端独立 APK 缺失的运行依赖，避免安装后一打开就退出。
- 关闭 New Architecture，接口地址失败时回退到主站，不再在启动时抛错。

## 2026-08 — 漫画、移动端与收录修复

- 主站增加漫画目录、详情、滚动阅读、漫画标签、日/周/月/总榜和登录收藏。
- 漫画数据写入 `mangas` / `manga_chapters` / `manga_pages` / `manga_favorites` / `manga_view_*`，与里番 `tags` 互不相通。
- 公开只读接口增加 `GET /api/mangas`、`/api/mangas/{id}`、`/api/mangas/{id}/chapters/{number}`，供网页与 `mobile/` 共用。
- 后台可配置页脚 Android 下载地址（`system_settings.site.androidDownloadUrl`）；留空不显示。
- 后台可配置页脚 Telegram 频道（`system_settings.site.telegramUrl` / `telegramLabel`）；支持 `@name` 或 `https://t.me/...`，留空不显示。
- `mobile/` 增加漫画目录、详情、阅读，以及本地漫画收藏/历史。APK 由 `.github/workflows/build-android.yml` 构建，产物挂到 GitHub Release。
- 收藏前台改为爱心开关，去掉「想看 / 在看 / 已看完 / 自定义列表」入口。
- SEO：修复 sitemap 标签 URL 中未转义的 `&`，去掉会污染子页的全局首页 canonical，私密页 `noindex`，补 `/manga` 与默认 OG 图。

漫画相关迁移：`drizzle/migrations/0014-mangas.sql`、`0015-manga-metadata.sql`、`0016-manga-favorites.sql`、`0017-manga-views.sql`、`0018-manga-reading-progress.sql`。生产库须人工审核后执行，容器不会自动跑迁移；漫画阅读进度服务会在首次写入时 `CREATE TABLE IF NOT EXISTS`。

## 2026-08 — 主站收敛为 App-only

- 删除仓库内的数据采集工程、Python 依赖、镜像和启动脚本。
- 删除管理后台的采集入口、Server Actions、内部 API、任务与节点控制模块。
- 删除相关数据库 schema、控制面迁移、测试、环境模板和运维脚本。
- 删除本机封面共享目录与静态读取路由；封面必须使用主站可直接访问的 URL。
- 根目录与 `deploy/` Compose 只保留 `app` 服务。
- GitHub Actions 只构建和发布 App 镜像。
- TypeScript 测试、lint、build 与边界检查不依赖 Python 或外部采集配置。

后续数据生产程序必须保持独立工程边界；允许放在仓库根 `crawler/` 下，但不得依赖主站私有模块、进入主站镜像或使用内部 HTTP 控制面。

## 2026-08 — 移除外链动漫产品线

- 保留 `animes`、`tags`、`anime_tags` 里番片库。
- 删除 `/works` 前后台页面、MacCMS 适配、流代理和线路解析播放器配置。
- `drizzle/migrations/0010–0013` 作为已发布迁移历史保留；主站不读写其 `anime_works`、`anime_work_sources`、`anime_work_tags`、`work_tags` 表。

旧数据库如需清理历史 works 表，必须先备份并确认没有回滚需求，再由运维人员单独执行：

```sql
DROP TABLE IF EXISTS anime_work_tags;
DROP TABLE IF EXISTS anime_work_sources;
DROP TABLE IF EXISTS anime_works;
DROP TABLE IF EXISTS work_tags;
```
