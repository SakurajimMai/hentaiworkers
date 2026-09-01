# 文档系统设计

## 1. 文档层级

文档采用三层信息架构，避免同一事实散落在多份长文中：

| 层级 | 文件 | 职责 |
|------|------|------|
| 入口 | `README.md`、`docs/README.md` | 说明产品边界，按读者和目标路由 |
| 参考 | `docs/{user-guide,mobile,admin-guide,development,deployment,architecture}.md`、`docs/api/` | 完整、可查询的行为与约束 |
| 教程 | `docs/tutorials/` | 从已知前提到一个可验证结果的最短步骤 |

教程只引用必要事实，并在末尾链接对应参考文档。安装 ABI、环境变量、健康检查等容易漂移的
矩阵只保留一个权威版本；其他页面使用摘要加链接。

## 2. 读者路径

```text
README
  -> 普通用户 -> Web 首次使用 -> 用户指南
  -> Android 用户 -> 安装与更新 -> 移动端参考
  -> 管理员 -> 后台手册
  -> 运维 -> 生产发布检查 -> 部署参考
  -> 开发者 -> 开发参考 / API 快速上手 / 架构与交互图
```

`docs/README.md` 是完整路由表；根 README 保持简洁，不复制所有操作步骤。

## 3. 事实来源与写作规则

- 用户可见名称以页面/Compose UI 文案为准；路由、参数和边界以 App Router 与服务实现为准。
- Android 行为以 Kotlin、Manifest、Gradle 和 `build-android.yml` 为准；Actions Artifact 与
  GitHub Release 明确分开。
- 部署行为以两个 Compose 清单、环境模板、Dockerfile 和 workflow 为准；CI 只负责产物，
  不推导自动生产部署。
- API OpenAPI 只覆盖匿名公开契约。Cookie 会话和共享密钥发布接口在 Markdown 中单列，避免
  扩大公开规范的承诺面。
- 现状与建议分开。代码尚未实现、未验证或存在风险的能力使用“当前限制”标识，不写成教程
  的成功步骤。

## 4. 教程集合

| 教程 | 结果 | 关键边界 |
|------|------|----------|
| `web-getting-started.md` | 能找到内容、播放/阅读、登录并管理收藏历史 | 区分游客/登录、Web/Android |
| `android-install-update.md` | 从正式 Release 选择 APK、安装并理解更新提醒 | Android 7.0+、ABI、签名与本地数据风险 |
| `production-rollout.md` | 在已审核数据库前提下发布 App 并完成烟测 | 不伪造空库导入、CA 挂载或自动迁移能力 |
| `api-quickstart.md` | 用 curl 调用匿名公开接口并处理分页/错误 | 不把 Cookie/发布密钥接口当公开 API |

教程索引 `docs/tutorials/README.md` 按目标列出前提、预计结果与对应参考手册。

## 5. 已知限制的呈现

以下问题只能被文档准确披露，不能通过改文案宣称解决：

- 数据库基线的外键建表顺序和跨 MySQL/MariaDB 空库导入尚未验证。
- 官方 Compose/镜像未挂载 `DATABASE_TLS_CA_FILE` 指向的私有 CA 文件。
- 漫画榜单与漫画进度路径仍可能懒执行 `CREATE TABLE IF NOT EXISTS`。
- `/api/ready` 只近似验证数据库连通性，不验证迁移或完整 schema。
- Android 里番历史不保存真实 Media3 秒数；Web 阅读器不消费云端漫画 `pageIndex`。
- Actions 自动清理的是仓库级最新五次 workflow runs，不是五个 Releases 或镜像标签。

生产教程把这些项目放在前置条件或停止条件中，并为需要代码修复的内容建议独立任务。

## 6. 兼容与回滚

本任务不更改 HTTP、数据库、APK、Compose 或 CI 行为。回滚只需恢复本任务修改的 Markdown、
OpenAPI 和教程文件；不删除已有架构图，不触碰根 `design.md`。若 OpenAPI 修改导致契约测试
失败，先恢复到“匿名公开 API”边界，再按真实 route handler 补齐，不通过删除测试绕过。
