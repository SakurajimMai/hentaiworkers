# 本地封面下载与路由 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让未配置 S3/SFTP 的爬虫任务把勾选保存的封面下载到 `./covers`，并以本站完整 URL 写入动漫封面字段。

**Architecture:** Worker 将远程封面校验后以内容哈希文件名原子写入 `/data/covers`，并提交受控的 `/api/media/covers/...` 相对 URL。控制面用 `SITE_URL` 将其规范化为完整公网 URL；App 通过只读共享卷和固定两段路径的 Route Handler 返回图片。

**Tech Stack:** Next.js 15 Route Handler、TypeScript、Node test runner、Python 3 unittest、Docker Compose。

---

## 文件结构

- `docker-compose.yml`、`deploy/docker-compose.yml`：App 只读、Worker 读写的 `./covers:/data/covers` 共享卷。
- `.gitignore`、`.dockerignore`：排除服务器生成的 `covers` 内容。
- `crawler_worker/models/config.py`、`crawler_worker/main.py`：读取并创建 Worker 的封面根目录。
- `crawler_worker/media/local_cover_store.py`：图片签名校验、哈希命名、原子发布和本地路由生成。
- `crawler_worker/runtime/runner.py`：仅在无 S3/SFTP 且启用封面时调用本地保存逻辑，失败时记录警告并保留上游 URL。
- `lib/server/crawler/interfaces/worker-request.ts`：只允许 HTTP(S) URL 或严格的本站封面相对路由。
- `lib/server/crawler/application/crawler-result-service.ts`：将本站封面相对路由转换为 `SITE_URL` 下的完整 URL。
- `lib/server/media/local-cover-handler.ts`：安全读取、MIME 和缓存响应。
- `app/api/media/covers/[source]/[filename]/route.ts`：封面 HTTP 入口。
- `DEPLOYMENT.md`：服务器目录权限和升级步骤。

### Task 1: Compose 共享卷

**Files:**
- Modify: `tests/deployment/docker-compose.test.ts`
- Modify: `docker-compose.yml`
- Modify: `deploy/docker-compose.yml`
- Modify: `.gitignore`
- Modify: `.dockerignore`

- [ ] **Step 1: 写入失败测试。**

```ts
assert.deepEqual(app.volumes, ['./covers:/data/covers:ro']);
assert.equal(app.environment?.CRAWLER_COVER_DIR, '/data/covers');
assert.deepEqual(worker.volumes, [
  './crawler-worker-tmp:/tmp/crawler-worker',
  './covers:/data/covers',
]);
assert.equal(worker.environment?.CRAWLER_COVER_DIR, '/data/covers');
assert.match(gitIgnore, /^covers\/$/m);
assert.match(dockerIgnore, /^covers$/m);
```

- [ ] **Step 2: 运行测试并确认因卷和环境变量缺失而失败。**

Run: `cmd /c pnpm exec tsx --test tests/deployment/docker-compose.test.ts`

Expected: FAIL，`app.volumes` 仍为空且 Worker 只有临时目录卷。

- [ ] **Step 3: 为两个 Compose 文件增加已确认的相对卷。**

```yaml
app:
  environment:
    CRAWLER_COVER_DIR: /data/covers
  volumes:
    - ./covers:/data/covers:ro

worker:
  environment:
    CRAWLER_COVER_DIR: /data/covers
  volumes:
    - ./crawler-worker-tmp:/tmp/crawler-worker
    - ./covers:/data/covers
```

同时在 `.gitignore` 增加 `covers/`，在 `.dockerignore` 增加 `covers` 与 `**/covers`。

- [ ] **Step 4: 运行部署配置测试确认通过。**

Run: `cmd /c pnpm exec tsx --test tests/deployment/docker-compose.test.ts`

Expected: PASS。

### Task 2: Worker 本地封面存储

**Files:**
- Create: `crawler_worker/media/local_cover_store.py`
- Create: `crawler_worker/tests/test_local_cover_store.py`
- Create: `crawler_worker/tests/test_main.py`
- Modify: `crawler_worker/tests/test_runner.py`
- Modify: `crawler_worker/models/config.py`
- Modify: `crawler_worker/main.py`
- Modify: `crawler_worker/runtime/runner.py`

- [ ] **Step 1: 写入图片保存失败测试。**

