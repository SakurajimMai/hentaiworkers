# AnimeStream App 部署包

此目录的 Compose 清单只启动主站 App，数据库由外部维护。

```bash
cp .env.example .env
chmod 600 .env
# 填写 .env
docker compose pull app
docker compose up -d
docker compose ps
```

默认将容器 `3000` 端口发布到宿主机 `127.0.0.1:${APP_PORT:-13000}`。请使用 HTTPS 反向代理对外服务。

就绪检查：

```bash
curl -fsS http://127.0.0.1:${APP_PORT:-13000}/api/live
curl -fsS http://127.0.0.1:${APP_PORT:-13000}/api/ready
```

Compose 不执行数据库迁移或管理员 seed。升级前完成备份和受控迁移，详细步骤见 [`docs/deployment.md`](../docs/deployment.md)。
