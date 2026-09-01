# 生产部署拓扑研究

## 范围与证据口径

- 研究时间：2026-09-01 UTC。
- 范围：Web 镜像构建与发布、正式宿主机上的 Caddy/Compose、外部数据库边界、健康检查、Android APK 构建与 GitHub Releases、升级与回滚。
- “仓库声明”来自版本库文件；“当前生产事实”来自只读的容器、监听端口和公开/本地健康检查。未读取 `.env` 内容、数据库地址、令牌、keystore 或任何 Secret 值。
- 外部数据库供应商、区域、备份系统、DNS 供应商及宿主机上游防火墙未在仓库中定义，不应在架构图中猜测。

## 建议的生产主路径

```text
Browser / Android APK
        |
        | HTTPS :443 (HTTP :80 由 Caddy 接收)
        v
Caddy（宿主机网络，TLS 终止、gzip/zstd、HSTS）
        |
        | reverse_proxy 127.0.0.1:13000
        v
Docker host publish :13000 -> anime-app-1:3000
        |
        | MySQL protocol + TLS（由 App 配置）
        v
外部维护的 MySQL / MariaDB
```

### 当前生产事实

| 组件 | 已观察事实 | 证据 |
|---|---|---|
| Caddy | `caddy:alpine`，`network_mode: host`，监听宿主机 80/443，自动 HTTPS 站点为 `www.ixacg.de`，反代 `127.0.0.1:13000`；启用 gzip/zstd 与 HSTS；管理 API 关闭。 | `/root/docker/caddy/docker-compose.yml:1-12`；`/root/docker/caddy/conf/Caddyfile:1-13`；`ss -ltnp`；正式首页响应含 `via: 1.1 Caddy` 与 HSTS。 |
| App | 单一 `anime-app-1` 容器，镜像 `sakurajiamai/hentaiworkers-app:manga`，Node 进程监听容器 3000，`restart: unless-stopped`，当前 Docker health 为 `healthy`。 | `/root/docker/anime/docker-compose.yml:7-31`；`docker ps` / 限定字段的 `docker inspect`。 |
| App 镜像版本 | 当前 `manga` 与 `d26dbed` 两个本地标签指向同一镜像，OCI revision 为完整提交 `d26dbed234bdd67be12a28eed33780158c53cf03`，与研究时仓库 `HEAD` 一致。 | 限定字段的 `docker image inspect`；`git rev-parse HEAD`。 |
| 宿主机端口 | 实际是 `0.0.0.0:13000 -> container:3000`，而仓库部署指南/示例建议默认绑定 `127.0.0.1:13000`。因此当前存在绕过 Caddy 的全接口宿主机监听面；是否可从公网到达还取决于未纳入仓库的主机/云防火墙。 | `docker ps`、`ss -ltnp` 与 nftables Docker DNAT；`deploy/.env.example:5-7`、`docs/deployment.md:42-49`。 |
| 数据库 | 正式 Compose 不包含数据库服务；App 连接外部维护的 MySQL/MariaDB。限定枚举检查确认正式容器已配置数据库且 TLS 模式属于安全档；研究时 `/api/health` 的 `SELECT 1 AS ok` 返回成功，证明 App 当前可访问 MySQL。 | `docs/deployment.md:3-10`；`docs/architecture.md:9-21`；`app/api/health/route.ts:13-25`、`app/api/health/handler.ts:16-40`；只输出“已配置/安全档”的限定容器检查与本地健康请求。 |
| 敏感配置 | Compose 通过部署目录的 `.env` 注入运行配置；运行镜像不嵌入 `.env`。所需类别为数据库、站点源、Session 和应用加密密钥；本研究不读取其值。 | `/root/docker/anime/docker-compose.yml:11-18`；`deploy/.env.example:1-25`；`.dockerignore:13-19`。 |

### 构建产物边界

