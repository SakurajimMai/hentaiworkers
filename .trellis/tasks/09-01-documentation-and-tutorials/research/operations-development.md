# 运维与开发文档审计

## 1. 范围与结论

本报告只核对仓库当前代码和配置，不把期望架构写成既成事实。审计范围包括：

- 快速开始与文档索引：`README.md`、`docs/README.md`
- 管理后台、本地开发、生产部署与架构：`docs/admin-guide.md`、`docs/development.md`、`docs/deployment.md`、`docs/architecture.md`
- HTTP 契约：`docs/api/README.md`、`docs/api/openapi.yaml` 与 `app/api/**`
- 环境变量、数据库基线/迁移、健康检查、Docker/Compose 与 GitHub Actions

当前文档已经准确表达 App-only、外部数据库、Android 由 Actions 构建、生产数据库需要 TLS 等大方向，但仍有几处会让照抄命令的开发者或运维人员失败的高风险断层：

1. 正式部署文档声称 Compose 默认拉取 `latest`，实际默认 `manga` 且 `pull_policy: never`。
2. 文档提供的私有 CA 用法在当前生产镜像和 Compose 中没有文件挂载，容器读不到部署目录中的 CA。
3. 当前数据库基线把带外键的 `animes` 放在被引用的 `categories` 之前，又没有关闭外键检查；新库顺序导入存在直接失败风险。
4. 开发文档给出的管理员密码示例含 `replace-with`，而 seed 脚本明确拒绝该占位词。
5. 文档说 App 不自动迁移，但漫画榜单与漫画进度代码会在请求路径中懒执行 `CREATE TABLE IF NOT EXISTS`；同时 `/api/ready` 只做连通性探测，不验证迁移或表结构。

这些问题应先于文案润色处理。否则教程越完整，错误操作的可复制性越高。

## 2. 高优先级事实断层

### 2.1 Compose 镜像来源与启动命令相互矛盾

- `README.md:63-71` 和 `docs/deployment.md:25-32` 都让用户直接执行 `docker compose pull app` / `up -d`，并声称默认镜像是 `sakurajiamai/hentaiworkers-app:latest`。
- 实际根清单为 `IMAGE_TAG:-manga` 与 `PULL_POLICY:-never`（`docker-compose.yml:8-11`），生产包也相同（`deploy/docker-compose.yml:9-12`）。在没有本地 `manga` 镜像时，照抄正式部署文档不会按说明拉取 `latest`。
- `deploy/.env.example:2` 也声称 Compose 拉取 `latest`，但模板没有设置 `IMAGE_TAG` 或 `PULL_POLICY`（`deploy/.env.example:1-25`）。
- 只有 `deploy/README.md:27-34` 给出了与实际清单一致的远端镜像命令：两个命令都显式携带 `IMAGE_TAG=latest PULL_POLICY=always`。
- Docker 工作流确实发布 `main`、SemVer、commit SHA、`latest` 和 `manga` 标签（`.github/workflows/docker-publish.yml:35-46`），但只负责构建并推送镜像（`.github/workflows/docker-publish.yml:48-58`），没有主机部署步骤。

建议：部署教程必须先让操作者在“本地构建镜像”和“从仓库拉取镜像”中二选一，并在命令中显式固定 `IMAGE_TAG`/`PULL_POLICY`。生产示例优先 commit SHA；不能把 CI 发布镜像描述成自动部署。

端口也要区分两层默认值：复制模板后是 `127.0.0.1:13000`（`deploy/.env.example:5-7`），未使用模板时 Compose fallback 是 `127.0.0.1:3000`（`deploy/docker-compose.yml:12`）。当前 `docs/deployment.md:37-38` 的 `13000` 仅在已复制模板的前提下成立。

### 2.2 私有 CA 指引在容器中不可执行

