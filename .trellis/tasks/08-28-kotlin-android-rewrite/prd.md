# Rewrite Android Client In Kotlin

## Goal

将 `mobile/` 的 Expo 54 / React Native Android 客户端替换为原生 Kotlin 客户端，在不减少现有用户功能、服务端契约和发布能力的前提下，改善界面完成度、播放体验、漫画阅读体验和长期可维护性。

## Product Requirements

### Native Android

- APK 必须由 Kotlin Android 工程产出，不再包含 Expo、React Native、Metro、Hermes 或 JavaScript 业务运行时。
- 用户界面以 Jetpack Compose 为主；确有必要的播放器、WebView 广告或高分辨率图片组件可以通过标准 Android View 互操作。
- 保持应用名 `AnimeStream`、包名 `de.ixacg.animestream`、自定义 scheme `animestream` 和现有图标资产。
- 保持现有最低 Android 支持范围，不因重写主动淘汰仍可安装当前 APK 的设备。
- 移动端继续只消费现有 HTTP API，不导入 Next.js 私有模块，不进入根应用镜像或根 TypeScript/ESLint 编译范围。

### Existing Feature Parity

- 首页保留热门里番、漫画入口、内容卡片、下拉刷新、加载/空/失败状态和信息流广告。
- 里番发现保留搜索、标签筛选、无限加载、去重、下拉刷新和详情跳转。
- 标签浏览能力必须保留；允许将隐藏的独立标签路由整合为发现页筛选入口。
- 漫画目录保留标题/作者/标签搜索、最近更新及日榜/周榜/月榜/总榜、标签筛选、无限加载和信息流广告。
- 里番详情保留标题与元数据、简介、标签、收藏、播放、剧照灯箱和相似推荐。
- 漫画详情保留作者与页数/章节数、简介、标签、收藏、章节目录、开始阅读和推荐内容。
- 历史与收藏保留里番/漫画两类内容、登录与未登录两种数据来源、删除、清空历史及继续观看/阅读。
- 我的页面保留会话恢复、网站账号登录和退出。
- 登录后收藏、观看历史、漫画章节与页码继续和网页账号同步；登录时继续执行本地数据的尽力合并。
- 所有现有广告位继续工作：信息流 HTML/链接广告、阅读页顶部/底部 HTML 广告、播放器前贴片和暂停广告。
- 保留媒体 URL 规范化、`image.ixacg.de` 同源代理重写、图片请求头以及无效媒体的容错。

### Video Playback

- 同时播放现有 MP4 和 HLS (`.m3u8`) 地址。
- 播放页进入横屏全屏，离开时恢复竖屏；系统栏、返回、加载、错误和重试行为完整。
- 提供播放/暂停、拖动、时长、倍速和画面比例等现有用户可用控制。
- 前贴片广告继续支持视频、图片或 HTML，保留总时长、可关闭倒计时、静音和点击链接。
- 暂停广告继续支持视频、图片或 HTML，并在恢复播放或用户关闭时消失。
- 打开有效播放器后继续写入本地观看历史，并在登录时同步现有观看标记语义。

### Manga Reader

- 保留纵向连续条漫阅读，不增加来源扩展、离线下载或多阅读模式等产品范围。
- 参考 TachiyomiJ2K 的阅读交互：全屏黑色画布、点按显隐工具栏、滚动/缩放时隐藏工具栏、当前页/总页数、可拖进度、章节面板、上一话/下一话。
- 保留双指缩放能力，并改善为高分辨率图片友好的缩放与平移；不得因放大导致整章列表无法恢复滚动。
- 页面应独立显示加载、失败与重试状态，预取临近页面，并避免一次解码整章大图造成内存峰值。
- 当前页变化后按现有节流语义记录漫画章节和页码；重新进入历史可继续打开对应章节。
- 阅读页顶部和底部广告、章节末尾提示及无上一话/下一话状态继续保留。

### Upgrade Compatibility

- 使用与现有 APK 相同的包名和发布签名，使 Kotlin APK 可以覆盖安装。
- 首次启动 Kotlin 版本时，必须幂等迁移旧 `RKStorage` 中的登录 Cookie、里番/漫画收藏与历史。
- 迁移失败不得删除旧数据库；部分损坏的单项数据不得阻塞应用启动，其余合法数据仍应导入。
- 新安装不得创建虚假的旧数据，重复启动不得重复或覆盖较新的原生数据。

