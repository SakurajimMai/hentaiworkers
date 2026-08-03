# 删除所有爬虫相关内容

## Goal

先将 AnimeStream 仓库收敛为纯主站程序，彻底删除现有爬虫、Worker 和爬虫控制面相关代码与配置，为后续重新设计爬虫留下干净基线。本任务不实现替代爬虫。

## Background

- 当前工作区已存在一批未提交的产品收敛改动，必须保留并整合，不得回退用户已有工作。
- `crawler/` 同时包含新 direct-MySQL 路径和旧主站控制面客户端，尚未形成干净的独立工程。
- 主站仍包含 `/admin/crawler/**`、`/api/internal/crawler/v1/**`、`lib/server/crawler/**`、控制面 schema/迁移、Worker 运维和联合部署配置。
- 用户决定不在本任务中继续修复或保留当前爬虫脚本，而是先删除全部相关内容，后续另行优化重建。

## Requirements

- 删除整个 `crawler/` 工程及其 Python 代码、测试、依赖、配置、Dockerfile、脚本和文档。
- 删除主站中的爬虫后台页面、组件、Server Actions、内部 Worker API、领域服务、仓储、认证和控制面逻辑。
- 删除根工程中的爬虫控制面 schema、纯爬虫迁移、Worker 运维脚本、Python 测试代理和爬虫 npm 命令。
- 删除 Crawler 镜像发布、Worker Compose 服务、Worker 环境样例和共享卷初始化。
- 删除主站本机爬虫封面路由、`CRAWLER_COVER_DIR` 和共享封面目录依赖；主站仅使用数据库中已有的绝对媒体 URL。
- 将主站仍需使用的通用加密/哈希能力从爬虫命名空间移入主站共享模块。
- 更新当前有效文档、API 索引和项目说明，不再宣传、配置或部署爬虫。
- 增加主站边界检查，禁止重新引入爬虫控制面、Worker 协议和根级爬虫运行入口。
- 删除爬虫命名的数据库脚本；主站继续使用审核后的 SQL 流程，不新增替代运行时迁移框架。

## Acceptance Criteria

- [x] 仓库中不存在 `crawler/`、根级 `crawler_worker/`、Worker Dockerfile、爬虫运行脚本或 Python 爬虫测试。
- [x] 主站中不存在 `/admin/crawler/**`、`/api/internal/crawler/**`、`components/admin/crawler/**` 或 `lib/server/crawler/**`。
- [x] 主站 active schema、迁移工具和运行时代码不再声明或查询爬虫控制面表与 `anime_sources`。
- [x] 根 `package.json` 不包含 Python 测试、Worker、crawler migration/setup/compaction 命令。
- [x] 根 Compose、`deploy/` 和 GitHub 发布流程只构建、部署 App。
- [x] 主站没有 `CRAWLER_*` 环境变量、共享封面卷或爬虫本机文件 HTTP 路由。
- [x] 当前 canonical 文档和 OpenAPI 不再包含爬虫操作、Worker API 或联合部署说明。
- [x] 自动化边界检查可检测上述路径、命令、控制面表和 Worker 协议回流。
- [x] 在不安装 Python、不提供爬虫配置的情况下，主站 lint、TypeScript 测试和 production build 全部通过。
- [x] `git diff --check` 通过，现有用户改动未被回退。

## Out of Scope

- 实现、修复或优化任何新爬虫脚本。
- 保留当前 `crawler/` 作为模板或兼容入口。
- 建立新的采集 API、任务调度、Worker 协议或 `anime_sources` 迁移。
- 自动删除现有生产数据库中的 `crawler_*`、`storage_profile*`、`crawler_media_uploads` 或 `anime_sources` 表。
- 恢复 MacCMS、`anime_works` / `work_tags`、`/works`、流代理或线路解析播放器。
- 删除项目约束明确要求保留的历史 `0010`–`0013` works 迁移。

## Key Decisions

- 撤销此前“同仓库双工程”的目标；本次交付后仓库只包含主站及既有移动端等非爬虫内容。
- 当前爬虫实现不做兼容保留，后续重建将作为独立任务重新设计。
- 代码删除不伴随生产数据库 `DROP TABLE`，避免不可逆数据损失。
