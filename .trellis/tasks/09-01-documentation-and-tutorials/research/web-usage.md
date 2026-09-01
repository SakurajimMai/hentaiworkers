# Web 前台使用审计

## 1. 范围与方法

- 审计基线：`9f97a1c`。
- 范围：首页与公共导航、里番浏览/搜索/标签、播放、漫画目录/详情/阅读、注册/登录/账号、收藏/历史分页，以及加载、空结果、失败和 404 状态。
- 证据来源：当前 App Router 页面、客户端组件、服务/仓储实现及相应测试；对照 `README.md` 和 `docs/user-guide.md`。
- 本文是后续文档改写的事实底稿，不修改正式文档或运行时代码。未连接生产数据库，也未在浏览器中做端到端验证；视觉文案和流程结论来自当前源码，分页边界同时由测试佐证。

## 2. 结论摘要

现有 `README.md` 的功能清单总体仍成立，但它不是可执行的 Web 教程。`docs/user-guide.md` 已覆盖主要路由和认证流程，不过有四处会让用户形成错误预期：

1. `/history` 已不是单纯的“观看历史”。登录用户看到的是里番观看和漫画阅读合并后的时间线；未登录用户才是浏览器本机的里番观看记录。来源：`app/(site)/history/page.tsx:63`、`app/(site)/history/page.tsx:164`、`lib/server/library-pagination.ts:90`。
2. `/favorites` 和 `/history` 已支持大量记录分页，但用户指南没有说明。收藏中的里番和漫画各自 20 条一页，分别使用 `animePage`、`mangaPage`；历史是统一的 `page`，同样 20 条一页。来源：`lib/server/shared/pagination.ts:1`、`app/(site)/favorites/page.tsx:22`、`components/favorites-library.tsx:82`、`app/(site)/history/page.tsx:244`。
3. 漫画阅读器会把当前页写入本机，并在登录时向云端写入章节/页码，但当前 Web 阅读器只从 `localStorage` 恢复页面，没有读取云端页码。`docs/user-guide.md:76` 的“与网页同步”会让用户误以为 Web 能跨设备自动跳回漫画页码，应改成更窄的说明。来源：`components/manga-reader.tsx:45`、`components/manga-reader.tsx:94`、`components/manga-reader.tsx:102`、`app/(site)/history/page.tsx:171`。
4. 文档称视频为“本站托管”，但主站实际只消费目录中的媒体 URL，页脚还明确提示播放依赖源站与网络。Web 播放路径当前确实强制为 progressive 媒体，但“本站托管”不是代码可证明的属性。来源：`components/watch-player.tsx:252`、`components/watch-player.tsx:262`、`app/(site)/layout.tsx:144`、`docs/architecture.md:7`。

此外，用户菜单实际名称是“我的收藏”，不是“我的片单”；漫画详情当前只有首章“开始阅读”，没有章节列表；登录历史中的漫画条目不能单条清除，也不会按已记录的 `pageIndex` 打开。来源：`components/user-menu.tsx:22`、`app/(site)/manga/[slug]/page.tsx:168`、`app/(site)/history/page.tsx:165`、`app/(site)/history/page.tsx:230`。

## 3. 当前 Web 路由与用户行为

### 3.1 公共导航与首页