### Design And Accessibility

- 视觉方向为内容优先的安静影院/编辑式界面，保持深色阅读与播放环境，避免现有单一紫色调和过度卡片化。
- 内容图片是目录与详情的主要视觉信号；控件使用一致的 Material 图标与语义色。
- 手机保持高效单手导航；平板和横屏使用自适应列数或导航栏，不简单拉伸手机布局。
- Android 可点击目标至少 `48dp`，相邻目标保留间距，适配系统安全区、字体缩放、TalkBack 和减少动态效果。
- 加载、空、错误、离线/网络失败和禁用状态必须可识别并提供可执行的恢复动作。

### CI-Only Build And Release

- 开发机只需编辑代码，不要求安装 JDK、Gradle 或 Android SDK，也不在本地执行 Android 编译。
- GitHub Actions 负责 Kotlin 格式/静态检查、Android Lint、单元测试和 Release APK 编译。
- `main` push 先生成正式签名待验收 Artifact；在同一已验证提交上显式选择 `publish_release` 后创建 `build-<run_number>` 预发布 Release，非 `main` 分支不得接触生产密钥或发布 Release。
- `versionCode` 继续来自 GitHub run number；生产 API 默认继续为 `https://www.ixacg.de`。
- 继续支持现有四个签名 Secret；未配置发布密钥时只允许生成明确标记为内部测试的 debug-signed 产物。
- Actions Artifact 与正式 GitHub Release 同时提供真实的 `arm64-v8a`、`armeabi-v7a`、`x86_64`、`x86` split 和 universal APK，并在发布说明中标明适用设备。

## Constraints

- 不修改现有服务端 API 响应结构来迁就客户端重写。
- 不重新引入 MacCMS、works 表、流代理或已移除的播放器设置。
- 不实现 iOS、Web 或 Kotlin Multiplatform 客户端。
- 不直接复制 TachiyomiJ2K 的完整阅读器或无关模块；只参考交互与分层，并遵守其 Apache-2.0 许可边界。
- 不把根目录未跟踪的 `design.md` 纳入本任务提交；移动端所需设计约束在任务设计中独立记录。

## Acceptance Criteria

- [ ] `mobile/` 中不存在 Expo/React Native 业务代码、Node 包管理文件或 JS bundle 依赖，APK 入口为原生 Kotlin `Activity`。
- [ ] 功能对照表中的所有用户流程都有 Kotlin 实现和对应的自动或人工验收记录。
- [ ] 覆盖安装测试证明旧本地登录、收藏和历史可迁移，迁移可重复执行且失败可恢复。
- [ ] MP4、HLS、播放器前贴片/暂停广告、横竖屏恢复和错误重试通过验证。
- [ ] 条漫长列表、页级加载/重试、缩放、进度拖动、目录与章节切换通过验证，长章节无明显内存失控。
- [ ] 登录、退出、本地回退、登录后合并、收藏和两类进度 API 通过契约测试。
- [ ] 信息流、阅读页和播放器广告配置保持与 `/api/ads` 相同的启用与间隔规则。
- [ ] GitHub Actions 在非发布分支完成检查与五种 APK 构建，在已验证的 `main` 提交上显式发布包含全部五个 APK 的可下载 `build-*` Release。
- [ ] APK 保持 `de.ixacg.animestream`，生产 API、签名 Secret、图标和下载发布链路不变。
- [ ] 根应用的 lint、typecheck、测试、边界检查和构建不因移动端重写回归。
- [ ] `README.md`、`docs/mobile.md`、`docs/development.md`、`docs/deployment.md`、`docs/architecture.md` 和变更日志不再把客户端描述为 Expo。

## Notes

- “现有功能不发生变化”按“不删除能力、不改变服务端数据语义”执行。导航分组和视觉布局可以改进，但收藏、历史等能力必须仍然清楚且快速可达。
- Android 实际编译与测试只在 GitHub Actions 中执行；本地仅运行与 Android 编译无关的文本、配置和根应用检查。
