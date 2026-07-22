# MacCMS 线路标识、采集上限与封面开关 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 MacCMS 模板可独立配置上游线路选择和站内线路标识，支持不限条目采集，并让封面开关实际控制写入与上传。

**Architecture:** 配置层新增 `source.sourcePlayFrom` 作为上游匹配标识，保留 `source.playFrom` 为站内自定义线路标识。Worker 用前者选择 URL、用后者覆盖匹配线路的 `name`/`flag`；显式 `maxItems=0` 转换为无限上限。Runner 与上传管道共同保证关闭封面时不提交封面 URL。

**Tech Stack:** Next.js 15、TypeScript、Zod、Node test runner、Python 3 unittest。

---

## 文件结构

- `lib/server/crawler/domain/config.ts`：配置模式和边界校验。
- `app/admin/crawler/form-config.ts`：表单默认值、旧配置兼容和提交转换。
- `components/admin/crawler/profile-source-fields.tsx`：管理端控件与文案。
- `crawler_worker/sources/maccms.py`：线路选择、标识覆盖和条目上限。
- `crawler_worker/runtime/runner.py`：外链入库路径的媒体开关。
- `crawler_worker/media/upload_pipeline.py`：上传路径的媒体开关。
- `tests/crawler/*.test.ts`、`crawler_worker/tests/*.py`：跨层回归测试。

### Task 1: 配置模式与表单转换

**Files:**
- Modify: `tests/crawler/form-config-maccms.test.ts`
- Modify: `lib/server/crawler/domain/config.ts`
- Modify: `app/admin/crawler/form-config.ts`

- [ ] **Step 1: 写入失败测试。**

```ts
const config = parseCrawlerProfileConfig(JSON.parse(profileConfigFromForm(form({
  requiredSource: 'ikun', baseUrl: 'https://ikunzyapi.com/api.php/provide/vod/',
  typeIds: '37', sourcePlayFrom: 'ikm3u8', playFrom: 'ik', maxPages: '62',
  maxItems: '0', enableCover: '1', years: '2026', months: '7',
  qualityPriority: '1080', downloadConcurrency: '2', parseConcurrency: '2',
  pageConcurrency: '2', maxActiveJobs: '1',
}))));
assert.equal(config.source.sourcePlayFrom, 'ikm3u8');
assert.equal(config.source.playFrom, 'ik');
assert.equal(config.source.maxItems, 0);
assert.equal(config.media.enableCover, true);
```

- [ ] **Step 2: 运行测试并确认因新字段或 `0` 校验失败。**

Run: `cmd /c pnpm exec tsx --test tests/crawler/form-config-maccms.test.ts`

Expected: FAIL。

- [ ] **Step 3: 实现配置模式与表单转换。**

```ts
sourcePlayFrom: z.string().optional(),
playFrom: z.string().optional(),
maxItems: z.number().int().min(0).max(5000).optional(),
```

表单将 `sourcePlayFrom` 与 `playFrom` 分别写入；`maxItems >= 0` 时保留 `0`；MacCMS 的 `media.enableCover` 读取本次复选框。旧配置没有 `sourcePlayFrom` 时，将原 `playFrom` 显示为源标识；用户未填写站内标识并直接保存时保持旧字段形状。

- [ ] **Step 4: 运行测试确认新旧配置均通过。**

Run: `cmd /c pnpm exec tsx --test tests/crawler/form-config-maccms.test.ts`

Expected: PASS。

- [ ] **Step 5: 提交配置层改动。**

Run: `git add tests/crawler/form-config-maccms.test.ts lib/server/crawler/domain/config.ts app/admin/crawler/form-config.ts`

Run: `git commit -m "feat(crawler): separate maccms source and local line ids"`

### Task 2: 管理表单控件

**Files:**
- Modify: `tests/crawler/profile-ui-wiring.test.ts`
- Modify: `components/admin/crawler/profile-source-fields.tsx`

- [ ] **Step 1: 写入失败测试，锁定字段和文案。**

```ts
assert.match(sourceFields, /name="sourcePlayFrom"/);
assert.match(sourceFields, /name="playFrom"/);
assert.match(sourceFields, /0 = 本次已配置页数全部条目/);
assert.match(sourceFields, /name="enableCover"/);
assert.match(sourceFields, /下载并保存封面/);
```

- [ ] **Step 2: 运行测试并确认现有单字段界面失败。**

Run: `cmd /c pnpm exec tsx --test tests/crawler/profile-ui-wiring.test.ts`

Expected: FAIL。

- [ ] **Step 3: 实现两个线路输入、`min={0}` 和 MacCMS 封面复选框。**

```tsx
<input name="sourcePlayFrom" placeholder="例如 ikm3u8" />
<input name="playFrom" placeholder="例如 ik" />
<input name="maxItems" type="number" min={0} max={5000} />
<input type="checkbox" name="enableCover" value="1" />
```

标签分别使用“源播放标识（用于匹配资源站）”和“站内线路标识（播放器显示与解析）”；最大条目注明 `0` 只取消条数上限；封面文案为“下载并保存封面”。

- [ ] **Step 4: 运行测试确认通过。**

Run: `cmd /c pnpm exec tsx --test tests/crawler/profile-ui-wiring.test.ts`

Expected: PASS。

- [ ] **Step 5: 提交管理表单改动。**

