# 公开 API 参考

基础路径：同源 `/api`（生产环境使用你在 `SITE_URL` 配置的 HTTPS 域名）。

- 协议：HTTPS（生产）/ HTTP（本地）
- 格式：JSON，`Content-Type: application/json`
- 鉴权：公开只读接口**无需**登录
- 机读规范：[openapi.yaml](./openapi.yaml)

## 端点一览

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/health` | 健康检查 + 数据库连通性 |
| GET | `/api/animes` | 作品分页列表 |
| GET | `/api/animes/{id}` | 作品详情（含标签） |
| GET | `/api/animes/{id}/similar` | 相似推荐 |
| GET | `/api/tags` | 全部标签 |

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
GET /api/tags
```

### 成功 `200`

```json
[
  { "id": 1, "name": "标签A" },
  { "id": 2, "name": "标签B" }
]
```

按名称排序。

## 6. 错误约定

| HTTP | 含义 |
|------|------|
| 200 | 成功 |
| 404 | 资源不存在（详情） |
| 500 | 服务端 / 数据库异常，`{ "error": string }` |

当前公开接口无速率限制中间件；生产建议在反向代理层配置限流。

## 7. 与后台的关系

- 管理后台写操作通过 **Server Actions**（`app/admin/actions.ts`），**不是**本公开 REST 的一部分。
- 修改 `is_active`、标题、标签后，公开 API 读到的是同一 MySQL 库的最新数据。

## 8. OpenAPI 使用

```bash
# 使用 Redocly / Swagger UI 等加载
# docs/api/openapi.yaml
```

在线工具示例：将 `openapi.yaml` 导入 [Swagger Editor](https://editor.swagger.io/) 即可预览与调试。