- `docs/deployment.md:19` 要求设置仓库内相对路径 `DATABASE_TLS_CA_FILE`，并让 CA 文件在部署目录可读。
- 配置解析确实只允许工作目录内相对路径（`lib/server/shared/config.ts:170-191`）；运行时从 `process.cwd()` 解析并读取（`lib/db.ts:27-40`），随后传给 MySQL TLS（`lib/db.ts:70-75`）。
- 但两个环境模板都没有该变量（`.env.example:6-28`、`deploy/.env.example:9-25`），两个 Compose 清单也没有 CA volume（`docker-compose.yml:12-18`、`deploy/docker-compose.yml:13-19`）。
- 生产镜像只复制 `public`、Next standalone 与静态资源（`Dockerfile:24-26`），所以“把 CA 放在部署目录”不会让 `/app/<relative-path>` 出现在容器中。

建议：正式教程不能继续承诺当前用法可用。实施阶段应先选择并验证一种真实方案，例如只读挂载到 `/app/certs/...` 并用容器工作目录相对路径引用；随后同步 Compose、模板和文档。挂载方案落地前，文档必须明确这是尚未提供的能力，不能让用户只改 `.env`。

### 2.3 新库基线存在导入顺序与兼容性风险

- 开发文档把 `drizzle/baseline/0000-production-schema.sql` 定义为核心表基线（`docs/development.md:31-37`），README 也把“基线 + 增量 SQL”作为数据库建立入口（`README.md:42`）。
- 基线先创建 `animes`（`drizzle/baseline/0000-production-schema.sql:5`），并立即声明引用 `categories` 的外键（同文件 `:28`）；`categories` 直到同文件 `:58` 才创建。文件没有 `FOREIGN_KEY_CHECKS` 包裹，因此不能把它当作已经验证可顺序导入的新库教程。
- 生成脚本固定表顺序也是 `animes` 在 `categories` 前（`scripts/export-schema-baseline.mjs:27-33`），并按该顺序拼接 SQL（同文件 `:217-230`），下次导出会复现问题。
- 基线固定使用 `utf8mb4_uca1400_ai_ci`（例如 `drizzle/baseline/0000-production-schema.sql:29`），但文档同时承诺 MySQL 8+ 与 MariaDB 10.6+（`docs/development.md:5-7`）。仓库没有对两个引擎都执行全新导入的证据，因此跨引擎兼容性只能标记为待验证，不能在教程里宣称已支持。

建议：在发布“从零建库”教程前，用临时 MySQL 8 和 MariaDB 10.6 分别执行基线及迁移链，并修复生成器以保持依赖顺序或安全地处理外键。教程应区分“全新空库”和“已有生产库增量升级”，禁止对已有库盲目重放基线。

### 2.4 管理员初始化示例会失败，且执行顺序不明确

- `docs/development.md:45-52` 给出 `ADMIN_BOOTSTRAP_PASSWORD=replace-with-at-least-12-characters`。
- seed 脚本明确拒绝包含 `replace-with` 的密码（`scripts/seed-admin.ts:45-55`），所以该复制示例必然失败。
- seed 会自行 `CREATE TABLE IF NOT EXISTS users`（`scripts/seed-admin.ts:7-20`），但它不是完整迁移器。若在基线前运行，随后基线又用普通 `CREATE TABLE users`（`drizzle/baseline/0000-production-schema.sql:69-80`），建库流程更容易进入半初始化状态。
- 当数据库中已有任意管理员时，seed 直接跳过（`scripts/seed-admin.ts:34-43`）。正式文档只说首次创建与首次改密（`README.md:36-40`、`docs/admin-guide.md:5-13`），没有说明“先完成 schema，再 seed、验证登录、删除一次性 bootstrap 环境变量”的完整顺序。

建议：示例不要提供会被误当真实密码的字面占位值；教程应生成随机密码或明确提示交互设置。固定流程为：完成基线/迁移 -> 校验 `/api/ready` 与必要表 -> 临时注入 bootstrap 变量 -> `npm run seed:admin` -> 登录并改密 -> 从环境中删除 bootstrap 变量。

### 2.5 “不自动迁移”不等于“运行时不执行 DDL”

