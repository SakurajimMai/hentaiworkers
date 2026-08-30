# Technical Design - Native Kotlin Android Client

## 1. Decision Summary

将现有 Expo 客户端一次性替换为单 Activity、单 Gradle app module 的原生 Android 应用。主要页面使用 Kotlin + Jetpack Compose；Media3 提供原生播放，Coil 提供目录图片，支持子采样的成熟 Compose 图片组件承担阅读页高分辨率缩放，HTML 广告保留在受限 WebView 中。

工程继续位于 `mobile/android/`。`mobile/` 作为移动端边界，删除 Expo 路由、组件、服务、Node 配置和包锁；取消对 `/android` 的忽略并提交完整 Gradle wrapper 与原生源码。保留此层级可以复用当前 CI 路径，同时避免让根 Next.js 工具链接触 Android 工程。

## 2. Repository Boundary

```text
mobile/
  .gitignore
  assets/                         # 原始品牌资产，可保留作为设计源
  android/
    build.gradle.kts
    settings.gradle.kts
    gradle.properties
    gradle/libs.versions.toml
    gradle/wrapper/*
    gradlew
    gradlew.bat
    app/
      build.gradle.kts
      proguard-rules.pro
      src/main/AndroidManifest.xml
      src/main/java/de/ixacg/animestream/
      src/main/res/
      src/test/
      src/androidTest/
```

根 `.dockerignore`、TypeScript、ESLint 和 App Docker 镜像继续排除整个 `mobile/`。原生客户端只依赖公开 API，不引用 `lib/server` 或数据库代码。

## 3. Application Architecture

保持一个 Gradle app module，使用包级分层，避免为当前规模引入多 module 构建开销。

```text
de.ixacg.animestream
  AnimeStreamApplication.kt       # AppContainer、ImageLoader、迁移启动
  MainActivity.kt                 # Compose 入口、系统栏、导航宿主
  core/
    network/                      # OkHttp、CookieJar、Retrofit、错误映射
    database/                     # Room、DAO、旧 RKStorage 导入
    model/                        # API/domain model
    media/                        # URL 规范化、请求头、图片加载
  data/
    remote/                       # API DTO 与 service
    local/                        # 收藏、历史、会话存储
    repository/                  # catalog/auth/library/ads repositories
  ui/
    navigation/                   # destination、deep link、adaptive shell
    theme/                        # tokens、type、shape、motion
    components/                   # cards、state、HTML ad、adaptive grids
    home|discover|manga|library|account|detail/
  player/                         # Media3 状态与广告 overlay
  reader/                         # 条漫状态、页项、chrome、章节 sheet
```

依赖通过轻量 `AppContainer` 和显式 ViewModel factory 注入。状态使用 immutable UI state + `StateFlow`；一次性导航和 snackbar 使用不会重放的事件流。Compose 列表使用 stable key，所有网络/数据库工作离开主线程。

## 4. Navigation And Information Architecture

紧凑手机使用五项底部导航：

```text
首页 | 发现 | 漫画 | 书架 | 我的
```

“书架”内使用分段标签保留“收藏”和“历史”两项能力；编辑、移除和清空操作不变。平板/宽屏切换 NavigationRail，并让目录/详情采用更宽的自适应布局。里番标签通过发现页筛选入口和详情标签进入；现有 `animestream` deep links 映射到对应原生 destination。

该调整只合并导航入口，不合并存储或服务端语义。任何一类收藏/历史仍需最多两次点击到达。

## 5. Visual System

采用仓库设计方向中的“cool ink + warm paper text + desaturated ember accent”，而不是复刻现有紫色设计板或 UI skill 返回的网页落地页配色。

- Canvas: 近黑冷色背景；阅读器和播放器使用纯黑。
- Surface: 少量层级表面和分隔线，不把页面 section 包成浮动卡片。
- Accent: 低饱和暖红/琥珀仅用于当前导航、进度和主要动作。
- Typography: Android 系统中文字体优先；标题、正文和数字元信息建立明确层级，不在线下载字体。
- Shape: 卡片和工具面板圆角不超过 `8dp`；图标按钮保持圆形触控区。
- Motion: 仅使用短淡入、内容状态交叉淡化和系统弹簧反馈；减少动态效果时关闭位移。
- Media: 海报使用稳定 `2:3` 比例；详情首屏以真实封面/剧照为视觉信号。

所有独立图标使用 Material Symbols/Icons 并配置 content description。Android 触控目标至少 `48dp`，相邻按钮至少 `8dp` 间距，固定栏消费 WindowInsets。

## 6. Networking And API Contract

使用 OkHttp + Retrofit + kotlinx.serialization：

