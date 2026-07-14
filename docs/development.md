# 开发指南

## 1. 环境要求

- Node.js 22+（推荐与 Docker 基础镜像一致）
- npm 10+
- 可访问的 MySQL（本地或远程）
- 可选：Python 3（仅采集脚本 / 部分测试）

## 2. 本地启动

```bash
cp .env.example .env
# 编辑 DATABASE_URL / SESSION_SECRET / SITE_URL 等

npm install
npm run seed:admin   # 首次
npm run dev          # http://localhost:3000
```

| 地址 | 用途 |
|------|------|
| http://localhost:3000 | 前台 |
| http://localhost:3000/admin | 后台 |
| http://localhost:3000/api/live | 存活 |
| http://localhost:3000/api/ready | 就绪（DB） |
| http://localhost:3000/api/health | 兼容健康检查 |
| http://localhost:3000/admin/crawler | 爬虫控制面 |

## 3. 常用脚本

| 命令 | 说明 |
|------|------|
| `npm run dev` | Next 开发服务器 |
| `npm run build` | 生产构建 |
| `npm run start` | 生产模式启动 |
| `npm run lint` | ESLint |
| `npm run test` | TS + Python 测试入口 |
| `npm run test:ts` | `tsx --test tests/**/*.test.ts` |
| `npm run test:python` | `scripts/tests` + `crawler_worker/tests` |
| `npm run seed:admin` | 引导管理员 |
| `npm run db:push` | Drizzle 推送 schema（**慎用生产**） |
| `npm run db:studio` | Drizzle Studio |
| `npm run check:legacy` | 检查是否误引入废弃路径 |

## 4. 代码约定

### 路径别名

- `@/*` → 仓库根目录（见 `tsconfig.json`）

### 分层

| 目录 | 约定 |
|------|------|
| `app/(site)` | 前台页面，优先 Server Components |
| `app/admin` | 后台页面 + `actions.ts` Server Actions |
| `app/api` | 公开 Route Handlers，保持 JSON 契约稳定 |
| `lib` | 无 UI 的业务与基础设施 |
| `components` | 可复用 UI；Client 组件需 `'use client'` |

### 鉴权

- 页面门禁：`middleware.ts`（`/admin/*`）
- 写操作：`requireAdmin()`（`lib/auth.ts`）
- 勿在客户端暴露 `SESSION_SECRET` 或数据库凭据

### 数据库

- Schema：`lib/schema.ts`
- 连接与重试：`lib/db.ts`
- 列表/相似逻辑：`lib/anime-service.ts`

修改表结构时：

1. 更新 `lib/schema.ts`
2. 评估远程库是否已有列（生产库多为既有表）
3. 需要时使用 `drizzle-kit` / 手工 `ALTER`
4. 同步 `docs/architecture.md` 与 API 文档

## 5. 测试建议

```bash
npm run test:ts
npm run lint
npm run build
```

手动冒烟：

1. 首页是否出热门/最新
2. `/browse?search=` 搜索
3. `/watch/{id}` 播放器与标签
4. `/admin` 登录后改一条作品上下架，前台是否反映
5. `GET /api/animes?limit=2` 契约字段

## 6. 采集脚本（可选）

`scripts/` 下 Python 采集工具向 **MySQL 直写**，不经过 Next：

- 运行时：`crawler_worker/`（无数据库）
- YAML 导入模板：`scripts/production_config.yml.example`（不含 MySQL 凭据）
- 遗留直写脚本已删除；撤销独立爬虫库账号：`node scripts/revoke-legacy-crawler-db.mjs`

采集与 Web 进程解耦：Web 只读库展示。

## 7. 移动端

`mobile/` 为 Expo 工程，独立安装依赖与构建。API 基址指向部署后的 Next 源站 `/api`。

契约文档：`docs/api/README.md`。

## 8. 提交与文档同步

涉及以下变更时请同步文档（`docs/`）：

| 变更 | 文档 |
|------|------|
| 新 API / 改参数 | `docs/api/*` |
| 新环境变量 | `.env.example` + `docs/deployment.md` |
| 后台功能 | `docs/admin-guide.md` |
| 架构/部署方式 | `docs/architecture.md` |

## 9. 已知历史路径

| 路径 | 状态 |
|------|------|
| `functions/` | 旧 Cloudflare Functions，非当前生产入口 |
| `legacy/` | 旧 Vite 前端存档（若存在） |
| `server/` | 早期 Express 草稿，勿与 Next 混用 |