- `docs/development.md:41`、`docs/deployment.md:32` 与 `deploy/README.md:46` 都正确说明 Compose 不会执行迁移链。
- 但漫画榜单访问会懒创建 `manga_view_days` / `manga_view_dedup`（`lib/manga-views.ts:23-48`），漫画进度访问会懒创建 `manga_reading_progress`（`lib/server/manga-progress.ts:20-43`）。生产应用数据库账号因此仍可能需要 `CREATE` 权限；文档没有披露此运行时 DDL。
- 正式迁移已经提供对应表（`drizzle/migrations/0017-manga-views.sql:1-14`、`drizzle/migrations/0018-manga-reading-progress.sql:1-14`），所以运行时建表与“受控迁移、最小权限”叙事处于冲突状态。
- `/api/ready` 在有 `DATABASE_URL` 时只执行 `SELECT 1`（`app/api/ready/route.ts:8-16`），不会验证上述表或任何 migration；缺少 `DATABASE_URL` 时甚至直接返回 ready（同文件 `:10-12`）。因此 `docs/development.md:29` 中“数据库就绪检查”的表述需要限定为连接检查。

建议：实施阶段应决定保留还是移除运行时 DDL。在决定前，运维教程要诚实记录当前权限要求；长期应让受控迁移负责 schema，再把应用账号收敛到 DML 权限。无论如何，部署验收不能只看 `/api/ready`，还要做代表性目录、登录、收藏/历史、漫画阅读烟测。

### 2.6 漫画迁移清单已经落后

- `deploy/README.md:15-19` 只列出 `0014` 到 `0017`。
- 当前还需要漫画阅读进度 `0018`（`drizzle/migrations/0018-manga-reading-progress.sql:1-14`）和收藏/历史分页索引 `0019`（`drizzle/migrations/0019-library-pagination-indexes.sql:1-66`）。`docs/development.md:33-41` 对 `0014–0019` 和 `0019` 可重入特性描述得更准确。
- Drizzle journal 没有迁移记录（`drizzle/meta/_journal.json:1`），`package.json:17-20` 也只有基线导出、禁止的 `db:push`、Studio 和 seed，没有自动 migration runner。

建议：教程必须把“由操作者记录已应用版本”写成显式责任，提供迁移前 schema 检查、备份、按序执行、索引检查、应用烟测及独立数据库恢复步骤。`0019` 的可重复执行不代表大表 DDL 没有锁和磁盘风险。

## 3. 接口与架构文档缺口

### 3.1 健康检查需要三分法，而不是三个近义链接

实际语义如下：

| 端点 | 当前行为 | 运维含义 |
|---|---|---|
| `/api/live` | 永远返回 `200 {status:"live"}`，不检查依赖（`app/api/live/handler.ts:3-7`） | 仅进程存活；Compose 正在使用它（`deploy/docker-compose.yml:20-31`） |
| `/api/ready` | 有 `DATABASE_URL` 时 `SELECT 1`，失败为 503；无该变量时仍为 200（`app/api/ready/route.ts:8-19`、`app/api/ready/handler.ts:5-25`） | 数据库连通性近似值，不证明 schema 完整 |
| `/api/health` | 总是查询 DB；成功返回 DB/版本，失败把异常消息原样返回 500（`app/api/health/handler.ts:16-40`） | 诊断端点；当前可能暴露底层连接错误，不宜被教程当作无条件公网探针 |

`docs/api/README.md:15-17` 列出三者，但只详细说明 `/api/health`（同文件 `:28-52`）；OpenAPI 也只有 `/api/health`（`docs/api/openapi.yaml:31-48`）。部署教程应明确 Docker healthy 只表示进程存活，并给出从 live -> ready -> 日志 -> 代表性接口的排查顺序。

### 3.2 API README 与 OpenAPI 都不是当前完整契约