| 入口 | 当前行为 | 证据 |
|---|---|---|
| 顶栏主导航 | 桌面展示首页、里番、漫画、历史、收藏；移动端在抽屉中提供同一组入口。 | `components/site-header-client.tsx:93`、`components/site-header-client.tsx:215` |
| 顶栏搜索 | 搜索词提交到 `/search?q=...`。最近搜索存在本机，去重并最多保留 12 条，可重搜或清除。 | `components/site-header-client.tsx:56`、`components/site-header-client.tsx:136`、`lib/client/search-history.ts:1` |
| 主题与账号 | 桌面账号入口在顶栏；移动端账号入口在抽屉。登录菜单为用户中心、我的收藏、观看历史、退出，管理员另有管理中心。 | `components/site-header-client.tsx:175`、`components/site-header-client.tsx:236`、`components/user-menu.tsx:22`、`components/user-menu.tsx:55` |
| 漫画阅读页 | 普通站点顶栏被隐藏，改用阅读器自己的固定工具栏。 | `components/site-header-client.tsx:66`、`components/manga-reader.tsx:145` |
| 页脚 | 固定提供里番、漫画、历史、收藏、登录、注册、隐私和条款；Android 下载与 Telegram 仅在管理员配置后出现。 | `app/(site)/layout.tsx:53`、`app/(site)/layout.tsx:85`、`app/(site)/layout.tsx:105`、`app/(site)/layout.tsx:120` |
| 首页 | 可显示管理员幻灯片、继续观看、基于收藏/历史的推荐、热门、最近更新和漫画更新。未登录的继续观看来自本机，登录后来自账号。 | `app/(site)/page.tsx:55`、`app/(site)/page.tsx:69`、`app/(site)/page.tsx:185`、`app/(site)/page.tsx:224`、`app/(site)/page.tsx:226` |

用户教程应同时写桌面和移动端入口，不应只写“顶栏右侧”。`docs/user-guide.md:32` 对桌面大致成立，但没有说明移动端账号菜单位于抽屉，也使用了过时的“我的片单”名称。

### 3.2 里番浏览、统一搜索与标签

#### `/browse`

- 可用参数为 `page`、`search`、数字 `tag`、仅用于标题显示的 `tagName`，以及 `sort=popular`；其他排序值回落为最近更新。每页请求 40 条。来源：`app/(site)/browse/page.tsx:52`。
- 最近更新与热门切换会保留当前搜索/标签并重置到第 1 页。来源：`app/(site)/browse/page.tsx:86`、`app/(site)/browse/page.tsx:126`。
- 有数据时显示网格和分页；通用分页组件复制当前查询参数后只更新 `page`。来源：`app/(site)/browse/page.tsx:163`、`components/pagination.tsx:14`。
- 没有结果时提示更换关键词并提供“返回里番馆”；加载失败时显示错误文本，但没有页面内重试按钮。来源：`app/(site)/browse/page.tsx:146`、`app/(site)/browse/page.tsx:152`。

#### `/search`

- 空查询只显示搜索说明。非空查询并行查里番和漫画，每类最多预览 12 条；`/search` 本身没有分页，结果超过 12 条时分别跳到 `/browse?search=` 或 `/manga?q=` 查看完整目录。来源：`app/(site)/search/page.tsx:37`、`app/(site)/search/page.tsx:50`、`app/(site)/search/page.tsx:99`、`app/(site)/search/page.tsx:129`。
- 两类搜索采用 `Promise.allSettled`，所以一类失败时另一类仍可显示。全部成功但均为空时才显示总空结果。来源：`app/(site)/search/page.tsx:51`、`app/(site)/search/page.tsx:56`、`app/(site)/search/page.tsx:67`。
- 里番匹配主标题、日文标题、英文标题和简介；漫画匹配标题、作者和漫画自身标签。用户指南的字段说明是准确的。来源：`lib/server/infrastructure/database/mariadb-catalog-repository.ts:50`、`lib/manga-service.ts:137`、`tests/catalog/search-fields.test.ts:6`，对照 `docs/user-guide.md:104`。

#### 标签

- 没有独立的公共标签总览路由。里番标签只从播放页进入 `/browse?tag=<id>&tagName=<name>`；漫画标签从详情页进入 `/manga?tag=<tag>`。来源：`app/(site)/watch/[id]/page.tsx:192`、`app/(site)/manga/[slug]/page.tsx:139`。
- 两套标签命名空间互不相通。`docs/user-guide.md:105` 至 `docs/user-guide.md:108` 对搜索字段、标签隔离和排序的描述基本准确。

教程应把 `/search` 定义为“跨目录预览页”，把 `/browse` 与 `/manga` 定义为“可继续筛选和翻页的完整结果页”，避免暗示 `/search` 能无限翻页。

