# Journal - root (Part 1)

> AI development session journal
> Started: 2026-08-02

---


## Session 1: Remove crawler runtime and control plane

**Date**: 2026-08-03
**Task**: Remove crawler runtime and control plane
**Branch**: `main`

### Summary

Removed crawler and Worker code, control-plane APIs/UI/schema/scripts, shared media/proxy coupling, and worker deployment; retained an App-only Next.js repository with passing quality gates.

### Git Commits

| Hash | Message |
|------|---------|
| `226befb` | (see git log) |

### Status

[OK] **Completed**


## Session 2: Add isolated Hanime crawler workspace

**Date**: 2026-08-04
**Task**: Add isolated Hanime crawler workspace
**Branch**: `main`

### Summary

Added an independent crawler/hanime Python workspace while keeping the deployed Next.js App and Compose topology unchanged; tracked only a sanitized configuration example and archived the completed Trellis task.

### Main Changes

- Added the isolated Hanime crawler source, dependency manifest, tests, documentation, and sanitized YAML example.
- Updated App boundary specifications so crawler code remains outside the App build and runtime.
- Archived task 08-04-allow-crawler-workspace after implementation and verification.

### Git Commits

| Hash | Message |
|------|---------|
| `fa1f09b` | (see git log) |
| `cd219e8` | (see git log) |
| `d92a868` | (see git log) |

### Testing

- [OK] Main project lint, typecheck, 134 TypeScript tests, legacy and boundary checks, Next.js build, Compose checks, and Dockerfile check passed.
- [OK] Crawler Python sources passed py_compile and the example YAML parsed successfully; dependency-based Python tests were not run because pip/ensurepip is unavailable on this host.

### Status

[OK] **Completed**

### Next Steps

- Install crawler dependencies in an isolated environment before running its focused Python unit tests.


## Session 3: Fix Android weak-network timeout

**Date**: 2026-08-30
**Task**: Fix Android weak-network timeout
**Branch**: `feat/kotlin-android-client`

### Summary

Raised bounded Android API timeouts, localized transport errors, made home loads independently resilient with inline retry UI, added regression tests, passed root checks and three GitHub Actions Android gates, and published production-signed build-62.

### Git Commits

| Hash | Message |
|------|---------|
| `34540b9` | (see git log) |

### Status

[OK] **Completed**


## Session 4: 修复 Android 首屏超时与服务端目录降级

**Date**: 2026-08-30
**Task**: 修复 Android 首屏超时与服务端目录降级
**Branch**: `feat/kotlin-android-client`

### Summary

定位 Build 62 首屏串行发布与生产 MariaDB TLS reset；实现 Kotlin 首页渐进提交、部分失败内联重试、启动请求收敛、深链广告按需加载和 25 秒调用预算；为四个公开目录加入严格有界 stale 缓存、同键单飞与 5 秒连接预算。根应用 181 项测试、Lint、类型、边界和生产构建通过，隔离生产镜像完成冷/热请求及断网 stale 实测；待 GitHub Actions Android 编译、部署与真机复测。

### Git Commits

| Hash | Message |
|------|---------|
| `32f1412` | (see git log) |

### Status

[OK] **Completed**


## Session 5: 修复 Android 目录、阅读器并发布更新提醒

**Date**: 2026-08-31
**Task**: 修复 Android 目录、阅读器并发布更新提醒
**Branch**: `feat/kotlin-android-client`

### Summary

修复空标签刷新卡住、章节标题冗余、刘海安全区和拖页反馈；新增服务端更新清单与 Android 非阻塞更新提醒。根应用与 Android Actions 全绿，生产服务已部署，production-signed Build 72 已发布五个 ABI APK。

### Main Changes

- 目录请求增加取消、代际隔离与可恢复空状态，标签 API 仅返回有效关联标签。
- 阅读器适配安全区、章节仅显示第几话，Slider 拖动时实时识别并跳页。
- 新增严格校验、缓存降级的更新 endpoint，以及 ABI 匹配、频控与稍后提醒。

### Git Commits

| Hash | Message |
|------|---------|
| `3e38a7b` | (see git log) |
| `f70b56c` | (see git log) |
| `92813d0` | (see git log) |
| `1ff6127` | (see git log) |

### Testing

- [OK] 根应用 lint、typecheck、33 个测试文件、legacy、boundaries、build 与 diff check 全部通过。
- [OK] Android Actions Build 72 的 ktlint、lintRelease、单测、assemble、签名证书和五 ABI 内容校验全部通过。
- [OK] 生产 live、ready、tags 与 android/update 均为 200；更新清单返回 Build 72 和完整五 ABI。

### Status

[OK] **Completed**

### Next Steps

- 在有刘海的真机安装 Build 72，复测空标签、实时拖页，并在 Build 73 验证更新提醒。


