# 开发指南

本指南面向 Next.js 主站。仓库中的 `crawler/` 和
`mobile/android/` 是独立工程边界，不进入主站依赖、镜像或 Compose。

## 1. 环境

- Node.js 22+
- npm
- 已准备好的 MySQL 8+ 或 MariaDB 10.6+ 开发数据库

```bash
npm ci
cp .env.example .env
```

仓库没有用于本地数据库的 Compose 服务。数据库需要单独提供。

## 2. 配置

完整 App 开发至少需要：

| 变量 | 本地要求 |
|------|----------|
| `DATABASE_URL` | `mysql://用户:密码@主机:端口/数据库`；密码特殊字符需 URL 编码 |
| `DATABASE_TLS_MODE` | 只有 `localhost`、`127.0.0.1` 或 `::1` 可设为 `disabled` |
| `SITE_URL` | 通常为 `http://localhost:3000`，不得带路径、查询或片段 |
| `SESSION_SECRET` | 至少 32 字符，不能是占位值 |
| `APP_ENCRYPTION_KEYRING` | 非空 JSON 对象；每个值是规范 Base64 编码的 32 字节密钥 |
| `APP_ENCRYPTION_CURRENT_KEY_ID` | 必须对应 keyring 中已有的 key id |

以下命令生成一组可用的 Session secret 和 keyring 配置并打印到终端：

```bash
node --input-type=module -e "
import { randomBytes } from 'node:crypto';
const session = randomBytes(48).toString('base64');
const settingsKey = randomBytes(32).toString('base64');
console.log('SESSION_SECRET=' + session);
console.log('APP_ENCRYPTION_KEYRING=' + JSON.stringify({ primary: settingsKey }));
console.log('APP_ENCRYPTION_CURRENT_KEY_ID=primary');
"
```

将输出填入本机 `.env` 的对应项。keyring 形如
`{"primary":"<32 字节密钥的规范 Base64>"}`，不是单独一段 Base64 字符串。
不要提交 `.env` 或把真实密钥写入文档、日志和测试夹具。

