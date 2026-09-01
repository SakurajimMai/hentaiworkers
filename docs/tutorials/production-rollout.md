# 教程：发布一次生产版本

本教程的目标是在**已有、已审核并已迁移的数据库**上发布一个 App 镜像，并完成
进程、数据库和业务烟测。它不创建空库，不设计私有 CA mount，也不把 GitHub Actions
产物误认为已经部署。

完整行为和故障说明见 [部署指南](../deployment.md)。

## 完成结果

完成后应满足：

- Compose 只运行一个 `app` 服务。
- 生产主机运行你明确选择的本地 `manga` 镜像或已发布的不可变 tag。
- App 只绑定宿主机回环地址，并通过 HTTPS 反向代理访问。
- `/api/live`、`/api/ready` 和代表性业务路径通过。
- 当前镜像 tag、迁移记录、备份与回滚 tag 已记录。

## 前提

- Linux 主机、支持 `docker compose` 的 Compose CLI、域名和 HTTPS 反向代理已经准备好。
- 你有仓库源码或至少有 `deploy/` 部署包。
- 外部 MySQL/MariaDB 已存在，schema 由负责人审核，且有可恢复备份。
- 远程数据库使用证书匹配的 DNS 主机名和可信系统证书链。
- 你已经选择：
  - 本地构建 `manga` 镜像；或
  - Docker workflow 已发布并验证过的不可变 commit SHA tag。
- 已记录当前生产镜像 tag，作为 App 回滚目标。

## 停止条件

遇到以下任一情况，停止本教程：

- 数据库为空，或不知道哪些迁移已经应用。
- 计划直接导入 `drizzle/baseline/0000-production-schema.sql`。其外键顺序和
  MySQL/MariaDB 空库兼容性目前尚未完成验证。
- 数据库依赖私有 CA。官方 Compose/镜像没有 CA volume，宿主机文件不会因为设置
  `DATABASE_TLS_CA_FILE` 自动进入容器。
- 没有备份、恢复步骤或前一版本镜像 tag。
- 目标镜像 tag 不存在、未验收，或无法确认来源。

这些条件需要独立处理并验证，不能用 `/api/live` 成功代替。

## 1. 准备部署环境

从仓库根目录执行：

```bash
cp deploy/.env.example deploy/.env
chmod 600 deploy/.env
```

编辑 `deploy/.env`，填写：

- `DATABASE_URL`
- `DATABASE_TLS_MODE=required`
- `SITE_URL=https://实际域名`
- `SESSION_SECRET`
- `APP_ENCRYPTION_KEYRING`
- `APP_ENCRYPTION_CURRENT_KEY_ID`
- `APP_HOST_BIND=127.0.0.1`
- `APP_PORT=13000`，或你明确选择的回环端口

