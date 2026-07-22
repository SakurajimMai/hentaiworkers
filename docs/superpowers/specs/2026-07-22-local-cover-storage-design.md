# 本地封面下载与路由设计

## 目标

当采集模板勾选“下载并保存封面”且未配置 S3/SFTP 外部存储时，由 Worker 将资源站封面下载到服务器共享目录，并将动漫的 `cover_url` 替换为本站可访问的封面 URL。取消勾选时继续提交 `null`，不下载也不保留上游封面 URL。

## 存储与容器边界

Docker Compose 使用宿主机相对目录 `./covers`，容器内统一挂载到 `/data/covers`：

- App：`./covers:/data/covers:ro`，仅通过 HTTP 路由读取文件。
- Worker：`./covers:/data/covers`，负责创建目录和原子写入封面。

封面不写入 Next.js 镜像内的 `public/`。镜像升级不会删除宿主机封面，Web 进程也不能修改 Worker 写入的数据。

部署前由宿主机创建 `./covers`，并授予 Worker 用户（UID 10001）写权限。Worker 创建的目录使用 `0755`、文件使用 `0644`，确保 App 的非 root 用户可以只读访问。

## 下载与文件命名

Worker 复用现有 HTTP 下载器的公网地址校验、超时、重试和大小限制。封面下载到同目录临时文件，校验成功后通过原子重命名发布。

最终相对键使用：

```text
<source>/<sha256>.<extension>
```

`source` 只允许安全的小写字母、数字、下划线和短横线；文件扩展名只允许 `jpg`、`jpeg`、`png`、`webp`。内容哈希进入文件名，避免不同资源相互覆盖，也允许封面路由使用长期不可变缓存。

相同内容已存在时不重复写入。下载或校验失败时保留资源站原始封面 URL，并记录 Worker 警告，不让单张封面导致整条动漫采集失败。

## 封面路由

新增 Node.js Route Handler：

```text
GET /api/media/covers/<source>/<filename>
```

路由从 `CRAWLER_COVER_DIR` 读取文件，默认目录为 `/data/covers`。它只接受固定的两段安全路径和允许的图片扩展名，解析后的绝对路径必须位于封面根目录内；不存在或不合法时返回 `404`。

成功响应根据扩展名设置 `Content-Type`，并返回：

```text
Cache-Control: public, max-age=31536000, immutable
X-Content-Type-Options: nosniff
```

## 入库 URL

Worker 成功保存封面后提交站内相对 URL：

```text
/api/media/covers/<source>/<sha256>.<extension>
```

控制面仅接受上述受控相对路由或现有绝对 HTTP(S) URL。对于受控相对路由，控制面使用现有 `SITE_URL` 转换成完整公网 URL后写入 `anime_works.cover_url`，例如：

```text
https://example.com/api/media/covers/ikun/abc123.jpg
```

这样网页、播放器、公开 API 和移动端继续直接使用 `coverUrl`，无需各自拼接域名。现有封面组件不需要修改。

## 与外部存储的关系

- 未配置 S3/SFTP：勾选封面时保存到本地共享目录并使用本站封面路由。
- 已配置 S3/SFTP：继续使用现有媒体上传管道及其公开 URL，不再额外保存一份本地封面。
- 取消勾选：两种模式都不下载封面，入库值为 `null`。

## 配置与验证

Compose 为两个服务设置 `CRAWLER_COVER_DIR=/data/covers`，并使用已确认的 `./covers` 相对卷。封面路由生成公网地址时复用 App 的 `SITE_URL`，不向 Worker 身份文件添加域名或数据库配置。

测试覆盖：

1. Compose 的 App 只读卷、Worker 读写卷及统一容器目录。
2. Worker 下载封面、生成内容哈希键、复用已有文件、失败回退和关闭封面。
3. 控制面只允许受控本地封面路由，并将其转换为 `SITE_URL` 下的完整 URL。
4. 封面路由的成功响应、MIME 类型、缓存头、缺失文件和路径穿越拒绝。

按用户要求不启动本地开发服务，也不运行本地 Docker；使用 TypeScript、Python 单元测试和静态检查完成验证。
