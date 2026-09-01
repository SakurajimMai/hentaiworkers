# 执行计划

## Phase 1: 入口与参考边界

- [x] 重写 `README.md` 的文档入口和最短启动说明，纠正 Docker 默认值并链接用户、Android、
  部署、API、架构图。
- [x] 将 `docs/README.md` 改为按读者和目标导航，建立教程索引入口。
- [x] 更新 `docs/architecture.md` 的当前分层事实、发布责任、schema 生命周期与生产架构图链接。

## Phase 2: 用户与 Android 文档

- [x] 更新 `docs/user-guide.md`：实际导航名称、搜索预览、Web 播放、漫画阅读、账号流程、
  收藏/历史分页、游客/登录差异及空错状态。
- [x] 更新 `docs/mobile.md`：系统要求、ABI/Release、安装与签名迁移、账号/本地/云端、实际
  观看/阅读能力、非阻塞更新和故障排查；保留开发与 Actions 参考。
- [x] 新增 `docs/tutorials/web-getting-started.md` 与
  `docs/tutorials/android-install-update.md`，并从参考文档双向链接。

## Phase 3: 管理、开发与生产教程

- [x] 更新 `docs/admin-guide.md` 的完整功能矩阵、安全操作顺序、漫画发布、广告、Telegram、
  Android 下载入口与媒体/图片代理边界。
- [x] 更新 `docs/development.md`，修正 seed 示例，补齐环境变量/keyring 结构、数据库初始化的
  未验证边界、健康语义、迁移与 Android 开发边界。
- [x] 更新 `docs/deployment.md` 与 `deploy/README.md`，明确本地/远端镜像两条路径、显式 tag
  与 pull policy、`0018`/`0019`、CA/DDL/readiness 限制、烟测、升级和回滚责任。
- [x] 新增 `docs/tutorials/production-rollout.md`，只覆盖具备已审核 schema 的可执行发布路径；
  把空库导入和私有 CA 列为停止条件。

## Phase 4: API 与教程收口

- [x] 更新 `docs/api/README.md`，补齐公开端点、健康检查与 ads，明确静态示例；单独列出 Android
  Cookie 会话和漫画发布集成接口的边界。
- [x] 更新 `docs/api/openapi.yaml`，在匿名公开范围内补齐 `/api/live` 和 `/api/ready`，与
  Markdown 的范围和错误语义一致。
- [x] 新增 `docs/tutorials/api-quickstart.md` 与教程索引，完成所有入口和参考文档的交叉链接。

## Phase 5: 验证与复核

- [x] 逐项复核所有改动中的路由、参数、按钮名、环境变量、镜像标签、迁移、ABI 和保留策略。
- [x] 检查所有 Markdown 相对链接目标；解析 OpenAPI，并运行公开 API 契约测试。
- [x] 运行 `git diff --check`、`npm run lint`、`npm run typecheck`、`npm run test`、
  `npm run check:legacy`、`npm run check:boundaries` 和 `npm run build`；记录与本任务无关的既有失败。
- [x] 由独立检查代理对照 PRD、设计、研究证据和最终 diff，确认没有把已知限制写成已完成能力。
- [x] 判断是否有可长期复用的新项目约束需要更新 `.trellis/spec/`；没有则记录不更新原因。
- [x] 提交前展示只包含任务 scope 的 commit plan，排除根 `design.md`。

## 验证记录

- 通过：Markdown 相对链接检查（28 个交付与任务文档，共核对 97 个相对链接）、OpenAPI
  3.0.3 解析（12 个路径、26 个 schema、56 个 `$ref`）和公开 API 聚焦契约测试（24/24）。
- 通过：`git diff --check`、`npm run typecheck`、`npm run test`（218/218）、
  `npm run check:legacy`、`npm run check:boundaries` 和 `npm run build`。
- `npm run lint` 已运行；唯一失败为任务开始前已存在的
  `tests/home-carousel.test.ts:108` `react/no-children-prop`，本任务不修改该测试或运行时代码。
- 未运行 Android Gradle、真机安装或线上 Release 验收；本任务只修改文档与公开 OpenAPI，且
  项目约束明确禁止本地 Gradle 构建。
- 独立复核未发现剩余文档缺陷。范围外 `deploy/.env.example` 仍有声称默认拉取 `latest` 的旧
  注释，但交付文档和教程均已明确真实 Compose fallback 为 `manga + never`。
- 不更新 `.trellis/spec/`：本任务没有建立新的编码或架构约束，只把现有实现、配置和已知限制
  写入面向读者的文档；现有 App-only 边界与文档职责规范仍然适用。

## 回滚点

- Phase 1-4 均为文档改动，可按文件恢复；不要回滚用户自有工作。
- OpenAPI 失败时仅回滚本任务新增的公开路径描述，不修改 route handler 或测试契约。
- 如发现某教程依赖尚未验证的数据库/容器能力，删除该成功步骤并改为明确停止条件，不扩大为
  运行时代码修复。
