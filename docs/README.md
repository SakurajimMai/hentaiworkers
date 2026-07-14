# AnimeStream 文档中心

面向运维、开发与内容运营的统一文档入口。内容与当前 **Next.js 全栈 + 远程 MySQL** 实现对齐。

| 文档 | 说明 |
|------|------|
| [架构说明](./architecture.md) | 系统结构、数据流、权限模型、目录职责 |
| [API 参考](./api/README.md) | 公开 REST 接口说明与示例 |
| [OpenAPI 规范](./api/openapi.yaml) | OpenAPI 3.0 机读规格 |
| [部署指南](./deployment.md) | 环境变量、Docker、上线检查清单 |
| [开发指南](./development.md) | 本地启动、脚本、测试与约定 |
| [前台使用](./user-guide.md) | 访客浏览与播放说明 |
| [后台管理](./admin-guide.md) | 管理员操作手册 |
| [设计规格](./superpowers/specs/2026-07-12-nextjs-mysql-admin-design.md) | 重构设计原文 |
| [实现计划](./superpowers/plans/2026-07-12-nextjs-mysql-admin.md) | 实现任务拆分 |

## 快速链接

- 本地前台：`http://localhost:3000`
- 本地后台：`http://localhost:3000/admin`
- 健康检查：`GET /api/health`
- 环境模板：仓库根目录 [`.env.example`](../.env.example)
- 主 README：[../README.md](../README.md)

## 文档维护约定

1. 变更公开 API 时同步更新 `docs/api/openapi.yaml` 与 `docs/api/README.md`。
2. 变更环境变量时同步 `.env.example` 与 `docs/deployment.md`。
3. 变更后台能力时同步 `docs/admin-guide.md`。
4. 架构级调整先更新 `docs/architecture.md`，再改实现文档。