- `BuildConfig.API_BASE_URL` 从 Gradle property 或 CI 环境读取，默认 `https://www.ixacg.de`。
- 所有请求发送 `Accept: application/json`；JSON 请求发送 `Content-Type: application/json`。
- 持久 CookieJar 只保存目标站点 Cookie，正确接收 `Set-Cookie` 并在登录、`/api/me*` 请求携带会话。
- 非 2xx 响应解析现有字符串或 `{ error: { message } }` 形状并映射为统一 `ApiError`。
- DTO 保持字段可空性和当前默认值，不让单个缺失的可选字段使整页解析失败。
- 列表 query、分页大小、排序、标签和搜索参数与 `mobile/services/api.ts` 基线一致。

`MediaUrlNormalizer` 保持现有规则：绝对 URL 校验、逗号媒体列表、`image.ixacg.de` 改写到 `${origin}/cdn-img/...`。图片请求继续发送 `Accept` 和站点 `Referer`。

## 7. Local Data And Upgrade Migration

新客户端使用 Room 保存四类结构化列表，DataStore 保存会话 Cookie、迁移版本和少量设置。

首次启动迁移流程：

1. 检查 DataStore 中的 `legacy_storage_migration_version`。
2. 若旧 `databases/RKStorage` 存在，以只读 SQLite 打开 `catalystLocalStorage(key, value)`。
3. 只查询五个已知 key：`@auth/cookie`、`@anime/history`、`@anime/favorites`、`@manga/history`、`@manga/favorites`。
4. 对每个 JSON 数组独立解析与校验；合法记录在一个 Room transaction 中按业务主键 upsert。
5. Cookie 通过格式校验后写入 Cookie store。
6. 只有导入事务成功后写迁移版本；旧 `RKStorage` 永不删除，便于失败回滚。

重复运行使用 upsert 与时间戳冲突规则，不重复记录，不覆盖时间更新的原生记录。全新安装在找不到旧表时直接写完成标记。

登录后的 repository 行为保持现有语义：已登录优先云端，非鉴权网络失败回退本地；收藏切换先请求云端再更新本地镜像；登录成功后将本地收藏和历史尽力合并到云端。

## 8. Video Player

使用 AndroidX Media3 ExoPlayer 处理 MP4/HLS，并在 Compose 中承载 `PlayerView` 或官方 Compose media UI。自定义 controller 保留播放、暂停、seek、时长、倍速、比例和返回；播放器 lifecycle 与 Activity/导航生命周期绑定，离开时释放。

播放页：

- 进入后锁定横屏、edge-to-edge、隐藏系统栏；返回或销毁时恢复竖屏。
- 使用站点 Referer 和兼容 User-Agent 创建 media data source。
- 只有媒体地址有效时记录观看历史；网络/解码错误显示可重试状态。
- 前贴片广告作为阻塞 overlay，在倒计时结束或达到可关闭时间前阻止主视频播放。
- 暂停广告只在非结束态的用户暂停时显示，恢复播放立即关闭。
- 视频/图片广告使用 Media3/Coil；HTML 广告使用独立受限 WebView，外链交给系统浏览器。

## 9. Manga Reader

只实现当前产品的连续纵向阅读模式。TachiyomiJ2K 作为交互参考，而非代码基础；参考版本固定到 commit `8df100d6e616851e329b274964c726dcef0556b6`。

核心状态：

```text
ReaderUiState
  manga + chapter + ordered pages
  currentPageIndex
  chromeVisible
  zoomedPage
  previousChapter / nextChapter
  chapterSheetVisible
  pageLoadStates
```

实现原则：

- `LazyColumn` 使用页面 index 作为 stable key，只组合可见窗口。
- 高分辨率图片使用支持子采样的成熟 Compose 图片库；每页有占位、加载进度、失败与重试。
- 默认宽度适配屏幕；双指/双击放大后在图片内平移，回到最小缩放后纵向列表恢复滚动。
- 中央轻点显隐 chrome；滚动超过阈值或开始缩放时隐藏。
- 当前页以可见面积阈值计算；变化后 debounce 约 800ms 写进度。
- 预取后续 3-4 页；接近章节结尾时可预取下一章元数据，但不一次性解码所有图片。
- 顶部/底部 chrome 消费安全区；底部包含上一话、页码 slider、下一话；章节目录为 modal bottom sheet。
- 阅读器顶部/底部 HTML 广告作为列表 item，不能覆盖页面或阻断系统返回。

若 Compose 子采样组件在 CI 测试样本上出现长图内存或嵌套手势问题，回滚点为仅替换 `reader/` 呈现层，使用 AndroidView 包装 RecyclerView + 子采样 View；repository、reader state 和导航契约保持不变。

