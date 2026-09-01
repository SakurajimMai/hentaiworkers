# 漫画阅读性能技术设计

## Current architecture

### Web

`Next.js App Router Server Component -> manga-service -> Drizzle/mysql2 -> remote MySQL`

阅读器由 `components/manga-reader.tsx` 渲染原生 `<img>`。Web 直接请求外部 `image.ixacg.de`；站点容器不保存漫画二进制。

当前阅读页位于 `(site)` route group。即使 CSS 隐藏页头/页脚，site layout 仍等待身份、站点设置和异步 header。页面本身在拿到图片清单后继续等待当前用户、收藏、广告和 `recordMangaView`，导致关键 HTML 较晚返回。

### Android

`Compose -> AnimeStreamViewModel -> Retrofit/OkHttp -> public Next.js API -> MySQL`

图片由 Coil 2.7 + Telephoto 0.16 在 `LazyColumn` 中显示。`image.ixacg.de` URL 会保持既有规则改写到本站 `/cdn-img`，由 Next 代理流式读取固定图片域名并缓存。此代理解决过 Android 直连 Cloudflare 失败，必须保留。

### Data

`manga_pages` 只有 `page_index` 和 `image_url`，没有 width/height。图片生产者 `tg-manga -> image host` 不在仓库、Compose 或应用镜像中，因此当前任务无法从源头补齐准确尺寸。

## Confirmed root causes

1. Web 关键响应被非图片依赖门禁：site layout、收藏、广告和浏览统计全部位于阅读器 HTML 之前。
2. Web 页面、metadata、章节 API 和 `getChapter` 重复解析漫画并加载无用完整章节列表；数字 ID 还会先失败一次 slug 查询。
3. Web 预加载与当前页共用 `rootMargin: 1400px` observer，导致屏外页面被当作当前页并写入进度。
4. Web 初始固定 P1/P2 eager，均无 `fetchPriority=high`；恢复到 P201 时先下载 P1/P2，目标图晚约 820ms 发起。
5. Web 所有页面使用固定 900x1280/2:3 占位。生产图片存在 1280x1800、1024x1024、1216x832 等比例，造成明显布局跳动。
6. Android `loadReader` 等待章节、完整漫画和收藏全部完成；登录收藏可受 25 秒 API 超时影响，虽然章节图片清单已到仍不展示。
7. Android 在当前图可读前预取后 4 页，滚动时重复调度重叠窗口；40 页顺序阅读会发起 150 次显式 enqueue，且离开章节不能主动取消。
8. Android `onSuccess` 早于 Telephoto `imageState.isImageDisplayed`，现有 Loading 消失不能证明图片可读。
9. Android 先以 item 0 创建列表再 effect 跳到恢复页，可能浪费第 0 页请求。

## Confirmed exclusions

- 不存在等待整章图片完成的 `Promise.all` 门禁；第一张 Web 图片也不是 lazy。
- 评论、推荐和统计接口没有阻塞图片清单；真正阻塞的是上述 layout、收藏、广告和浏览统计工作。
- 单图失败已按页隔离，图片解码是 async，listener/observer 有 cleanup。
- 当前没有真机内存或 DOM trace 证明必须更换现有按需挂载/LazyColumn 方案。
- Web 没有发现同 URL 的 React preload 与 `<img>` 双重下载。

## Proposed design

### 1. Shared reader query path

在 `manga-service` 增加专用 reader-data 用例：

1. 用一次 published manga resolver 保持“精确 slug 优先、纯数字 ID fallback”语义。
2. 一次读取已发布章节概要并定位当前章节，保证章节导航仍可用。
3. 一次按 `page_index ASC` 读取当前章页面。

Web 页面和章节 API 共用该用例。Web 用 React request cache 在 metadata/page 之间复用 Promise。公开 API shape 保持 `{ manga: { id, title, coverUrl }, chapter }`，不改变 Android 契约。

不在本任务引入长期 response cache：当前发布/下架没有完整的 tag invalidation，缓存陈旧会破坏权限和内容正确性。

### 2. Remove noncritical Web gates

- 将同 URL 阅读路由移动到独立 `(reader)` route group，使用最小 layout，避免 `(site)` header/footer 的身份和设置查询。
- Server Component 只等待漫画开关、reader-data 和权限/发布校验。
- 收藏/身份和广告各自作为 Promise 传入独立 Suspense 子树，由 Client Component 用 React `use()` 消费；漫画页面和当前图不等待这些结果。
- 使用 Next `after` 注册浏览统计，使响应不等待写入。实现时确保 cookies/headers 身份信息在允许的请求上下文中捕获，并对统计失败记录错误而不影响响应。

### 3. Correct Web image scheduling

