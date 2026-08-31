# 公开 API 参考

基础路径：同源 `/api`（生产环境使用你在 `SITE_URL` 配置的 HTTPS 域名）。

- 协议：HTTPS（生产）/ HTTP（本地）
- 格式：JSON，`Content-Type: application/json`
- 鉴权：公开只读接口**无需**登录；`/api/me/*` 需前台会话 Cookie
- 范围：里番目录（`animes` / `tags`）、已发布漫画（`mangas`）与 Android 更新清单。无独立「动漫 / works」公开 API
- 机读规范：[openapi.yaml](./openapi.yaml)

## 端点一览

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/live` | 进程存活（Compose healthcheck） |
| GET | `/api/ready` | 就绪（含 `SELECT 1`） |
| GET | `/api/health` | 兼容健康检查 + 数据库连通性 |
| GET | `/api/animes` | 里番分页列表 |
| GET | `/api/animes/{id}` | 里番详情（含标签） |
| GET | `/api/animes/{id}/similar` | 相似推荐 |
| GET | `/api/tags` | 里番标签字典 |
| GET | `/api/android/update` | 最新完整 Android GitHub Release 清单 |
| GET | `/api/mangas` | 已发布漫画分页列表 |
| GET | `/api/mangas/{id}` | 漫画详情（含章节摘要） |
| GET | `/api/mangas/{id}/chapters/{number}` | 章节图片；同时记一次榜单浏览 |
| GET/PUT… | `/api/me/watch-progress*` | 登录用户观看进度 |

## 1. 健康检查

```http
GET /api/health
```

**成功 `200`**

```json
{
  "ok": true,
  "database": "mysql",
  "result": [{ "ok": 1 }],
  "version": "1.0.0"
}
```

**失败 `500`**

```json
{
  "ok": false,
  "error": "连接错误信息"
}
```

## 2. 作品列表

```http
GET /api/animes?page=1&limit=48&sort=popular&tag=12&search=关键词
```

### Query 参数

| 参数 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `page` | integer | `1` | 页码，≥ 1 |
| `limit` | integer | `48` | 每页条数，实现侧会钳制到合理上限（≤ 100） |
| `sort` | string | `latest` | `latest` 按上架/创建时间；`popular` 按 `view_count` |
| `tag` | integer | — | 标签 ID，过滤含该标签的作品 |
| `search` | string | — | 模糊匹配 `title` / `title_japanese` |

### 业务规则

- 默认只返回上架作品：`is_active = 1` 或 `is_active IS NULL`（兼容历史空值）。
- 列表字段为摘要，不含完整简介与视频地址。

### 成功 `200`

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

### 失败 `500`

```json
{ "error": "Failed query: ..." }
```

### 示例

```bash
curl -s "http://localhost:3000/api/animes?page=1&limit=2&sort=popular"
```

```javascript
const res = await fetch('/api/animes?page=1&limit=24&sort=latest');
const { data, pagination } = await res.json();
```

## 3. 作品详情

```http
GET /api/animes/{id}
```

### 成功 `200`

返回完整作品行（Drizzle / 表字段驼峰映射）+ `tags` 数组：

```json
{
  "id": 1,
  "title": "示例",
  "titleEnglish": null,
  "titleJapanese": null,
  "description": "简介...",
  "cover": "https://...",
  "fanart": "https://a.jpg,https://b.jpg",
  "videoUrl": "https://.../video.m3u8",
  "releaseYear": null,
  "releaseDate": null,
  "viewCount": 100,
  "favoriteCount": 0,
  "isActive": 1,
  "categoryId": null,
  "createdAt": "2024-01-01 00:00:00",
  "updatedAt": "2024-01-02 00:00:00",
  "tags": [
    { "id": 3, "name": "标签名", "description": null }
  ]
}
```

### 失败

| 状态 | 条件 |
|------|------|
| `404` | 无效 id 或不存在 |
| `500` | 数据库错误 |

```json
{ "error": "Not found" }
```

## 4. 相似推荐

```http
GET /api/animes/{id}/similar
```

### 算法概要

1. 从标题剥离集数后缀，提取系列前缀，做 `LIKE prefix%` 匹配。
2. 若不足 12 条，再按共同标签数排序补齐。
3. 仍不足则按播放量回退。

### 成功 `200`

JSON 数组（最多约 12 条）：

```json
[
  {
    "id": 2,
    "title": "相关作品",
    "cover": "https://...",
    "fanart": null,
    "viewCount": 500
  }
]
```

无效 id 时返回 `[]`（而非 404）。

## 5. 标签列表

```http
GET /api/tags?limit=20
```

### 成功 `200`

```json
[
  { "id": 1, "name": "标签A" },
  { "id": 2, "name": "标签B" }
]
```

只返回至少关联一部当前有效里番（`is_active = 1` 或 `NULL`）的去重标签，按名称排序。`limit` 默认为 `100`，并始终钳制到 `1..100`；历史孤立标签和只关联下架里番的标签不会出现在公开列表中。

## 6. Android 更新清单

```http
GET /api/android/update
```

该接口不访问数据库。服务端以 5 秒上游超时读取固定仓库
`SakurajimMai/hentaiworkers` 的 GitHub Releases（包含 prerelease），忽略 draft、
非 `main` 目标和资产不完整的版本，并选择数值最大的合法 `build-N`。每个合法
Release 必须包含五个精确命名的 APK 与 `SHA256SUMS`，所有资产必须是已上传的
非空文件，带 GitHub SHA-256 digest，并使用固定 HTTPS 下载路径。

### 成功 `200`

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

`apks` 始终同时包含 `arm64-v8a`、`armeabi-v7a`、`x86_64`、`x86` 和
`universal`。进程缓存 15 分钟 fresh，并可在 GitHub 暂时失败时继续返回最多
24 小时的 stale 数据；公开响应允许 CDN 缓存 5 分钟。冷缓存且无合法上游清单时
返回 `502`：

```json
{ "error": "Update metadata unavailable" }
```

## 7. 漫画列表

```http
GET /api/mangas?page=1&limit=24&q=关键词&tag=NTR&rank=week
```

| 参数 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `page` | integer | `1` | 页码 |
| `limit` | integer | `24` | 每页条数，最大 100 |
| `q` | string | — | 匹配标题、作者或漫画标签 |
| `tag` | string | — | 漫画标签名（不是里番标签 ID） |
| `rank` | string | — | `day` / `week` / `month` / `all`；缺省按更新时间 |

漫画栏目关闭时返回 `404` `{ "error": "Manga disabled" }`。

### 成功 `200`

```json
{
  "data": [
    {
      "id": 17,
      "slug": "example",
      "title": "示例漫画",
      "author": "作者",
      "tags": ["NTR"],
      "coverUrl": "https://example.com/cover.jpg",
      "chapterCount": 1,
      "pageCount": 225
    }
  ],
  "pagination": { "page": 1, "limit": 24, "total": 11, "totalPages": 1 }
}
```

## 8. 漫画详情与章节

```http
GET /api/mangas/17
GET /api/mangas/17/chapters/1
```

详情返回作品字段加 `chapters`。章节返回 `{ manga, chapter }`，`chapter.pages` 为 `{ index, imageUrl }`。打开章节会记一次去重浏览，供榜单使用。

```bash
curl -s "https://www.ixacg.de/api/mangas?limit=2&rank=week"
```

## 9. 错误约定

| HTTP | 含义 |
|------|------|
| 200 | 成功 |
| 404 | 资源不存在（详情） |
| 500 | 服务端 / 数据库异常，`{ "error": string }` |
| 502 | 更新清单上游不可用且没有可用缓存 |

当前公开接口无速率限制中间件；生产建议在反向代理层配置限流。

## 10. 与后台的关系

- 管理后台写操作通过 **Server Actions**（`app/admin/actions.ts`），**不是**本公开 REST 的一部分。
- 修改 `is_active`、标题、标签后，公开 API 读到的是同一 MySQL 库的最新数据。

## 11. OpenAPI 使用

```bash
# 使用 Redocly / Swagger UI 等加载
# docs/api/openapi.yaml
```

在线工具示例：将 `openapi.yaml` 导入 [Swagger Editor](https://editor.swagger.io/) 即可预览与调试。
