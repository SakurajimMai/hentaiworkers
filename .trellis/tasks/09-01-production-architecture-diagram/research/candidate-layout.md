# Archify 生产架构候选布局

## 1. 候选结论

建议使用 12 个 primary components。中部只保留一条明显的生产请求主链：

`Web Browser / AnimeStream Android -> Caddy -> host publish -> Next.js -> application services -> MariaDB`

Android 本地状态合并进 Android 节点的 `sublabel` 与运行事实卡，不再拆成 Room、DataStore 两个节点。这样可以保留独立的正式环境运维节点，明确表达 Docker Hub 到正式宿主机之间是人工或仓库外交接，而不是 GitHub Actions 自动部署。

外部媒体来源保留为一个节点；Turnstile、SMTP、进程内缓存、Session、健康检查、迁移责任与 crawler 排除项进入 cards，避免把可选集成或进程内实现误画成独立服务。

## 2. Meta 与作者约束

候选 JSON 应采用：

- `schema_version: 1`
- `diagram_type: "architecture"`
- `meta.title: "AnimeStream 生产架构与交付所有权"`
- `meta.locale: "zh-CN"`
- `meta.quality_profile: "showcase"`
- `meta.engineering_profile: "deployment-ownership"`
- `meta.output: "docs/diagrams/hentaiworkers-production.architecture.html"`
- `meta.repository.url: "https://github.com/SakurajimMai/hentaiworkers"`
- `meta.repository.revision: "d26dbed234bdd67be12a28eed33780158c53cf03"`

默认静态展示，不写 `meta.animation`。用户没有要求特定视觉样式，因此不写 `meta.visual_preset`；不写重复标题含义的 `subtitle`，也不写 `views` 或显式 `legend`。第一版只使用 grid placement 与自动路由，不预置 `via`、`labelAt`、`channelX` 或 `channelY`。

仓库 `sources` 只引用 revision 中存在的相对路径。2026-09-01 的主机侧只读证据不伪装成 Git revision 内的源码；它通过“生产快照”card 表达，并由 `research/production-deployment.md` 保留审计依据。

## 3. Primary Components

所有 ID 都满足 Archify identifier 约束。每个节点都提供 `tag`，让部署所有权在 `deployment-ownership` profile 下可见。

| ID | type | label | sublabel | tag / owner | 相对位置 |
|---|---|---|---|---|---|
| `web_browser` | `frontend` | `Web 浏览器` | `SSR/CSR · admin · direct media` | `终端用户` | 中部主运行轨最左端 |
| `android_client` | `frontend` | `AnimeStream Android` | `Kotlin/Compose · Room + DataStore` | `终端用户设备` | 浏览器下方，短支路汇入 Caddy |
| `caddy_edge` | `security` | `Caddy HTTPS 入口` | `host network · TLS/HSTS · gzip/zstd` | `主机运维 · Caddy Compose` | 两类客户端右侧 |
| `host_publish` | `security` | `宿主机发布端口` | `observed 0.0.0.0:13000 -> container :3000` | `主机运维 · App Compose` | Caddy 与容器之间 |
| `next_runtime` | `backend` | `Next.js standalone` | `UI · Route Handlers · Server Actions · /cdn-img` | `App 团队` | 主运行轨中段 |
| `application_core` | `backend` | `应用服务与 DB adapters` | `Catalog/Identity/System + manga · Drizzle/mysql2` | `App 团队` | Next.js 右侧、同一容器内 |
| `mariadb` | `database` | `外部 MySQL / MariaDB` | `catalog · users · library · settings` | `外部数据库运维 · 未记录` | 主运行轨最右端、宿主机外 |
| `media_origins` | `external` | `外部媒体来源` | `image.ixacg.de + data-provided URLs` | `外部来源 · provider/region 未记录` | Next.js / application core 上方的短侧枝 |
| `github_actions` | `cloud` | `GitHub Source + Actions` | `Docker workflow + Android workflow` | `仓库维护者 / GitHub Actions` | 下方交付控制面起点 |
| `docker_hub` | `cloud` | `Docker Hub` | `hentaiworkers-app OCI images` | `Docker Hub` | Actions 与正式环境运维之间 |
| `github_releases` | `cloud` | `GitHub Releases` | `build-N · 5 ABI APKs + SHA256SUMS` | `GitHub Releases` | 下方更新/Android 发布支路 |
| `production_ops` | `external` | `正式环境运维` | `pin/pull or build · compose up · verify` | `正式环境所有者` | `host_publish` 下方，人工闸门 |

### JSON source anchors

