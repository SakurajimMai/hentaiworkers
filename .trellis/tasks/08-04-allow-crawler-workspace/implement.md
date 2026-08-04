# 实施记录

1. [x] 建立 `crawler/` 和 `crawler/hanime/` 文档及独立 Python 工程。
2. [x] 从 App 边界检查中移除根 `crawler/` 禁令，保留主站内部 crawler 禁令。
3. [x] 在 `.dockerignore`、`tsconfig.json` 和 `eslint.config.mjs` 中排除 crawler 工程。
4. [x] 添加独立 `requirements.txt`、字幕过滤测试和脱敏 YAML example。
5. [x] 忽略生产 YAML、Python 缓存、虚拟环境及运行产物。
6. [x] 更新项目说明、架构文档、开发文档、变更记录和 backend spec。
7. [x] 运行 lint、typecheck、134 项主站测试、边界检查、legacy 检查、构建、Compose 和 Dockerfile 检查。
8. [x] 通过 `py_compile` 和 YAML 解析验证；未部署、未修改数据库。
9. [x] 提交并推送 `fa1f09b feat(crawler): add isolated hanime workspace`。