- API README 的一览只记录公开目录、更新清单和 watch progress（`docs/api/README.md:11-26`），遗漏 OpenAPI 已有的 `/api/ads`（`docs/api/openapi.yaml:50-66`），也遗漏真实存在的 `/api/me`、favorites、manga progress 和漫画发布接口。
- OpenAPI 自称“公开只读 REST API”且无需鉴权（`docs/api/openapi.yaml:2-12`），路径只有 health、ads、update、animes、tags、mangas（同文件 `:31-308`）。它没有 `/api/live`、`/api/ready`，也没有任何 Cookie 或发布密钥 security scheme。
- 实际 `/api/me` 可返回当前会话摘要或 `user:null`（`app/api/me/route.ts:6-21`）；favorites 同时支持 GET 全量列表和 POST 切换（`app/api/me/favorites/route.ts:10-60`）；watch progress 支持列表/合并/清空及单项 GET/PUT/DELETE（`app/api/me/watch-progress/route.ts:20-60`、`app/api/me/watch-progress/[animeId]/route.ts:29-96`）；manga progress 支持列表/合并/清空及单项 PUT/DELETE（`app/api/me/manga-progress/route.ts:11-44`、`app/api/me/manga-progress/[mangaId]/route.ts:17-41`）。
- 发布接口接受 `X-Manga-Publish-Key` 或 Bearer，并兼容 camelCase/snake_case 请求字段（`app/api/manga/publish/route.ts:9-40`），校验后返回 201 或 200（同文件 `:42-91`）。管理手册只给了其中一种请求头（`docs/admin-guide.md:50-54`）。
- 网页 `/favorites` 和 `/history` 已按每页 20 条分页并规范化越界页码（`lib/server/shared/pagination.ts:1-59`、`app/(site)/favorites/page.tsx:30-80`、`app/(site)/history/page.tsx:46-121`），但移动端 favorites API 仍调用无分页的 `listMine()`/`listMangaFavorites()`（`app/api/me/favorites/route.ts:10-17`；后者 SQL 无 `LIMIT`，`lib/server/manga-favorites.ts:82-95`）。API 文档必须描述真实差异，不能把网页分页能力推断到 API。

建议先做范围决策：

1. 若 OpenAPI 只承诺匿名公开 API，就把标题和边界写清，补齐 live/ready/ads，并将会话 API 与 publish 放到单独“应用内部/集成接口”章节。
2. 若目标是完整 HTTP 契约，则补全所有稳定路径、Cookie security、publish apiKey/Bearer、400/401/403/404/5xx、`Cache-Control: no-store` 与请求/响应 schema。

无论选择哪种，`docs/api/README.md` 和 OpenAPI 必须从同一范围生成/核对，不能一个“半完整”、一个“只公开”。

### 3.3 架构文档把局部约束写成了全局事实

- `docs/architecture.md:23-34` 描述 `catalog`/`identity`/`system` 的 ports/adapters，并断言页面和 Route Handler 不直接拼 SQL、数据库访问集中在 infrastructure repository。
- 实际后台概览页面直接导入 `db` 并查询五组统计（`app/admin/page.tsx:2-18`），后台里番编辑页也直接读表（`app/admin/animes/[id]/page.tsx:3-35`）。
- 漫画目录服务直接导入 Drizzle/db/schema（`lib/manga-service.ts:4-13`）并执行列表查询（同文件 `:152-180`）；漫画 admin、favorites、progress 也在 `lib/server/infrastructure` 外直接访问 DB（`lib/server/manga-admin.ts:1-9`、`lib/server/manga-favorites.ts:1-9`、`lib/server/manga-progress.ts:1-4`）。
- `docs/development.md:73-78` 可继续作为“新代码约束”，但架构现状应写成“部分模块完成分层，漫画与若干后台页面仍是直接数据访问的已知例外”，不要把目标状态伪装为现状。

架构图/文档还应明确：GitHub Actions 只产出镜像/APK；生产主机拉取、迁移、反代和回滚由操作者负责；`crawler/` 仍在主站部署边界之外（该边界当前由 `docs/architecture.md:3-7` 和 `README.md:3-5` 准确表达）。

## 4. 环境变量与安全教程缺口

### 4.1 缺少按作用域整理的环境参考

