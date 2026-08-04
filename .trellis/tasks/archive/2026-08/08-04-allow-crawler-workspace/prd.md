# 建立独立 Hanime crawler 工程

## Goal

在当前仓库的 `crawler/hanime/` 中保留独立 Hanime 数据采集工程，同时保持 Next.js 主站的构建、依赖、部署和运行边界不变。

## Requirements

- 创建并跟踪 `crawler/hanime/` 的 Python 源码、测试、依赖清单和使用文档。
- 根目录边界检查必须允许 `crawler/`，但继续禁止在 `app/`、`components/`、`lib/server/` 和主站 API 中恢复 crawler 控制面代码。
- crawler 文件不得进入主站 Docker 构建上下文，也不得被主站 TypeScript 或 ESLint 配置处理。
- 主站根 `package.json` 和两个 Compose 清单继续只描述 Next.js App；本任务不添加 crawler 依赖、命令或服务。
- 更新项目说明和架构文档，明确“同仓库双工程、运行与部署独立”。
- 生产 YAML 必须保持本地 ignored；仓库只提交无真实凭据的 `production_config.example.yml`。

## Acceptance Criteria

- [x] `crawler/hanime/` 在 Git 中可见并包含源码、依赖和边界说明。
- [x] `npm run check:boundaries` 在目录存在时通过。
- [x] `npm run check:legacy`、`npm run lint`、`npm run typecheck` 和 `npm run test` 通过。
- [x] 根目录和 `deploy/` Compose 均仍只输出 `app`。
- [x] 主站 Docker 构建上下文、TypeScript 和 ESLint 均排除 `crawler/`。
- [x] 生产 YAML 未提交，Git 只跟踪脱敏 example。
- [x] 文档明确同仓库双工程、运行与部署隔离。

## Notes

- 实际目录名称为用户提供的 `crawler/hanime/`。
- Python 文件通过 `py_compile`；当前主机缺少 `pip/ensurepip`，第三方依赖单测未在本机会话执行。
- “允许 crawler”不恢复已删除的主站 crawler 控制面。
