# 原生 Android 客户端

`mobile/android/` 是独立的 Kotlin + Jetpack Compose Android 应用，不进入根 Next.js 的依赖、TypeScript/ESLint 范围、Docker 镜像或生产 Compose 服务。应用名保持 `AnimeStream`，包名保持 `de.ixacg.animestream`，自定义链接 scheme 保持 `animestream`。

客户端通过现有 HTTP API 工作：匿名目录使用 `/api/animes*`、`/api/tags`、`/api/mangas*` 和 `/api/ads`；登录后使用 `/api/me/favorites`、`/api/me/watch-progress` 和 `/api/me/manga-progress`。未登录时收藏和历史保存在 Room，目标站点会话与迁移版本保存在 DataStore，登录成功后会尽力把本地数据合并到网页账号。

## 1. 功能与导航

| 底栏 | 作用 |
|------|------|
| 首页 | 热门里番、漫画横滑入口与信息流广告 |
| 发现 | 里番搜索、标签筛选、最近更新/热门排序与无限加载 |
| 漫画 | 搜索、日/周/月/总榜、标签筛选与无限加载 |
| 书架 | 里番/漫画收藏与历史、编辑删除、清空和继续观看/阅读 |
| 我的 | 会话恢复、网站账号登录与退出 |

里番详情保留元数据、简介、标签、收藏、播放、剧照灯箱和相似推荐。漫画详情保留作者、页数/章节数、简介、标签、收藏、章节目录、开始阅读和推荐。

播放器使用 Media3，支持 MP4/HLS、播放/暂停、拖动、倍速、画面比例、横屏全屏、错误重试、前贴片与暂停广告。前贴片会等待该作品的广告配置完成后只决定一次，不会因异步加载直接跳过正片前广告；离开页面会释放播放器并恢复竖屏。

阅读器参考 TachiyomiJ2K 的内容优先交互，保持纵向连续条漫。页面由 `LazyColumn` 按可见窗口组合，Telephoto + Coil 自动进行高分辨率图片子采样，支持双指缩放、缩放时嵌套滚动、单页加载/失败重试和后续 4 页预取。轻点切换工具栏；底部进度条、章节目录、上一话/下一话、章节末提示和顶部/底部广告均保留。阅读进度优先在页面至少可见 40% 时切换；超长页无法达到该阈值时按最大可见区域回退，并以 800ms 防抖写入章节与页码。

手机使用 5 项底栏，宽屏和平板使用导航栏与自适应网格。按钮和图标操作区至少为 48dp，并适配系统安全区、字体缩放和 TalkBack 标签。

## 2. 本地工作方式

开发机只编辑以下内容，不参与 Android 编译：

```text
mobile/android/app/src/main/       Kotlin、Manifest、资源与第三方声明
mobile/android/app/src/test/       JVM/Robolectric 单元与契约测试
mobile/android/gradle/             版本目录和 Gradle wrapper
.github/workflows/build-android.yml 远程验证与发布
```

本地不要求安装 JDK、Gradle、Android SDK 或模拟器，不要运行 `gradlew`、Android Studio build、设备测试或任何 Android 编译。可以运行根项目的非 Android lint、typecheck、测试、边界检查与构建；Android 反馈以 GitHub Actions 为准。

生产 API origin 由工作流环境变量/Gradle property `ANIMESTREAM_API_BASE_URL` 注入，默认是 `https://www.ixacg.de`。客户端只接受 HTTP(S) origin，并移除路径、查询与 fragment；空值、非法值或非 HTTP(S) 值会回退到默认站点，避免错误 CI 配置导致启动崩溃。

## 3. GitHub Actions 构建

工作流：[`.github/workflows/build-android.yml`](../.github/workflows/build-android.yml)

触发条件：

- 任意分支推送并改动 `mobile/**` 或工作流文件
- 改动上述路径的 Pull Request
- 在 GitHub Actions 手动运行 **Build Android APK**；只有受 `Production` 分支规则允许的候选分支才能显式选择 `use_production_signing`

远程构建执行：

```bash
./gradlew ktlintCheck lintRelease testDebugUnitTest assembleRelease --no-daemon --stacktrace
```

随后会验证五个 APK 均可解压、包名为 `de.ixacg.animestream`、`versionCode` 等于 GitHub run number、launcher 为原生 `MainActivity`、签名有效，并确认 APK 不含 JavaScript bundle 或旧客户端运行时。四个 ABI split 必须只包含目标架构的原生库，并与 universal 中同架构的库清单一致。所有验证成功后上传：

