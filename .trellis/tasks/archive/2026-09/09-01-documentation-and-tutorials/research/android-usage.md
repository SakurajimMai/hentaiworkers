# Android 使用文档审计

## 范围与结论

本稿按当前工作树核对原生 Android 客户端、Android GitHub Actions、`README.md`、
`docs/mobile.md`、`docs/user-guide.md` 和 `docs/api/README.md`。它只记录可由代码证明的
现状，不把网页端行为推定为 App 行为，也不把 Actions Artifact 当作公开安装包。

结论：`README.md:55-59` 与 `docs/mobile.md:3-114` 对工程结构、ABI、CI、更新检查和
阅读器的描述整体接近实现；主要缺口在普通用户文档。`docs/user-guide.md` 只有两条 App
摘要（`docs/user-guide.md:72-77`），没有安装、更新、登录、播放、阅读或故障排查教程，
而其中网页端的“续看”语义容易被误套到 Android。`docs/api/README.md:11-27` 也不是完整的
Android 集成契约，漏列客户端实际调用的广告、登录、会话、收藏和漫画进度接口。

本次未运行 Gradle 或安装 APK；仓库明确要求 Android 编译和自动化验证以 GitHub Actions
为准（`docs/mobile.md:25-36,104-114`）。

## 已验证的生产行为

### 安装、ABI 与发布

- App 包名为 `de.ixacg.animestream`，最低支持 API 24，即 Android 7.0；当前
  `versionName` 为 `2.0.0`，`versionCode` 取 GitHub run number
  （`mobile/android/app/build.gradle.kts:22-49`）。最低系统版本目前未见于普通用户文档。
- Gradle 生成 `arm64-v8a`、`armeabi-v7a`、`x86_64`、`x86` 四个 split 和一个
  universal APK（`mobile/android/app/build.gradle.kts:85-96`）。`README.md:59` 与
  `docs/mobile.md:64-72` 的选择建议准确：普通现代手机优先 `arm64-v8a`，旧 32 位手机
  用 `armeabi-v7a`，Intel 模拟器/少量 Intel 设备用 `x86_64` 或 `x86`，不能判断时用
  更大的 universal。
- 分支、PR 和手动任务都会先执行格式检查、Lint、单元测试和 release assemble
  （`.github/workflows/build-android.yml:3-18,99-108`）。构建后上传五个 APK、
  `SHA256SUMS` 和 `build-info.txt`，Artifact 保留 30 天
  （`.github/workflows/build-android.yml:249-291`）。
- 公开 GitHub Release 只有在 `main` 上手动勾选 `publish_release` 且使用正式签名时创建，
  并以 `build-<run>` 预发布形式附带五个 APK 与校验文件
  （`.github/workflows/build-android.yml:293-375`）。因此终端用户教程应只指向
  `https://github.com/SakurajimMai/hentaiworkers/releases`，不应指导用户下载内部 Actions
  Artifact。
- 工作流会删除仓库中超出最新五次的已完成 **Actions runs**
  （`.github/workflows/build-android.yml:377-434`）；当前文件没有删除旧 GitHub Releases
  的逻辑。文档若描述“只保留五份”，必须明确对象是 Actions runs，而非 Releases。
- Build 39 及以前使用旧 Expo debug 证书，不能直接覆盖为新生产签名版本；首次迁移需先
  同步/备份本地数据再卸载旧版（`docs/mobile.md:92`；发布说明生成逻辑位于
  `.github/workflows/build-android.yml:330-357`）。这是高风险安装提示，不应只藏在开发者文档。
- 原生首次启动会只读导入旧 `RKStorage/catalystLocalStorage` 中的 Cookie、收藏和历史，
  迁移有版本门控且不会删除旧库
  （`mobile/android/app/src/main/java/de/ixacg/animestream/core/database/LegacyStorageMigrator.kt:15-84`）。

### 更新提醒

- 首页两个目录请求结束后才独立触发更新检查；自动检查失败不显示错误，手动检查才显示
  “检查更新失败”或“已是最新版本”
  （`mobile/android/app/src/main/java/de/ixacg/animestream/ui/AnimeStreamViewModel.kt:184-214,251-289`）。
- 更新请求上限约 4 秒；成功后 24 小时内不再自动检查，失败后退避 6 小时；“稍后提醒”
  对该 Build 暂停 24 小时
  （`mobile/android/app/src/main/java/de/ixacg/animestream/data/repository/UpdateRepository.kt:40-126,129-151`；
  `mobile/android/app/src/main/java/de/ixacg/animestream/data/repository/UpdateCheckStore.kt:10-60`）。
