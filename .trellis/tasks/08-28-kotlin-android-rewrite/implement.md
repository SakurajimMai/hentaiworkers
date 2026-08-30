# Implementation Plan - Native Kotlin Android Client

## Working Rules

- 不在开发机运行 `gradlew`、Android Studio build、模拟器或任何 Android 编译。
- 每个 Android 验证点通过 GitHub Actions 分支构建完成；非 `main` 构建不得创建 Release。
- 不提交根目录已有的未跟踪 `design.md`。
- 每个阶段保持可回滚；只有功能矩阵与 CI 全绿后才删除最后的 Expo 源码。

## Phase 1 - Native Build Vertical Slice

- [ ] 创建实现分支并在 Trellis 记录 branch/base branch。
- [ ] 将现有 ignored `mobile/android` 整理为可提交的 Kotlin DSL Gradle 工程。
- [ ] 固定 Java/Gradle/AGP/Kotlin/Compose 兼容版本和 version catalog。
- [ ] 建立原生 `Application`、`MainActivity`、Compose theme 和最小启动界面。
- [ ] 复用包名、scheme、图标、启动画面、minSdk、edge-to-edge 与网络权限。
- [ ] 修改 `mobile/.gitignore`，提交 wrapper，忽略 build、keystore、IDE 和本地配置。
- [ ] 先改 Android workflow：分支验证、lint/test/assemble、版本号、签名、artifact 校验、仅 main 发布。
- [ ] 更新根部署测试对原生工作流的断言。
- [ ] 推送分支并取得第一份 GitHub Actions 可安装 APK；失败时只修构建基础设施，不继续堆页面。

Validation gate:

- GitHub Actions: Gradle checks、unit test skeleton、`assembleRelease`、APK package/version/signature validation 全绿。
- Local non-build: YAML/JSON/XML 解析、根部署测试、`git diff --check`。

## Phase 2 - Contracts, Storage And Migration

- [ ] 建立 API/domain models、Retrofit services、OkHttp client、错误映射和 persistent CookieJar。
- [ ] 实现 catalog、manga、ads、auth、favorites、watch progress、manga progress repositories。
- [ ] 实现 `MediaUrlNormalizer`、Referer/Accept header 和 CDN proxy rewrite。
- [ ] 建立 Room entities/DAO 和 DataStore session/migration state。
- [ ] 实现只读 `RKStorage.catalystLocalStorage` 的五 key 幂等迁移。
- [ ] 保持本地/云端优先级、鉴权错误回退、登录后 best-effort merge 和 50 条历史上限。
- [ ] 添加 DTO fixtures、MockWebServer tests、Room migration tests 和 repository tests。
- [ ] 将旧 TypeScript CDN rewrite 测试迁移为 Kotlin 测试，并移除根测试对 `mobile/services/media.ts` 的导入。

Validation gate:

- GitHub Actions: unit tests covering API, cookie restart, local/cloud semantics and migration fixtures。
- Review: API path、query、body、nullable field 与旧 `services/api.ts` 对照完成。

## Phase 3 - App Shell And Catalog UI

- [ ] 实现 ink/ember design tokens、typography、shape、motion 和 system insets。
- [ ] 实现 adaptive navigation：手机五项底栏、宽屏 NavigationRail、书架内收藏/历史分段。
- [ ] 实现通用 loading/empty/error/retry、poster card、adaptive grid、search、filter chip 和 HTML ad。
- [ ] 实现启动/session hydration、首页、发现、标签筛选、漫画目录。
- [ ] 保持分页大小、无限加载去重、刷新和广告 interval。
- [ ] 添加 Compose previews/UI tests，覆盖小手机、大字体、平板宽度与 TalkBack labels。

Validation gate:

- GitHub Actions: Compose/UI unit tests、lint、release assembly。
- Screenshot artifacts: 首页、发现、漫画、书架 shell 的 phone/tablet previews。

## Phase 4 - Details, Library And Authentication

