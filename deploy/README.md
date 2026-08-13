# AnimeStream App 部署包

此目录的 Compose 清单只启动主站 App，数据库由外部维护。

## 本地构建（含漫画）

```bash
# 在仓库根目录构建镜像
docker build -t sakurajiamai/hentaiworkers-app:manga ..

cp .env.example .env
chmod 600 .env
# 填写 DATABASE_URL / SESSION_SECRET / APP_ENCRYPTION_* / SITE_URL

# 应用漫画表迁移（受控执行，勿用 drizzle push）
# mysql ... < ../drizzle/migrations/0014-mangas.sql
# mysql ... < ../drizzle/migrations/0015-manga-metadata.sql
# mysql ... < ../drizzle/migrations/0016-manga-favorites.sql
# mysql ... < ../drizzle/migrations/0017-manga-views.sql

IMAGE_TAG=manga PULL_POLICY=never docker compose up -d
docker compose ps
```

漫画发布密钥在 **管理后台 → 系统设置** 配置，无需写入 App `.env`。

## 拉取远端镜像（可选）

若使用已发布的 `latest` 等 tag：

```bash
IMAGE_TAG=latest PULL_POLICY=always docker compose pull app
IMAGE_TAG=latest PULL_POLICY=always docker compose up -d
```

默认将容器 `3000` 端口发布到宿主机 `127.0.0.1:${APP_PORT:-13000}`。请使用 HTTPS 反向代理对外服务。

就绪检查：

```bash
curl -fsS http://127.0.0.1:${APP_PORT:-13000}/api/live
curl -fsS http://127.0.0.1:${APP_PORT:-13000}/api/ready
curl -fsS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:${APP_PORT:-13000}/manga
```

Compose 不执行数据库迁移或管理员 seed。升级前完成备份和受控迁移，详细步骤见 [`docs/deployment.md`](../docs/deployment.md)。
