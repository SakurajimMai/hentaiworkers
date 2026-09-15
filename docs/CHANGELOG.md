# 变更记录

面向运维与开发的产品范围变更说明。细粒度历史以 Git 为准。

## 2026-09 — 搜索引擎收录、信息流广告尺寸与 APK 阅读预取

- 修复升级到配置注入镜像后 APK 新漫画无图、检查更新失败：生产在 `deploy/.env` 没有
  `IMAGE_PROXY_UPSTREAM` 与 `ANDROID_UPDATE_REPOSITORY` 的情况下换上了新镜像，`/cdn-img/**`
  返回 503（旧作品只是还有边缘/设备缓存），`/api/android/update` 返回 404。Docker workflow 现在
  把仓库变量 `IMAGE_PROXY_UPSTREAM` 与构建仓库 `github.repository` 作为镜像默认值烘焙进去
  （`.env` 仍可覆盖，模板里这两项改为注释，避免复制模板时把默认值清空），并在构建前校验图片代理
  上游与 APK 改写的图片主机一致；`/api/health` 新增 `features.imageProxy` /
  `features.androidUpdates`，部署后可直接确认。APK 在 `/cdn-img` 返回 5xx 时改为直连图片主机
  重试一次并沿用缓存键，代理故障降级为直连而不是整页空白。

- 详情页返回目录不再固定回到第一页：`/manga/{id}` 与 `/watch/{id}` 现在按默认排序算出作品所在页，
  站内跳转仍优先按浏览历史返回（含标签、榜单与筛选）；后台里番/漫画详情的返回链接同样改为按历史返回。
- 目录排序补上 `id` 次级排序（里番 `COALESCE(updated_at, created_at) DESC, id DESC`；漫画
  `updated_at DESC, id DESC`，榜单在热度之后）。此前时间相同的作品在翻页时可能重复出现或被跳过，
  现在分页稳定，作品所在页也可以精确计算。

- 播放量与收藏数改为紧凑显示：999 以内原样，1000 显示 `1k`，7887 显示 `7.8k`，32000 显示 `3.2w`；
  一律向下截断，不会把数字说大。网页卡片/详情页与 APK 详情页共用同一套规则，后台仍显示精确数字。
- APK 播放器画面改用 TextureView 渲染：`SurfaceView` 的缓冲区独立于视图层级，横屏退回竖屏时会把最后
  一帧留在屏幕上，看起来像详情页卡住。同时播放期间保持屏幕常亮，并且只有真正调过亮度才在退出时还原
  窗口属性，避免旋转过程中多一次无谓的窗口重排。

- 代码评审修复：信息流广告尺寸推断不再把 `width="100%"` 读成 10 像素、不再被素材前的角标或计数像素
  抢走尺寸，并按比例缩放到上限以保持原始宽高比；站点地图分片名拒绝前导零；站点地图在漫画查询失败时
  不再把空结果当成新鲜快照缓存；标签站点地图与 `/browse` 的可索引判断使用同一套「有上架作品」的连接；
  `/manga` 的 canonical、标签链接与站点地图统一用 `encodeURIComponent` 编码；目录页 robots 改为共享常量，
  不再覆盖掉 `max-image-preview`；`/browse` 不再信任 URL 传入的 `tagName`；超出总页数的目录页改为 noindex；
  分页链接只保留列表参数，丢弃 `tagName` 与 utm 之类的追踪参数；IndexNow 覆盖章节、页面与标签改动并改为
  响应后才发起；`VideoObject` 的 `contentUrl` 支持相对媒体地址；后台 IndexNow 输入框的 `pattern` 在浏览器
  `v` 模式下可编译；无时区的 `created_at` 按 UTC 解析。

- 里番播放量与收藏数改为真实数据。`/watch/{id}` 与 `GET /api/animes/{id}` 会在响应之后（`after()`）
  按「同一访客 · 同一作品 · 同一 UTC 日」去重记一次播放，写入新表 `anime_view_days` 并把
  `animes.view_count` +1；不存在或已下架的作品不计数。`AnimeDetail.favoriteCount` 改为实时统计
  `user_lists` + `user_list_items` 中系统收藏列表的条目数，自定义列表与旧 `user_favorites` 表都不计入；
  统计不可用时返回 `null`（未知），不再返回恒为 0 的占位值。字段名保持不变，已发布 APK 不受影响。