每个 component 最多附 3 个 source objects。下面的 path、line 与 end_line 可以直接转换为 JSON：

#### `web_browser`

- `docs/architecture.md`, line 12, end_line 18, label `公开访问拓扑`
- `app/(site)/page.tsx`, line 29, end_line 62, label `SSR 进程内读取`

#### `android_client`

- `docs/architecture.md`, line 61, end_line 65, label `原生客户端边界`
- `mobile/android/app/src/main/java/de/ixacg/animestream/core/network/AnimeStreamApi.kt`, line 221, end_line 271, label `Retrofit/OkHttp`
- `mobile/android/app/src/main/java/de/ixacg/animestream/core/network/SessionCookieStore.kt`, line 20, end_line 123, label `Session DataStore`

#### `caddy_edge`

- `docs/deployment.md`, line 42, end_line 51, label `HTTPS 反向代理契约`

`Caddy` 产品名、host networking、压缩/HSTS 和实际 upstream 来自主机快照，不由上面的仓库 source 单独证明；必须同时保留生产快照 card。

#### `host_publish`

- `deploy/docker-compose.yml`, line 7, end_line 31, label `App Compose 与 healthcheck`
- `docs/deployment.md`, line 23, end_line 40, label `启动与本地探针`
- `docs/deployment.md`, line 53, end_line 75, label `升级回滚与镜像标签`

仓库 Compose 的默认值是 loopback；节点 `sublabel` 的 `observed 0.0.0.0:13000` 是生产快照事实，不能写成仓库推荐配置。

#### `next_runtime`

- `Dockerfile`, line 15, end_line 30, label `非 root standalone runtime`
- `docs/architecture.md`, line 23, end_line 34, label `Web 与基础设施分层`
- `app/api/live/handler.ts`, line 3, end_line 7, label `进程 liveness`

#### `application_core`

- `docs/architecture.md`, line 25, end_line 34, label `应用与基础设施层`
- `lib/server/catalog/index.ts`, line 14, end_line 34, label `Catalog service wiring`
- `lib/server/identity/index.ts`, line 30, end_line 76, label `Identity service wiring`

节点文案使用“services + adapters”，不声称所有漫画与后台查询已经 ports 化。

#### `mariadb`

- `docs/architecture.md`, line 18, end_line 50, label `外部数据库与表族`
- `lib/db.ts`, line 50, end_line 78, label `MySQL pool 与 TLS`
- `app/api/ready/route.ts`, line 8, end_line 19, label `数据库 readiness`

#### `media_origins`

- `app/cdn-img/[...path]/route.ts`, line 6, end_line 57, label `固定图片代理上游`
- `mobile/android/app/src/main/java/de/ixacg/animestream/core/media/MediaUrlNormalizer.kt`, line 26, end_line 64, label `图片改写与媒体 headers`
- `mobile/android/app/src/main/java/de/ixacg/animestream/player/PlayerScreen.kt`, line 193, end_line 205, label `Media3 直接播放`

#### `github_actions`

- `.github/workflows/docker-publish.yml`, line 3, end_line 58, label `Docker image CI`
- `.github/workflows/build-android.yml`, line 28, end_line 108, label `Android build 与签名环境`
- `.github/workflows/build-android.yml`, line 293, end_line 375, label `Android release gate`

#### `docker_hub`

- `.github/workflows/docker-publish.yml`, line 29, end_line 58, label `OCI 登录与推送`
- `docs/deployment.md`, line 66, end_line 75, label `发布标签与固定建议`

#### `github_releases`

- `.github/workflows/build-android.yml`, line 293, end_line 375, label `5 APK 发布`
- `lib/server/android-update.ts`, line 7, end_line 22, label `固定 Release API 与 ABI`
- `lib/server/android-update.ts`, line 93, end_line 196, label `完整版本校验与超时`

#### `production_ops`

- `docs/deployment.md`, line 23, end_line 40, label `人工启动与检查`
- `docs/deployment.md`, line 53, end_line 75, label `升级与回滚`
- `deploy/docker-compose.yml`, line 7, end_line 31, label `App Compose 所有权`

## 4. Boundaries

候选只使用真实部署或信任边界，不用 boundary 代替关系：

1. `kind: region`, label `生产宿主机 · provider/region 未记录`，wraps `caddy_edge`, `host_publish`, `next_runtime`, `application_core`。这表示当前同一正式宿主机，不代表已知云区域。
2. `kind: security-group`, label `App Compose / Next.js standalone 容器`，wraps `next_runtime`, `application_core`。它明确排除 Caddy、数据库、Android 构建与 crawler。
3. 可选的 `kind: security-group`, label `Android 设备 · 本地状态`，只 wraps `android_client`。如果单节点 boundary 令图面过密，优先删除此 boundary，并保留 Android `sublabel` 与 card；不要为它增加 Room/DataStore primary nodes。

