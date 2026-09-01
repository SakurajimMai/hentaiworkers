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
