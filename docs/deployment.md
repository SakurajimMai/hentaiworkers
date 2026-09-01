# 部署指南

生产 Compose 只运行 AnimeStream App。MySQL/MariaDB、数据库迁移、管理员 seed、
HTTPS 反向代理和主机升级均由操作者或外部平台负责。GitHub Actions 发布镜像不等于
生产主机已经部署。

需要按步骤发布时，使用
[生产发布检查教程](./tutorials/production-rollout.md)；本页保留完整参考和限制。

## 1. 责任边界

| 组件 | 当前责任 |
|------|----------|
| Docker workflow | 构建并推送 App 镜像与标签 |
| Android workflow | 检查并构建 APK；满足手动门禁时创建 GitHub prerelease |
| Compose | 启动一个 `app` 服务并检查进程存活 |
| 操作者 | 选择镜像、准备环境、审核/执行迁移、seed、反代、烟测、升级与回滚 |
| 外部数据库 | 创建数据库、备份、TLS、权限、容量和恢复 |
| HTTPS 反向代理 | 证书、域名、请求转发、超时和公网入口 |

`crawler/`、数据抓取、媒体下载和对象存储上传不属于 App 部署拓扑。

## 2. 发布前停止条件

出现以下任一情况时，不要继续生产启动：

- 数据库是空库，或无法确认当前 schema 与待应用迁移。
- 计划直接导入 `drizzle/baseline/0000-production-schema.sql`。该 baseline 的
  外键建表顺序以及 MySQL 8 / MariaDB 10.6 空库兼容性尚未完成验证。
- 数据库必须使用私有 CA。官方 Compose 和生产镜像当前没有挂载 CA 文件，单独设置
  `DATABASE_TLS_CA_FILE` 不会让宿主机文件出现在容器内。
- 没有数据库备份或未经审核的恢复方案。
- 不知道要部署的镜像 tag，或该 tag 尚未由 Docker workflow 发布。
- 反向代理、域名或 `SITE_URL` 尚未确定。

空库基线和私有 CA 需要独立实现、隔离验证和评审，不能通过补一条文档命令绕过。

## 3. 环境与私有 CA 限制

```bash
cp deploy/.env.example deploy/.env
chmod 600 deploy/.env
```

在 `deploy/.env` 中填写：

| 变量 | 生产要求 |
|------|----------|
| `DATABASE_URL` | 外部 MySQL URL；密码特殊字符需 URL 编码 |
| `DATABASE_TLS_MODE` | 远程生产数据库必须为 `required` |
| `DATABASE_POOL_*` | 连接池上限、空闲连接与超时；模板值可作为起点 |
| `SITE_URL` | 用户实际访问的 HTTPS origin，不得带路径、查询或片段 |
| `SESSION_SECRET` | 至少 32 字符且不能是占位值 |
| `APP_ENCRYPTION_KEYRING` | JSON 对象；每个值是规范 Base64 的 32 字节密钥 |
| `APP_ENCRYPTION_CURRENT_KEY_ID` | keyring 中当前存在的 key id |
| `APP_HOST_BIND` | 模板为 `127.0.0.1`，不要无意改为公网监听 |
| `APP_PORT` | 模板为 `13000`；Compose 未读取模板时 fallback 为 `3000` |
| `IMAGE_TAG` | 本地构建使用 `manga`；远端生产使用已发布的不可变 tag |
| `PULL_POLICY` | 本地构建使用 `never`；远端拉取使用 `always` |