当前变量分散在模板、脚本和 workflows：

| 作用域 | 变量/秘密 | 代码事实 |
|---|---|---|
| App/Compose | `APP_HOST_BIND`, `APP_PORT` | 模板值见 `.env.example:1-4`；仅供 Compose 插值，不是 Next.js 业务配置 |
| App DB | `DATABASE_URL`, TLS、pool、timeout、可选 CA | 模板见 `.env.example:6-13`；MySQL URL/远程 DNS 限制见 `lib/server/shared/config.ts:127-167`；生产远程 DB 禁止关闭 TLS 见同文件 `:369-383` |
| App URL/Session | `SITE_URL`, `SESSION_SECRET` | 生产 `SITE_URL` 必填且不能带 path/query/hash（`lib/site-url.ts:1-28`）；Session 会拒绝低强度/占位值（`lib/server/shared/config.ts:194-223`、`:420-425`） |
| App 加密 | `APP_ENCRYPTION_KEYRING`, `APP_ENCRYPTION_CURRENT_KEY_ID` | keyring 必须是 JSON 对象，每个值是规范 Base64 的 32 字节密钥，current id 必须存在（`lib/server/shared/config.ts:226-300`） |
| 一次性 seed | `ADMIN_BOOTSTRAP_USER`, `ADMIN_BOOTSTRAP_PASSWORD` | 只由 seed 使用，必填且邮箱/长度/占位词校验见 `scripts/seed-admin.ts:23-28`、`:45-55` |
| Docker CI | `DOCKERHUB_USERNAME`, `DOCKERHUB_TOKEN` | `.github/workflows/docker-publish.yml:29-33` |
| Android CI | 四个 signing secrets、`ANDROID_RELEASE_CERT_SHA256` | `.github/workflows/build-android.yml:28-30`、`:63-94`、`:226-238` |

模板只说 keyring 中“每个值”为 32 字节 Base64（`.env.example:25-28`），没有给出整个 JSON 结构，README 的“至少配置”清单（`README.md:28-34`）也不足以让新开发者第一次正确启动。教程应提供可执行但不含固定秘密的生成流程，并明确 keyring 与数据库备份必须一起保管；删除仍用于解密历史配置的旧 key 会破坏 SMTP、Turnstile 或漫画发布秘密读取。

### 4.2 管理后台手册的功能清单不完整且有一条错误边界

- 后台导航本身与手册基本一致（`app/admin/layout.tsx:8-17` 对应 `docs/admin-guide.md:17-26`），但概览实际还有漫画统计和漫画发布状态（`app/admin/page.tsx:11-37`、`:81-128`），手册 `docs/admin-guide.md:19` 未提。
- 系统设置页面还包含 Telegram 页脚链接、信息流/漫画阅读广告、漫画栏目/发布密钥以及 SMTP 测试（`app/admin/settings/page.tsx:29-45`、`:482-573`、`:575-630`）；`docs/admin-guide.md:66-75` 的清单不完整。
- `docs/admin-guide.md:78` 断言“主站不代理视频或图片”。实际 `/cdn-img/**` 固定代理 `https://image.ixacg.de`，包含上游抓取与一个月缓存（`app/cdn-img/[...path]/route.ts:3-57`）。准确说法应是：播放器视频/广告素材要求浏览器直连；特定漫画/封面图片可能走受限的 `image.ixacg.de` 图片代理；主站没有通用视频代理。
- SMTP、Turnstile 和漫画发布密钥的留空保留语义在 UI 中真实存在（`app/admin/settings/page.tsx:31-32`、`:545-607`），教程应按“先保存基础 SMTP -> 发测试邮件 -> 再开启邮箱验证”和“先配置 Turnstile key -> 再开启全局与 Trust 场景开关”的顺序讲解，避免把多个开关混为一个。

## 5. GitHub Actions 与发布运维应明确的事实

### Docker 镜像