- 更新清单必须匹配固定包名、`build-N` 标签、固定 GitHub 仓库、五个 ABI、文件大小和
  SHA-256 字段；客户端按设备支持列表选择首个匹配 ABI，无法匹配才用 universal
  （`mobile/android/app/src/main/java/de/ixacg/animestream/data/repository/UpdateRepository.kt:153-208`）。
- 提醒仅在五个主导航页显示。点“立即更新”用外部 `ACTION_VIEW` 打开 APK URL，失败时再
  打开 Release 页面；之后由浏览器和 Android 安装器接管
  （`mobile/android/app/src/main/java/de/ixacg/animestream/ui/navigation/AnimeStreamApp.kt:74-160`）。Manifest
  只有网络权限，没有安装包权限（`mobile/android/app/src/main/AndroidManifest.xml:2-12`）。
  所以这是“启动后拉取检查 + 弹窗”，不是推送通知、后台下载、静默安装或强制升级。
- 客户端验证的是更新清单中的 URL、大小和哈希格式，然后打开外部下载地址；当前代码没有
  对浏览器下载后的 APK 文件重新计算 SHA-256。教程可以把 Release 中的 `SHA256SUMS`
  作为高级手工校验步骤，但不能宣称 App 已完成文件校验。
- `docs/mobile.md:44` 对上述非阻塞机制基本准确，但 `docs/user-guide.md` 完全缺少终端用户
  操作：“我的 -> 检查更新”、24 小时稍后提醒、浏览器下载、允许该来源安装、系统确认。

### 登录、Cookie、本地与云端

- App 登录页接受“用户名或邮箱 + 密码”，明确使用网站账号；没有注册、忘记密码或重置
  密码入口（`mobile/android/app/src/main/java/de/ixacg/animestream/ui/library/LibraryAccountScreens.kt:331-387`）。
  新用户注册和密码重置必须在网页完成，网页路径见 `docs/user-guide.md:36-57`；现有 Android
  文档没有说清这条跳转关系。
- 登录 Cookie 只保存 API 主机下的 `animestream_session` 名值，存在 DataStore；登录会等待
  Cookie 持久化，退出即使服务端请求失败也会清除本机 Cookie
  （`mobile/android/app/src/main/java/de/ixacg/animestream/core/network/SessionCookieStore.kt:20-124`；
  `mobile/android/app/src/main/java/de/ixacg/animestream/data/repository/SessionRepository.kt:39-64`）。
- 冷启动有 Cookie 时会调用 `/api/me` 恢复会话；该请求失败时本次进程把用户视为未登录，
  但此路径不会删除持久 Cookie
  （`mobile/android/app/src/main/java/de/ixacg/animestream/data/repository/SessionRepository.kt:28-37`）。
  因而弱网下暂时显示“未登录”不等于账号或 Cookie 已被清除。
- 未登录时收藏与历史存 Room。收藏查询不设数量上限；里番历史和漫画历史各只保留最近 50 条
  （`mobile/android/app/src/main/java/de/ixacg/animestream/core/database/LibraryDatabase.kt:57-123`）。
- 登录后书架优先并行读取云端收藏、观看标记和漫画进度；任一请求异常时整份快照回退本地
  （`mobile/android/app/src/main/java/de/ixacg/animestream/data/repository/LibraryRepository.kt:40-77`）。
  收藏操作先写云端再镜像本地，401/403 时退回本地
  （`mobile/android/app/src/main/java/de/ixacg/animestream/data/repository/LibraryRepository.kt:80-138`）。
  这支持“弱网仍可看到部分本地数据”，但不能承诺完整云端书架已经离线缓存。
- 登录成功后会尽力把本机收藏和历史合并到云端，单项失败不会阻止登录完成
  （`mobile/android/app/src/main/java/de/ixacg/animestream/ui/AnimeStreamViewModel.kt:705-717`；
  `mobile/android/app/src/main/java/de/ixacg/animestream/data/repository/LibraryRepository.kt:223-263`）。
- 漫画会记录精确章节和页码，书架历史可直接回到该位置
  （`mobile/android/app/src/main/java/de/ixacg/animestream/data/repository/LibraryRepository.kt:161-188`；
  `mobile/android/app/src/main/java/de/ixacg/animestream/ui/library/LibraryAccountScreens.kt:121-138,247-258`）。