不为 GitHub、Docker Hub、MariaDB 和媒体来源画一个共同 region，因为仓库没有证据证明它们共享供应商、区域或信任域。

## 5. Connections

第一版都使用自动路由。主链关系用 `emphasis` 或真实加密 crossing 的 `security`；交付、更新和媒体支路用 `dashed`，从视觉上与实时请求主链区分。

| ID | from -> to | label | variant | 语义 |
|---|---|---|---|---|
| `browser_https` | `web_browser -> caddy_edge` | `HTTPS :443 · SSR/CSR + Session Cookie` | `security` | 浏览器正式入口 |
| `android_https` | `android_client -> caddy_edge` | `HTTPS JSON · catalog/auth/library/update` | `security` | Android 只通过站点 API 发现更新 |
| `proxy_loopback` | `caddy_edge -> host_publish` | `HTTP loopback · reverse_proxy 127.0.0.1:13000` | `emphasis` | Caddy 当前 upstream |
| `docker_nat` | `host_publish -> next_runtime` | `Docker DNAT · host :13000 -> container :3000` | `emphasis` | 实际发布端口进入单容器 |
| `runtime_dispatch` | `next_runtime -> application_core` | `同进程调用 · UI/API -> services/adapters` | `emphasis` | 模块化单体内部调用，不是网络服务 |
| `database_tls` | `application_core -> mariadb` | `MySQL + TLS · catalog/users/library/settings` | `security` | 外部数据库 crossing |
| `image_proxy` | `next_runtime -> media_origins` | `HTTPS GET · /cdn-img -> image.ixacg.de` | `dashed` | 固定图片代理；无视频代理 |
| `android_media` | `android_client -> media_origins` | `direct media URLs · Coil/Media3` | `dashed` | 数据提供的 MP4/HLS/图片 URL |
| `update_manifest` | `next_runtime -> github_releases` | `GitHub REST · validated build-N manifest` | `dashed` | 5 秒上游超时与独立 stale cache 进 card |
| `apk_download` | `android_client -> github_releases` | `用户确认 · matching ABI 或 universal APK` | `dashed` | 下载/安装不是静默动作；不是直接调用 GitHub API |
| `oci_publish` | `github_actions -> docker_hub` | `push OCI · main/latest/manga/SHA/SemVer` | `dashed` | 只发布镜像 |
| `image_selection` | `docker_hub -> production_ops` | `选择目标 image tag/digest` | `dashed` | 人工或仓库外交接的输入 |
| `manual_rollout` | `production_ops -> host_publish` | `人工/仓库外交接 · pin/pull or build + compose up` | `dashed` | 不存在 Actions 自动部署边 |
| `apk_publish` | `github_actions -> github_releases` | `手动发布闸门 · 生产签名 5 APK + SHA256SUMS` | `security` | main + workflow_dispatch + publish_release |

关系语义注意事项：

- 不增加 `github_actions -> host_publish` 或 `github_actions -> next_runtime`。
- 不增加 `android_client -> mariadb` 或“Android 直接调用 GitHub Releases API”的关系。
- `apk_download` 明确是用户打开下载 URL；更新发现仍是 Android -> Site API -> GitHub REST。
- 不增加 Redis、queue、video proxy、auto migrate、auto rollback 或 remote Manga API。
- 浏览器也可能直接加载目录中的媒体 URL。为控制线条数量，第一版放在 `web_browser.sublabel` 与 card，不再添加跨越主链的第二条媒体边。

## 6. Relative Layout

使用一份横向 grid：

- 中部主运行轨依次放置 `web_browser`, `caddy_edge`, `host_publish`, `next_runtime`, `application_core`, `mariadb`。
- `android_client` 与浏览器垂直堆叠在左侧，并从最近位置汇入 `caddy_edge`。
- `media_origins` 放在 `next_runtime` / `application_core` 附近的上方，保持两条媒体边为短侧枝。
- 下方交付面以 `github_actions` 为分叉点。一侧经 `docker_hub`、`production_ops` 回到 `host_publish`；另一侧到 `github_releases`，并让 Releases 同时接近 `next_runtime` 和 `android_client`。
- `production_ops` 尽量与 `host_publish` 垂直对齐，使人工部署 crossing 短而清晰。