keyring 是 JSON 对象，不是单独 Base64 字符串。生成方法见
[开发指南的配置章节](../development.md#2-配置)。

## 2. 选择并固定镜像

### 远端不可变镜像

把 Docker workflow 已发布的实际 tag 写入 `deploy/.env`：

```dotenv
IMAGE_TAG=<已发布且验证过的 commit-sha tag>
PULL_POLICY=always
```

必须替换占位值。不要把 `latest` 当作可重复回滚的版本标识。

### 本地构建镜像

在仓库根目录构建：

```bash
docker build -t sakurajiamai/hentaiworkers-app:manga .
```

在 `deploy/.env` 设置：

```dotenv
IMAGE_TAG=manga
PULL_POLICY=never
```

Compose 的原始默认值就是 `manga + never`。它不会默认拉取 `latest`。

## 3. 验证 Compose 解析结果

```bash
cd deploy
docker compose config -q
test "$(docker compose config --services)" = "app"
docker compose config --images
```

确认 `--images` 输出你在上一步选择的 tag。不要把完整
`docker compose config` 输出粘贴到工单或聊天中，解析后的环境可能含有秘密。

## 4. 完成数据库检查点

不要在本步骤盲目执行整个迁移目录。先由数据库负责人检查当前状态，再只执行已经审核且
确认待应用的 SQL。

目标版本使用漫画阅读进度和收藏/历史分页时，迁移清单应包含：

- `drizzle/migrations/0018-manga-reading-progress.sql`
- `drizzle/migrations/0019-library-pagination-indexes.sql`

可以在受控数据库客户端中用以下只读 SQL 核对关键表和索引：

```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = DATABASE()
  AND table_name IN (
    'animes',
    'tags',
    'anime_tags',
    'users',
    'system_settings',
    'mangas',
    'manga_chapters',
    'manga_pages',
    'manga_view_days',
    'manga_view_dedup',
    'manga_reading_progress'
  )
ORDER BY table_name;

SELECT table_name, index_name
FROM information_schema.statistics
WHERE table_schema = DATABASE()
  AND index_name IN (
    'user_list_items_list_created_id_idx',
    'manga_favorites_user_created_id_idx',
    'user_watch_progress_user_last_id_idx',
    'manga_reading_progress_user_last_id_idx'
  )
ORDER BY table_name, index_name;
```

结果缺失时停止启动，回到迁移审核。当前 App 的漫画榜单和漫画进度路径仍可能懒执行
`CREATE TABLE IF NOT EXISTS`；这不是迁移成功证明，也不能补齐其他表、列或索引。

## 5. 拉取或确认镜像

远端镜像：

```bash
docker compose pull app
```

本地 `manga` 镜像：

```bash
docker image inspect sakurajiamai/hentaiworkers-app:manga >/dev/null
```

如果远端 pull 被跳过，检查 `deploy/.env` 中是否仍为
`PULL_POLICY=never`。如果本地 inspect 失败，回到仓库根目录重新构建。

## 6. 启动并检查进程

```bash
docker compose up -d --no-build
docker compose ps
docker compose logs --tail=100 app
```

复制模板且保留默认端口时：

```bash
APP_CHECK_ORIGIN=http://127.0.0.1:13000
curl -fsS "$APP_CHECK_ORIGIN/api/live"
curl -fsS "$APP_CHECK_ORIGIN/api/ready"
```

预期：

- live 返回 `{"status":"live"}`。它只证明 Node.js 进程响应。
- ready 返回 `{"status":"ready"}`。生产有 `DATABASE_URL` 时会执行
  `SELECT 1`，但不检查完整 schema。

Compose healthy 只基于 live。ready 或业务路径失败时，发布仍然失败。

## 7. 初始化首个管理员

仅在数据库还没有管理员时执行。seed 不是迁移器，必须在第 4 步完成后运行。它会先发出
`CREATE TABLE IF NOT EXISTS users`，所以应使用获准完成这条受控语句的数据库身份；它不会
补齐其他 schema。

另开终端，从安装了 Node.js 22 和依赖的仓库根目录执行：

```bash
read -r -p "Admin email: " ADMIN_BOOTSTRAP_USER
read -r -s -p "Admin password (at least 12 characters): " ADMIN_BOOTSTRAP_PASSWORD
printf '\n'
export ADMIN_BOOTSTRAP_USER ADMIN_BOOTSTRAP_PASSWORD
DOTENV_CONFIG_PATH=deploy/.env npm run seed:admin
unset ADMIN_BOOTSTRAP_USER ADMIN_BOOTSTRAP_PASSWORD
```

密码不得使用常见密码或包含 `change-me`、`replace-with`、
`admin123`、`password`、`example` 等占位词。已有管理员时 seed 会跳过。
登录后在 `/admin/account` 修改密码。后台操作见
[后台管理手册](../admin-guide.md)。

## 8. 配置 HTTPS 反向代理

将实际域名的 HTTPS 请求转发到 `127.0.0.1:13000`，或你在
`APP_PORT` 选择的端口。代理应转发：

- `Host`
- `X-Forwarded-Proto`
- 经过信任边界处理的客户端 IP 头

不要向公网开放 App 宿主端口或数据库端口。确认 `SITE_URL` 与用户访问的 HTTPS
origin 完全一致。

## 9. 预热并做业务烟测

先小流量预热公开缓存：

```bash
curl -fsS "$APP_CHECK_ORIGIN/api/animes?limit=1" >/dev/null
curl -fsS "$APP_CHECK_ORIGIN/api/mangas?limit=1" >/dev/null
curl -fsS "$APP_CHECK_ORIGIN/api/tags?limit=1" >/dev/null
curl -fsS "$APP_CHECK_ORIGIN/api/ads" >/dev/null
```

再通过真实 HTTPS 域名和浏览器检查：

1. 首页、里番列表、详情和播放页。
2. 漫画列表、详情、章节图片和榜单。
3. 登录、收藏、观看/阅读历史及分页。
4. `/admin` 概览和一项可回滚的内容编辑。
5. 已启用时的 SMTP 测试、Turnstile 和漫画发布测试。
6. `/api/android/update` 是否返回当前完整 Release 清单。

出现数据库超时、缺表、图片失败或登录异常时，保留当前日志并停止发布。

## 10. 记录发布并准备回滚

记录：

- 部署时间和操作者
- Git commit 与 `IMAGE_TAG`
- 部署前 tag
- 实际应用的迁移
- 数据库备份/恢复点
- live、ready 和业务烟测结果

App 回滚时，把 `deploy/.env` 的 `IMAGE_TAG` 改回前一已验证 tag，然后执行：

```bash
docker compose pull app
docker compose up -d --no-build
docker compose ps
```

数据库回滚必须使用预先审核的独立恢复方案。不要假设旧 App 与已经前向迁移的数据兼容。

## 11. 发布系统边界

Docker workflow 只构建和推送镜像，不登录生产主机。Android main push 也只产生待验收
Artifact；满足手动 `publish_release` 和正式签名门禁后才创建 GitHub prerelease。

workflow cleanup 保留的是整个仓库最新五次 Actions runs，不会删除 GitHub Releases、
APK assets 或 Docker tags。因此：

- Actions run 消失不代表 APK Release 被删除。
- 新镜像出现在 Docker Hub 不代表生产主机已经升级。
- Releases 与镜像需要独立的保留和清理策略。