远程数据库必须使用证书匹配的 DNS 主机名并保持
`DATABASE_TLS_MODE=required`。运行时也支持相对工作目录的
`DATABASE_TLS_CA_FILE`，但官方生产 Compose 尚未挂载 CA 文件；生产限制见
[部署指南](./deployment.md#3-环境与私有-ca-限制)。

## 3. 数据库

### 当前文件职责

- `drizzle/baseline/0000-production-schema.sql`：五张核心表的结构快照。
- `drizzle/migrations/0003-0009`：当前账号、设置、收藏、历史等增量。
- `drizzle/migrations/0010-0013`：已发布的历史兼容迁移；主站不读写其 works 表。
- `drizzle/migrations/0014-0019`：漫画表、元数据、收藏、榜单、阅读进度和
  收藏/历史分页索引。

仓库当前没有自动 migration runner，Drizzle journal 也不记录这些 SQL 的应用状态。
`npm run db:push` 会主动失败，防止未经审核直接修改数据库。

### 空库限制

当前 baseline 先创建带 `categories` 外键的 `animes`，再创建
`categories`，而且还没有完成 MySQL 8 与 MariaDB 10.6 的双引擎空库导入验证。
因此，本指南不把 baseline 表述为可直接复制执行的全新建库步骤。

新开发者应使用团队已经审核可用的开发数据库或经批准的 schema 快照。若需要建立全新
数据库，应先在隔离环境修复并验证 baseline 与完整迁移链，再另行发布建库流程。

### 已有数据库变更

对已有数据库：

1. 先检查当前表、列和索引，确定真正待应用的 SQL。
2. 审核目标迁移并备份数据库。
3. 在维护窗口通过团队批准的数据库客户端执行待应用文件。
4. 独立记录已应用版本。
5. 检查表和索引，再做代表性业务烟测。

`0018-manga-reading-progress.sql` 创建漫画阅读进度表。
`0019-library-pagination-indexes.sql` 为里番收藏、漫画收藏、观看历史和漫画历史新增
四个复合索引。后者会在每条 DDL 前查询 `information_schema`，部分成功后可重新执行；
这不代表大表 DDL 没有锁、耗时或磁盘风险。

`npm run db:baseline` 是从指定数据库重新导出固定核心表结构的维护工具，不会应用
schema，也不能替代迁移。需要查看数据库时可以运行 `npm run db:studio`。

### 当前运行时 DDL

Compose 不会自动执行迁移链，但当前漫画榜单和漫画进度路径仍会懒执行
`CREATE TABLE IF NOT EXISTS`：

- `manga_view_days`
- `manga_view_dedup`
- `manga_reading_progress`

不要把该行为当作完整迁移或 schema 修复。若开发数据库账号禁止 DDL，应先确保相关迁移
已经应用，并验证榜单、漫画章节和进度路径；当前代码仍可能发出建表语句。

## 4. 启动与健康检查

```bash
npm run dev
```

常用入口：

| 地址 | 真实语义 |
|------|----------|
| `http://localhost:3000` | 公开站点 |
| `http://localhost:3000/admin` | 管理后台 |
| `http://localhost:3000/api/live` | 只检查 Node.js 进程存活，不访问数据库 |
| `http://localhost:3000/api/ready` | 配置 `DATABASE_URL` 时执行 `SELECT 1`；不验证迁移或完整 schema |
| `http://localhost:3000/api/health` | 数据库诊断响应；失败时当前会返回底层错误信息 |

没有 `DATABASE_URL` 时，`/api/ready` 仍可返回 ready，供无数据库的 UI/测试场景使用。
因此开发验收不能只看 ready，还要打开目录、登录、收藏/历史和漫画章节等实际路径。

## 5. 初始化管理员

只有在 schema 已准备好后才运行 seed。脚本仍会先发出
`CREATE TABLE IF NOT EXISTS users`，因此数据库账号必须获准完成这条语句；这不会迁移其他
schema。推荐通过交互式 shell 临时注入凭据，避免在 `.env` 中长期保留：

```bash
read -r -p "Admin email: " ADMIN_BOOTSTRAP_USER
read -r -s -p "Admin password (at least 12 characters): " ADMIN_BOOTSTRAP_PASSWORD
printf '\n'
export ADMIN_BOOTSTRAP_USER ADMIN_BOOTSTRAP_PASSWORD
npm run seed:admin
unset ADMIN_BOOTSTRAP_USER ADMIN_BOOTSTRAP_PASSWORD
```

用户名必须是邮箱。密码不能包含 `change-me`、`replace-with`、
`admin123`、`password` 或 `example` 等占位词。已有管理员时命令会跳过。
完成后登录 `/admin/account` 修改密码。

## 6. 检查命令

| 命令 | 作用 |
|------|------|
| `npm run lint` | ESLint，禁止 warning |
| `npm run typecheck` | TypeScript 静态类型检查 |
| `npm run test` | 运行全部 TypeScript 测试 |
| `npm run test:ads:browser` | 验证 HTML 广告脚本执行、横幅尺寸与隔离 |
| `npm run test:meta:browser` | 验证全局 Meta 服务端输出、导入与手机/桌面布局 |
| `npm run check:legacy` | 阻止旧 Web/SQLite 栈回流 |
| `npm run check:boundaries` | 验证仓库和部署保持 App-only |
| `npm run build` | Next.js 生产构建与类型检查 |

提交前至少运行以上检查，并补充与改动对应的聚焦测试。

## 7. 移动端开发边界

原生客户端位于 `mobile/android/`，使用 Kotlin、Jetpack Compose、Media3、Room
和 DataStore。开发机只编辑源码和资源，不要求安装 JDK、Gradle 或 Android SDK，也不在
本机运行 `gradlew`、Android Studio build、模拟器或 Android 编译。

提交 `mobile/**` 或 Android workflow 改动后，GitHub Actions 执行格式检查、
Android Lint、单元测试、Release 构建以及包名、ABI、内容和签名验证。构建五个 APK：
`arm64-v8a`、`armeabi-v7a`、`x86_64`、`x86` 和 `universal`。

`main` push 只产生待验收 Artifact；同一提交必须再手动运行
`workflow_dispatch` 并选择 `publish_release`，才可能创建正式签名的
`build-*` prerelease。普通分支或没有生产签名配置时只产生内部测试 Artifact。
详见 [移动端文档](./mobile.md)。

Android 与 Docker workflow 的 cleanup 保留的是整个仓库最新五次 Actions runs，
不是每个 workflow 各五次，也不会删除 GitHub Releases、Release assets 或 Docker tags。

## 8. 代码边界

- 新后端逻辑优先进入现有 `catalog`、`identity` 或 `system` 模块。
- Route Handler 和 Server Action 应只处理协议、鉴权和应用服务调用。
- 当前漫画服务和少量后台页面仍存在直接数据库访问；这是现状例外，不是新代码范例。
- 不在主站加入数据抓取、下载、媒体搬运或对应调度代码。
- `crawler/` 使用自己的依赖、配置、测试和部署流程，不导入主站私有模块。
- 不恢复 MacCMS、works 页面、流代理或线路解析播放器设置。
