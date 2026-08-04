# 系统架构

## 1. 边界

AnimeStream 主站是一个 Next.js 模块化单体。Node.js 进程和生产 Compose 只包含主站：公开站点、管理后台、公开 API 和 MySQL/MariaDB 数据访问。仓库内的 `crawler/` 是独立工程空间，不进入主站镜像或运行拓扑。

数据抓取、媒体下载、对象存储上传及其调度不在主站系统边界内。主站不提供对应的内部控制 API，也不读取 crawler 环境变量或本机共享目录。

## 2. 运行拓扑

```text
Browser / Mobile
       |
       v
HTTPS reverse proxy
       |
       v
Next.js App  --->  Remote MySQL / MariaDB
```

生产 Compose 只有 `app` 服务。数据库由外部独立维护，Compose 不负责创建数据库、迁移或 seed。

## 3. 代码分层

| 层 | 路径 | 职责 |
|----|------|------|
| Web | `app/**` | 页面、Server Actions、Route Handlers、鉴权入口 |
| UI | `components/**` | 前台与后台可复用组件 |
| Application | `lib/server/{catalog,identity,system}/application` | 用例编排与业务校验 |
| Domain / Ports | `lib/server/{catalog,identity,system}/{domain,ports}` | 领域模型与依赖接口 |
| Infrastructure | `lib/server/infrastructure/**` | MariaDB、Session、加密实现 |
| Composition | `lib/server/composition/container.ts` | 配置与基础设施装配 |

页面和 Route Handler 不直接拼接 SQL。数据库访问集中在 infrastructure repository，实现由业务模块的 ports 约束。

## 4. 主要数据

| 表 | 用途 |
|----|------|
| `animes` / `tags` / `anime_tags` | 里番目录与标签 |
| `users` | 账号、角色、启停状态与 Session 版本 |
| `system_settings` | 注册、SMTP、Trust、Turnstile 与播放器设置 |
| `email_verification_tokens` / `password_reset_tokens` | 邮箱验证与密码重置 |
| `user_lists` / `user_list_items` | 收藏、想看、在看、已看完与自定义片单 |
| `user_watch_progress` | 登录用户观看进度 |
| `user_events` | 播放里程碑事件 |

`drizzle/migrations/0010–0013` 是已发布过的历史迁移，可能在旧数据库中留下不再使用的 works 表。主站代码不得读写这些表，处理建议见 [变更记录](./CHANGELOG.md)。

## 5. 接口

- 匿名只读：`/api/animes*`、`/api/tags`
- 登录用户：`/api/me/watch-progress*`
- 健康检查：`/api/live`、`/api/ready`、`/api/health`
- 后台写操作：`app/admin/actions.ts` 的 Server Actions

公开契约见 [API 文档](./api/README.md)。

## 6. 安全

- 生产数据库默认要求 TLS；远程连接必须使用证书匹配的 DNS 主机名。
- 用户 Session 使用 `iron-session`，修改密码会递增 `session_version` 使旧 Cookie 失效。
- SMTP 密码和 Turnstile Secret 使用 AES-256-GCM 密钥环加密后存库。
- 管理后台要求有效的 `admin` 会话；公开写接口要求用户会话。
- `.env` 不进入 Git 或 Docker 构建上下文。

## 7. 部署

GitHub Actions 从根目录 `Dockerfile` 构建并发布 App 镜像。Compose 拉取公开镜像、读取 `.env`、暴露健康检查，并默认绑定 `127.0.0.1`。详见 [部署指南](./deployment.md)。