- [ ] 实现里番详情、剧照灯箱、相似推荐、收藏与标签跳转。
- [ ] 实现漫画详情、推荐 fallback、章节目录、收藏与开始阅读。
- [ ] 实现书架收藏、历史合并列表、编辑删除、清空、继续观看/阅读。
- [ ] 实现我的、登录表单、会话恢复、退出和登录后本地合并状态。
- [ ] 覆盖加载、无媒体、无章节、服务器 401/404/500 和离线回退。

Validation gate:

- GitHub Actions: ViewModel/repository/UI tests and release assembly。
- Manual remote APK smoke: 全部导航、搜索、筛选、收藏、历史、登录/退出。

## Phase 5 - Native Video Player And Ads

- [ ] 集成 Media3 MP4/HLS 播放与 lifecycle-safe release。
- [ ] 实现横屏全屏、系统栏、返回竖屏、加载/错误/重试。
- [ ] 实现播放控制、seek、倍速和画面比例。
- [ ] 实现前贴片与暂停广告状态机，支持 video/image/HTML/click URL。
- [ ] 保持打开播放器时写本地/云端观看标记。
- [ ] 添加广告计时、pause/end 判定、状态恢复和错误单元测试。

Validation gate:

- GitHub Actions: player state tests、lint、release assembly。
- Manual remote APK smoke: 一条 MP4、一条 HLS、前贴片、暂停广告、返回方向恢复。

## Phase 6 - J2K-Inspired Manga Reader

- [ ] 先做高分辨率/长章节 reader prototype，验证 Compose 子采样与嵌套手势。
- [ ] 实现纵向 LazyColumn、稳定页面尺寸、页级加载/错误/重试与后续页面预取。
- [ ] 实现 pinch/double-tap zoom、pan、回到最小缩放后恢复纵向滚动。
- [ ] 实现 tap-to-toggle chrome、滚动/缩放自动隐藏、status/navigation bars。
- [ ] 实现页码、scrubber、章节 sheet、上一话/下一话和章节末尾状态。
- [ ] 实现 800ms 节流进度写入和进入章节时的历史记录。
- [ ] 插入 reader top/bottom HTML ads，确保不覆盖漫画与控制栏。
- [ ] 若 prototype 不满足内存/手势要求，只替换 reader 呈现层为 RecyclerView + subsampling View。

Validation gate:

- GitHub Actions: reader state/gesture coordination tests、长图 fixture、release assembly。
- Manual remote APK smoke: 短章、长章、坏图重试、缩放、快速拖页、跨章、广告、后台恢复。

## Phase 7 - Expo Removal, Documentation And Final Validation

- [ ] 删除 Expo routes/components/services/plugins、Node package files、Metro/app config 和生成 JS 库。
- [ ] 确认 `mobile/` 无 Expo/React Native/Hermes/Metro 依赖或文案。
- [ ] 更新 README、architecture、development、deployment、mobile guide、docs index 和 changelog。
- [ ] 更新边界/部署测试；保持 root Docker context、TypeScript 和 ESLint 排除。
- [ ] 运行全部允许的本地非 Android 检查。
- [ ] 推送最终分支，等待 GitHub Actions lint、tests、release build 与 artifact checks 全绿。
- [ ] 审查五个 APK artifact 名、真实 ABI 内容、包名、versionCode、签名状态和 Release 条件。
- [ ] 执行功能矩阵人工 smoke 并记录结果。
- [ ] 运行 Trellis check、更新必要 spec、提交并完成任务。

## Root Validation Commands

这些命令不编译 Android，可在本地运行：

```bash
npm run lint
npm run typecheck
npm run test
npm run check:legacy
npm run check:boundaries
npm run build
git diff --check
```

Android 命令仅写入 GitHub Actions，不在本地执行：

```bash
./gradlew ktlintCheck lintRelease testDebugUnitTest assembleRelease --no-daemon
```

## Rollback Points

- Phase 1 失败：恢复原 `.github/workflows/build-android.yml`，Expo 源码尚未删除。
- Phase 2-6 失败：保留已通过的原生分支，不合入 `main`，当前 Expo Release 不受影响。
- Reader 失败：只回滚 `reader/` 呈现实现，保留 state/repository/API。
- 发布后严重回归：重新发布上一 commit 的 Expo APK；旧 `RKStorage` 未被删除。
