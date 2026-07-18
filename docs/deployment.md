# Docker Hub 生产部署

生产环境采用 **app-only Docker Compose**：服务器只从 Docker Hub 拉取网站镜像，直接连接你独立维护的远程 MySQL / MariaDB。

部署过程不会：

- `git clone` 或 `git pull` 业务源码
- 在服务器执行 `docker build`
- 启动数据库容器
- 执行数据库初始化、迁移或 seed
- 启动 ops、crawler-worker 或其它节点

---

## 1. 架构

```text
Internet
   │ HTTPS
   ▼
Nginx / Caddy
   │
   ▼
127.0.0.1:${APP_PORT} → hentaiworkers-app:3000
                              │
                              ▼
                   externally managed remote DB
```

| 组件 | 说明 |
|------|------|
| `app` | Next.js standalone：前台、后台和 API |
| 远程数据库 | 由你独立维护；Compose 只连接，不修改 schema |
| Docker Hub | 公开镜像 `sakurajiamai/hentaiworkers-app:latest` |

---

## 2. 远程数据库前提

启动 app 前，远程数据库必须已经具备：

1. 与目标 app 镜像版本兼容的完整表结构
2. 可登录后台的管理员账号
3. 允许生产服务器出口 IP 连接
4. 使用系统可信证书链提供 TLS
5. 与 `APP_ENCRYPTION_KEYRING` 匹配的加密数据密钥

数据库 schema、管理员账号、备份和迁移由远程数据库侧自行维护，不属于 Docker Compose 部署流程。

---

## 3. 服务器准备

要求：

- Docker Engine 24+
- Docker Compose v2
- 可访问 Docker Hub
- 可访问远程数据库
- 反向代理与 HTTPS 证书

创建目录：

```bash
mkdir -p /opt/anime-web
cd /opt/anime-web
```

只需准备：

```text
/opt/anime-web/
├── docker-compose.yml
└── .env
```

可直接使用 [`deploy/docker-compose.yml`](../deploy/docker-compose.yml) 和 [`deploy/.env.example`](../deploy/.env.example)，无需完整仓库。

---

## 4. 稳定 `.env`

```env
# 宿主机端口；容器内固定 3000
APP_HOST_BIND=127.0.0.1
APP_PORT=13000

# 远程数据库
DATABASE_URL=mysql://USER:PASSWORD@HOST:3306/DATABASE
DATABASE_TLS_MODE=required
DATABASE_POOL_CONNECTION_LIMIT=8
DATABASE_POOL_MAX_IDLE=4
DATABASE_POOL_IDLE_TIMEOUT_MS=30000
DATABASE_CONNECT_TIMEOUT_MS=20000

# 公网规范地址
SITE_URL=https://你的域名

# openssl rand -base64 48
SESSION_SECRET=你的随机会话密钥

# openssl rand -base64 32
APP_ENCRYPTION_KEYRING={"primary":"你的32字节Base64密钥"}
APP_ENCRYPTION_CURRENT_KEY_ID=primary
```

### 4.1 数据库 URL

格式：

```text
mysql://USER:PASSWORD@HOST:3306/DATABASE
```

密码中的特殊字符必须 URL 编码：

| 字符 | 编码 |
|------|------|
| `@` | `%40` |
| `#` | `%23` |
| `:` | `%3A` |
| `/` | `%2F` |
| `%` | `%25` |

远程数据库生产环境保持：

```env
DATABASE_TLS_MODE=required
```

### 4.2 生成密钥

```bash
openssl rand -base64 48   # SESSION_SECRET
openssl rand -base64 32   # APP_ENCRYPTION_KEYRING.primary
```

如果远程数据库已经保存了 SMTP、Turnstile、爬虫存储等加密配置，必须使用原有 keyring；随意更换会导致旧密文无法解密。

服务器直接拉取固定公开镜像，不需要任何 Docker Hub 凭据或额外服务变量，也不需要执行 `docker login`。

