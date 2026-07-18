# Docker Hub 服务器部署（推荐）

本目录用于**生产机只拉镜像**，不在服务器 `git clone` 全量源码、也不在服务器 `docker build`。

镜像由 GitHub Actions（`.github/workflows/docker-publish.yml`）在 `main` 推送时发布到 Docker Hub：

| 镜像 | 名称 |
|------|------|
| 网站 | `{DOCKERHUB_USERNAME}/hentaiworkers-app` |
| 数据库运维（一次性） | `{DOCKERHUB_USERNAME}/hentaiworkers-ops` |
| Worker（可选） | `{DOCKERHUB_USERNAME}/hentaiworkers-worker` |

仓库 Secrets（CI 用，**不要**写进服务器 `.env`）：

- `DOCKERHUB_USERNAME`
- `DOCKERHUB_TOKEN`

服务器 `.env` 里的 `DOCKERHUB_USERNAME` 只需与 CI 推送的命名空间一致（公开镜像一般**不必**在服务器 `docker login`）。

---

## 1. 准备目录

```bash
mkdir -p /opt/anime-web/certificates && cd /opt/anime-web
# 将本目录两个文件放到服务器：
#   docker-compose.yml
#   .env.example  → 复制为 .env
cp .env.example .env
chmod 600 .env
```

也可从 GitHub raw 只下载这两个文件，无需完整仓库。

若数据库要求私有 CA，把 PEM 放到 `./certificates/`，并在 `.env` 设置例如 `DATABASE_TLS_CA_FILE=certificates/mariadb-ca.pem`；app 与 ops 都通过相对 bind mount 读取。

---

## 2. 填写 `.env`

必填：

```bash
DOCKERHUB_USERNAME=你的Hub用户名   # 与仓库 Secret 相同命名空间
APP_IMAGE_TAG=latest
OPS_IMAGE_TAG=latest

DATABASE_URL=mysql://USER:PASS@HOST:3306/DB
DATABASE_TLS_MODE=required
SITE_URL=https://你的域名
SESSION_SECRET=          # openssl rand -base64 48
APP_ENCRYPTION_KEYRING={"primary":"..."}   # openssl rand -base64 32
APP_ENCRYPTION_CURRENT_KEY_ID=primary

APP_HOST_BIND=127.0.0.1
APP_PORT=13000
```

首次建管理员时临时加上（seed 成功后可删）：

```bash
ADMIN_BOOTSTRAP_USER=you@example.com
ADMIN_BOOTSTRAP_PASSWORD=长随机密码至少12位
```

**不要**配置 `CRAWLER_WORKER_*`，除非你明确要跑采集节点。

---

## 3. 数据库迁移 + 管理员（只用 Hub 运维镜像）

服务器不需要源码、Node 或 npm。GitHub Actions 同步发布最小化 `hentaiworkers-ops` 镜像。

先拉取：

```bash
docker compose --profile ops pull ops
```

### 全新空库

> `setup` 只接受**完全空的数据库**，若发现任何表会安全拒绝。

```bash
docker compose --profile ops run --rm \
  -e CRAWLER_MIGRATE_CONFIRM=yes \
  ops setup

docker compose --profile ops run --rm ops seed-admin
```

### 已有库 / 日常升级

```bash
# 可先 dry-run；不连接数据库、不写入
docker compose --profile ops run --rm ops migrate --dry-run

# 应用已审核的增量迁移
docker compose --profile ops run --rm \
  -e CRAWLER_MIGRATE_CONFIRM=yes \
  ops migrate

# 仅首次需要；已有管理员会安全跳过
docker compose --profile ops run --rm ops seed-admin
```

`ADMIN_BOOTSTRAP_*` 仅供 `seed-admin` 使用，成功后可从 `.env` 删除。

---

## 4. 启动网站

```bash
cd /opt/anime-web
docker compose pull app
docker compose up -d app   # pull_policy: always，也会检查并拉取新镜像

curl -sS "http://127.0.0.1:${APP_PORT:-3000}/api/live"
curl -sS "http://127.0.0.1:${APP_PORT:-3000}/api/ready"
```

反代 HTTPS → `127.0.0.1:$APP_PORT`，并禁止公网访问 `/api/internal/crawler/**`。

---

## 5. 日常升级（不需要 git pull 业务代码）

```bash
cd /opt/anime-web
# 建议 APP_IMAGE_TAG 与 OPS_IMAGE_TAG 固定为同一个 main / sha / semver
docker compose --profile ops pull ops
docker compose --profile ops run --rm -e CRAWLER_MIGRATE_CONFIRM=yes ops migrate
docker compose pull app
docker compose up -d --no-build app
```

先用与 app 同版本的 ops 镜像迁移，再切换 app 镜像。

---

## 6. 可选 Worker

默认**不需要**。仅当本机要跑采集进程时：

```bash
# .env 增加后台签发的 CRAWLER_WORKER_ID / CRAWLER_WORKER_TOKEN
mkdir -p data/crawler-worker
docker compose --profile worker pull
docker compose --profile worker up -d
```

---

## 与仓库根 `docker-compose.yml` 的关系

两个清单都只拉 Docker Hub 镜像，均**没有** `build:`：

| | `deploy/docker-compose.yml` | 根目录 `docker-compose.yml` |
|--|-----------------------------|------------------------------|
| 用途 | 可单独复制到生产服务器 | 仓库根目录直接运行 |
| 镜像来源 | Docker Hub | Docker Hub |
| `DOCKERHUB_USERNAME` | 必填 | 必填 |
| 宿主机构建 | 不支持 | 不支持 |

`Dockerfile` / `Dockerfile.ops` / `Dockerfile.worker` 仅由 GitHub Actions 用于构建并推送镜像，不在生产服务器执行。

完整变量表与反代示例见 [docs/deployment.md](../docs/deployment.md)。