Run: `git add tests/crawler/profile-ui-wiring.test.ts components/admin/crawler/profile-source-fields.tsx`

Run: `git commit -m "feat(admin): expose maccms line and cover controls"`

### Task 3: Worker 线路覆盖与无限条目

**Files:**
- Modify: `crawler_worker/tests/test_maccms.py`
- Modify: `crawler_worker/sources/maccms.py`

- [ ] **Step 1: 写入失败测试。**

```python
self.assertEqual(item.video_url, "https://cdn.example/e2.m3u8")
self.assertEqual(item.play_lines[0]["name"], "ik")
self.assertEqual(item.play_lines[0]["flag"], "ik")

snapshot = {
    "requiredSource": "ikun",
    "source": {
        "baseUrl": "https://api.example/provide/vod/",
        "typeIds": [37],
        "sourcePlayFrom": "ikm3u8",
        "playFrom": "ik",
        "maxPages": 2,
        "maxItems": 0,
        "filterJpKr": False,
    },
    "dateFilter": {"years": [2026], "months": [7]},
    "skipKeywords": [],
}
items = source.crawl(snapshot, workdir=Path(tempfile.mkdtemp()), should_stop=lambda: False)
self.assertEqual([item.source_id for item in items], ["4", "3", "2", "1"])
```

- [ ] **Step 2: 运行新测试并确认失败。**

Run: `python -m unittest crawler_worker.tests.test_maccms -v`

Expected: FAIL，现有 Worker 不识别 `sourcePlayFrom`，且 `0` 回退为 100。

- [ ] **Step 3: 实现线路匹配与无限上限。**

```python
max_items = None if int(cfg["maxItems"]) == 0 else max(1, min(5000, int(cfg["maxItems"])))
if max_items is not None and len(results) >= max_items:
    break
```

`_resolve_config` 通过 `is not None` 保留 `0`，并将旧 `source.playFrom` 回退为上游匹配值。`play_lines_payload` 仅对匹配 `sourcePlayFrom` 的线路用自定义 `playFrom` 同时覆盖 `name` 和 `flag`，其他线路保持原值。

- [ ] **Step 4: 运行 MacCMS 测试确认通过。**

Run: `python -m unittest crawler_worker.tests.test_maccms -v`

Expected: PASS。

- [ ] **Step 5: 提交 Worker 改动。**

Run: `git add crawler_worker/tests/test_maccms.py crawler_worker/sources/maccms.py`

Run: `git commit -m "feat(worker): honor local maccms line ids and unlimited limits"`

### Task 4: 封面禁用的写入与上传防线

**Files:**
- Modify: `crawler_worker/tests/test_upload_pipeline.py`
- Modify: `crawler_worker/runtime/runner.py`
- Modify: `crawler_worker/media/upload_pipeline.py`

- [ ] **Step 1: 修改现有封面测试，要求关闭后 URL 为 `None`。**

```python
# 将现有测试重命名为 test_disabled_cover_discards_cover_url，
# 保留原有 publish_item_media 调用，仅替换调用后的封面断言。
self.assertIsNone(out.item.cover_url)
self.assertEqual(client.media_reserve.call_count, 1)
```

- [ ] **Step 2: 运行测试并确认当前仍保留原始 URL。**

Run: `python -m unittest crawler_worker.tests.test_upload_pipeline.UploadPipelineTests.test_disabled_cover_discards_cover_url -v`

Expected: FAIL。

- [ ] **Step 3: 在 Runner 和上传管道剥离封面。**

```python
if not bool(media_options.get("enableCover", True)):
    item = replace(item, cover_url=None)

cover_url = item.cover_url if enable_cover else None
```

Runner 处理 URL 直入库路径；上传管道作为直接调用的防御层。两者均在下载或提交前执行。

- [ ] **Step 4: 运行上传与 Runner 回归测试。**

Run: `python -m unittest crawler_worker.tests.test_upload_pipeline crawler_worker.tests.test_runner -v`

Expected: PASS。

- [ ] **Step 5: 提交封面控制改动。**

Run: `git add crawler_worker/tests/test_upload_pipeline.py crawler_worker/runtime/runner.py crawler_worker/media/upload_pipeline.py`

Run: `git commit -m "fix(worker): honor disabled cover media option"`

### Task 5: 跨层验证与计划归档

**Files:**
- Verify: 所有上述文件
- Commit: `docs/superpowers/plans/2026-07-22-maccms-line-id-limits-cover.md`

- [ ] **Step 1: 运行 TypeScript 定向回归。**

Run: `cmd /c pnpm exec tsx --test tests/crawler/form-config-maccms.test.ts tests/crawler/profile-ui-wiring.test.ts`

Expected: PASS。

- [ ] **Step 2: 运行 Python 定向回归。**

Run: `python -m unittest crawler_worker.tests.test_maccms crawler_worker.tests.test_upload_pipeline crawler_worker.tests.test_runner -v`

Expected: PASS。

- [ ] **Step 3: 检查格式和工作区。**

Run: `git diff --check`

Expected: 无空白错误。

- [ ] **Step 4: 提交计划文档。**

Run: `git add docs/superpowers/plans/2026-07-22-maccms-line-id-limits-cover.md`

Run: `git commit -m "docs: plan maccms profile controls"`
