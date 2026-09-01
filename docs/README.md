# AnimeStream 文档中心

这里的文档分为入口、参考手册和任务型教程。第一次接触项目时先按角色选择入口；需要查询
完整行为或边界时再进入参考手册。

## 按角色开始

| 读者 | 推荐入口 | 进一步阅读 |
|------|----------|------------|
| 网站用户 | [Web 快速上手](./tutorials/web-getting-started.md) | [前台使用指南](./user-guide.md) |
| Android 用户 | [Android 安装与更新](./tutorials/android-install-update.md) | [Android 客户端参考](./mobile.md) |
| 站点管理员 | [后台管理手册](./admin-guide.md) | [部署指南](./deployment.md) |
| 运维人员 | [生产发布教程](./tutorials/production-rollout.md) | [部署指南](./deployment.md) / [架构](./architecture.md) |
| 开发者 | [开发指南](./development.md) | [API 快速上手](./tutorials/api-quickstart.md) / [API 参考](./api/README.md) |

## 按目标选择教程

| 我想要 | 教程 |
|--------|------|
| 从首页找到内容并保存收藏或历史 | [Web 快速上手](./tutorials/web-getting-started.md) |
| 为手机选择正确 APK 并理解升级提醒 | [Android 安装与更新](./tutorials/android-install-update.md) |
| 在已准备数据库的前提下发布和验收 App | [生产发布教程](./tutorials/production-rollout.md) |
| 用 curl 调用目录、标签和更新接口 | [公开 API 快速上手](./tutorials/api-quickstart.md) |

教程总览见 [教程索引](./tutorials/README.md)。

## 参考手册

| 文档 | 内容 |
|------|------|
| [前台使用指南](./user-guide.md) | 浏览、播放、漫画、账号、收藏、历史与错误状态 |
| [Android 客户端](./mobile.md) | 安装、功能、同步、更新、构建、签名与验收 |
| [后台管理手册](./admin-guide.md) | 内容、标签、用户、广告、邮件与系统设置 |
| [开发指南](./development.md) | 本地环境、配置、数据库、管理员与检查命令 |
| [部署指南](./deployment.md) | App-only Docker 部署、迁移、健康、升级与回滚 |
| [系统架构](./architecture.md) | 运行边界、当前分层、数据、缓存、安全与交付责任 |
| [API 参考](./api/README.md) | 匿名公开 API、客户端会话边界与 OpenAPI |
| [变更记录](./CHANGELOG.md) | 产品范围与运维影响 |

## 架构资源

- [生产架构图 HTML](./diagrams/hentaiworkers-production.architecture.html)：可离线打开的交互式图
- [生产架构图 JSON](./diagrams/hentaiworkers-production.architecture.json)：Archify 可编辑源
- [系统架构说明](./architecture.md)：仓库当前结构与已知例外

生产架构图包含生成时的仓库与主机证据快照；通用约束以当前参考文档和代码为准。

## 配置模板

- [本地/根 Compose 环境模板](../.env.example)
- [部署包环境模板](../deploy/.env.example)

不要提交真实 `.env`、数据库凭据、Session secret、加密 keyring 或 Android 签名材料。