### 3.3 播放页 `/watch/{id}`

- 无效或不存在的数字 ID 进入 404。页面显示播放器、云端续播提示、标题/别名、收藏、播放量、日期、简介、剧照、相关推荐和里番标签。来源：`app/(site)/watch/[id]/page.tsx:53`、`app/(site)/watch/[id]/page.tsx:96`、`app/(site)/watch/[id]/page.tsx:112`、`app/(site)/watch/[id]/page.tsx:123`。
- 当前页面明确把 ArtPlayer 配置成 `mediaKind="progressive"` 并请求自动播放；浏览器禁止自动播放时会静默等待用户手动开始。来源：`components/watch-player.tsx:252`、`components/art-player.tsx:651`。
- 续播仅在进度大于 5 秒、已知总时长、且未达到 90% 时自动跳转。来源：`components/watch-player.tsx:152`。
- 播放开始、时间更新、25/50/75% 里程碑、暂停、结束、页面隐藏和离开都会触发记录；常规进度写入被限制为约每 20 秒一次。来源：`components/watch-player.tsx:15`、`components/watch-player.tsx:193`、`components/watch-player.tsx:229`、`components/watch-player.tsx:235`。
- 未登录时写入本机；登录后写账号 API，网络请求抛错时保留本机副本，之后登录布局会尝试合并并在成功后清掉本机副本。来源：`components/watch-player.tsx:50`、`components/watch-player.tsx:84`、`components/watch-player.tsx:89`、`components/watch-player.tsx:271`、`app/(site)/layout.tsx:36`。
- 达到 90% 或剩余不超过 5 秒即算看完；本机最多保留 100 个观看进度记录。来源：`lib/client/watch-progress-storage.ts:50`、`lib/client/watch-progress-storage.ts:70`。
- 播放错误覆盖层会区分不支持/地址失效与网络/源站限制，并把媒体 URL 显示出来。来源：`components/art-player.tsx:598`、`components/art-player.tsx:609`、`components/art-player.tsx:695`。

`docs/user-guide.md:83` 至 `docs/user-guide.md:88` 对视频进度阈值和登录合并基本准确。应将 `docs/user-guide.md:66` 的“托管 progressive MP4”改为“通过 ArtPlayer 播放目录配置的 progressive 媒体地址”，并在故障说明中区分“站点页面可用”和“媒体源不可达”。

### 3.4 漫画目录、详情与阅读器

#### `/manga`

- 漫画功能可被管理员整体关闭；关闭时显示专门状态。启用后支持 `page`、`q`、漫画 `tag` 和 `rank`，每页 30 条。榜单为最近更新、日榜、周榜、月榜、总榜。来源：`app/(site)/manga/page.tsx:64`、`app/(site)/manga/page.tsx:75`、`app/(site)/manga/page.tsx:90`、`app/(site)/manga/page.tsx:136`。
- 分页链接保留查询、标签和榜单参数。来源：`components/manga-pagination.tsx:1`、`tests/manga-pagination.test.ts:5`。
- 空结果会按标签、搜索或无内容给出不同提示；搜索/标签状态提供回到全部漫画的入口。来源：`app/(site)/manga/page.tsx:168`。
- 失败状态会直接显示异常文本，特定数据库错误还会向公共用户展示迁移文件名。来源：`app/(site)/manga/page.tsx:157`。这不是用户教程应复制的内容，宜另列为运行时代码/运维文案的后续问题。

#### `/manga/{id}`

- 非数字别名会永久跳转到数字 ID 的规范 URL；禁用漫画或找不到作品时进入 404。来源：`app/(site)/manga/[slug]/page.tsx:60`。
- 详情显示封面、作者、漫画标签、简介、页数/更新时间、收藏和推荐。当前阅读入口只取 `manga.chapters[0]` 并显示一个“开始阅读”按钮，没有章节列表、章节选择器、上一话或下一话入口。来源：`app/(site)/manga/[slug]/page.tsx:71`、`app/(site)/manga/[slug]/page.tsx:116`、`app/(site)/manga/[slug]/page.tsx:168`、`app/(site)/manga/[slug]/page.tsx:187`。
- 推荐查询失败不会阻断详情页。来源：`app/(site)/manga/[slug]/page.tsx:74`。