第一版不手工指定 endpoint sides 或折线路径。若 showcase validator 报告 crossing/corridor，只修复诊断中的 subject，并遵循 label-preserving 顺序；不要先删语义标签。更新清单与 APK 下载两条边可能是首个几何风险点，应通过移动 `github_releases` 或诊断给出的单一 geometry control 处理。

## 7. Cards

建议只保留 3 张 conclusion cards，避免独立节点和过多底部内容。

### Card 1

- `dot: cyan`
- `title: 运行时与安全`
- items:
  - `iron-session Cookie: Secure + HttpOnly + SameSite=Lax；私有 /api/me/** no-store`
  - `目录缓存 30s fresh / 15m stale；更新缓存 15m fresh / 24h stale；均为进程内，无 Redis`
  - `Docker healthcheck 只访问 /api/live；/api/ready 与 /api/health 才检查 MariaDB`

证据映射：`lib/server/identity/session-config.ts:3-39`、`lib/server/shared/stale-read-cache.ts:3-8,33-86,183-200`、`lib/server/android-update.ts:9-14,164-196`、`deploy/docker-compose.yml:20-31`、`app/api/ready/route.ts:8-19`、`app/api/health/handler.ts:16-40`。

### Card 2

- `dot: rose`
- `title: 生产快照 · 2026-09-01`
- items:
  - `Caddy target 是 127.0.0.1:13000；App publish 实际监听 0.0.0.0:13000`
  - `旁路是否可从公网到达取决于仓库外 firewall；不能宣称 Caddy 是唯一网络入口`
  - `当前 App revision d26dbed234bdd67be12a28eed33780158c53cf03；Caddy 与 App 是两个 Compose 项目`

证据映射：`research/production-deployment.md:28-37,119-127`，以及其中列出的 `/root/docker/caddy/**`、`/root/docker/anime/docker-compose.yml`、限定 `docker inspect`、`ss` 与 nftables 只读证据。这些不是 repository `sources`。

### Card 3

- `dot: emerald`
- `title: 交付与边界`
- items:
  - `Actions 只发布镜像；正式部署需要人工/仓库外交接，Compose 不自动 migrate 或 seed`
  - `Android Release 需要 main + manual publish_release + Production signing；下载与安装由用户确认`
  - `crawler/ 不进入 App 镜像/运行时；“保留最新 5 个”只指 Actions runs，不是 GitHub Releases`

证据映射：`.github/workflows/docker-publish.yml:3-117`、`.github/workflows/build-android.yml:293-434`、`docs/deployment.md:23-32,53-79`、`.dockerignore:1-19`、`docs/architecture.md:3-7`。

Turnstile HTTPS 校验与 SMTP 邮件是 App 可选外部集成，可在 Card 1 的节点详情或 viewer source evidence 中呈现；不为其增加 primary nodes。证据：`lib/server/system/application/turnstile.ts:12-65`、`lib/server/system/application/mailer.ts:22-71`。

## 8. Showcase 风险与不可退让项

优先保持以下事实，不能为了 validator 通过而删除：

1. `caddy_edge -> host_publish` 的 `127.0.0.1:13000` 与 `host_publish` 的 observed `0.0.0.0:13000` 必须同时出现。
2. `production_ops` 与 `manual_rollout` 必须存在，且不能替换成 Actions 自动部署。
3. GitHub Releases 同时承担 App 的校验清单上游与用户确认后的 APK 下载，但两条关系标签必须区分 API 查询和下载 URL。
4. MariaDB 在生产宿主机与 App Compose 之外，provider/region 保持未记录。
5. `next_runtime` 与 `application_core` 是同一 Node.js 进程内分层，不能画成两个可独立伸缩的服务。
6. 主机、数据库、媒体、DNS、备份与 firewall 的供应商或区域不能推断。

若 12 节点构图仍过密，首个可压缩项是把 `media_origins` 退为 card，并保留 `/cdn-img` 与 direct media 的事实；不得合并 Caddy 与 host publish，也不得删除 `production_ops`、MariaDB 或 GitHub Releases。

## 9. 实现顺序

父任务创建正式候选时应：

1. 先按本文组件、边界、关系与 cards 写入 `docs/diagrams/hentaiworkers-production.architecture.json`。
2. 候选存在后只运行一次 Archify update checker。
3. 使用 `--repo-root /root/code/hentaiworkers` 执行 architecture showcase validation，确保 repository anchors 在 pinned revision 可解析。
4. 每轮只修 validator 的 diagnosed subject，最多使用一个明确要求的 geometry control。
5. 9/9、0 composition errors、0 warnings 后冻结 JSON，再执行 `deliver`；随后独立执行 `visual-check` 与图像审阅。