- 触发条件是 main push、`v*` tag 和手动运行（`.github/workflows/docker-publish.yml:3-7`）。
- 需要 Docker Hub 用户名/token（同文件 `:29-33`），产出标签见同文件 `:35-46`。
- 工作流没有 SSH、Compose 或部署步骤；宿主机升级始终是独立人工/外部自动化责任。

### Android

- 只在 `mobile/**` 或工作流文件变化的 push/PR，以及手动运行时触发（`.github/workflows/build-android.yml:3-18`）。
- API 基址目前硬编码为 `https://www.ixacg.de`（同文件 `:28-30`）；fork 或新正式环境若不改 workflow，APK 仍连接该站点。
- 四个签名 secret 必须全有或全无，部分配置会失败（同文件 `:63-94`）；release 签名还要匹配仓库变量证书摘要（同文件 `:226-238`）。
- 构建产出四个 ABI split + universal、`SHA256SUMS` 与 build info（同文件 `:249-279`）。只有 main 上手动 dispatch 且 `publish_release=true`、签名模式为 release 才创建 prerelease（同文件 `:293-300`、`:362-375`）。现有 `README.md:55-59` 与 `docs/deployment.md:77-81` 基本准确。

### “只保留最新五个”的精确语义

两个 workflow 的 cleanup 都调用仓库级 `listWorkflowRunsForRepo`，按时间保留最新五个仓库 Actions runs，并删除其余已完成 run（`.github/workflows/docker-publish.yml:60-117`、`.github/workflows/build-android.yml:377-434`）。这不是“每个 workflow 五个”，也不会删除 GitHub Releases、Release assets 或 Docker Hub tags。教程应显式写清，避免用户把 Actions run retention 误认为发布包保留策略。

## 6. 建议的文档与教程结构

建议保留现有文件，按读者任务重新组织，避免新增大量彼此重复的文档。

### `README.md`：十分钟入口

1. 产品与仓库边界，链接完整架构图。
2. 两条明确入口：“本地开发”与“生产部署”；不在 README 内复制完整运维手册。
3. 本地最短闭环：依赖 -> 创建/迁移 DB -> 生成秘密 -> 启动 -> `/api/live`/代表性页面。
4. 管理员 seed 只给链接和正确顺序。
5. Docker 只展示一种确定可用的路径，镜像 tag/pull policy 显式化。
6. Android ABI 选择与 Releases 链接保留现有简表。

### `docs/README.md`：按角色导航

- 使用者：用户指南、Android 下载/更新。
- 站点管理员：首次登录、内容、用户、SMTP/Turnstile、发布密钥。
- 开发者：本地环境、数据库初始化、质量检查、模块边界、API。
- 运维：生产准备、迁移、部署、健康、升级/回滚、Actions 发布。
- 架构：静态说明 + 可浏览生产架构图及其可编辑源。

当前索引只有文件表（`docs/README.md:1-14`），可补充“先读哪一篇”和常见任务入口。

### `docs/development.md`：本地开发逐步教程

1. Node/npm 与 MySQL/MariaDB 版本；明确仓库没有本地 DB Compose。
2. 新建本地 DB 用户与数据库；说明 MySQL/MariaDB 基线兼容性验证状态。
3. 复制 `.env.example`，生成 Session/keyring，给出合法 JSON 结构；本地 loopback 才可关闭 TLS。
4. 全新库导入基线与迁移；已有库先检查 schema，禁止盲目重放。
5. `npm run dev`，验证 live、ready、首页、登录。
6. 管理员初始化与清理 bootstrap 变量。
7. 常用开发流：测试、lint/typecheck/build、边界检查。
8. 故障排查：配置校验、DB TLS、缺表、端口冲突。
9. Android 只解释源码边界并链接 `docs/mobile.md`，避免重复完整发布流程。

### `docs/deployment.md`：生产 operator runbook