#### `/manga/{id}/read/{n}`

- 阅读页校验作品和章节，标记为不索引，并传入当前章节图片、收藏状态和可选广告。来源：`app/(site)/manga/[slug]/read/[number]/page.tsx:18`、`app/(site)/manga/[slug]/read/[number]/page.tsx:28`、`app/(site)/manga/[slug]/read/[number]/page.tsx:45`。
- 页面纵向连续阅读，通过观察可见图片实时更新 `P当前页 / P总页数`，只加载当前页附近图片，单页失败有“本页加载失败”占位。来源：`components/manga-reader.tsx:63`、`components/manga-reader.tsx:145`、`components/manga-reader.tsx:202`。
- 工具栏提供返回作品、收藏、全屏和主题；向下滚动时隐藏，滚动超过 480px 后出现回到顶部按钮。来源：`components/manga-reader.tsx:113`、`components/manga-reader.tsx:147`、`components/manga-reader.tsx:240`。
- 当前页实时写入章节专属 `localStorage`，重新打开同一设备时滚回本机保存页。登录用户的活跃页在停止变化 800ms 后也写入云端；未登录时 API 失败被静默忽略。来源：`components/manga-reader.tsx:45`、`components/manga-reader.tsx:77`、`components/manga-reader.tsx:94`、`components/manga-reader.tsx:102`。
- 云端确实保存 `chapterNumber` 和 `pageIndex`，也有读取 API；但当前阅读器没有调用 GET，也没有接收云端初始页参数。登录历史的漫画链接只包含章节号，不包含或应用 `pageIndex`。因此“同设备本机续读”已实现，“Web 跨设备自动恢复漫画页码”未实现。来源：`app/api/me/manga-progress/route.ts:11`、`lib/server/manga-progress.ts:101`、`components/manga-reader.tsx:16`、`app/(site)/history/page.tsx:171`。
- 章节图片为空时有返回作品的空状态。来源：`components/manga-reader.tsx:187`。

### 3.5 登录、注册、找回密码与账号

| 流程 | 当前行为 | 证据 |
|---|---|---|
| 登录 | 邮箱和至少 8 位密码；可选 Turnstile；默认成功页为收藏，也保留安全的公共 `next` 深链。已登录用户会被直接重定向。 | `app/(site)/login/page.tsx:35`、`app/(site)/login/page.tsx:43`、`app/(site)/login/page.tsx:83`、`tests/server/library-pagination.test.ts:46` |
| 注册 | 可关闭注册，可限制邮箱白名单、要求邮箱验证或 Turnstile；邮箱/昵称最长 64 字符，密码至少 8 位。 | `app/(site)/register/page.tsx:52`、`app/(site)/register/page.tsx:67`、`app/(site)/register/page.tsx:82` |
| 找回密码 | 无论邮箱是否存在，成功提示均使用同一措辞；另有频率限制和格式错误状态。 | `app/(site)/forgot-password/page.tsx:21`、`app/(site)/forgot-password/page.tsx:31` |
| 重置/验证 | 重置令牌缺失、无效、过期和密码不一致均有反馈；验证邮箱成功后登录，失败时返回登录入口。 | `app/(site)/reset-password/page.tsx:22`、`app/(site)/reset-password/page.tsx:42`、`app/(site)/verify-email/page.tsx:23`、`app/(site)/verify-email/page.tsx:34` |
| 用户中心 | 必须登录；显示管理员身份、收藏总数快捷入口、退出、显示名编辑和密码修改。修改密码成功会销毁会话并要求重新登录。 | `app/(site)/account/page.tsx:35`、`app/(site)/account/page.tsx:46`、`app/(site)/account/page.tsx:68`、`app/(site)/account/page.tsx:96`、`app/(site)/account/page.tsx:151`、`app/(site)/auth/actions.ts:141` |