Session/keyring 的正确生成方式见
[开发指南](./development.md#2-配置)。keyring 与数据库备份必须一起安全保管，
否则已加密的 SMTP、Turnstile 和漫画发布密钥可能无法恢复。

### 私有 CA

应用代码要求 `DATABASE_TLS_CA_FILE` 是容器工作目录内的相对路径。当前
`deploy/docker-compose.yml` 没有 volume，生产镜像也没有包含操作者的 CA。
因此，下列做法当前不成立：

```dotenv
# 当前官方 Compose 中不可直接使用
DATABASE_TLS_CA_FILE=certs/private-ca.pem
```

如果数据库证书不能由镜像内的系统信任链验证，请停止官方部署流程，先通过独立任务设计
只读 CA mount、容器内路径、权限和轮换流程，并用 `docker compose config` 与真实 TLS
连接验证后再部署。

## 4. 数据库与迁移

App 容器不会运行 SQL migration runner，也不会记录迁移版本。对已有且经过审核的数据库：

1. 备份数据库，并验证恢复路径。
2. 检查实际表、列、索引，确定目标版本真正待应用的 SQL。
3. 审核 DDL 锁、磁盘、耗时和向后兼容性。
4. 在维护窗口通过受控数据库客户端执行。
5. 记录已应用文件并检查结果。

目标版本包含漫画阅读与收藏/历史分页时，检查清单必须包含：

- `0018-manga-reading-progress.sql`
- `0019-library-pagination-indexes.sql`

`0019` 会在每条 DDL 前检查索引，可在部分完成后重试，但仍可能影响大表。历史
`0010-0013` 可能留下当前 App 不读写的 works 表；不要因为编号连续就盲目重放或删除。

### 当前运行时 DDL

“Compose 不自动迁移”不等于“App 永远不发 DDL”。当前漫画榜单与漫画进度路径可能懒执行
`CREATE TABLE IF NOT EXISTS`，涉及：

- `manga_view_days`
- `manga_view_dedup`
- `manga_reading_progress`

应通过正式迁移预先准备这些表，并在应用账号权限策略下验证榜单、漫画阅读和进度路径。
不要依赖懒建表补齐其他 schema。

## 5. 选择镜像

两个 Compose 清单的真实默认值都是：

```text
IMAGE_TAG=manga
PULL_POLICY=never
```

这组默认值面向本地已构建镜像，不会默认拉取 `latest`。

### 路径 A：本地构建

在仓库根目录：

```bash
docker build -t sakurajiamai/hentaiworkers-app:manga .
cd deploy
IMAGE_TAG=manga PULL_POLICY=never docker compose up -d
```

### 路径 B：拉取已发布镜像

生产优先选择 Docker workflow 已发布并验收的 commit SHA tag，而不是可移动的
`latest`。把实际 tag 写入 `deploy/.env`：

```dotenv
IMAGE_TAG=<已发布且验证过的 commit-sha tag>
PULL_POLICY=always
```

替换占位值后执行：

```bash
cd deploy
docker compose config -q
docker compose config --services
docker compose config --images
docker compose pull app
docker compose up -d --no-build
```

`--services` 应只输出 `app`，`--images` 应输出预期 tag。不要在工单或日志中粘贴
完整 `docker compose config` 输出，因为解析后的环境可能包含秘密。

CI 发布的常用标签包括 `latest`、`main`、`manga`、commit SHA 和版本 tag
对应的 SemVer 标签。生产选择由操作者负责。

## 6. 启动与健康检查

```bash
cd deploy
docker compose ps
docker compose logs --tail=100 app
```

复制模板且没有改端口时：

```bash
APP_CHECK_ORIGIN=http://127.0.0.1:13000
curl -fsS "$APP_CHECK_ORIGIN/api/live"
curl -fsS "$APP_CHECK_ORIGIN/api/ready"
```

若修改了 `APP_PORT`，同步修改 `APP_CHECK_ORIGIN`，不要假设 shell 会自动读取
`deploy/.env`。

| 端点 | 成功含义 | 不保证 |
|------|----------|--------|
| `/api/live` | Node.js 进程可以响应 | 数据库、迁移、登录和业务可用 |
| `/api/ready` | 生产有 `DATABASE_URL` 时 `SELECT 1` 成功 | 所有表、列、索引或业务查询可用 |
| `/api/health` | 数据库诊断查询成功 | 完整业务可用；失败响应当前可能包含底层错误 |

Compose healthcheck 只调用 `/api/live`。容器显示 healthy 仍可能存在数据库或 schema
问题。

## 7. 反向代理

复制模板时，App 监听宿主机 `127.0.0.1:13000`，容器内端口始终为 `3000`。
反向代理应：

- 终止 HTTPS，并转发到宿主机回环地址的 App 端口。
- 转发 `Host`、`X-Forwarded-Proto` 和可信的客户端 IP 头。
- 为请求体、连接和响应设置合理上限与超时。
- 不直接向公网暴露 App 宿主端口或数据库端口。

`SITE_URL` 必须与用户实际访问的 HTTPS origin 一致。配置代理后，从外部网络检查
`https://<域名>/api/live` 和代表性页面。

## 8. 预热与烟测

数据库连接默认建立超时为 5 秒；只有调用数据库重试 helper 的路径，才会对瞬时连接错误最多
重试两次，不能把它视为所有查询的保证。里番列表、漫画列表、标签和广告读取使用有界进程内
缓存；容器重启后缓存为空。

启动后可请求以下端点进行小流量预热：

```bash
curl -fsS "$APP_CHECK_ORIGIN/api/animes?limit=1" >/dev/null
curl -fsS "$APP_CHECK_ORIGIN/api/mangas?limit=1" >/dev/null
curl -fsS "$APP_CHECK_ORIGIN/api/tags?limit=1" >/dev/null
curl -fsS "$APP_CHECK_ORIGIN/api/ads" >/dev/null
```

随后通过 HTTPS 和浏览器完成：

- 首页、里番列表/详情、播放页
- 漫画列表、详情、章节图片与榜单
- 登录、收藏、观看/阅读历史分页
- 管理后台登录与概览
- 已启用时的 SMTP 测试、Turnstile 和漫画发布
- Android 更新清单 `/api/android/update`

任一关键路径失败时停止发布，不要用 `/api/live` 的成功覆盖业务失败。

## 9. 升级与回滚

升级前：

1. 记录当前 App tag、数据库版本和配置文件备份位置。
2. 备份数据库并审核目标 SQL。
3. 确认新镜像已经发布，且架构/质量检查通过。
4. 完成所需迁移后再替换 App。

远端镜像升级使用新的不可变 tag 更新 `deploy/.env`，再执行：

```bash
cd deploy
docker compose pull app
docker compose up -d --no-build
docker compose ps
```

完成第 6-8 节的检查后才结束维护窗口。

App 回滚时，把 `IMAGE_TAG` 改回先前已验证的 tag，再执行相同的 pull/up 命令。
数据库回滚是独立恢复操作，必须使用升级前审核的恢复方案。不要假设旧 App 一定兼容已经
前向迁移的数据，也不要依赖容器自动回滚数据库。

## 10. Actions、Releases 与 Android

Docker workflow 在 main push、`v*` tag 或手动触发时构建并推送镜像；它没有生产
主机部署步骤。

Android workflow 构建：

- `arm64-v8a`
- `armeabi-v7a`
- `x86_64`
- `x86`
- `universal`

`main` push 只产生待验收 Artifact。只有在同一已验证提交上手动选择
`publish_release`、四个生产签名 Secrets 完整且证书摘要匹配时，才创建
`build-*` GitHub prerelease。APK 不进入 App 镜像。

两个 workflow 的 cleanup 都按创建时间保留整个仓库最新五次 Actions runs，并只删除
更早且已完成的 runs。这不是每个 workflow 五次，也不会删除：

- GitHub Releases 或 APK assets
- Docker Hub image tags
- 当前生产容器

Releases 和镜像的保留策略需要单独管理。Android 签名、ABI 与 Build 39 迁移见
[移动端文档](./mobile.md)。

## 11. 常见故障

| 症状 | 先检查 |
|------|--------|
| `docker compose pull` 不拉取 | `IMAGE_TAG` 是否真实存在，`PULL_POLICY` 是否仍为默认 `never` |
| 容器 healthy，但页面超时 | `/api/ready`、App 日志、数据库 DNS/TLS/白名单、代表性目录查询 |
| `/api/ready` 成功但功能报缺表 | ready 只做连接检查；核对实际 schema 和迁移记录 |
| 私有 CA 文件不存在 | 官方 Compose 未挂载 CA；停止并完成独立 mount 方案 |
| 漫画榜单/进度失败 | 核对 `0017`、`0018`、账号 DDL 权限和 App 日志 |
| 新 APK 未出现在 Releases | 检查是否只是 main Artifact，是否手动启用 `publish_release` 并使用正式签名 |
| 旧 Actions run 消失 | cleanup 只保留仓库级最新五次；到 Releases 检查正式 APK，不把 run 当 Release |
