# AnimeStream 旧栈退出实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 删除 Vite、Cloudflare/D1 和 Express/libSQL 旧栈，同时保留移动端与 MySQL 爬虫，并补齐 sitemap、Docker 和质量门禁。

**Architecture:** Next.js App Router 是唯一 Web/API 运行路径；Expo 移动端继续消费兼容 API；Python 采集链路只负责 MySQL。静态旧栈检查、Python 配置测试和 sitemap 纯函数测试共同约束清理结果。

**Tech Stack:** Next.js 15、React 19、TypeScript、Drizzle ORM、MySQL、Node.js test runner、Python unittest、ESLint 9、Docker。

---

### Task 1: 建立旧栈回流检查

**Files:**
- Create: `scripts/check-no-legacy.mjs`
- Modify: `package.json`

- [x] **Step 1: 创建失败检查**

检查器必须验证这些旧路径不存在：`legacy`、`functions`、`server`、`wrangler.toml.example`、`tsconfig.app.json`、`tsconfig.node.json`、`public/vite.svg`、`IMPLEMENTATION_PLAN.md`、`npm`、`scripts/d1_direct_client.py`、`scripts/CRAWLER_UPDATE.md`。

同时验证 `scripts/production_crawler.py` 不含 `D1DirectClient`、`d1_sync`、`sync_to_d1`，`scripts/unified_crawler.py` 不含旧默认主机、默认用户和默认密码，`components.json` 指向 `app/globals.css` 且启用 RSC。

- [x] **Step 2: 注册命令并验证 RED**

在 `package.json` 增加：

```json
"check:legacy": "node scripts/check-no-legacy.mjs"
```

运行：`cmd /c npm run check:legacy`  
预期：FAIL，列出当前仍存在的旧目录、D1 引用和旧 shadcn 路径。

### Task 2: 删除旧运行路径与迁移产物

**Files:**
- Delete: `legacy/`, `functions/`, `server/`, `.wrangler/`, `dist/`, `.playwright-mcp/`
- Delete: `wrangler.toml`, `wrangler.toml.example`, `tsconfig.app.json`, `tsconfig.node.json`
- Delete: `public/vite.svg`, `IMPLEMENTATION_PLAN.md`, `npm`
- Delete: `scripts/inspect-db.ts`, `scripts/inspect-drizzle.ts`, `scripts/__pycache__/`
- Create: `.dockerignore`
- Modify: `.gitignore`, `components.json`, `README.md`, `tsconfig.json`

- [x] **Step 1: 删除已确认失效内容**

删除前对每个递归目录解析绝对路径并确认位于仓库根目录内；不得删除 `.next/`、`mobile/`、`scripts/production_config.yml`。

- [x] **Step 2: 封闭 Docker 构建上下文**

`.dockerignore` 至少排除 `.git`、`.github`、`.claude`、`.next`、`node_modules`、`mobile`、`dist`、`out`、`.playwright-mcp`、`.wrangler`、`.env*`（保留 `.env.example`）、`scripts/production_config.yml`、Python 缓存和日志。

- [x] **Step 3: 同步仓库配置**

- `.gitignore` 增加 `.playwright-mcp/`、`__pycache__/`、`*.py[cod]`、`scripts/production_config.yml`。
- `components.json` 设置 `rsc: true`，CSS 改为 `app/globals.css`。
- `tsconfig.json` 删除不存在的 `functions`、`server`、`src`、`legacy`、`dist` 排除项，保留 `mobile` 和 `scripts` 隔离。
- README 只描述 Next.js、移动端和 MySQL 爬虫，不再把旧栈称为仓库模块。

### Task 3: 保留 MySQL 爬虫并移除 D1/硬编码凭据

**Files:**
- Create: `scripts/crawler_config.py`
- Create: `scripts/tests/test_crawler_config.py`
- Modify: `scripts/unified_crawler.py`, `scripts/production_crawler.py`
- Modify: `scripts/production_config.yml.example`, `scripts/production_config.yml`
- Delete: `scripts/d1_direct_client.py`, `scripts/CRAWLER_UPDATE.md`

- [x] **Step 1: 编写数据库配置失败测试**

测试以下行为：

```python
def test_requires_database_credentials():
    with self.assertRaisesRegex(ValueError, "缺少数据库配置"):
        resolve_database_config({}, {})

def test_reads_yaml_and_host_port():
    result = resolve_database_config({"database": {
        "host": "db.example.com:3307",
        "user": "anime",
        "password": "secret",
        "database": "anime_db",
    }}, {})
    self.assertEqual(result["host"], "db.example.com")
    self.assertEqual(result["port"], 3307)

def test_uses_mysql_environment_fallback():
    result = resolve_database_config({}, {
        "MYSQL_HOST": "127.0.0.1",
        "MYSQL_PORT": "3306",
        "MYSQL_USER": "anime",
        "MYSQL_PASSWORD": "secret",
        "MYSQL_DATABASE": "anime_db",
    })
    self.assertEqual(result["database"], "anime_db")
```

- [x] **Step 2: 运行 Python 测试验证 RED**

运行：`python -m unittest discover -s scripts/tests -p "test_*.py" -v`  
预期：FAIL，因为 `scripts/crawler_config.py` 尚不存在。