- 根 `Dockerfile` 是三阶段构建：Node 22 Alpine `deps` -> `builder` 执行 `npm run build` -> 非 root `nextjs` 用户运行 `node server.js`。运行阶段只复制 `public`、`.next/standalone` 和 `.next/static`，暴露 3000。证据：`Dockerfile:3-30`。
- Next.js 明确输出 standalone。证据：`next.config.ts:3-7`。
- `.dockerignore` 排除 `.github`、`mobile`、`crawler`、`.env*` 等；Android 与 crawler 不进入 Web 构建上下文/运行镜像。证据：`.dockerignore:1-19`；`docs/architecture.md:3-7,65`。
- 正式 Compose 只有 App；它不会执行数据库迁移或管理员 seed。数据库迁移是升级前的独立受控操作。证据：`deploy/README.md:1-25,46`；`docs/deployment.md:23-32,53-64`。

## Web 镜像 CI 与部署交接

```text
main push / v* tag / manual dispatch
        -> GitHub Actions: Publish Docker image
        -> Buildx 使用根 Dockerfile
        -> Docker Hub: sakurajiamai/hentaiworkers-app
           tags: main / latest / manga / commit SHA / SemVer

Docker Hub --(没有仓库内自动 CD 边)--> 正式宿主机
正式宿主机需由人工或仓库外编排执行 pull/build + docker compose up
```

- Docker 工作流在 `main` push、`v*` tag 或手动触发时运行，登录 Docker Hub 后构建并推送。证据：`.github/workflows/docker-publish.yml:1-58`。
- 默认分支会发布 `latest` 和 `manga`，同时还有分支名、提交 SHA 及 SemVer 标签。证据：`.github/workflows/docker-publish.yml:35-46`；`docs/deployment.md:66-75`。
- **工作流没有 SSH、部署 webhook、Compose 或主机更新步骤。** 镜像发布成功不等于正式环境已更新。当前正式清单又固定 `manga` 且 `pull_policy: never`，所以部署必须由人工或仓库外系统把目标镜像放入宿主机并重建容器。证据：`.github/workflows/docker-publish.yml:15-117`；`/root/docker/anime/docker-compose.yml:7-12`。
- 2026-09-01 的公开 GitHub API 快照显示最新 `d26dbed` 的 Docker workflow 已成功；这证明镜像发布流水线成功，不证明主机部署。当前容器 revision 与该 SHA 相同则是另一条独立的主机侧证据。

### Actions 保留策略

- Docker 与 Android 工作流都在结束后进入同一 concurrency group `repository-actions-retention`，按仓库所有 workflow runs 的创建时间排序，只保留最新 5 个，删除更早且已完成的运行。证据：`.github/workflows/docker-publish.yml:60-117`；`.github/workflows/build-android.yml:377-434`。
- 该清理逻辑删除的是 **Actions runs**，不是 Docker Hub 标签、镜像，也不是 GitHub Releases。仓库中没有自动清理旧 Release 的 workflow。2026-09-01 的公开 API 快照恰有 5 个 Android Releases，但不能据此推断未来会自动维持 5 个。

## Android 构建、发布与更新链路

```text
mobile/** push / PR / manual
        -> Android GitHub Action（Java 17 + Android SDK + Gradle）
        -> ktlint + lintRelease + unit tests + assembleRelease
        -> 签名、包名、versionCode、资源、ABI、SHA-256 校验
        -> 5 APK + SHA256SUMS + build-info（Actions Artifact）

main + manual publish_release + Production release signing
        -> GitHub prerelease build-<run>
        -> 5 APK assets + SHA256SUMS

Android APK -> HTTPS /api/android/update -> Next.js App
Next.js App -> GitHub Releases API（5 秒超时 + stale cache）
Android 用户确认 -> GitHub Release 的匹配 ABI APK（unknown -> universal）
```

### 构建与签名边界