1. 部署责任矩阵：Actions 产物、操作者迁移/主机、外部 DB、反代/TLS。
2. 预检：备份、磁盘/DDL 窗口、DB DNS/TLS/CA、端口绑定、域名。
3. 选择镜像：本地 `manga + never` 或远端 immutable SHA + `always`。
4. 完整环境变量/秘密生成与文件权限；私有 CA 必须用已验证的容器挂载步骤。
5. 迁移：检查当前状态、按序应用、记录、验证索引；App 不替代 migration runner。
6. 首次启动与管理员 seed。
7. 反向代理与外部验证。
8. 健康矩阵和烟测：live、ready、目录、登录、收藏/历史、漫画章节、管理员。
9. 升级：固定目标 tag/SHA、迁移前备份、拉取、替换、预热、验收。
10. 回滚：App 镜像回滚与 DB 恢复分离；列出停止条件。
11. 故障手册：容器 healthy 但站点失败、DB TLS、响应超时、GitHub update 元数据、邮件/Turnstile。

### `docs/admin-guide.md`：操作型后台教程

1. 首次登录和账户安全。
2. 每个导航项的目标、必填字段、不可逆操作。
3. 里番与漫画标签严格分开。
4. 漫画发布密钥：生成、配置、请求示例、轮换与撤销。
5. SMTP：配置 -> 测试 -> 开启验证；Turnstile：key -> enable -> Trust 场景。
6. 广告/播放器素材直连与受限图片代理边界。
7. Android Release URL 配置与用户入口验证。

### `docs/architecture.md`：事实架构，不写迁移目标

1. 系统/信任边界和生产拓扑。
2. GitHub Actions、镜像仓库、人工生产部署的控制面。
3. 模块化单体的已分层模块与直接 DB 访问例外。
4. HTTP 鉴权分区、数据所有权、缓存与外部依赖。
5. schema 生命周期：基线、人工迁移、当前运行时 DDL 例外。
6. secrets/keyring、TLS、Turnstile/SMTP、健康探针边界。

### `docs/api/README.md` + `docs/api/openapi.yaml`：单一契约范围

1. 明确“仅匿名公开”或“完整 HTTP API”范围。
2. 路径清单由 `app/api/**/route.ts` 反向核对。
3. 分开匿名、Cookie 会话、共享发布密钥三种鉴权。
4. 完整记录分页/上限、缓存、错误、幂等与状态码。
5. 增加 OpenAPI 解析/校验到文档验收；示例请求必须来自真实 schema。

## 7. 建议验收清单

文档实施完成后至少执行以下非破坏性或隔离验证：

1. `git diff --check`；检查所有 Markdown 相对链接存在。
2. 使用仓库的 `yaml` 依赖解析 `docs/api/openapi.yaml`，并把声明路径与 `app/api/**/route.ts` 的目标范围逐项比对。
3. 在临时 MySQL 8 和 MariaDB 10.6 空库分别执行基线与按序迁移；确认表、外键和 `0019` 四个复合索引。
4. 对教程中的 `.env` 生成步骤运行配置解析测试，确认 keyring JSON、Session secret、URL/TLS/CA 都能被实际代码接受。
5. 用 `docker compose config` 分别验证“本地构建”和“远端 SHA 拉取”两套示例，确认最终 image、pull policy、bind、port 和 CA mount。
6. 启动隔离环境后依次验证 `/api/live`、`/api/ready`、公开目录、登录、收藏/历史分页、漫画章节、后台 SMTP 测试；记录预期状态码和响应体。
7. 对 Actions 文档逐项核对 trigger、environment、Secrets/Variables、五个 APK、手动 release gate 与仓库级五-run retention。
8. 确认没有把 `crawler/` 写进 App 镜像、Compose、运行时环境或内部模块依赖。

## 8. 实施边界

- 此报告没有修改上述正式文档、应用代码、迁移、Compose、workflow 或根 `design.md`。
- 私有 CA、基线顺序/跨引擎兼容、运行时 DDL 等问题不能仅靠改文案变成“已解决”；正式教程应在对应实现得到验证后再给出可复制命令。
- 文档中的生产事实应以仓库声明配置和可重复验证为准；某一台主机的临时状态只能作为运维检查结果，不能反向写成所有部署的默认架构。