```python
def fake_download(_url: str, dest: Path, **_kwargs: object) -> Path:
    dest.write_bytes(b"\xff\xd8\xff" + b"cover-bytes")
    return dest

relative_url = save_cover_locally(
    url="https://cdn.example/cover",
    source="ikun",
    referer=None,
    root_dir=Path(tmp),
    downloader=fake_download,
)
self.assertRegex(relative_url, r"^/api/media/covers/ikun/[a-f0-9]{64}\.jpg$")
self.assertEqual((Path(tmp) / relative_url.removeprefix("/api/media/covers/")).read_bytes(), b"\xff\xd8\xffcover-bytes")
```

另写测试拒绝 HTML/未知签名、复用已存在的同哈希文件，并验证生成文件模式允许其他 UID 读取。

- [ ] **Step 2: 运行测试并确认模块尚不存在。**

Run: `python -m unittest crawler_worker.tests.test_local_cover_store -v`

Expected: FAIL，`crawler_worker.media.local_cover_store` 尚不存在。

- [ ] **Step 3: 实现本地封面存储。**

```python
LOCAL_COVER_ROUTE_PREFIX = "/api/media/covers"
MAX_COVER_BYTES = 20 * 1024 * 1024

def detect_image_extension(path: Path) -> str:
    with path.open("rb") as stream:
        head = stream.read(16)
    if head.startswith(b"\xff\xd8\xff"):
        return ".jpg"
    if head.startswith(b"\x89PNG\r\n\x1a\n"):
        return ".png"
    if len(head) >= 12 and head[:4] == b"RIFF" and head[8:12] == b"WEBP":
        return ".webp"
    raise ValueError("unsupported cover image format")
```

`save_cover_locally` 校验 `source`，创建 `0755` 子目录，以 UUID 临时名调用 `download_http_file(..., max_bytes=MAX_COVER_BYTES)`，流式计算 SHA-256，按检测到的扩展名原子改名并设置 `0644`；异常时删除临时文件。

- [ ] **Step 4: 写入 Runner 与环境配置失败测试。**

```python
self.assertEqual(config.cover_dir, "/data/covers")
self.assertEqual(committed["cover_url"], expected_local_route)
```

Runner 测试分别覆盖：启用封面且无对象存储会本地保存；本地保存失败保留上游 URL并发送 `cover_download_failed` 事件；有 S3/SFTP 时不调用本地保存；关闭封面时仍为 `None`。

- [ ] **Step 5: 运行测试确认配置字段与 Runner 调用缺失。**

Run: `python -m unittest crawler_worker.tests.test_main crawler_worker.tests.test_runner -v`

Expected: FAIL。

- [ ] **Step 6: 接入 Worker 配置与 Runner。**

```python
@dataclass(frozen=True)
class WorkerRuntimeConfig:
    # 现有字段保持不变
    cover_dir: str = "/data/covers"
```

`config_from_env` 读取 `CRAWLER_COVER_DIR` 并创建目录。Runner 在 `needs_upload is False`、`enableCover is True`、条目成功且存在 `cover_url` 时调用 `save_cover_locally`；异常通过 `_log(..., "cover_download_failed", ...)` 记录后继续提交原 URL。

- [ ] **Step 7: 运行 Worker 定向测试确认通过。**

Run: `python -m unittest crawler_worker.tests.test_local_cover_store crawler_worker.tests.test_main crawler_worker.tests.test_runner crawler_worker.tests.test_upload_pipeline -v`

Expected: PASS。

### Task 3: 控制面封面 URL 规范化

**Files:**
- Modify: `tests/contracts/worker-api-contract.test.ts`
- Modify: `tests/crawler/catalog-ingestion.test.ts`
- Modify: `lib/server/crawler/interfaces/worker-request.ts`
- Modify: `lib/server/crawler/application/crawler-result-service.ts`

- [ ] **Step 1: 写入失败测试。**