- Android API origin 在 workflow 中固定为 `https://www.ixacg.de`。构建使用 `mobile/android`、Java 17 与 Android SDK。证据：`.github/workflows/build-android.yml:28-62`。
- 四项签名 Secret 只有全部存在时才启用 release signing；全部缺失则是 `internal-debug` Artifact；部分配置直接失败。证书还必须匹配仓库变量中的固定 SHA-256。Secret 只进入 Runner 临时 keystore，不进入仓库或 Artifact。证据：`.github/workflows/build-android.yml:63-94,226-238`；`docs/mobile.md:77-90`。
- 质量门执行 ktlint、Android Lint、单元测试与 Release assemble，并验证包名、入口 Activity、签名、资源、无旧 JS/React Native runtime，以及四个 split ABI 与 universal 的原生库一致性。证据：`.github/workflows/build-android.yml:99-247`。
- 产出 `arm64-v8a`、`armeabi-v7a`、`x86_64`、`x86`、`universal` 五个不同 APK，加 `SHA256SUMS` 与 `build-info.txt`。APK Artifact 保留 30 天，报告保留 14 天。证据：`.github/workflows/build-android.yml:249-291`。
- 创建公开 Release 是显式闸门：仅 `main`、`workflow_dispatch`、`publish_release=true` 且签名模式为 release 才执行；Release 为 `build-<run>` prerelease，包含五个 APK 和校验和。证据：`.github/workflows/build-android.yml:293-375`。
- 2026-09-01 的 GitHub API 快照显示最新公开版本为 `build-76`，目标分支 `main`，包含 6 个资产（5 APK + `SHA256SUMS`）。这是时点事实，不应硬编码进长期架构节点标题。

### 非阻塞更新检查

- App 的 `/api/android/update` 向 GitHub Releases API 查询最多 100 条 Release，仅接受 `main`、非 draft、`build-N`、资产名称/下载 URL/大小/SHA-256 全部符合约束的完整版本，并选择最大 versionCode。证据：`lib/server/android-update.ts:7-22,93-161`。
- 上游 GitHub 请求超时 5 秒；App 内存缓存新鲜期 15 分钟、过期可用期 24 小时、失败重试间隔 5 分钟，并向客户端发送 stale cache 指令。证据：`lib/server/android-update.ts:9-14,164-196`；`app/api/android/update/route.ts:11-26`。
- Android 自动成功检查间隔为 24 小时、失败退避为 6 小时；它验证包名、版本、Release origin、全部 ABI 和哈希，按设备 ABI 选择 APK，无法匹配时退到 universal。证据：`mobile/android/app/src/main/java/de/ixacg/animestream/data/repository/UpdateRepository.kt:124-183`。
- 有更新时弹出非阻塞对话框；“立即更新”优先打开匹配 ABI 的 GitHub 下载 URL，失败再打开 Release 页；“稍后提醒”可延后。证据：`mobile/android/app/src/main/java/de/ixacg/animestream/ui/navigation/AnimeStreamApp.kt:120-149`。

## 健康检查与故障语义

| 端点 | 含义 | 是否被 Docker healthcheck 使用 |
|---|---|---|
| `/api/live` | 只证明 Next.js 进程可响应，不访问依赖。 | 是；30 秒间隔、5 秒超时、3 次重试、40 秒启动宽限。 |
| `/api/ready` | 生产配置存在 `DATABASE_URL` 时加载 pool 并执行 `SELECT 1`；失败返回 503。 | 否；部署后人工/外部验证。 |
| `/api/health` | 执行 `SELECT 1 AS ok` 并返回数据库状态；失败返回 500。 | 否。 |

证据：`app/api/live/handler.ts:3-7`；`app/api/ready/route.ts:8-16`、`app/api/ready/handler.ts:5-35`；`app/api/health/handler.ts:16-40`；`/root/docker/anime/docker-compose.yml:19-31`。

研究时本地和正式 HTTPS 的 `/api/live`、`/api/ready` 均成功，`/api/health` 的 MySQL 查询也成功。注意：容器可显示 `healthy` 但数据库仍可能故障，因为 Docker 只探测 liveness；架构图应把 readiness 画成旁路运维探针而非编排门禁。

## 升级与回滚边界

### Web App

