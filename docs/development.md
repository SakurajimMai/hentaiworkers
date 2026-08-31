# 开发指南

## 1. 环境

- Node.js 22+
- npm
- MySQL 8+ 或 MariaDB 10.6+

```bash
npm ci
cp .env.example .env
```

本地数据库可设置 `DATABASE_TLS_MODE=disabled`，但仅允许 `localhost`、`127.0.0.1` 或 `::1`。远程数据库必须启用 TLS。

## 2. 启动

```bash
npm run dev
```

常用入口：

| 地址 | 用途 |
|------|------|
| `http://localhost:3000` | 公开站点 |
| `http://localhost:3000/admin` | 管理后台 |
| `http://localhost:3000/api/live` | 进程存活检查 |
| `http://localhost:3000/api/ready` | 数据库就绪检查 |

## 3. 数据库

- `drizzle/baseline/0000-production-schema.sql`：核心表基线。
- `drizzle/migrations/0003–0009`：当前主站能力的增量迁移。
- `drizzle/migrations/0010–0013`：历史兼容迁移，主站不读写其 works 表。
- `drizzle/migrations/0014–0019`：漫画表、元数据、收藏、榜单计数、阅读进度与收藏/历史分页索引。
- `npm run db:baseline`：从指定数据库导出核心表结构基线。
- `npm run db:push`：明确禁用，防止未经审核直接修改数据库。
- `npm run db:studio`：启动 Drizzle Studio。

生产变更应审核 SQL、备份数据库、在维护窗口执行并验证 `/api/ready`。迁移不会由 App 容器自动运行。`0019-library-pagination-indexes.sql` 只新增复合索引，并会在每条 DDL 前查询 `information_schema`，可在部分成功后重新执行；大表执行前仍应确认可用磁盘空间与 DDL 锁影响。

## 4. 管理员

在本机 `.env` 增加：

```dotenv
ADMIN_BOOTSTRAP_USER=admin@example.com
ADMIN_BOOTSTRAP_PASSWORD=replace-with-at-least-12-characters
```

然后执行 `npm run seed:admin`。命令不会提供默认凭据。

## 5. 检查命令

| 命令 | 作用 |
|------|------|
| `npm run lint` | ESLint，禁止 warning |
| `npm run typecheck` | TypeScript 静态类型检查 |
| `npm run test` | 运行全部 TypeScript 测试 |
| `npm run check:legacy` | 阻止旧 Web/SQLite 栈回流 |
| `npm run check:boundaries` | 验证仓库和部署保持 App-only |
| `npm run build` | Next.js 生产构建与类型检查 |

提交前至少运行以上检查，并补充与改动对应的聚焦测试。

## 6. 移动端

原生客户端工程位于 `mobile/android/`，使用 Kotlin、Jetpack Compose、Media3、Room 和 DataStore。开发机只负责编辑源码与资源，不要求安装 JDK、Gradle 或 Android SDK，也不要在本机运行 `gradlew`、Android Studio build、模拟器或 Android 编译。

提交 `mobile/**` 或 Android 工作流改动后，GitHub Actions 会在分支、Pull Request 和手动运行中执行 Kotlin 格式检查、Android Lint、单元测试与 Release APK 构建，并生成四种 ABI split 及 universal APK。普通分支使用无签名 Secret 的 `CI` environment；只有 `main` 上受保护的 `Production` environment 才能读取生产 keystore，并校验固定证书指纹。`main` push 先生成正式签名待验收 Artifact，随后必须在同一提交上手动选择 `publish_release` 才会发布 `build-*` Release；debug-signed 构建只保留为内部 Artifact。允许在本机运行的仍是根项目的非 Android 检查命令。说明见 [移动端](./mobile.md)。

## 7. 约束

- 新后端逻辑放入现有 `catalog`、`identity` 或 `system` 模块。
- Route Handler 和 Server Action 只负责协议转换、鉴权与调用应用服务。
- 不在主站加入数据抓取、下载、媒体搬运或对应调度代码。
- `crawler/` 使用自己的依赖、配置、测试和部署流程，不导入主站私有模块。
- 不恢复 MacCMS、works 页面、流代理或线路解析播放器设置。