- `animes.favorite_count` 列保留在 schema 中仅作历史，不再维护、不再被读取（`lib/schema.ts` 已标注）。
- 新增 `drizzle/migrations/0020-anime-views.sql` 创建 `anime_view_days` / `anime_view_dedup`；
  **必须先人工审核并执行，否则应用会在请求路径懒执行 `CREATE TABLE IF NOT EXISTS` 建这两张表。**
  该迁移**会执行** `UPDATE animes SET view_count = 0`：现有播放量全部是爬虫随机种子
  （`random.randint(1000, 10000)`），清零后计数才真实。重置不可逆，`sort=popular`、首页/相似推荐热度回退和
  「N 次播放」会立即归零并随真实流量回升，**执行迁移前请备份数据库**；应用本身永远不会执行它。
- `/sitemap.xml` 改为站点地图索引，分片文件位于 `/sitemaps/{pages,animes-N,mangas-N,tags-N,manga-tags-N}.xml`，
  每片最多 10,000 条并带封面图片；`app/sitemap.ts` 由 `app/sitemap.xml/route.ts` 与 `app/sitemaps/[name]/route.ts`
  取代，`check:legacy` 同步更新。站点地图数据在进程内缓存 10 分钟。
- 新增 IndexNow：`system_settings.site.indexNowKey`（后台「搜索引擎收录」），密钥文件由 `/indexnow/{key}.txt`
  自动提供；漫画发布接口与后台里番/漫画保存、上下架、删除会在响应后异步通知 `api.indexnow.org`。留空即关闭。
- `/manga` 分页与榜单页 canonical 指向自身；只有后台「精选」的漫画标签页可索引并进入站点地图，其余标签页
  `noindex`。`/browse?tag=ID` 在缺少 `tagName` 时服务端解析标签名，不存在的标签页 `noindex`。
- 详情页 Open Graph 补齐 `og:site_name` / `og:locale`；`VideoObject` 使用 `contentUrl` 与 ISO 日期，
  详情页增加 `BreadcrumbList`；全站增加 `<meta name="rating" content="adult">`、`max-image-preview:large`
  和图片主机 preconnect；`robots.txt` 屏蔽 `/search` 与 `/ads/`；分页改为可抓取的链接。
- 信息流广告：`/api/ads` 会从 `<img width height>` 推断尺寸；填写或推断出尺寸的「信息流卡片」在网页与 Android
  中都按比例完整放进 2:3 海报格并居中，不再裁切；Android 横幅按素材比例放大到所占列宽，修复固定尺寸广告在窄
  栏位中偏移的问题；空槽位显示招租占位。后台与文档要求图片类素材按真实像素配置尺寸。
- Android 阅读器：预取并发 2 → 4、前向窗口 6 → 10 页（3 页预览 + 7 页磁盘），章节准备缓存 30 秒 → 5 分钟且
  容量 3；读到本章最后三页时后台预热下一话的章节 JSON 与首页文件；OkHttp 每主机并发上限提高到 8。需要
  GitHub Actions 重新构建 APK 才会生效。
- 配置化：源码不再包含站点域名、图片主机、GitHub 仓库或镜像名。新增环境变量 `IMAGE_PROXY_UPSTREAM`
  （`/cdn-img` 上游，缺失返回 503）、`ANDROID_UPDATE_REPOSITORY`（更新清单来源，缺失返回 404）、`APP_IMAGE`
  （Compose 镜像名，必填）与可选 `INDEXNOW_ENDPOINT`；Android 构建改为必填 `ANIMESTREAM_API_BASE_URL` 并新增
  `ANIMESTREAM_IMAGE_PROXY_HOST`、`ANIMESTREAM_UPDATE_REPOSITORY`，GitHub Actions 从仓库变量与 `github.repository`
  注入。**升级生产前必须在 `deploy/.env` 补齐这些变量**，否则 APK 图片代理与更新提醒会失效。
