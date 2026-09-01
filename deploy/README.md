# AnimeStream App 部署包

此目录的 Compose 清单只启动主站 `app`。外部数据库、迁移、管理员 seed、HTTPS
反向代理、生产升级与回滚均由操作者负责。

完整流程见 [生产发布检查教程](../docs/tutorials/production-rollout.md) 和
[部署指南](../docs/deployment.md)。

## 当前默认值

`deploy/docker-compose.yml` 的实际默认值是：

```text
IMAGE_TAG=manga
PULL_POLICY=never
APP_HOST_BIND=127.0.0.1
```

Compose 自身的 `APP_PORT` fallback 是 `3000`；复制本目录模板后，
`deploy/.env` 把它设置为 `13000`。默认 `manga + never` 面向本地已构建镜像，
不会自动拉取 `latest`。

## 发布前提

- 数据库已经由操作者创建、备份并迁移到目标 schema。
- 不直接执行尚未完成空库双引擎验证的 baseline。
- 已检查目标版本所有待应用迁移；漫画能力位于 `0014-0019`，其中包括
  `0018-manga-reading-progress.sql` 和 `0019-library-pagination-indexes.sql`。
- 数据库可由系统信任链验证。官方 Compose/镜像当前没有挂载私有 CA 文件；
  仅设置 `DATABASE_TLS_CA_FILE` 不可用。
- 已准备 HTTPS 反向代理和与真实域名一致的 `SITE_URL`。

Compose 不运行 migration runner 或管理员 seed。漫画榜单与漫画进度路径当前仍可能
懒执行 `CREATE TABLE IF NOT EXISTS`；这不能替代受控迁移。

## 准备环境

```bash
cp .env.example .env
chmod 600 .env
```

填写 `DATABASE_URL`、`SITE_URL`、`SESSION_SECRET`、
`APP_ENCRYPTION_KEYRING` 和 `APP_ENCRYPTION_CURRENT_KEY_ID`。远程生产数据库保持
`DATABASE_TLS_MODE=required`。

漫画发布密钥在「管理后台 -> 系统设置 -> 漫画发布」配置，不写入 App `.env`。

## 路径 A：本地构建镜像

在本目录执行：

```bash
docker build -t sakurajiamai/hentaiworkers-app:manga ..
IMAGE_TAG=manga PULL_POLICY=never docker compose up -d
```

## 路径 B：拉取远端镜像

生产优先使用 Docker workflow 已发布并验收的不可变 commit SHA tag。把实际 tag 写入
`.env`，同时设置：

```dotenv
IMAGE_TAG=<已发布且验证过的 commit-sha tag>
PULL_POLICY=always
```

替换占位值后执行：

```bash
docker compose config -q
docker compose config --services
docker compose config --images
docker compose pull app
docker compose up -d --no-build
```

`--services` 应只输出 `app`，`--images` 应输出预期镜像。不要把包含解析后环境
秘密的完整 Compose 配置粘贴到日志或工单。

## 检查

复制模板且没有修改 `APP_PORT` 时：

```bash
APP_CHECK_ORIGIN=http://127.0.0.1:13000
docker compose ps
curl -fsS "$APP_CHECK_ORIGIN/api/live"
curl -fsS "$APP_CHECK_ORIGIN/api/ready"
curl -fsS -o /dev/null -w '%{http_code}\n' "$APP_CHECK_ORIGIN/manga"
```

`/api/live` 只检查进程，也是 Compose healthcheck 的目标。`/api/ready` 在生产配置
下执行 `SELECT 1`，但不验证迁移或完整 schema。发布完成前仍需检查目录、登录、
收藏/历史、漫画章节和管理后台。

GitHub Actions 发布镜像不会自动运行这里的命令。workflow cleanup 保留的是仓库级最新
五次 Actions runs，不会删除 GitHub Releases、APK assets 或 Docker tags。