## 10. Ads

`AdsRepository` 缓存并规范化 `/api/ads`。信息流插入规则逐项保持：仅启用 slot，每个 slot 将 interval clamp 到 1..40，并在每 N 个内容后插入；刷新目录时强制刷新配置。

WebView 默认禁用文件访问、内容访问和多窗口，只允许必要 JavaScript；导航到 http(s) 外链时交给系统浏览器。后台提供的 HTML 仍被视为受信管理内容，但不暴露原生对象桥。

## 11. Build, Signing And Release

Gradle Kotlin DSL 将版本、API origin、签名和 APK 命名纳入可重复构建：

- Java 17 toolchain，提交 Gradle wrapper 和 version catalog。
- `versionCode = GITHUB_RUN_NUMBER`，本地解析不到时使用 `1`。
- release signing 只读取受分支规则保护的 `Production` environment 中四个 Secrets，不把 secret 写入仓库；普通分支使用无密钥的 `CI` environment。
- 仓库变量 `ANDROID_RELEASE_CERT_SHA256` 固定生产证书指纹，release APK 必须逐包匹配。
- 无 release keystore 时使用 debug signing，并在 artifact/release notes 标注 internal。
- Build 39 及更早版本使用公开 Expo debug 证书，不能作为生产密钥继续使用；首次安装新生产签名版前需卸载旧版并提示未同步本地数据风险。
- 当前原生依赖为四种 ABI 提供 `.so`，因此构建真实的 `arm64-v8a`、`armeabi-v7a`、`x86_64`、`x86` split 和 universal APK；CI 必须验证每个 split 只含目标 ABI，并禁止将同一 APK 伪装为多个架构。

工作流：

```text
checkout -> JDK/Android SDK/Gradle cache
         -> ktlint/static checks -> Android lint -> unit tests
         -> assembleRelease -> APK integrity/package/version/signature checks
         -> upload artifact
         -> release only on main
```

增加 `pull_request` 和 `workflow_dispatch` 验证入口，使分支可以完全远程编译而不接触生产密钥。`main` push 先生成正式签名待验收 Artifact，只有在同一提交上显式选择 `publish_release` 才创建公开 Release。根部署测试改为断言无 Expo/Node 步骤、存在 Gradle checks、构建与条件发布。

## 12. Testing Strategy

- Pure unit: URL rewrite、query、错误解析、广告 interval、repository fallback/merge、旧 JSON 解析与冲突规则、reader page/chapter state。
- MockWebServer contract: catalog、auth Cookie、favorites、watch/manga progress、ads 成功与错误响应。
- Room migration: 构造旧 `RKStorage` fixture，验证五个 key、损坏条目、重复运行和旧库保留。
- ViewModel: loading/content/empty/error/retry、分页去重、筛选变化、编辑删除。
- Compose UI: 关键导航、登录表单、书架分段、详情动作、48dp target 与大字体布局。
- Reader: 页码计算、debounce、章节边界、缩放/滚动状态切换、页面失败重试。
- Player: 广告计时状态机、暂停/恢复规则、横竖屏恢复；真实解码作为远程人工 smoke。
- CI artifact: `aapt dump badging`/`apkanalyzer` 检查包名、versionCode、launcher activity、文件完整性和签名。

## 13. Rollout And Rollback

在独立分支完成原生工程，GitHub Actions 分支构建通过后才允许合入 `main`。合入后由相同包名和签名覆盖升级。

回滚使用上一个 `build-*` Release 和对应 Git commit。旧 `RKStorage` 保留意味着回滚到 Expo 版仍可访问旧数据；Kotlin 版新增数据若已登录会同步云端，未登录的新原生本地数据不保证旧 Expo 版可见，需在发布说明中说明这一单向兼容边界。

## 14. Main Risks

| Risk | Mitigation |
|------|------------|
| 本地禁止编译导致反馈慢 | 先落 CI 骨架和最小 app，再按小批提交触发远程验证 |
| Cookie 行为与 fetch 不同 | 持久 CookieJar + MockWebServer 的 Set-Cookie/重启测试 |
| 长漫画 OOM 或手势冲突 | 子采样库、可见窗口、预取上限、reader 呈现层回滚点 |
| HTML 广告与原生 UI 不匹配 | 受限 WebView 封装，保持现有配置优先于视觉纯度 |
| 覆盖安装丢本地数据 | 只读旧库、幂等迁移 fixture、同包名/同签名检查 |
| CI 首次构建才发现依赖问题 | 先完成 Gradle/CI vertical slice，再扩展页面 |
