# 公开 API 快速上手

本教程只使用无需登录的匿名公开 API。网站 Session、Android 登录/收藏/进度和漫画发布密钥
接口不属于公开 OpenAPI，边界见 [API 参考](../api/README.md)。

## 1. 选择 API Origin

本地开发默认使用：

```bash
ANIMESTREAM_ORIGIN=http://localhost:3000
```

生产环境把变量改成站点实际 HTTPS origin，不要附加路径、查询或片段。

## 2. 判断服务状态

先检查进程，再检查数据库连通性：

```bash
curl -fsS "$ANIMESTREAM_ORIGIN/api/live"
curl -fsS "$ANIMESTREAM_ORIGIN/api/ready"
```

预期分别得到 `{"status":"live"}` 和 `{"status":"ready"}`。`ready` 只代表配置数据库时
`SELECT 1` 成功，不证明迁移或完整 schema 可用。`/api/health` 是会返回数据库诊断信息的兼容
端点，不应在不受控场景公开其失败响应。

## 3. 查询里番目录

```bash
curl -fsS \
  "$ANIMESTREAM_ORIGIN/api/animes?page=1&limit=12&sort=popular"
```

响应包含 `data` 与 `pagination`：

```json
{
  "data": [],
  "pagination": {
    "page": 1,
    "limit": 12,
    "total": 0,
    "totalPages": 1
  }
}
```

可用参数：

| 参数 | 作用 |
|------|------|
| `page` | 从 1 开始的页码 |
| `limit` | 每页数量，最多 100 |
| `sort` | `latest` 或 `popular` |
| `tag` | 里番标签数字 ID |
| `search` | 匹配主标题、日文/英文标题和简介 |

先获取有效标签，再组合查询：

```bash
curl -fsS "$ANIMESTREAM_ORIGIN/api/tags?limit=20"
curl -fsS \
  "$ANIMESTREAM_ORIGIN/api/animes?page=1&limit=12&tag=1&sort=latest"
```

详情和相似推荐：

```bash
curl -fsS "$ANIMESTREAM_ORIGIN/api/animes/1"
curl -fsS "$ANIMESTREAM_ORIGIN/api/animes/1/similar"
```

不存在的详情返回 `404`；相似推荐收到无效 ID 时返回 `200 []`。

## 4. 查询漫画目录

```bash
curl -fsS \
  "$ANIMESTREAM_ORIGIN/api/mangas?page=1&limit=12&rank=week"
```

漫画使用自己的文本标签，不是里番标签 ID：

```bash
curl -fsS \
  "$ANIMESTREAM_ORIGIN/api/mangas?page=1&limit=12&q=关键词&tag=标签名"
```

详情和章节页面：

```bash
curl -fsS "$ANIMESTREAM_ORIGIN/api/mangas/17"
curl -fsS "$ANIMESTREAM_ORIGIN/api/mangas/17/chapters/1"
```

读取章节会记录一次用于榜单的去重浏览。漫画栏目关闭时，漫画接口返回 `404` 和
`{"error":"Manga disabled"}`。

## 5. 广告与 Android 更新清单

```bash
curl -fsS "$ANIMESTREAM_ORIGIN/api/ads"
curl -fsS "$ANIMESTREAM_ORIGIN/api/android/update"
```

广告响应只包含公开投放配置，不包含后台秘密。Android 更新接口从固定 GitHub Releases
仓库选择数值最大的完整 `build-N`，正常响应始终包含四种 ABI split、universal APK 与
`SHA256SUMS`。冷缓存且 GitHub 元数据不可用时返回 `502`。

## 6. 分页、缓存与错误

- 始终读取响应中的 `pagination.totalPages`，不要根据本页数组长度推断是否还有下一页。
- 尊重响应的 `Cache-Control`；目录、标签与广告允许共享缓存，账号数据不属于本教程范围。
- `404` 可能表示资源不存在或漫画栏目关闭；`500` 表示服务端/数据库错误；更新清单还可能
  返回 `502`。
- 不要把服务端返回的 `error` 文本直接展示给终端用户或写入公开日志，其中可能含诊断细节。

完整字段和 schema 见 [API 参考](../api/README.md) 与
[OpenAPI](../api/openapi.yaml)。