```ts
const localCover = '/api/media/covers/ikun/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.jpg';
assert.equal(itemsCommitBodySchema.safeParse({ ...validBody, coverUrl: localCover }).success, true);
assert.equal(itemsCommitBodySchema.safeParse({ ...validBody, coverUrl: '/api/media/covers/../secret.jpg' }).success, false);

await service.commitItem({ ...input, coverUrl: localCover });
assert.equal(catalog.lastInput?.coverUrl, `https://anime.example${localCover}`);
```

测试构造 `CrawlerResultService` 时显式传入 `siteUrl: 'https://anime.example'`，避免依赖测试进程环境。

- [ ] **Step 2: 运行测试并确认相对 URL 被现有 HTTP 校验拒绝。**

Run: `cmd /c pnpm exec tsx --test tests/contracts/worker-api-contract.test.ts tests/crawler/catalog-ingestion.test.ts`

Expected: FAIL。

- [ ] **Step 3: 实现严格的本地封面模式与规范化。**

```ts
const localCoverPathSchema = z.string().regex(
  /^\/api\/media\/covers\/[a-z0-9_-]+\/[a-f0-9]{64}\.(?:jpg|jpeg|png|webp)$/,
);
const coverUrlSchema = z.union([httpUrlSchema, localCoverPathSchema]);
```

`CrawlerResultService` 构造选项新增 `siteUrl?: string`，使用 `resolveSiteUrl`；提交前的 `normalizeCoverUrl` 仅将匹配本地封面模式的值转换为 `${siteUrl}${path}`，绝对 HTTP(S) URL 原样保留，其他值抛出 `RESULT_INVALID`。幂等请求体和目录写入共同使用转换后的完整 URL。

- [ ] **Step 4: 运行控制面定向测试确认通过。**

Run: `cmd /c pnpm exec tsx --test tests/contracts/worker-api-contract.test.ts tests/crawler/catalog-ingestion.test.ts tests/crawler/idempotency.test.ts`

Expected: PASS。

### Task 4: App 本地封面路由

**Files:**
- Create: `lib/server/media/local-cover-handler.ts`
- Create: `app/api/media/covers/[source]/[filename]/route.ts`
- Create: `tests/media/local-cover-handler.test.ts`

- [ ] **Step 1: 写入失败测试。**

```ts
const handler = createLocalCoverHandler({ rootDir: fixtureRoot });
const response = await handler({ source: 'ikun', filename: `${digest}.jpg` });
assert.equal(response.status, 200);
assert.equal(response.headers.get('content-type'), 'image/jpeg');
assert.equal(response.headers.get('cache-control'), 'public, max-age=31536000, immutable');
assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
assert.deepEqual(Buffer.from(await response.arrayBuffer()), fixtureBytes);
```

另写测试验证缺失文件、非法 source、非哈希文件名、编码路径穿越均返回 `404`。

- [ ] **Step 2: 运行测试并确认处理器尚不存在。**

Run: `cmd /c pnpm exec tsx --test tests/media/local-cover-handler.test.ts`

Expected: FAIL。

- [ ] **Step 3: 实现安全文件响应。**

```ts
const SOURCE_PATTERN = /^[a-z0-9_-]+$/;
const FILE_PATTERN = /^[a-f0-9]{64}\.(jpg|jpeg|png|webp)$/;
const MIME = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
```

处理器在正则通过后拼接固定两段路径，读取普通文件并返回不可变缓存头；所有非法路径和 `ENOENT` 返回 `404`。Route Handler 使用 `process.env.CRAWLER_COVER_DIR || '/data/covers'` 创建处理器，并保持 `runtime = 'nodejs'`。

- [ ] **Step 4: 运行路由测试与 TypeScript 检查。**

Run: `cmd /c pnpm exec tsx --test tests/media/local-cover-handler.test.ts`

Run: `cmd /c pnpm exec tsc --noEmit`

Expected: 两条命令均 PASS。

### Task 5: 部署说明与完整验证

**Files:**
- Modify: `DEPLOYMENT.md`
- Verify: 上述全部文件

- [ ] **Step 1: 补充服务器目录准备命令。**

```bash
mkdir -p ./covers ./crawler-worker-tmp
chown -R 10001:10001 ./covers ./crawler-worker-tmp
chmod 0755 ./covers ./crawler-worker-tmp
docker compose pull
docker compose up -d
```

说明 App 以只读方式使用同一目录，`SITE_URL` 必须是用户访问站点的公网 origin，且不要删除 `./covers`。

- [ ] **Step 2: 运行全部 TypeScript 测试。**

Run: `cmd /c pnpm run test:ts`

Expected: 0 failed。

- [ ] **Step 3: 运行全部 Python 测试。**

Run: `cmd /c pnpm run test:python`

Expected: 0 failed。

- [ ] **Step 4: 运行类型、旧栈和依赖锁检查。**

Run: `cmd /c pnpm exec tsc --noEmit`

Run: `cmd /c pnpm run check:legacy`

Run: `cmd /c pnpm run check:worker-requirements`

Expected: 所有命令退出码为 0。

- [ ] **Step 5: 检查差异并提交实现。**

Run: `git diff --check`

Run: `git status --short`

确认只包含本计划文件后提交并推送到当前分支。
