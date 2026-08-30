# 部署指南

生产部署只运行 AnimeStream App，并连接外部维护的 MySQL/MariaDB。

## 1. 前置条件

- 支持 Docker Compose v2 的 Linux 主机
- 已创建并迁移完成的远程 MySQL/MariaDB
- 数据库出口 IP 白名单和可信 TLS 证书链
- 指向服务器的域名与 HTTPS 反向代理

## 2. 准备配置

```bash
cp deploy/.env.example deploy/.env
chmod 600 deploy/.env
```

必须填写 `DATABASE_URL`、`SITE_URL`、`SESSION_SECRET`、`APP_ENCRYPTION_KEYRING` 和 `APP_ENCRYPTION_CURRENT_KEY_ID`。远程数据库保持 `DATABASE_TLS_MODE=required`；如使用私有 CA，再设置仓库内相对路径 `DATABASE_TLS_CA_FILE` 并确保文件在部署目录可读。

## 3. 启动

```bash
cd deploy
docker compose pull app
docker compose up -d
docker compose ps
```

Compose 拉取 `sakurajiamai/hentaiworkers-app:latest`，不会构建镜像、迁移数据库或创建管理员。

检查：

```bash
curl -fsS http://127.0.0.1:${APP_PORT:-13000}/api/live
curl -fsS http://127.0.0.1:${APP_PORT:-13000}/api/ready
docker compose logs --tail=100 app
```

## 4. 反向代理

默认监听 `127.0.0.1:${APP_PORT}`。反向代理应：

- 终止 HTTPS，并转发到本地 App 端口。
- 转发 `Host`、`X-Forwarded-Proto` 和客户端 IP 头。
- 设置合理的请求体、连接和响应超时。
- 不直接向公网暴露数据库端口。

`SITE_URL` 必须与用户实际访问的 HTTPS 源一致。

## 5. 升级与回滚

升级前先备份数据库并审核目标版本 SQL：

```bash
cd deploy
docker compose pull app
docker compose up -d --no-build
docker compose ps
```

升级后验证 `/api/live`、`/api/ready`、登录、目录查询和播放页。回滚时将 Compose 镜像固定到先前可用标签，再执行 `docker compose up -d`；数据库回滚必须使用预先审核的恢复方案，不能依赖容器自动处理。

## 6. 镜像标签

CI 发布：

- `sakurajiamai/hentaiworkers-app:latest`
- `sakurajiamai/hentaiworkers-app:main`
- `sakurajiamai/hentaiworkers-app:<commit-sha>`
- 版本 tag 对应的 SemVer 标签

生产建议固定版本或 commit SHA，完成验证后再更新。

## 7. Android APK

APK 不进 App 镜像。`mobile/**` 或 Android 工作流变更在任意分支、Pull Request 和手动运行时都会远程完成格式检查、Lint、单元测试、Release 构建及包名/版本/签名校验；只有 `main` 的非 Pull Request 运行且使用正式签名时，才会在 GitHub Release `build-<run>` 挂上 `arm64-v8a`、`armeabi-v7a`、`x86_64`、`x86` 和 `universal` 五个 APK。现代 Android 手机推荐 `arm64-v8a`，无法判断架构时使用 universal。

生产分发前必须在受 `main` 分支规则保护的 `Production` environment 配置四个 Android 签名 Secrets，并用仓库变量 `ANDROID_RELEASE_CERT_SHA256` 固定证书指纹；普通分支的 `CI` environment 不持有密钥。未配置时产物使用 debug 签名并明确标记为仅限内部测试 Artifact，不创建 GitHub Release，部分配置或证书不匹配则直接失败。Build 39 及更早版本使用公开 Expo debug 证书，首次安装新生产签名版本前必须卸载旧版。把 Release 资源 URL 填进后台「移动端下载」，前台页脚才会显示。步骤见 [移动端文档](./mobile.md)。