- 发布流程：正式签名的 `main` Android 构建自动发布 `build-*` 正式 Release（最新一个带 Latest，不再标 prerelease），不再需要手动 `publish_release`；
  发布后只保留最新八个 Release（连同标签删除更早的）。Docker workflow 推送后只保留 Docker Hub 最新八个
  提交 SHA 镜像标签，`latest` / `manga` / 分支 / `v*` 标签不受影响；`DOCKERHUB_TOKEN` 需要删除权限。

## 2026-08 — 收藏与历史分页

- `/favorites` 的里番与漫画分别使用 `animePage` / `mangaPage`，每类每页 20 条；服务端执行真实计数和有界查询，不再把全部收藏发送到页面。
- `/history` 取消里番、漫画各 100 条的截断，改为按最近活动时间合并的统一时间线；超过 100 条的旧记录可继续翻页访问。
- 非法或越界页码会回到有效页面，删除末页最后一项后自动回退；查询失败显示重试状态，不再伪装为空列表。
- 账户页只查询收藏总数，首页推荐最多读取最近 100 条收藏。现有无参数 `/api/me/favorites` 返回结构保持不变，以兼容已发布 APK。
- 新增 `drizzle/migrations/0019-library-pagination-indexes.sql`，为两类收藏与两类历史增加时间 + ID 的稳定分页索引；生产环境仍须人工审核并执行迁移。

## 2026-08 — 原生 Kotlin Android 客户端

- `mobile/android/` 改为单 Activity 的 Kotlin + Jetpack Compose 应用，包名、`animestream` scheme、图标、最低 Android 版本和现有服务端契约保持不变。
- 目录、搜索筛选、详情、收藏/历史、账号同步、Media3 MP4/HLS 播放、全部广告位和纵向漫画阅读均迁移到原生实现；阅读页使用支持子采样的图片缩放组件，避免长章节一次性解码。
- 首次覆盖安装会幂等、只读地迁移旧 `RKStorage` 的会话、里番/漫画收藏和历史；损坏条目单独跳过，旧数据库不删除。未登录时在新客户端新增的本地数据不保证旧版本可见。
- Android 格式检查、Lint、单元测试、Release 构建和 APK 身份/签名检查只在 GitHub Actions 执行。原生依赖包含四种 ABI 的 `.so`，因此 Actions 和正式 Release 会生成真实的 `arm64-v8a`、`armeabi-v7a`、`x86_64`、`x86` split 以及 universal APK；分支和 Pull Request 只验证，`main` 也只有使用正式签名时才公开发布。
- API origin 继续默认为 `https://www.ixacg.de`；空值、非法值、非 HTTP(S) 值或带路径/查询的配置会规范化或回退到默认站点。
- 修复首页等待热门里番请求后才发布已完成漫画内容的问题；两个栏目现在按真实完成顺序渐进展示，部分失败保留内容和内联重试。广告/标签延后加载，广告消费页直达时按需补载，空 Cookie 跳过 `/api/me`，目录调用上限收紧为 25 秒。
- 公开动漫、漫画、标签和广告增加 30 秒新鲜、15 分钟故障兜底的有界进程缓存；远程数据库默认连接超时收紧为 5 秒，避免 TLS 连接重置时与 Android 形成约 60 秒的重试等待。
- 修复标签无匹配内容时目录持续转圈：空结果保留筛选控件并可清除，快速切换只接收最新请求；公开标签不再返回没有有效里番关联的历史标签。
- APK 漫画章节仅显示话数；阅读器工具栏完整避开刘海与系统导航区，页码滑动器在拖动过程中实时定位并取消过时跳页。
- 新增非阻塞 Android 更新提醒：服务端严格校验 GitHub Release 五种 APK，客户端按 Build/ABI 选择下载，自动检查带成功/失败频控，“我的”可手动检查。首个含此功能的 APK 只能提醒之后发布的版本。

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