`docs/user-guide.md:38` 至 `docs/user-guide.md:57` 的认证教程总体准确。建议补充：登录默认进入收藏；受保护深链会在登录后返回原页；用户中心可退出；修改密码成功后必须重新登录。

### 3.6 收藏分页 `/favorites`

- 页面要求登录；未登录时把完整的收藏分页 URL 编码进登录 `next`，登录后可回到原页。来源：`app/(site)/favorites/page.tsx:35`、`app/(site)/favorites/page.tsx:45`、`tests/server/library-pagination.test.ts:46`。
- 里番和漫画分别请求分页数据，并行加载；任一加载失败时显示统一、非技术性错误和“重新加载”。来源：`app/(site)/favorites/page.tsx:50`。
- 默认页大小为 20。里番与漫画的页码分别是 `animePage` 和 `mangaPage`，改变一类页码会保留另一类当前页。第一页省略对应参数。来源：`lib/server/shared/pagination.ts:1`、`app/(site)/favorites/page.tsx:22`、`components/favorites-library.tsx:40`、`tests/library-pagination.test.ts:35`。
- 两类各自显示总数、网格、取消收藏按钮和独立分页；两类都为空时提供浏览里番/漫画入口。来源：`components/favorites-library.tsx:39`、`components/favorites-library.tsx:59`、`components/favorites-library.tsx:94`。
- 分页显示当前页/总页数/总条数，支持上一页、下一页、紧凑页码和省略号；移动端可换行。来源：`components/library-pagination.tsx:40`、`components/library-pagination.tsx:46`、`tests/library-pagination.test.ts:59`。
- 无效页码规范化为 1；超过末页会钳制到最后一页并规范重定向。取消末页最后一项后也会回落到新的最后页。来源：`lib/server/shared/pagination.ts:20`、`lib/server/shared/pagination.ts:35`、`app/(site)/favorites/page.tsx:75`、`tests/identity/favorites-service.test.ts:186`、`tests/identity/favorites-service.test.ts:227`。
- 查询采用稳定的收藏时间/记录 ID 倒序及 `LIMIT/OFFSET`，不会把“收藏过多”一次性加载到页面。来源：`lib/server/infrastructure/database/mariadb-favorites-repository.ts:110`、`lib/server/manga-favorites.ts:98`、`tests/identity/favorites-service.test.ts:244`。

### 3.7 历史分页 `/history`

#### 未登录

- 只展示本机 `localStorage` 中的里番观看记录，并提示登录可同步；不会出现漫画云端记录。来源：`app/(site)/history/page.tsx:63`、`components/continue-watching-client.tsx:97`。
- 每页 20 条，记录超过当前末页时客户端修正规范 URL；可清除单条或清除本机全部。来源：`components/continue-watching-client.tsx:95`、`components/continue-watching-client.tsx:107`、`components/continue-watching-client.tsx:174`、`components/continue-watching-client.tsx:189`。
- 本机观看记录底层最多保留 100 条。来源：`lib/client/watch-progress-storage.ts:50`。

#### 已登录

- 同一分页按 `activity_at DESC, kind ASC, record_id DESC` 合并里番观看和已发布漫画的阅读进度，每页 20 条，记录超过 100 条仍全部可达。来源：`lib/server/library-pagination.ts:90`、`lib/server/library-pagination.ts:118`、`lib/server/library-pagination.ts:157`、`tests/server/library-pagination.test.ts:128`、`tests/server/library-pagination.test.ts:150`。
- 漫画行显示“读到第 N 话”，点击打开该话；当前没有漫画单条清除按钮，也没有显示/应用已保存的页码。里番行显示百分比或看完状态，并支持单条清除。来源：`app/(site)/history/page.tsx:164`、`app/(site)/history/page.tsx:195`、`app/(site)/history/page.tsx:230`。
- “清除全部”有二次确认，并同时删除里番与漫画进度。来源：`app/(site)/history/page.tsx:134`、`app/(site)/auth/actions.ts:216`。
- 加载失败时显示安全错误与“重新加载”；操作失败时保留当前页并显示通用提示。空状态明确说明播放里番或阅读漫画会写入账号。来源：`app/(site)/history/page.tsx:88`、`app/(site)/history/page.tsx:148`、`app/(site)/history/page.tsx:152`。
- 无效或删除后越界的页码会钳制到有效末页并重定向。来源：`app/(site)/history/page.tsx:51`、`app/(site)/history/page.tsx:113`、`tests/server/library-pagination.test.ts:143`。

