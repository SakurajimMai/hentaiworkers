# API 参考

AnimeStream 的 HTTP 接口分成三类：

- **匿名公开 API**：目录、漫画、广告、健康检查与 Android 更新清单；由
  [OpenAPI](./openapi.yaml) 描述。
- **客户端会话接口**：网站和 Android 登录后使用 Cookie 访问的账号、收藏与进度接口。
- **受信发布接口**：漫画生产者使用共享密钥提交章节，不属于公开 API。

基础路径为同源 `/api`。生产环境使用 `SITE_URL` 对应的 HTTPS 域名，本地开发通常是
`http://localhost:3000`。所有响应均为 JSON。

第一次调用可先完成 [API 快速上手](../tutorials/api-quickstart.md)。

## 匿名公开端点

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/live` | 进程存活检查，不访问依赖 |
| GET | `/api/ready` | 就绪检查；配置数据库时执行 `SELECT 1` |
| GET | `/api/health` | 兼容诊断接口，包含数据库结果和版本 |
| GET | `/api/ads` | 网站与 Android 使用的公开广告配置 |
| GET | `/api/animes` | 里番分页目录 |
| GET | `/api/animes/{id}` | 里番详情与标签 |
| GET | `/api/animes/{id}/similar` | 相似推荐 |
| GET | `/api/tags` | 当前有效里番使用的标签 |
| GET | `/api/mangas` | 已发布漫画分页目录 |
| GET | `/api/mangas/{id}` | 漫画详情与章节摘要；`id` 可为 slug 或数字 ID |
| GET | `/api/mangas/{id}/chapters/{number}` | 漫画章节图片；`id` 可为 slug 或数字 ID |
| GET | `/api/android/update` | 最新完整 Android GitHub Release 清单 |

匿名公开接口当前没有应用层速率限制。生产环境应在反向代理或边缘层配置合理的限流与超时。

## 1. 存活、就绪与诊断

### 存活检查

```http
GET /api/live
```

进程能够处理请求时返回 `200`：

```json
{ "status": "live" }
```

该接口不检查数据库，适合作为进程存活探针。

### 就绪检查

```http
GET /api/ready
```

成功返回 `200`：

```json
{ "status": "ready" }
```

数据库探测失败时返回 `503`：

```json
{ "status": "not_ready", "reason": "dependency error" }
```

当前实现只在配置 `DATABASE_URL` 时执行 `SELECT 1`；未配置数据库时仍会返回 ready。它不验证
迁移版本、表结构或运行时懒创建表，因此不能替代发布后的业务烟测。

### 兼容诊断接口

```http
GET /api/health
```

数据库可查询时返回 `200`：

```json
{
  "ok": true,
  "database": "mysql",
  "result": [{ "ok": 1 }],
  "version": "1.0.0"
}
```

失败返回 `500` 与 `{ "ok": false, "error": string }`。错误字符串可能包含底层诊断信息，
不应把该响应公开汇入日志面板或用户界面。

## 2. 广告配置

```http
GET /api/ads
```

返回启用的内容流广告位、阅读器广告位和播放器广告配置，不包含管理密钥：

```json
{
  "feedSlots": [],
  "reader": {
    "top": { "enabled": false, "html": "", "interval": 5 },
    "middle": { "enabled": false, "html": "", "interval": 5 },
    "bottom": { "enabled": false, "html": "", "interval": 5 }
  },
  "player": {
    "preRollAd": {
      "enabled": false,
      "videoUrl": "",
      "imageUrl": "",
      "html": "",
      "clickUrl": "",
      "playDuration": 0,
      "totalDuration": 0,
      "muted": true
    },
    "pauseAd": {
      "enabled": false,
      "videoUrl": "",
      "imageUrl": "",
      "html": "",
      "clickUrl": "",
      "muted": true
    }
  }
}
```

接口允许公共读缓存；客户端仍应处理 `500`，并在广告配置不可用时继续显示核心内容。

## 3. 里番目录

### 列表

```http
GET /api/animes?page=1&limit=48&sort=popular&tag=12&search=关键词
```

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `page` | integer | `1` | 页码，最小为 1 |
| `limit` | integer | `48` | 每页条数，钳制到 1..100 |
| `sort` | string | `latest` | `latest` 按更新时间（缺失时回退创建时间）；`popular` 按浏览量 |
| `tag` | integer | - | 里番标签 ID |
| `search` | string | - | 模糊匹配标题、日文标题、英文标题和简介 |

默认只返回 `is_active = 1` 或历史兼容值 `NULL` 的作品。成功响应：

```json
{
  "data": [
    {
      "id": 2065,
      "title": "示例标题",
      "cover": "https://example.com/cover.jpg",
      "viewCount": 10000,
      "titleEnglish": ""
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 48,
    "total": 2813,
    "totalPages": 59
  }
}
```

### 详情

```http
GET /api/animes/{id}
```

成功返回完整作品字段和 `tags` 数组。当前详情查询只按 ID 查找，不过滤 `is_active`；下架状态
不能作为阻止直接访问详情 API 的安全边界。无效 ID 或不存在时返回 `404`：

```json
{ "error": "Not found" }
```

### 相似推荐

```http
GET /api/animes/{id}/similar
```

服务先匹配去除集数后缀的系列标题；当前作品有标签时按共同标签补齐，没有标签时才按热度
回退，最多约 12 条。无效 ID 返回空数组，而不是 `404`。

## 4. 标签

```http
GET /api/tags?limit=20
```

`limit` 默认为 `100` 并钳制到 1..100。接口只返回至少关联一部当前有效里番的去重标签，
按名称排序：

```json
[
  { "id": 1, "name": "标签A" },
  { "id": 2, "name": "标签B" }
]
```

## 5. 漫画目录与章节

### 列表

```http
GET /api/mangas?page=1&limit=24&q=关键词&tag=NTR&rank=week
```

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `page` | integer | `1` | 页码 |
| `limit` | integer | `24` | 每页条数，最大 100 |
| `q` | string | - | 匹配标题、作者或漫画标签 |
| `tag` | string | - | 漫画标签名，不是里番标签 ID |
| `rank` | string | - | `day`、`week`、`month` 或 `all` |

成功响应包含 `data` 和 `pagination`。漫画栏目关闭时返回
`404 { "error": "Manga disabled" }`。

### 详情与章节

```http
GET /api/mangas/example-slug
GET /api/mangas/example-slug/chapters/1
```

路径中的 `id` 优先按已发布漫画 slug 解析，也兼容纯数字数据库 ID。详情返回作品字段与
`chapters` 摘要。章节响应包含 `manga` 和 `chapter`，
`chapter.pages` 为 `{ index, imageUrl }` 数组。成功读取章节也会记录一次用于榜单的去重
浏览。栏目关闭、作品未发布或资源不存在时返回 `404`。

## 6. Android 更新清单

```http
GET /api/android/update
```

接口以 5 秒上游超时读取固定仓库
`SakurajimMai/hentaiworkers` 的 GitHub Releases，并选择数值最大的完整 `build-N`。草稿、
非 `main` 目标、缺少资产、空文件、下载路径不可信或没有 GitHub SHA-256 digest 的版本都会
被忽略。

合法 Release 必须同时包含以下资产：

- `arm64-v8a`
- `armeabi-v7a`
- `x86_64`
- `x86`
- `universal`
- `SHA256SUMS`

以下是字段节选，只展开 `arm64-v8a` 以说明资产结构；真实 `200` 响应的 `apks` 必定同时包含
五种 APK。build 号、文件大小和校验值也不代表当前最新版本：

```json
{
  "schemaVersion": 1,
  "packageName": "de.ixacg.animestream",
  "versionCode": 66,
  "releaseTag": "build-66",
  "releaseName": "AnimeStream Build 66",
  "publishedAt": "2026-08-30T15:35:02Z",
  "releasePageUrl": "https://github.com/SakurajimMai/hentaiworkers/releases/tag/build-66",
  "apks": {
    "arm64-v8a": {
      "name": "AnimeStream-66-arm64-v8a.apk",
      "url": "https://github.com/SakurajimMai/hentaiworkers/releases/download/build-66/AnimeStream-66-arm64-v8a.apk",
      "size": 16194840,
      "sha256": "671c8be3b9d9b3aedd31f2fc3774764554f08f4d48bfe31b14f1f5c8937a2086"
    }
  },
  "checksums": {
    "name": "SHA256SUMS",
    "url": "https://github.com/SakurajimMai/hentaiworkers/releases/download/build-66/SHA256SUMS",
    "size": 468,
    "sha256": "61ed90914b56c27b96a65ad45b8f776934507890cdf41be631eea17bf88f3e88"
  }
}
```

进程缓存新鲜数据 15 分钟；GitHub 暂时失败时可以继续返回最多 24 小时的 stale 数据。冷缓存且
没有合法上游清单时返回 `502 { "error": "Update metadata unavailable" }`。

## 7. 客户端会话接口

下列接口供本项目网站和 Android 客户端使用，不属于匿名 OpenAPI。登录响应设置会话 Cookie；
调用方必须保留并在后续请求发送该 Cookie。

| 方法 | 路径 | 用途 |
|------|------|------|
| POST | `/api/auth/login` | 使用 `emailOrUsername` 与 `password` 登录 |
| POST | `/api/auth/logout` | 注销当前会话 |
| GET | `/api/me` | 读取当前账号 |
| GET/POST | `/api/me/favorites` | 读取全部收藏或设置里番/漫画收藏 |
| GET/POST/DELETE | `/api/me/watch-progress` | 列表、合并游客里番进度或全部清除 |
| GET/PUT/DELETE | `/api/me/watch-progress/{animeId}` | 单个里番进度 |
| GET/POST/DELETE | `/api/me/manga-progress` | 列表、合并游客漫画进度或全部清除 |
| PUT/DELETE | `/api/me/manga-progress/{mangaId}` | 单个漫画进度 |

`/api/me/favorites` 的 GET 为移动端兼容而返回当前账号的完整里番与漫画收藏，不提供分页。
Web 收藏页自身分别按里番和漫画分页。会话接口可能返回 `400`、`401`、`403`、登录限流的
`429` 或 `500`；
客户端不应依赖错误正文的内部实现。

## 8. 漫画发布集成

```http
POST /api/manga/publish
X-Manga-Publish-Key: <secret>
Content-Type: application/json
```

也可以使用 `Authorization: Bearer <secret>`。请求至少需要：

```json
{
  "title": "作品标题",
  "sourceKey": "producer-stable-id",
  "imageUrls": ["https://example.com/page-1.jpg"]
}
```

接口也接受代码中定义的 snake_case 别名，并可附带作者、标签、章节标题、封面、简介和来源
信息。创建返回 `201`，幂等或已有结果可能返回 `200`。密钥由后台系统设置管理；不要把它
写入仓库、客户端、URL 或日志。完整生产者接入前应审查
`app/api/manga/publish/route.ts` 的当前请求类型。

## 9. 错误与缓存

| HTTP | 常见含义 |
|------|----------|
| `200` | 查询成功 |
| `201` | 漫画发布创建成功 |
| `400` | 参数或请求体无效 |
| `401` / `403` | 会话或发布凭据无效 |
| `404` | 资源不存在或漫画栏目关闭 |
| `429` | 登录或其他受保护操作触发限流 |
| `500` | 服务端或数据库异常 |
| `502` | Android 更新上游不可用且无缓存 |
| `503` | 就绪依赖失败 |

成功响应的共享缓存策略为：

| 端点 | `Cache-Control` |
|------|-----------------|
| `/api/animes`、`/api/mangas`、`/api/tags`、`/api/ads` | `public, max-age=30, stale-while-revalidate=120, stale-if-error=900` |
| `/api/android/update` | `public, max-age=300, stale-while-revalidate=900, stale-if-error=86400` |

详情、章节、健康和失败响应不应从这张表推导缓存策略。具体响应结构和上述成功响应头也在
[OpenAPI](./openapi.yaml) 中声明。

## 10. OpenAPI 使用

`openapi.yaml` 只承诺本页“匿名公开端点”表中的契约，不包含 Cookie 会话、漫画发布或后台
Server Actions。

```bash
# 在仓库根目录解析或导入：
docs/api/openapi.yaml
```

可以将文件导入 [Swagger Editor](https://editor.swagger.io/) 或其他 OpenAPI 3.0 工具。架构和
信任边界见 [系统架构](../architecture.md)，部署探针用法见
[生产发布教程](../tutorials/production-rollout.md)。