- 里番 App 当前只在加载到合法媒体地址时写入 `positionSeconds = 1` 的“观看标记”，书架点击
  里番历史回详情页，不记录或恢复真实 Media3 播放秒数
  （`mobile/android/app/src/main/java/de/ixacg/animestream/ui/AnimeStreamViewModel.kt:727-739`；
  `mobile/android/app/src/main/java/de/ixacg/animestream/data/repository/LibraryRepository.kt:140-158`；
  `mobile/android/app/src/main/java/de/ixacg/animestream/ui/library/LibraryAccountScreens.kt:129-138`）。
  因此 `docs/mobile.md:14` 的“继续观看”应改为“打开观看记录/返回详情”；
  `docs/user-guide.md:81-88` 的每 20 秒记录、跨设备续播是网页行为，不得当作 Android 教程。

### 导航、播放与阅读

- 主导航是“首页、发现、漫画、书架、我的”五项，宽度达到 700dp 时改用侧栏
  （`mobile/android/app/src/main/java/de/ixacg/animestream/ui/navigation/AnimeStreamApp.kt:59-118`）；
  `docs/mobile.md:9-15,23` 与实现一致。
- 播放器直接把规范化后的 HTTP(S) 媒体 URL 交给 Media3，支持跨协议重定向、原生控制器、
  重试、前贴片和暂停广告
  （`mobile/android/app/src/main/java/de/ixacg/animestream/player/PlayerScreen.kt:79-167,170-267`）。
  倍速按 `1x -> 1.25x -> 1.5x -> 2x` 循环，画面比例按适应、填充、裁切循环
  （同文件 `:275-325`）；播放页进入传感器横屏并隐藏系统栏，退出恢复系统栏和竖屏
  （同文件 `:523-543`）。`docs/mobile.md:19` 基本准确。
- 媒体并非都能概括为“本站托管 progressive MP4”：客户端允许外部 HTTP(S) URL，只有
  `image.ixacg.de` 图片会重写到同源 `/cdn-img`
  （`mobile/android/app/src/main/java/de/ixacg/animestream/core/media/MediaUrlNormalizer.kt:7-64`），
  Media3 可处理实际媒体源。`docs/user-guide.md:9,66` 是网页端且过度限定，跨端总述应改为
  “由作品媒体地址提供，Android 支持 MP4/HLS”，不要保证全部本站托管。
- 阅读器是纵向连续列表：滚动时自动隐藏工具栏，轻点未缩放页面切换工具栏，预取当前页后
  四页（`mobile/android/app/src/main/java/de/ixacg/animestream/reader/ReaderScreen.kt:94-183,202-239`）。
  顶底工具栏使用 `safeDrawing` 避开刘海和导航区（同文件 `:243-346`）。
- 拖动进度条期间就会换算页码、取消旧跳页任务并立即定位，松手再次强制提交最终页
  （同文件 `:121-131,311-329`）；章节目录只显示“第 N 话”（同文件 `:349-388`）。
- 单页支持最大 4 倍缩放，超长图片使用受限视口，失败可“重试本页”
  （同文件 `:395-487`；`mobile/android/app/src/main/java/de/ixacg/animestream/reader/ReaderLogic.kt:36-58`）。
  `docs/mobile.md:21` 大体准确；“Telephoto + Coil 自动子采样”属于依赖实现细节，面向用户
  建议简化为“支持高分辨率缩放和超长页”，除非另有依赖级验证。

### 网络与故障边界

- 生产 API 默认 origin 是 `https://www.ixacg.de`，可由构建参数覆盖
  （`mobile/android/app/build.gradle.kts:15-20`；`.github/workflows/build-android.yml:28-30`）。
- JSON API 使用 8 秒连接、20 秒读写、25 秒整次调用超时并启用连接失败重试；超时、普通
  网络错误、5xx 和非法 JSON 分别映射成中文错误
  （`mobile/android/app/src/main/java/de/ixacg/animestream/core/network/AnimeStreamApi.kt:172-194,221-271`）。
  `docs/mobile.md:38-42` 描述了启动与筛选的非阻塞行为，但 `docs/user-guide.md:112-120`
  没有 Android 错误文案对应的排查步骤。
- “手机网络正常”不能排除站点 API、DNS/私有 DNS、代理/VPN、TLS、CDN 图片或单个视频源
  不可达。教程应先区分：全部目录都失败、只有图片失败、只有某部视频失败、只有更新检查
  失败。目录能打开但视频失败通常是媒体源问题，不应笼统归因于手机断网。
- 首页里番与漫画并行请求，一栏先成功即可结束全屏等待；空筛选结果会结束加载并显示清除
  筛选入口（`mobile/android/app/src/main/java/de/ixacg/animestream/ui/AnimeStreamViewModel.kt:184-214`；
  现有行为说明见 `docs/mobile.md:40-42`）。故障文档不应再建议用户无限等待旋转状态。

## 文档差距与修订优先级

### P0：会造成数据或功能误解

