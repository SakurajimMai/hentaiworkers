# Docker Hub app-only 部署

本目录是生产服务器使用的最小部署清单：

- 直接拉取公开镜像 `sakurajiamai/hentaiworkers-app:latest`
- 只启动 `app` 一个容器
- 直接连接你维护的远程 MySQL / MariaDB
- 不执行数据库初始化、迁移或 seed
- 不启动 ops、crawler-worker 或其它节点
- 不需要服务器 git clone、Node、npm 或 `docker build`

## 前提

远程数据库必须提前具备：

1. 与当前应用版本匹配的表结构
2. 可用的管理员账号
3. 已放行服务器出口 IP
4. 使用系统可信证书链提供 TLS

数据库结构和管理员账号由你在远程数据库侧独立维护，不属于 Compose 启动流程。

## 1. 准备目录

```bash
mkdir -p /opt/anime-web
cd /opt/anime-web
```

只需放入：

```text
docker-compose.yml
.env
```

## 2. 配置 `.env`

```env
APP_HOST_BIND=127.0.0.1
APP_PORT=13000

DATABASE_URL=mysql://USER:PASSWORD@HOST:3306/DATABASE
DATABASE_TLS_MODE=required

SITE_URL=https://你的域名
SESSION_SECRET=使用-openssl-rand-base64-48-生成
APP_ENCRYPTION_KEYRING={"primary":"使用-openssl-rand-base64-32-生成"}
APP_ENCRYPTION_CURRENT_KEY_ID=primary
```

服务器不需要 `DOCKERHUB_USERNAME`、`DOCKERHUB_TOKEN` 或 `docker login`。

## 3. 启动

```bash
chmod 600 .env
docker compose pull app
docker compose up -d app
```

健康检查：

```bash
docker compose ps
curl -sS "http://127.0.0.1:${APP_PORT:-3000}/api/live"
curl -sS "http://127.0.0.1:${APP_PORT:-3000}/api/ready"
```

- `/api/live`：应用进程存活
- `/api/ready`：应用可连接远程数据库

## 4. 升级

确认远程数据库 schema 已与目标应用镜像兼容后：

```bash
docker compose pull app
docker compose up -d --no-build app
```

当前 Compose 固定拉取公开 `latest` 镜像；更新后重新执行 `pull` + `up` 即可。

## 5. 反向代理

Nginx / Caddy upstream 指向：

```text
127.0.0.1:${APP_PORT}
```

例如 `APP_PORT=13000`：

```nginx
proxy_pass http://127.0.0.1:13000;
```

必须使用 HTTPS，并禁止公网访问 `/api/internal/crawler/**`。