| 产物 | 说明 |
|------|------|
| `AnimeStream-<run>-arm64-v8a.apk` | 大多数现代 Android 手机，推荐优先下载 |
| `AnimeStream-<run>-armeabi-v7a.apk` | 较旧的 32 位 Android 手机 |
| `AnimeStream-<run>-x86_64.apk` | 64 位 Intel 模拟器及少量 Intel 设备 |
| `AnimeStream-<run>-x86.apk` | 32 位 Intel 模拟器及少量 Intel 设备 |
| `AnimeStream-<run>-universal.apk` | 包含全部四种 ABI，无法判断架构时使用 |
| `SHA256SUMS` | 五个 APK 的 SHA-256 校验和 |
| `build-info.txt` | 包名、版本、API origin 与签名模式 |
| Android reports | Lint、测试结果和诊断报告，保留 14 天 |

分支、Pull Request 和非 `main` 手动运行只上传 Actions Artifact，不创建 Release。只有 `main` 的非 Pull Request 运行且使用正式签名时，才会在 [GitHub Releases](https://github.com/SakurajimMai/hentaiworkers/releases) 创建 `build-<run>` 预发布 Release。

## 4. 签名与覆盖安装

正式分发必须在受分支规则保护的 `Production` environment 中完整配置：

| Secret | 说明 |
|--------|------|
| `ANDROID_KEYSTORE_BASE64` | 现有发布 keystore 的 base64 |
| `ANDROID_KEYSTORE_PASSWORD` | keystore 密码 |
| `ANDROID_KEY_ALIAS` | 密钥别名 |
| `ANDROID_KEY_PASSWORD` | 密钥密码 |

仓库变量 `ANDROID_RELEASE_CERT_SHA256` 必须固定为生产证书的 SHA-256；CI 会拒绝任何使用其他证书的 release APK。普通分支使用不含密钥的 `CI` environment，`Production` 通常只允许 `main`；需要验证候选分支时，只临时允许该精确分支并手动选择 `use_production_signing`，验证后立即移除规则。

四项完整时生成 release-signed APK；四项全空时生成明确标记为 `internal-debug` 的内部测试 Artifact，不能覆盖正式签名版本、不能用于公开分发，也不会创建 GitHub Release。只配置部分 Secret 会让工作流失败，防止误标签名。keystore 仅解码到 GitHub Runner 临时目录，不进入 Artifact 或仓库。

Build 39 及更早版本使用 Expo 模板中的公开 debug 证书，不是可延续的生产签名。首次安装新生产签名版本前必须卸载旧版；卸载会删除未同步的本地数据，应先登录同步或自行备份。后续版本必须一直使用同一份新生产 keystore，才能直接覆盖升级。

Kotlin APK 要覆盖旧安装，包名和签名必须同时保持一致。首次启动会检查旧 `RKStorage` 的 `catalystLocalStorage` 表，并只读迁移以下键：

- `@auth/cookie`
- `@anime/history`
- `@anime/favorites`
- `@manga/history`
- `@manga/favorites`

迁移按单项容错并在事务成功后记录版本：损坏行不会阻塞其他合法数据，重复启动不会重复导入或覆盖时间更新的原生记录，旧 SQLite 数据库始终保留。全新安装找不到旧表时只记录迁移完成，不创建虚假内容。回滚到旧版本仍能看到迁移前数据；新版本中仅保存在本机且未同步账号的数据不保证能被旧版本读取。

## 5. 发布与验收

1. 在分支或 Pull Request 等待 **Build Android APK** 全绿，下载 Actions Artifact 做内部安装验证。
2. 使用真实设备检查首页/发现/漫画/书架/我的、搜索筛选、登录退出、收藏历史及继续阅读。
3. 检查一条 MP4、一条 HLS、前贴片、暂停广告、播放错误重试和返回后的方向恢复。
4. 检查短章、长章、坏图重试、缩放、快速拖页、章节切换、广告和后台恢复。
5. 合入 `main` 后确认 `build-*` Release 的签名模式及五个 APK 均存在；现代手机优先使用 `arm64-v8a`，无法判断架构时使用 universal。
6. 后台 **系统设置 → 移动端下载** 填入地址和链接文字；前台页脚只在地址为 `http://` 或 `https://` 时显示。

Android 实际编译、Lint 和自动化测试结果只能由 GitHub Actions 确认；未看到远程工作流成功前，不应把代码审查或根项目测试视为 APK 已验证。