`docs/user-guide.md:24`、`docs/user-guide.md:81` 至 `docs/user-guide.md:88` 应把“观看历史”改为“历史（登录后含漫画阅读）”，补充 20 条分页，并把“清除单条或全部”限定为：里番可单条清除，全部清除会同时移除云端里番和漫画记录；未登录则只操作本机里番历史。

## 4. 空、错与边界状态清单

| 场景 | 当前反馈与恢复路径 | 文档建议 | 证据 |
|---|---|---|---|
| 首页无目录 | “片库还是空的”，可打开浏览。 | FAQ 可保留“管理员尚未上架”；无需让普通用户执行运维操作。 | `app/(site)/page.tsx:160` |
| 首页加载失败 | 显示原始异常文本，无页面内重试。 | 教程写刷新页面/稍后再试/联系站点管理员。 | `app/(site)/page.tsx:128`、`app/(site)/page.tsx:154` |
| 里番无匹配 | 返回里番馆。 | 说明清除搜索/标签。 | `app/(site)/browse/page.tsx:152` |
| 里番加载失败 | 显示原始异常文本，无重试按钮。 | 不承诺某一具体原因。 | `app/(site)/browse/page.tsx:64`、`app/(site)/browse/page.tsx:146` |
| 统一搜索无结果 | 提供里番目录及可选漫画目录；单类失败不会吞掉另一类。 | 区分“没有匹配”和“某类搜索失败”。 | `app/(site)/search/page.tsx:50`、`app/(site)/search/page.tsx:75`、`app/(site)/search/page.tsx:108` |
| 漫画关闭/无结果 | 关闭状态独立；空结果按标签、查询或未发布内容区分。 | 说明漫画入口可能由站点管理员关闭。 | `app/(site)/manga/page.tsx:75`、`app/(site)/manga/page.tsx:168` |
| 漫画目录失败 | 可能暴露 SQL/迁移提示。 | 用户文档仅给通用处理；把迁移指令留给部署/管理文档。 | `app/(site)/manga/page.tsx:157` |
| 阅读器无图片/单图失败 | 可返回作品；失败图片显示本页加载失败。 | 说明先刷新，再检查网络或联系管理员。 | `components/manga-reader.tsx:187`、`components/manga-reader.tsx:211` |
| 播放失败 | 覆盖层显示网络、格式、源地址或源站限制信息。 | FAQ 不应只说“检查网络”，因为媒体源/证书/防盗链/跨域也可能是原因。 | `components/art-player.tsx:609`、`docs/user-guide.md:118` |
| 收藏/历史加载失败 | 使用通用错误并提供原页重试。 | 可直接教用户点击“重新加载”。 | `app/(site)/favorites/page.tsx:57`、`app/(site)/history/page.tsx:88` |
| 受保护页未登录 | 收藏和账号跳登录；收藏/历史深链保留安全 `next`。 | 在账号章节解释登录后返回原页。 | `app/(site)/favorites/page.tsx:45`、`app/(site)/account/page.tsx:41`、`tests/server/library-pagination.test.ts:46` |
| 内容不存在/下架 | 全局 404 提供首页和浏览入口。 | FAQ 增加“链接失效或内容下架”。 | `app/not-found.tsx:10` |
| 路由加载中 | 站点级骨架屏。 | 教程无需解释短暂骨架；故障排查应区分持续空转与正常加载。 | `app/(site)/loading.tsx:1` |

## 5. README 与用户指南差距

