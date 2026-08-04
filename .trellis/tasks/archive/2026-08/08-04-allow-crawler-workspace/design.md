# 设计：同仓库独立 Hanime crawler 工程

## 边界模型

仓库改为包含两个工程空间：

- 根目录现有 Next.js 主站工程，继续由根 `package.json`、`Dockerfile` 和 Compose 管理。
- `crawler/` 独立工程空间；`crawler/hanime/` 拥有自己的 Python 依赖、测试和运行配置。

本次不建立 crawler 与主站的代码依赖。数据交换仍通过明确的数据库表或未来公开契约完成，禁止 crawler 导入 `app/**`、`components/**` 或 `lib/server/**` 私有模块。

## 工具隔离

- `.dockerignore` 排除 `crawler`，保证主站镜像上下文不包含爬虫源码或凭据。
- 根 `tsconfig.json` 排除 `crawler`，未来 crawler TypeScript 配置由子工程自行管理。
- 根 `eslint.config.mjs` 忽略 `crawler/**`，未来 crawler lint 由子工程自行管理。
- `scripts/check-app-boundaries.mjs` 仅移除根 `crawler` 的禁用项，继续禁止主站内部 crawler 路由、模块、表标识和第二个 Compose 服务。

## 配置安全

- `production_config.yml` 和 `config.yml` 始终 ignored。
- Git 只跟踪 `production_config.example.yml`，其中数据库密码使用 `CHANGE_ME`，代理关闭且不包含生产域名或路径。
- Python 缓存、虚拟环境、日志和下载产物不进入 Git。

## 目录跟踪

`crawler/README.md` 与 `crawler/hanime/README.md` 记录所有权、隔离规则、依赖安装和配置初始化流程。

## 部署与回滚

本任务不改变生产 Compose 或已部署容器。回滚应用提交即可移除 crawler 工程和隔离配置；不会触及数据库或生产环境。
