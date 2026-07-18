# AnimeStream 文档中心

面向运维、开发与内容运营的统一文档入口。内容与当前 **Next.js 全栈 + 远程 MySQL + Docker Compose** 实现对齐。

| 文档 | 说明 |
|------|------|
| [架构说明](./architecture.md) | 系统结构、数据流、权限模型、目录职责 |
| [API 参考](./api/README.md) | 公开 REST 接口说明与示例 |
| [OpenAPI 规范](./api/openapi.yaml) | OpenAPI 3.0 机读规格 |
| [**部署指南**](./deployment.md) | **Docker Hub 生产部署**：环境变量、迁移、TLS、检查清单 |
| [Hub 部署清单](../deploy/README.md) | 服务器只拉镜像的 compose / `.env` 模板 |
| [开发指南](./development.md) | 本地启动、脚本、测试与约定 |
| [前台使用](./user-guide.md) | 双片库、ArtPlayer / 解析播放、进度、片单、广告体验 |
| [后台管理](./admin-guide.md) | 采集、存储、播放器广告、用户与系统设置 |
| [设计规格](./superpowers/specs/2026-07-12-nextjs-mysql-admin-design.md) | 重构设计原文 |
| [实现计划](./superpowers/plans/2026-07-12-nextjs-mysql-admin.md) | 实现任务拆分 |

## 快速链接

- 本地前台：`http://localhost:3000`
- 本地后台：`http://localhost:3000/admin`
- 存活探针：`GET /api/live` · 就绪（含 DB）：`GET /api/ready` · 兼容：`GET /api/health`
- 环境模板：[`.env.example`](../.env.example) · 生产精简：[deploy/.env.example](../deploy/.env.example)
- Compose（精简生产）：[deploy/docker-compose.yml](../deploy/docker-compose.yml)
- Compose（仓库根）：[docker-compose.yml](../docker-compose.yml)（同样仅拉 Hub 镜像）
- 主 README：[../README.md](../README.md)

## 上线最短路径（Docker Hub）

1. CI 已配置 Secrets：`DOCKERHUB_USERNAME`、`DOCKERHUB_TOKEN`（推 `main` 自动发镜像）
2. 服务器只用 `deploy/` 清单：配置 `.env`（含 `DOCKERHUB_USERNAME`、`DATABASE_URL`、`SESSION_SECRET`、`APP_ENCRYPTION_*`、`SITE_URL`、`APP_PORT`）
3. 拉取 ops 镜像并运行迁移/管理员引导（无需源码）：`docker compose --profile ops pull ops`（见 deployment.md §4）
4. `docker compose pull app && docker compose up -d app`
5. HTTPS 反代到 `127.0.0.1:${APP_PORT}`，拦截 `/api/internal/crawler/**`

细节见 [deployment.md](./deployment.md) 与 [deploy/README.md](../deploy/README.md)。

## 文档维护约定

1. 变更公开 API 时同步更新 `docs/api/openapi.yaml` 与 `docs/api/README.md`。
2. 变更环境变量时同步 `.env.example` 与 `docs/deployment.md`。
3. 变更后台能力时同步 `docs/admin-guide.md`。
4. 变更前台播放 / 进度 / 片单体验时同步 `docs/user-guide.md`。
5. 架构级调整先更新 `docs/architecture.md`，再改实现文档。
