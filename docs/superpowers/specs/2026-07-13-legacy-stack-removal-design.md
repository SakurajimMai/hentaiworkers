# AnimeStream 旧栈退出设计

**日期：** 2026-07-13  
**状态：** 已批准  
**目标：** 彻底移除 Vite、Cloudflare Pages/Functions、D1、旧 Express/libSQL 实现，同时保留移动端和 MySQL 采集能力。

## 1. 边界

### 删除

- 未跟踪的 `legacy/` Vite 归档副本。
- 已跟踪的 `functions/` Cloudflare Functions、`server/` Express/libSQL 原型。
- Wrangler、Vite、旧 TypeScript 工程配置与旧构建产物。
- D1 客户端、爬虫 D1 双写分支、D1 配置示例和 D1 专用文档。
- 迁移期数据库检查脚本、Python 缓存、Playwright 本地快照、空文件和旧模板资源。
- 已被新设计与计划取代的根 `IMPLEMENTATION_PLAN.md`。

### 保留

- `app/`、`components/`、`lib/` 组成的 Next.js/MySQL 主应用。
- `mobile/` Expo 客户端及 Android CI 发布链路。
- `scripts/production_crawler.py` 与 `scripts/unified_crawler.py` 的 MySQL 采集能力。
- `scripts/seed-admin.ts` 和当前 Next.js 重构设计/计划文档。

## 2. 兼容能力

旧 Cloudflare Functions 删除前，将动态站点地图迁移到 `app/sitemap.ts`。站点地图包含首页、浏览页、启用状态作品播放页和标签筛选页，默认站点域名为 `https://anime.ixacg.top`，允许通过 `SITE_URL` 覆盖。

移动端继续调用同一 `/api/animes`、`/api/tags`、详情和相似推荐契约，不修改 `mobile/` 代码。

## 3. 爬虫收口

生产爬虫只写 MySQL：

- 删除 `D1DirectClient` 导入、初始化、同步方法和统计字段。
- 删除 `d1_sync` 示例与本地配置段。
- 数据库连接参数只允许来自 YAML 配置或 `MYSQL_*` 环境变量。
- 源码不再提供真实或弱口令默认值；必要字段缺失时明确报错并停止启动。

## 4. 工具链与安全

- 新增 `.dockerignore`，阻止环境文件、数据库配置、Git 元数据、移动端依赖、构建缓存和本地工具产物进入 Docker 上下文。
- `.gitignore` 显式忽略 `scripts/production_config.yml`、`.playwright-mcp/`、Python 缓存。
- shadcn 配置改为 Next RSC，并指向 `app/globals.css`。
- ESLint 改用 CLI，显式补齐根级插件依赖。
- 增加 `check:legacy` 自动检查，阻止旧目录、D1 引用和硬编码数据库默认值回流。

## 5. 测试与验收

- 先运行旧栈检查并确认失败，再执行删除，最后确认通过。
- 通过 Python 单元测试验证数据库配置解析和缺失凭据失败行为。
- 通过 TypeScript 单元测试验证 sitemap URL、日期、标签编码和基础域名规范化。
- 运行 ESLint、TypeScript、Python 编译、Next.js 生产构建、残留关键词扫描和 Git 空白检查。
- 若本机 Docker/Compose 不可用，明确记录未执行的容器级验证，不以静态检查替代。

## 6. 非目标

- 不修改 DNS、Cloudflare 控制台、远程数据库或线上部署状态。
- 不删除或重写移动端。
- 不改变爬虫的抓取、下载、MySQL 入库和文件组织逻辑。
- 不提交、推送或创建发布版本。