### 5.1 `README.md`

| 位置 | 判断 | 建议 |
|---|---|---|
| `README.md:3`、`README.md:9` | “MP4/ArtPlayer 播放”符合当前 Web 的 progressive 配置；不要进一步推导为一定由本站托管。 | 用“progressive 媒体播放”或“目录媒体地址播放”。 |
| `README.md:10` | 漫画目录、标签、榜单和滚动阅读准确，但没有提示详情页当前只提供首章入口。 | 功能清单可保持简短，完整限制放用户指南。 |
| `README.md:12` | 收藏和继续观看准确；“观看历史”没有体现登录后也包含漫画阅读记录和分页。 | 改为“里番/漫画收藏、统一历史、继续观看”，并链接用户指南。 |
| `README.md:89` | 只链接文档索引，没有直接的前台教程入口。 | 在快速启动或文档段增加“Web 前台使用指南”直链。 |

### 5.2 `docs/user-guide.md`

| 位置 | 状态 | 必须调整的事实 |
|---|---|---|
| `docs/user-guide.md:3` | 部分过时 | “片单”应统一为“收藏”；视频云端续播成立，漫画 Web 自动恢复云端页码不成立。 |
| `docs/user-guide.md:9`、`docs/user-guide.md:66` | 表述过强 | 删除“本站托管/托管”，只说明当前 Web 用 ArtPlayer 播 progressive 媒体地址。 |
| `docs/user-guide.md:18` | 基本准确但不完整 | 首页还可能显示“根据收藏推荐”；登录/未登录继续观看的数据来源不同。 |
| `docs/user-guide.md:24` | 过时 | `/history` 登录后是里番+漫画统一时间线，未登录是本机里番历史；两者均 20 条分页。 |
| `docs/user-guide.md:25` | 准确但不完整 | 补充两类独立分页、每页 20 条及取消收藏后末页回落。 |
| `docs/user-guide.md:26` | 准确但不完整 | 补充退出登录、密码更新后重新登录。 |
| `docs/user-guide.md:32` | 命名和移动端过时 | “我的片单”改为“我的收藏”；移动端账号项在菜单抽屉。 |
| `docs/user-guide.md:76` | 用户可见语义过强 | 改成：漫画阅读页在本机恢复页码；登录时会记录云端章节/页码并显示在历史，但当前 Web 不会从云端页码自动定位。 |
| `docs/user-guide.md:86` | 过于笼统 | 补充分页；漫画没有单条清除，云端清除全部会同时删里番和漫画进度。 |
| `docs/user-guide.md:95` | 准确但不完整 | 补充 `animePage` / `mangaPage` 两套独立分页；用户文案不必暴露参数名，可在链接/排障段说明。 |
| `docs/user-guide.md:98` | 需收窄 | 收藏共享成立；“历史共享”应区分服务端记录共享与 Web 阅读器不应用云端漫画页码。 |
| `docs/user-guide.md:104` 至 `docs/user-guide.md:108` | 准确但不完整 | 增加 `/search` 每类 12 条预览、完整结果去各自目录翻页，以及标签没有总览页。 |
| `docs/user-guide.md:112` 至 `docs/user-guide.md:120` | 覆盖不足 | 增加空搜索、分页越界、漫画关闭、链接下架、收藏/历史重试；播放失败原因不止用户网络。 |

## 6. 建议的 Web 用户教程结构

以下顺序以“第一次打开站点到建立账号数据”为主线，适合重写 `docs/user-guide.md`：

1. **快速认识站点**
   - 无需登录即可浏览、搜索、播放和阅读；收藏及跨设备视频进度需要登录。
   - 桌面主导航、移动端菜单、主题开关、页脚可选 Android 下载入口。
   - 里番与漫画是两套目录，标签互不相通。
2. **从首页找内容**
   - 幻灯片、热门、最近更新、漫画更新。
   - 未登录继续观看来自本机；登录后来自账号；有数据时可能出现根据收藏推荐。