1. 在 Android 教程显著位置写明最低 Android 7.0、唯一公开下载源、五种 ABI 选择，以及
   Build 39 以前需卸载且会丢失未同步本地数据。
2. 把 Android 的里番“观看标记/打开历史详情”与网页的真实秒数续播彻底分开；漫画才支持
   精确章节与页码续读。修订 `docs/mobile.md:14`，并限制 `docs/user-guide.md:81-88` 的适用范围。
3. 明确更新是非阻塞拉取提醒：不推送、不静默安装、不自动下载；解释“稍后提醒”与手动检查。
4. 明确 App 无注册/重置入口，需先在网站完成；不要让用户在 App 内寻找不存在的按钮。

### P1：完整性与排障

1. 为 Android 增加按症状分流的排障：目录超时、图片失败、单个视频失败、登录暂时失效、
   更新检查失败、安装被系统拦截、签名不一致无法覆盖。
2. 说明本地与云端的实际边界：未登录数据在本机，登录后尽力合并；云端读取失败回退本地
   不代表完整离线镜像；卸载会删除未同步 Room/DataStore 数据。
3. `docs/api/README.md:11-27` 至少补充 Android 实际使用的 `/api/ads`、`/api/auth/login`、
   `/api/auth/logout`、`/api/me`、`/api/me/favorites*` 和 `/api/me/manga-progress*`。当前
   `docs/api/openapi.yaml:3-12` 明确只描述公开只读 API，因此应另建“Android 私有会话接口”
   章节或扩展规范，而不是暗示现有 OpenAPI 已覆盖客户端合同。客户端调用证据见
   `mobile/android/app/src/main/java/de/ixacg/animestream/core/network/AnimeStreamApi.kt:48-165`。
4. `docs/api/README.md:206-253` 的 Build 66 JSON 应明确标注为静态示例，避免被当成当前最新版本。
5. 记录 Actions 只自动保留最近五次运行；不要写成 Releases 也会自动只留五份。

## 建议的 Android 终端用户教程大纲

1. **系统要求与下载来源**：Android 7.0+；只从项目 GitHub Releases 下载；如何识别最新
   `build-N`；Release 标成 prerelease 不等于内部 debug Artifact。
2. **选择正确 APK**：用一张五行表解释 `arm64-v8a`、`armeabi-v7a`、`x86_64`、`x86`、
   universal；默认推荐 arm64，未知才用 universal。
3. **首次安装与旧版迁移**：浏览器下载、允许该来源安装、系统确认；Build 39 及以前的
   签名断点；先登录同步再卸载；原生版首次启动会尝试迁移旧数据。
4. **五个主页面快速上手**：首页、发现、漫画、书架、我的各自的目标操作，不展开开发信息。
5. **账号与同步**：网站注册/重置 -> App“我的”登录；用户名或邮箱；Cookie 恢复；本地收藏
   与历史登录后尽力合并；退出与卸载的区别。
6. **收藏与历史**：书架的收藏/历史标签、编辑删除、清空确认；里番仅观看标记和返回详情；
   漫画精确续读；本地历史各类型最多 50 条。
7. **播放教程**：进入横屏、点按原生控制器、倍速循环、画面比例循环、前贴片/暂停广告、
   重试和退出恢复竖屏；明确暂不支持跨端按秒续播。
8. **漫画阅读教程**：纵向滚动、轻点显隐工具栏、双指缩放、实时拖页、上一/下一话、章节
   目录、坏图重试、返回后从章节和页码继续。
9. **更新教程**：启动后何时检查、弹窗按钮、“我的 -> 检查更新”、24 小时稍后提醒、浏览器
   与系统安装确认；强调不是推送或静默安装。
10. **按症状排障**：先判断 API/图片/媒体/更新/登录哪一层失败；提供站点网页对照、切换
    Wi-Fi/移动数据、临时停用异常代理/VPN/私有 DNS、重试和联系管理员时需附带的 Build、
    页面、作品名与完整错误文案。
11. **完整性校验（可选）**：高级用户用 Release 的 `SHA256SUMS` 对下载文件做手工校验，
    不暗示 App 已校验浏览器下载的文件。

## 不应写入教程的错误承诺

- “App 会把新版本推送到通知栏、自动下载或静默安装”。
- “登录后 Android 会像网页一样每 20 秒保存视频秒数并跨设备续播”。
- “云端书架已完整离线缓存”或“卸载不会丢本地数据”。
- “所有视频都是本站托管的 progressive MP4”。
- “Actions 只保留五次，所以 GitHub Releases 也只保留五份”。
- “任何标有 release 的 Actions Artifact 都能覆盖正式版”；签名必须一致。