- 首次 SSR 只挂载当前必需页，并设置 `loading="eager"`、`fetchPriority="high"`；邻近页为低优先级按需加载。
- 独立 viewport observer 使用真实视口交叉面积维护可见集合并选择当前页；只有它能更新页码和阅读进度。
- 独立 prefetch observer 使用有限 rootMargin，仅扩展 loaded set，不触碰 active page。
- localStorage 恢复在 layout effect 中尽早设定目标页、加载集和高优先级，然后滚动；由于服务端不能读取浏览器 localStorage，首次 HTML 仍可能请求 P1，此限制必须在结果中量化。
- 匿名状态明确时完全跳过云进度 PUT；登录状态才防抖上传，并在卸载/隐藏时刷新最终值。
- 将页面列表/页面项拆到稳定 memo 边界，使用稳定 ref 回调；工具栏显示和 active page 改变不重新构造全部图片元素。

### 4. Progressive Android bootstrap

- `loadReader` 以章节结果作为关键结果。章节 API 已返回漫画概要和 pages，可立即发布 `ReaderContent`；完整漫画详情和收藏并行作为可选增强结果。
- 优先复用详情页或上一章节已有的同漫画详情/收藏；使用 request generation/id 校验，旧异步结果不能覆盖新章节。
- `LazyListState` 直接以有界恢复页（加广告偏移）初始化；广告随后到达时只做必要的一次位置校正。
- 当前页面使用 Telephoto `imageState.isImageDisplayed` 作为可读事件。只有当前页可读后才预取后 2 页。
- 每章维护已调度 URL set 与 Coil `Disposable` 集合；每个 URL 最多 enqueue 一次，切章/退出时 dispose 并清空。
- 保持原图 URL、disk cache、Telephoto 子采样、稳定 key 和单页 retry，不降低图片分辨率。

### 5. Layout ratio policy

Web 在图片尚未挂载时使用与既有 HTML `width=900`、`height=1280` 契约一致的响应式占位，图片加载后由浏览器按真实 intrinsic size 和 `height:auto` 排版；不再用绝对 `contain-intrinsic-size` 为整章累积错误高度。Android 继续让 Telephoto/Coil 在 drawable 可用后使用真实比例。当前实现不会把运行时尺寸持久化或回写到其他页面，因为 URL 之外没有稳定的尺寸契约。

Web/Android 在首次请求前仍无法知道未加载图片的准确尺寸。不在本任务增加空置 width/height 字段：没有生产者更新或历史回填时，它不会改善线上首屏，反而扩大数据库/API 契约。后续应单独完成生产者携带尺寸、可空 schema/API 兼容和历史图像头部受控回填。

## Concurrency and stale-result safety

- Web Suspense promise 的错误只降级对应收藏/广告 UI，不影响 pages。
- Android 为每次 reader load 分配 generation；任何完整详情、收藏或预取回调在写状态前检查 generation 和章节键。
- 章节切换时取消旧的可取消 Job/Disposable。不可取消的网络完成结果因 generation 不匹配被丢弃。
- 进度只从真实当前页产生，并去重相同 page index。

## Measurement design

### Web automated trace

- 390x844@3x、4x CPU throttle、150ms RTT、1.6Mbps down、冷 HTTP cache。
- 至少 5 次取中位数；记录 navigation start 到目标图片 request start、response end、`img.decode()` 后 2 RAF、LCP 及 LCP element。
- 分别测 P1 和 localStorage 恢复 P201；记录首屏图片请求数、请求优先级、未滚动页码和进度写入。

### Android instrumentation/manual trace

- 从同一导航动作记录 chapter API start/end、当前图 request start、Coil success、Telephoto `isImageDisplayed`、连续滚动等待与错误。
- 冷/暖 disk cache 分开测；同设备、同 APK、同章节至少 5 次。
- 记录预取 enqueue 唯一 URL 数、重复次数、取消数和内存峰值。
- 本地不运行 Gradle。静态/纯逻辑检查在仓库执行，APK 构建与真机 trace 交给 GitHub Actions/设备。

## Rollout and rollback

- 查询/API 契约先通过服务测试，再接入 Web/Android。
- Web route group 迁移保持公开 URL 不变，可独立回退。
- Android progressive merge 和 prefetch scheduler 分开提交/验证，出现状态错乱可恢复旧加载协调器而不影响 API。
- 不修改 `/cdn-img` 路由和图片 URL 重写，避免重新引入 Android 直连故障。

## Residual risks

- 外部图片 CDN 的冷缓存会显著影响 TTIR；仓库无法控制其上游对象存储。
- Web localStorage 只在水合后可读，无法完全避免服务端先发 P1，除非未来引入 cookie/server-readable progress。
- 旧页没有图片尺寸，首次未缓存页面仍可能布局跳动。
- 正式数据库距离/连接池饱和与 APK 真机解码/内存尚无生产级 trace，必须在验证报告中区分未确认项。