---

## 5. 启动

```bash
cd /opt/anime-web
chmod 600 .env

docker compose pull app
docker compose up -d app
```

Compose 中没有 `build:`，并设置 `pull_policy: always`。

检查：

```bash
docker compose ps
docker compose logs -f app
curl -sS "http://127.0.0.1:${APP_PORT:-3000}/api/live"
curl -sS "http://127.0.0.1:${APP_PORT:-3000}/api/ready"
```

- `/api/live`：进程存活，不检查数据库
- `/api/ready`：连接远程数据库并执行就绪检查

---

## 6. 反向代理

假设：

```env
APP_PORT=13000
```

### Nginx

```nginx
server {
  listen 443 ssl http2;
  server_name anime.example.com;

  # ssl_certificate     /path/fullchain.pem;
  # ssl_certificate_key /path/privkey.pem;

  location /api/internal/ {
    return 403;
  }

  location / {
    proxy_pass http://127.0.0.1:13000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 300s;
  }
}
```

### Caddy

```caddy
anime.example.com {
  @internal path /api/internal/*
  respond @internal 403
  reverse_proxy 127.0.0.1:13000
}
```

生产必须使用 HTTPS；`SITE_URL` 必须与证书域名一致。

---

## 7. 升级

先确认远程数据库 schema 已兼容目标镜像，然后：

```bash
cd /opt/anime-web
docker compose pull app
docker compose up -d --no-build app
```

Compose 固定使用 `sakurajiamai/hentaiworkers-app:latest`。每次升级执行 `pull` 后重新创建 app 容器即可。

应用镜像更新不会改变远程数据库 schema。

---

## 8. GitHub Actions / Docker Hub

仓库 Secrets：

```text
DOCKERHUB_USERNAME
DOCKERHUB_TOKEN
```

CI 在 `main`、`v*` tag 和手动触发时构建并推送：

```text
sakurajiamai/hentaiworkers-app:latest
sakurajiamai/hentaiworkers-app:main
sakurajiamai/hentaiworkers-app:<commit-sha>
```

`DOCKERHUB_USERNAME` 与 `DOCKERHUB_TOKEN` 仅用于 GitHub Actions 登录；服务器不需要它们。

---

## 9. 检查清单

- [ ] 远程数据库 schema 与 app 镜像版本兼容
- [ ] 远程数据库中已有管理员账号
- [ ] 数据库已放行服务器出口 IP
- [ ] `DATABASE_TLS_MODE=required`
- [ ] `.env` 权限为 `600`，未提交到 Git
- [ ] `SESSION_SECRET` 为强随机值
- [ ] `APP_ENCRYPTION_KEYRING` 与远程数据库现有密文匹配
- [ ] `SITE_URL` 与 HTTPS 域名一致
- [ ] `/api/live` 正常
- [ ] `/api/ready` 正常
- [ ] 公网访问 `/api/internal/**` 返回 403
- [ ] `/admin/login` 可使用远程数据库现有管理员登录

---

## 10. 常见问题

| 现象 | 原因 | 处理 |
|------|------|------|
| Hub pull 失败 | 网络或 Docker Hub 临时故障 | 检查服务器网络后重试 `docker compose pull app` |
| `/api/ready` 失败 | DB URL、TLS、IP 白名单或 schema 有问题 | 检查远程数据库连接与表结构 |
| 后台无法登录 | 远程数据库没有管理员或密码不匹配 | 在远程数据库侧维护管理员账号 |
| 宿主机端口冲突 | `APP_PORT` 已占用 | 改为 `13000` 等空闲端口 |
| Cookie 登录后丢失 | 未启用 HTTPS | 配置 HTTPS 和 `X-Forwarded-Proto` |
| 加密设置无法读取 | keyring 与数据库密文不匹配 | 恢复原 `APP_ENCRYPTION_KEYRING` |