3. **浏览、搜索和标签**
   - `/browse` 的最近更新/热门、搜索/标签和 40 条分页。
   - 顶栏搜索与最多 12 条本机最近搜索。
   - `/search` 每类预览 12 条，点击“全部结果”进入对应目录继续筛选/翻页。
   - 里番标签从播放页进入，漫画标签从漫画详情进入；没有标签总览页。
4. **观看里番**
   - 播放器、手动播放兜底、收藏、简介/剧照/相关推荐。
   - 5 秒续播门槛、约 20 秒保存、90%/剩余 5 秒看完判定。
   - 游客本机记录、登录云端记录和登录后合并；媒体源错误的排查顺序。
5. **浏览和阅读漫画**
   - `/manga` 搜索、标签、最新/日/周/月/总榜及 30 条分页。
   - 详情页当前从第一章开始，无章节选择器。
   - 纵向阅读、页码、收藏、全屏、主题、回顶部、图片失败状态。
   - 同设备本机页码恢复；登录写云端记录，但当前 Web 不承诺跨设备自动跳到漫画页码。
6. **创建与恢复账号**
   - 注册开放状态、白名单、邮箱验证、Turnstile。
   - 登录及安全返回原页面；忘记密码的非枚举提示；令牌失效处理。
7. **管理收藏**
   - 里番和漫画两区，各自 20 条分页；翻一类不会重置另一类。
   - 卡片爱心取消；取消末页最后一项后自动回到有效页；加载失败点击重新加载。
8. **查看和清理历史**
   - 游客：本机里番历史，20 条分页，最多保留 100 条，可单条/全部清除。
   - 登录：里番+漫画统一时间线，20 条分页；里番可单条清除，全部清除同时删除两类云端进度。
   - 漫画历史打开保存的章节，但当前不自动应用云端页码。
9. **用户中心**
   - 收藏总数、历史快捷入口、显示名、退出；管理员入口。
   - 修改密码需要当前密码，成功后重新登录。
10. **没有内容或加载失败时**
    - 区分无匹配、栏目关闭、内容下架、页面数据失败、媒体源失败和单张漫画图失败。
    - 优先使用页面已有返回/重新加载操作，再刷新；持续失败时联系站点管理员并提供页面 URL，不让普通用户执行数据库迁移。

## 7. 文档写作护栏

- 不宣称有独立标签页、漫画章节选择器、上一话/下一话按钮或 Web 云端漫画页码自动恢复；当前代码没有这些能力。
- 不把“progressive”写成“必然由本站托管”，也不向用户保证自动播放一定成功。
- 不把登录和未登录历史混写：游客只有本机里番历史，登录后才有统一云端时间线。
- 不把服务端已经保存 `pageIndex` 等同于阅读器已经消费该值。
- 不在前台教程暴露 SQL 表名、迁移文件或内部接口路径；这些仅作为本文的实现证据。
- 参数名可放在高级说明或排障段；普通教程优先使用页面上的实际按钮名称。

## 8. 测试证据与剩余验证

- 收藏分页服务已有多页、越界钳制、页大小上限及删除末页项后的回落测试：`tests/identity/favorites-service.test.ts:186`。
- 分页 UI 已测试查询参数保留、可访问状态、紧凑页码、移动换行和末页禁用：`tests/library-pagination.test.ts:13`。
- 历史已有 121 条全部可达、删除后末页回落、统一稳定排序及数据库索引断言：`tests/server/library-pagination.test.ts:128`。
- 登录/注册深链已测试收藏和历史分页保留，并拒绝站外/后台跳转：`tests/server/library-pagination.test.ts:46`。
- 搜索字段至少对英文标题和简介有服务层测试：`tests/catalog/search-fields.test.ts:6`；漫画字段由当前查询实现直接佐证，未发现同级 Web 搜索交互测试。
- 本研究没有启动开发服务器、连接数据库或运行浏览器；正式教程发布前仍应做一次桌面与移动端人工走查，重点验证菜单文案、分页深链、取消末页收藏、漫画本机恢复和播放器错误提示。
