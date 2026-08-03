# 变更记录

面向运维与开发的产品范围变更说明。细粒度历史以 Git 为准。

## 2026-08 — 主站收敛为 App-only

- 删除仓库内的数据采集工程、Python 依赖、镜像和启动脚本。
- 删除管理后台的采集入口、Server Actions、内部 API、任务与节点控制模块。
- 删除相关数据库 schema、控制面迁移、测试、环境模板和运维脚本。
- 删除本机封面共享目录与静态读取路由；封面必须使用主站可直接访问的 URL。
- 根目录与 `deploy/` Compose 只保留 `app` 服务。
- GitHub Actions 只构建和发布 App 镜像。
- TypeScript 测试、lint、build 与边界检查不依赖 Python 或外部采集配置。

后续数据生产程序应作为独立工程重新设计，不得依赖主站私有模块或内部 HTTP 控制面。

## 2026-08 — 移除外链动漫产品线

- 保留 `animes`、`tags`、`anime_tags` 里番片库。
- 删除 `/works` 前后台页面、MacCMS 适配、流代理和线路解析播放器配置。
- `drizzle/migrations/0010–0013` 作为已发布迁移历史保留；主站不读写其 `anime_works`、`anime_work_sources`、`anime_work_tags`、`work_tags` 表。

旧数据库如需清理历史 works 表，必须先备份并确认没有回滚需求，再由运维人员单独执行：

```sql
DROP TABLE IF EXISTS anime_work_tags;
DROP TABLE IF EXISTS anime_work_sources;
DROP TABLE IF EXISTS anime_works;
DROP TABLE IF EXISTS work_tags;
```