- [x] **Step 3: 实现配置解析并接入爬虫**

`resolve_database_config()` 仅从 YAML 或 `MYSQL_HOST`、`MYSQL_PORT`、`MYSQL_USER`、`MYSQL_PASSWORD`、`MYSQL_DATABASE` 读取连接信息，默认端口为 `3306`、字符集为 `utf8mb4`。缺少 host/user/password/database 时抛出 `ValueError`。

`UnifiedCrawler.get_default_config()` 不再含数据库地址或凭据，`setup_database()` 调用新解析器。

- [x] **Step 4: 删除全部 D1 分支**

从 `ProductionCrawler` 删除 D1 导入、实例字段、统计项、启动初始化、保存后双写、`sync_to_d1()` 方法和完成统计；删除 D1 客户端与 D1 文档；从示例和本地配置删除 `d1_sync` 段。

- [x] **Step 5: 验证 GREEN**

运行：

```powershell
python -m unittest discover -s scripts/tests -p "test_*.py" -v
python -m py_compile scripts/crawler_config.py scripts/unified_crawler.py scripts/production_crawler.py
```

预期：全部退出码为 0。

### Task 4: 迁移动态 sitemap

**Files:**
- Create: `tests/sitemap.test.ts`
- Create: `lib/sitemap.ts`
- Create: `app/sitemap.ts`
- Modify: `lib/anime-service.ts`, `.env.example`, `public/robots.txt`, `package.json`

- [x] **Step 1: 编写 sitemap 失败测试**

测试 `buildSitemap()`：去除基础域名末尾 `/`；输出 `/`、`/browse`、`/watch/{id}`、`/browse?tag={id}&tagName={encoded}`；作品日期优先 `updatedAt`，无效日期回退到传入的 `now`。

- [x] **Step 2: 注册测试并验证 RED**

在 `package.json` 增加：

```json
"test": "tsx --test tests/*.test.ts"
```

运行：`cmd /c npm test`  
预期：FAIL，因为 `@/lib/sitemap` 尚不存在。

- [x] **Step 3: 实现纯函数和数据查询**

`lib/sitemap.ts` 导出 `buildSitemap()`；`lib/anime-service.ts` 增加 `listSitemapData()`，查询启用作品的 id/createdAt/updatedAt 以及标签 id/name。

- [x] **Step 4: 创建 Next metadata route**

`app/sitemap.ts` 导出 `dynamic = 'force-dynamic'`，从 `SITE_URL`（默认 `https://anime.ixacg.top`）和数据库数据生成 `MetadataRoute.Sitemap`。`.env.example` 增加 `SITE_URL`，`public/robots.txt` 恢复 sitemap 声明。

- [x] **Step 5: 验证 GREEN**

运行：`cmd /c npm test`  
预期：全部测试通过。

### Task 5: 修复重构后的 lint 并完成验收

**Files:**
- Modify: `package.json`, `package-lock.json`, `eslint.config.mjs`

- [x] **Step 1: 迁移到 ESLint CLI**

把 `lint` 改为 `eslint . --max-warnings=0`，在配置中忽略 `.next/**`、`node_modules/**`、`mobile/**`，并显式安装根级 `eslint-plugin-react-hooks` 依赖。

- [x] **Step 2: 运行旧栈检查验证 GREEN**

运行：`cmd /c npm run check:legacy`  
预期：退出码 0，不存在旧目录、D1 引用、硬编码凭据或旧 shadcn 路径。

- [x] **Step 3: 运行完整验证**

```powershell
cmd /c npm test
cmd /c npm run lint
cmd /c npx tsc --noEmit --incremental false
python -m unittest discover -s scripts/tests -p "test_*.py" -v
python -m py_compile scripts/crawler_config.py scripts/unified_crawler.py scripts/production_crawler.py
cmd /c npm run build
git diff --check
```

预期：全部退出码为 0。

- [x] **Step 4: 残留与容器验证**

用 `rg` 扫描运行代码和配置中的 `Cloudflare|D1|Wrangler|Vite|Hyperdrive|D1DirectClient|d1_sync`；历史设计文档可保留迁移语境，其余运行路径不得命中。

若 Docker 可用，执行 `docker build --no-cache -t anime-web:verify .`；若不可用，记录具体缺失，不宣称容器验证通过。

- [x] **Step 5: 最终审查**

核对 `git status` 和完整 diff，确保未删除 `mobile/`、MySQL 爬虫或用户现有 Next.js 重构内容；删除临时根规划文件后再次运行 `git diff --check`。

## 验证记录

- `npm test`：7 个 TypeScript 测试和 6 个 Python 测试通过。
- `npm run lint`：通过，零警告。
- `npx tsc --noEmit --incremental false`：串行复跑通过。
- `npm run check:legacy`：通过。
- `npm run build`：通过，生成动态 `/robots.txt` 与 `/sitemap.xml`。
- 本地生产服务：`/api/health`、`/api/animes`、`/robots.txt`、`/sitemap.xml` 均返回 200；sitemap 共 3635 个 URL。
- 运行路径旧栈关键词扫描与 `git diff --check`：通过。
- Docker 镜像构建：未执行成功，本机 Docker 守护进程未运行且缺少 Compose 插件。
- 最终双重代码审查：未发现阻断交付的高/中问题。