- 推荐升级路径是固定目标 commit/版本标签、拉取镜像、`docker compose up -d --no-build`，再检查 live/ready、登录、目录和播放。证据：`docs/deployment.md:53-75`。
- 当前正式清单的实际路径是本地 `manga` + `pull_policy: never`，不会自动发现 Docker Hub 新镜像。安全升级需要明确拉取/构建并重新指向本地标签，然后重建 App 容器。
- 当前宿主机保留 `rollback-d4fe12d`，其 OCI revision 为 `d4fe12d1829c34cafb21006e5b7fbd46abc0a1de`；可将 Compose 的 App 镜像指向该不可变回滚标签并 `up -d`。这是 2026-09-01 的短期操作资产，不应当作为永久架构保证。
- Caddy 与 App 是两个独立 Compose 项目。重建 App 不需重建 Caddy；Caddy 数据/配置/证书目录是宿主机挂载。Caddy 清单没有 healthcheck，当前运行状态需单独监控。

### 数据库

- App Compose 不迁移数据库。升级前必须备份并审核 SQL；数据库回滚依赖预先审核的恢复方案，不能由回滚 App 容器自动完成。证据：`docs/deployment.md:53-64`。
- 因此“App 镜像回滚”和“数据库状态回滚”是两个独立控制面。图中不应画出容器对数据库执行自动 migrate/rollback 的边。

### Android

- 已安装 APK 不受 Web 容器回滚影响；它继续使用固定的 API origin，并仅在看到更高 versionCode 的完整 Release 时提示升级。
- Android 覆盖安装要求包名与生产签名持续一致。降低或删除 GitHub Release 不能可靠回退已安装客户端；实际修复路径应是使用相同签名发布更高 versionCode 的前向修复。证据：`docs/mobile.md:77-102` 与 `mobile/android/app/src/main/java/de/ixacg/animestream/data/repository/UpdateRepository.kt:153-183`。

## 架构图应表达的边界与关系

建议保留不超过 10 个主节点：

1. Browser
2. Android APK
3. Caddy / HTTPS edge
4. Docker host-published port
5. Next.js standalone App
6. External MySQL / MariaDB
7. GitHub repository + Actions（可合并为 CI control plane）
8. Docker Hub
9. GitHub Releases
10. Operations / manual deployment gate

关键语义边：

- Browser/Android -> Caddy：`HTTPS :443`
- Caddy -> host publish：`reverse_proxy 127.0.0.1:13000`
- host publish -> App：`Docker NAT -> :3000`
- App -> external DB：`MySQL + TLS`
- GitHub Actions -> Docker Hub：`push main/latest/manga/SHA/SemVer`
- Operations -> production App：`pin/pull or build + compose up`，必须显示为独立人工/外部交接，不得画成 Actions 自动部署。
- Android Action -> GitHub Releases：`manual release gate; 5 signed APKs + checksums`
- Android -> App：`GET /api/android/update`
- App -> GitHub Releases API：`validated manifest; cached`
- Android -> GitHub Releases：`download selected ABI APK`
- Operations -> `/api/live` 与 `/api/ready`：部署验证；Docker 自身只连 `/api/live`。

建议边界：

- **Public Internet**：Browser、Android、GitHub Releases 下载。
- **Production host**：Caddy、宿主机端口、App container；Caddy 是 TLS 入口。
- **External managed data plane**：MySQL/MariaDB，具体供应商未知。
- **CI/CD control plane**：GitHub Actions、Production environment signing secrets、Docker Hub、人工部署闸门。

## 不应被图误导性表达的事项

- 不要画 GitHub Actions 自动部署正式服务器；仓库没有这条边。
- 不要把数据库、crawler、Android 构建工具链或 keystore 画进 App 容器。
- 不要把 Docker `healthy` 等同数据库 ready。
- 不要宣称 Releases 会自动只保留 5 个；代码只自动清理 Actions runs。
- 不要把当前 `0.0.0.0:13000` 描述成仓库推荐配置；应标成生产现状与旁路暴露面。
- 不要写出 `.env`、数据库主机、证书邮箱或 Secret 值。