## Session 6: 重塑 Android 与网站品牌图标

**Date**: 2026-08-31
**Task**: 重塑 Android 与网站品牌图标
**Branch**: `main`

### Summary

以网站纸白、墨黑、余烬橙重设计余烬折页 SVG 品牌标记；同步 Android adaptive/legacy/monochrome/splash 与 Web favicon、Manifest、Apple、OG、页眉资源，移除旧紫色资源；新增确定性生成器、品牌契约及 APK 资源表 CI 校验。本地与远程验证通过，production-signed Build 76 已发布五个 ABI APK，网站品牌镜像已部署。

### Git Commits

| Hash | Message |
|------|---------|
| `fee7842` | (see git log) |

### Testing

- [OK] 根应用 lint、typecheck、195 项测试、legacy、boundaries、build、HTTP 与桌面/手机截图验证通过。
- [OK] Android Actions Run 76 的 ktlint、lintRelease、单测、assemble、生产签名、五 ABI 与品牌资源表校验通过。
- [OK] 生产 favicon、Manifest、live 与 update endpoint 为 200；Release API、SHA256SUMS 和实下载 arm64 APK 摘要一致。
- [OK] GitHub 保持最新五条 Actions 与最新五个 Releases。

### Status

[OK] **Completed**


## Session 7: 修复站点分页与首页轮播

**Date**: 2026-09-01
**Task**: 修复站点分页与首页轮播
**Branch**: `main`

### Summary

修复收藏与历史页面的大数据量分页，并消除首页横向列表固定卡宽造成的半张卡片；五个响应式宽度完成真实浏览器几何验证。

### Main Changes

- 收藏与历史改为服务端分页、确定性排序和越界回退。
- 首页轮播按容器宽度精确显示 2/3/4/5 张完整卡片，并按整页对称翻动。
- 游客与登录态继续观看复用统一卡片尺寸及可访问轮播控件。

### Git Commits

| Hash | Message |
|------|---------|
| `d4fe12d` | (see git log) |
| `2880536` | (see git log) |

### Testing

- [OK] 根应用 lint、typecheck、218 项测试、legacy、boundaries 与 production build 通过。
- [OK] Chrome 在 320、375、768、1024、1440 宽度验证零半卡、零横向溢出，箭头翻页后仍完整对齐。

### Status

[OK] **Completed**

### Next Steps

- 部署 main 到正式环境并验证 live、ready 与首页轮播。


## Session 8: 优化漫画阅读首图与连续滚动性能

**Date**: 2026-09-01
**Task**: 优化漫画阅读首图与连续滚动性能
**Branch**: `main`

### Summary

缩短 Web 与 Android 阅读器当前漫画图可读时间，分离视口进度与预取，并记录生产等价基准。

### Main Changes

- Web reader 使用独立 layout、共享 reader-data、单一高优先级首图和 decode+2RAF 预取门禁。
- Android 章节响应优先发布，恢复页直接初始化，Telephoto 显示后预取后两页并管理取消。
- 修复 MySQL collation 下大小写 slug 兼容，并将防回归规则写入 Trellis spec。

### Git Commits

| Hash | Message |
|------|---------|
| `7a36f06` | (see git log) |
| `4b1b93a` | (see git log) |
| `b60d6ec` | (see git log) |
| `1ce3174` | (see git log) |

### Testing

- [OK] npm run test: 241/241 passed; typecheck, boundaries, legacy, production Docker build and diff check passed.
- [OK] 390x844@3x cold-cache P1 median readable 1918.9ms; P201 restore 5/5 exact at 2853.2ms.

### Status

[OK] **Completed**

### Next Steps

- Monitor pushed GitHub Actions; Android Gradle and real-device TTIR remain remote verification items.


## Session 9: Native reader performance, chapter zoom, global meta and HTML banners

**Date**: 2026-09-06
**Task**: Native reader performance, chapter zoom, global meta and HTML banners
**Branch**: `codex/reader-meta-ads-check-20260906030631488`

### Summary

Implemented native reader and web admin changes; all root and browser checks passed; Android CI Build 87 passed with 84 JVM tests and five test APKs.

### Git Commits

| Hash | Message |
|------|---------|
| `e38f98ebc21b1be723db094aaee2bdf34c79c843` | (see git log) |

### Testing

- [OK] Root lint/typecheck/test/build and boundaries passed; meta/ads browser checks and 15 reader cases passed.
- [OK] Android CI 34008360595 passed; 15 native source hashes match local workspace.

### Status

[OK] **Completed**

### Next Steps

- Run real-device reader and ad smoke tests before production release; local preview needs valid DATABASE_URL.


## Session 10: 发布漫画阅读优化、Meta 与 HTML 广告正式版 Build 91

**Date**: 2026-09-06
**Task**: 发布漫画阅读优化、Meta 与 HTML 广告正式版 Build 91
**Branch**: `main`

### Summary

隔离保留原 SMTP 改动，推送功能提交和 Android 测试稳定性修正。Web 257 项测试与完整检查通过；Android Build 91 的 84 项单测、生产签名及五种 APK 校验通过，已提升为正式 latest Release。网站固定部署 9dc3d8f 镜像，公网 25 项检查与新版更新清单通过；数据库 22 表备份已隔离恢复验证，回滚配置保留。未进行真机测试。

### Git Commits

| Hash | Message |
|------|---------|
| `1e98a74` | (see git log) |
| `9dc3d8f` | (see git log) |

### Status

[OK] **Completed**


## Session 11: APK 阅读预取、信息流广告尺寸与 SEO 收录优化

**Date**: 2026-09-14
**Task**: APK 阅读预取、信息流广告尺寸与 SEO 收录优化
**Branch**: `main`

### Summary

阅读器预取并发 2→4、窗口 6→10（3 预览 + 7 磁盘）、章节准备缓存 5 分钟/容量 3、章末预热下一话、OkHttp 每主机 8；信息流广告推断 <img> 尺寸并在网页与 Android 中按 contain 展示固定尺寸卡片，修复 Android 固定创意偏移；站点地图改为索引 + 分片（含封面图片）、IndexNow、精选漫画标签可索引、browse 标签名解析、面包屑/OG/rating/preconnect、可抓取分页。根检查 lint/typecheck/280 测试/legacy/boundaries/build 与 test:ads:browser 通过；Android 需推送 Actions 验证。

### Git Commits

| Hash | Message |
|------|---------|
| `uncommitted` | (see git log) |

### Status

[OK] **Completed**


## Session 12: 自动发布 Release 与保留最新八个 APK/镜像版本

**Date**: 2026-09-14
**Task**: 自动发布 Release 与保留最新八个 APK/镜像版本
**Branch**: `main`

### Summary

Build 97 推送验证通过（ktlint 补丁后 89 项 JVM 测试全绿，正式签名），手动发布 Build 98；随后改为 main 正式签名构建自动发布 build-N，并在 Android 发布任务与 Docker workflow 中分别只保留最新八个 Release/SHA 镜像标签。推送 7e43c12 后 Build 99 自动发布，删除 build-72/66/62；Docker Hub 由 77 个 SHA 标签清理到 8 个。生产固定镜像 9dc3d8f 位于保留边缘，需重新固定。

### Git Commits

| Hash | Message |
|------|---------|
| `7e43c12` | (see git log) |

### Status

[OK] **Completed**


## Session 13: 移除源码中的部署专属域名、仓库与镜像名

**Date**: 2026-09-14
**Task**: 移除源码中的部署专属域名、仓库与镜像名
**Branch**: `main`

### Summary

cdn-img 上游、Android 更新仓库、Compose 镜像名、Actions 站点/图片主机/镜像变量与 Android BuildConfig 全部改为配置注入，缺失即关闭对应功能；设置仓库变量 ANIMESTREAM_API_BASE_URL / ANIMESTREAM_IMAGE_PROXY_HOST / APP_IMAGE。Docker 与 Android CI 均通过（91 项 JVM 测试），Build 102 自动发布为 Latest，build-79 被保留策略删除。生产 deploy/.env 需补 APP_IMAGE、IMAGE_PROXY_UPSTREAM、ANDROID_UPDATE_REPOSITORY。

### Git Commits

| Hash | Message |
|------|---------|
| `416fa97` | (see git log) |

### Status

[OK] **Completed**


## Session 14: 重做 APK 播放器并修复观看/收藏计数

**Date**: 2026-09-14
**Task**: 重做 APK 播放器并修复观看/收藏计数
**Branch**: `main`

### Summary

播放器改为自绘 Compose 控制层（顶/中/底栏、缓冲进度条、锁定、倍速与画面比例），新增双击±10秒、拖动预览进度、左右半屏亮度与音量、长按2倍速手势，手势识别拆到 PlayerGestures.kt，确定性逻辑进 PlayerUiPolicy.kt 并补 14 项 JVM 测试；播放进度改为上报真实秒数并支持云端续播，取代固定 1 秒观看标记。计数方面查明 crawler 用 random.randint(1000,10000) 伪造 view_count、favorite_count 恒为 0，新增 lib/anime-views.ts 按人按天去重计数并新增 0020 迁移，收藏数改为实时统计系统收藏列表。Android CI Build 105 通过（105 项 JVM 测试）并已发布为 Latest；Web 侧 300 项测试与全部根检查通过但尚未推送。

### Git Commits

| Hash | Message |
|------|---------|
| `509ef99` | (see git log) |

### Status

[OK] **Completed**
