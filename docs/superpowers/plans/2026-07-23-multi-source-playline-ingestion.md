# 多资源站主资料与补充线路采集实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 MacCMS 模板可选择完整采集或仅补充线路，并把多个资源站线路安全合并到同一部 `anime_works`，同时始终保留主资料源的详情、封面和标签。

**Architecture:** `ingestionMode` 保存在不可变任务快照中，Worker 只用它减少封面与资料处理，控制面在事务内从 Job 快照重新解析真实模式。MariaDB 入库适配器先按来源映射查找作品，首次补充时按规范化标题和年份唯一匹配，再使用纯函数按线路 `flag/name` 合并 JSON；补充模式不执行任何资料或标签更新。

**Tech Stack:** Next.js 15、TypeScript、Zod、MariaDB/mysql2、Python 3.12、Node test runner、unittest

---

## 文件职责

- `lib/server/crawler/domain/config.ts`：模板配置 schema 和模式解析。
- `app/admin/crawler/form-config.ts`：表单与配置快照双向转换。
- `components/admin/crawler/profile-source-fields.tsx`：主资料源复选框。
- `lib/server/crawler/domain/work-ingestion.ts`：标题规范化、候选匹配和线路合并纯函数。
- `lib/server/crawler/ports/catalog-ingestion-port.ts`：完整/跳过入库结果契约。
- `lib/server/crawler/application/crawler-result-service.ts`：从 Job 快照取得可信模式并落 Job Item 状态。
- `lib/server/infrastructure/database/mariadb-crawler-catalog-ingestion.ts`：来源绑定、唯一匹配和事务更新。
- `crawler_worker/runtime/runner.py`：补充模式关闭封面保存并裁剪非匹配资料。
- `app/admin/crawler/profiles/page.tsx`、`app/admin/crawler/jobs/page.tsx`：显示模板模式。

### Task 1: 模板模式配置与表单

**Files:**
- Modify: `lib/server/crawler/domain/config.ts`
- Modify: `app/admin/crawler/form-config.ts`
- Modify: `components/admin/crawler/profile-source-fields.tsx`
- Test: `tests/crawler/form-config-maccms.test.ts`
- Test: `tests/crawler/profile-ui-wiring.test.ts`

- [ ] **Step 1: 写失败测试**

在 `form-config-maccms.test.ts` 增加：

```ts
test('MacCMS profile checkbox selects full or playback-only ingestion', () => {
  const full = parseCrawlerProfileConfig(JSON.parse(profileConfigFromForm(form({
    requiredSource: 'ikun',
    baseUrl: 'https://ikunzyapi.com/api.php/provide/vod/',
    years: '2026',
    months: '7',
    qualityPriority: '1080',
    collectMetadata: '1',
  }))));
  const lines = parseCrawlerProfileConfig(JSON.parse(profileConfigFromForm(form({
    requiredSource: 'hongniu',
    baseUrl: 'https://www.hongniuzy2.com/api.php/provide/vod/',
    years: '2026',
    months: '7',
    qualityPriority: '1080',
  }))));

  assert.equal(full.ingestionMode, 'full');
  assert.equal(lines.ingestionMode, 'playback_only');
});
```

同时断言旧配置的 `profileFormDefaults(...).collectMetadata === true`，Hanime 表单转换不会生成 `playback_only`，UI 源码包含 `name="collectMetadata"` 和两种行为说明。

- [ ] **Step 2: 运行测试确认 RED**

Run: `cmd /c pnpm exec tsx --test tests/crawler/form-config-maccms.test.ts tests/crawler/profile-ui-wiring.test.ts`

Expected: FAIL，提示 `ingestionMode`、`collectMetadata` 或界面字段不存在。

- [ ] **Step 3: 最小实现配置模式**

在配置 schema 增加：

```ts
ingestionMode: z.enum(['full', 'playback_only']).optional(),
```

并导出可信默认解析：

```ts
export type CrawlerIngestionMode = 'full' | 'playback_only';

export function resolveCrawlerIngestionMode(
  config: Pick<CrawlerProfileConfig, 'requiredSource' | 'ingestionMode'>,
): CrawlerIngestionMode {
  if (config.requiredSource === 'hanime') return 'full';
  return config.ingestionMode ?? 'full';
}
```

表单默认值增加 `collectMetadata`。新 MacCMS 模板根据复选框写入 `full` 或 `playback_only`；编辑缺少字段的旧模板且仍勾选时保留字段缺失，避免无意义快照变更；Hanime 不写该字段。

- [ ] **Step 4: 增加复选框**

在 MacCMS 封面选项附近增加：

```tsx
<label className="field-check text-[12px]">
  <input
    type="checkbox"
    name="collectMetadata"
    value="1"
    defaultChecked={defaults?.collectMetadata ?? true}
  />
  采集详情资料（主资料源）
</label>
<p className="font-meta text-[11px] text-[#787774]">
  勾选时更新详情、封面、标签和当前线路；未勾选时只向已有作品补充当前线路。
</p>
```

- [ ] **Step 5: 运行测试确认 GREEN 并提交**

Run: `cmd /c pnpm exec tsx --test tests/crawler/form-config-maccms.test.ts tests/crawler/profile-ui-wiring.test.ts`

Expected: PASS。

Commit: `feat(crawler): add profile ingestion mode`

### Task 2: 标题匹配与线路合并纯函数

**Files:**
- Create: `lib/server/crawler/domain/work-ingestion.ts`
- Create: `tests/crawler/work-ingestion-domain.test.ts`

- [ ] **Step 1: 写失败测试**

覆盖以下行为：

```ts
test('normalizes title variants and splits aliases', () => {
  assert.deepEqual(
    normalizedWorkTitles({ title: ' 東京 猫猫！ ', aliases: 'Tokyo Cats／東京猫猫' }),
    ['東京猫猫', 'tokyocats'],
  );
});

test('matches one work by normalized title and compatible year', () => {
  const result = matchUniqueWork(
    { title: '東京猫猫', releaseYear: 2026 },
    [{ id: 7, title: '東京 猫猫!', titleEnglish: null, titleJapanese: null, aliases: null, releaseYear: 2026, playLinesJson: null }],
  );
  assert.deepEqual(result, { kind: 'matched', candidate: result.kind === 'matched' ? result.candidate : null });
});

test('merges one provider line without deleting other providers', () => {
  assert.deepEqual(
    mergeWorkPlayLines(
      JSON.stringify([
        { name: 'ik', flag: 'ik', episodes: [{ name: '第1集', url: 'https://ik/1.m3u8' }] },
        { name: 'hongniu', flag: 'hongniu', episodes: [{ name: '第1集', url: 'https://old/1.m3u8' }] },
      ]),
      [{ name: 'hongniu', flag: 'hongniu', episodes: [{ name: '第1集', url: 'https://new/1.m3u8' }] }],
    ),
    [
      { name: 'ik', flag: 'ik', episodes: [{ name: '第1集', url: 'https://ik/1.m3u8' }] },
      { name: 'hongniu', flag: 'hongniu', episodes: [{ name: '第1集', url: 'https://new/1.m3u8' }] },
    ],
  );
});
```

另测：无匹配、多匹配、年份冲突、损坏 JSON、空线路、无 `flag` 时按 `name`。

- [ ] **Step 2: 运行测试确认 RED**

Run: `cmd /c pnpm exec tsx --test tests/crawler/work-ingestion-domain.test.ts`

Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现纯函数**

导出：

```ts
export function normalizedWorkTitles(input: WorkTitleFields): string[];
export function matchUniqueWork(input: WorkTitleFields, candidates: readonly WorkCandidate[]): WorkMatch;
export function mergeWorkPlayLines(existingJson: string | null, incoming: readonly WorkPlayLine[]): WorkPlayLine[];
```

标题使用 `normalize('NFKC').toLocaleLowerCase('und').replace(/[\p{P}\p{Z}\s]+/gu, '')`。线路键使用 `flag?.trim() || name.trim()` 的 NFKC 小写值，已存在键原位替换，新键追加。

- [ ] **Step 4: 运行测试确认 GREEN 并提交**

Run: `cmd /c pnpm exec tsx --test tests/crawler/work-ingestion-domain.test.ts`

Expected: PASS。

Commit: `feat(crawler): add work matching and line merge rules`

### Task 3: 服务端从任务快照授权入库模式

**Files:**
- Modify: `lib/server/crawler/ports/catalog-ingestion-port.ts`
- Modify: `lib/server/crawler/application/crawler-result-service.ts`
- Test: `tests/crawler/catalog-ingestion.test.ts`
- Test: `tests/contracts/worker-api-contract.test.ts`

- [ ] **Step 1: 写失败测试**

创建两个带不同 `configSnapshotJson` 的运行中任务，断言目录端口分别收到 `full` 与 `playback_only`，并断言 Worker 提交正文没有决定模式的字段。增加目录返回跳过结果时 Job Item 变为 `skipped` 的测试：

```ts
return {
  kind: 'skipped' as const,
  code: 'CATALOG_MATCH_NOT_FOUND' as const,
  message: '没有唯一匹配的主资料作品',
};
```

- [ ] **Step 2: 运行测试确认 RED**

Run: `cmd /c pnpm exec tsx --test tests/crawler/catalog-ingestion.test.ts tests/contracts/worker-api-contract.test.ts`

Expected: FAIL，目录输入没有 `ingestionMode`，结果不能表达跳过。

- [ ] **Step 3: 扩展端口契约**

```ts
export type CatalogIngestionOutcome =
  | ({ kind: 'upserted' } & CatalogIngestionResult)
  | {
      kind: 'skipped';
      code: 'CATALOG_MATCH_NOT_FOUND' | 'CATALOG_MATCH_AMBIGUOUS' | 'RESULT_INVALID';
      message: string;
    };
```

`CatalogIngestionInput` 增加 `ingestionMode: CrawlerIngestionMode`，端口返回 `CatalogIngestionOutcome`。

- [ ] **Step 4: 从 Job 快照解析模式**

在租约验证后的同一事务内调用 `repos.jobs.get(input.jobId)`，安全解析 `configSnapshotJson`。只有明确值 `playback_only` 才使用补充模式；Hanime 或非法/缺失值使用 `full`。

目录结果为 `skipped` 时，覆盖待写 Job Item 的状态和错误字段：

```ts
status: outcome.kind === 'skipped' ? 'skipped' : input.status,
animeId: outcome.kind === 'upserted' ? outcome.animeId : null,
errorCode: outcome.kind === 'skipped' ? outcome.code : input.errorCode,
errorMessage: outcome.kind === 'skipped' ? outcome.message : input.errorMessage,
```

- [ ] **Step 5: 运行测试确认 GREEN 并提交**

Run: `cmd /c pnpm exec tsx --test tests/crawler/catalog-ingestion.test.ts tests/contracts/worker-api-contract.test.ts`

Expected: PASS。

Commit: `feat(crawler): authorize ingestion mode from job snapshots`

### Task 4: MariaDB 主资料更新与补充线路原子合并

**Files:**
- Modify: `lib/server/infrastructure/database/mariadb-crawler-catalog-ingestion.ts`
- Modify: `tests/crawler/mariadb-works-ingestion.test.ts`
- Modify: `tests/crawler/mariadb-catalog-ingestion.test.ts`

- [ ] **Step 1: 写失败测试**

增加基于伪事务连接的 SQL 行为测试：

1. `full` 更新读取已有 `play_lines_json`，更新 iKun 线路并保留红牛线路。
2. `playback_only` 无来源映射时唯一标题/年份匹配 work 21，插入 `anime_work_sources(work_id=21, source=hongniu)`。
3. 补充路径只执行 `UPDATE anime_works SET play_lines_json = ?, updated_at = UTC_TIMESTAMP()`，不包含标题、封面、标签或 `stream_url`。
4. 无匹配和多匹配返回对应 `skipped`，且不插入作品、来源映射或标签。
5. 已有来源映射直接更新其线路。

- [ ] **Step 2: 运行测试确认 RED**

Run: `cmd /c pnpm exec tsx --test tests/crawler/mariadb-works-ingestion.test.ts tests/crawler/mariadb-catalog-ingestion.test.ts`

Expected: FAIL，当前代码会创建新作品或覆盖完整线路 JSON。

- [ ] **Step 3: 实现补充线路路径**

在确认本次 `playLines` 非空后：

```ts
if (input.ingestionMode === 'playback_only') {
  const mapped = await findWorkMapping(...);
  const target = mapped || await matchUnmappedWork(...);
  if (target.kind === 'skipped') return target;
  if (!mapped) await bindWorkSource(...);
  await mergeOnlyWorkLines(...);
  return { kind: 'upserted', animeId: target.workId, workId: target.workId, created: false, target: 'anime_works' };
}
```

候选查询锁定活跃作品；有来源年份时使用 `(release_year = ? OR release_year IS NULL)`，无年份时读取活跃候选，然后交给 Task 2 纯函数判定唯一结果。

- [ ] **Step 4: 让完整路径也合并线路**

创建作品时直接保存本次线路；更新作品前锁定并读取原 `play_lines_json`，用 `mergeWorkPlayLines` 生成新 JSON。完整路径继续更新 `stream_url`、资料和标签，补充路径不调用这些函数。

所有成功返回增加 `kind: 'upserted'`；Hanime 路径保持当前业务字段行为。

- [ ] **Step 5: 运行测试确认 GREEN 并提交**

Run: `cmd /c pnpm exec tsx --test tests/crawler/mariadb-works-ingestion.test.ts tests/crawler/mariadb-catalog-ingestion.test.ts tests/crawler/catalog-ingestion.test.ts`

Expected: PASS。

Commit: `feat(crawler): merge supplemental source play lines`

### Task 5: Worker 补充模式跳过封面与非必要资料

**Files:**
- Modify: `crawler_worker/runtime/runner.py`
- Modify: `crawler_worker/tests/test_runner.py`

- [ ] **Step 1: 写失败测试**

复用 MacCMS fixture 创建 `ingestionMode=playback_only` 的 Job，注入会在调用时失败的 `save_cover_locally`，断言提交仍包含标题、年份、视频地址和线路，但以下字段为空：

```python
self.assertIsNone(commit["cover_url"])
self.assertIsNone(commit["description"])
self.assertEqual(commit["tags"], ())
self.assertEqual(commit["fanart_urls"], ())
```

同时保留英文名、日文名和别名用于匹配。

- [ ] **Step 2: 运行测试确认 RED**

Run: `cmd /c pnpm run test:python -- --pattern test_runner.py`

若脚本不支持 pattern，运行：`cmd /c pnpm run test:python`

Expected: FAIL，当前补充模式仍会保留资料或尝试保存封面。

- [ ] **Step 3: 实现 Worker 裁剪**

解析：

```python
playback_only = snapshot.get("ingestionMode") == "playback_only"
```

在任何封面保存或媒体上传前把补充条目替换为最小提交模型，保留匹配标题字段、`release_year`、`video_url` 和 `play_lines`，清空封面、剧照、简介、标签、演职员、地区、语言和更新时间。`playback_only` 不进入本地封面保存分支。

- [ ] **Step 4: 运行测试确认 GREEN 并提交**

Run: `cmd /c pnpm run test:python`

Expected: 现有 61 个测试加新增测试全部 PASS。

Commit: `feat(worker): trim playback-only crawl results`

### Task 6: 后台模式可见性与完整回归

**Files:**
- Modify: `app/admin/crawler/profiles/page.tsx`
- Modify: `app/admin/crawler/jobs/page.tsx`
- Modify: `tests/crawler/profile-ui-wiring.test.ts`
- Modify: `tests/crawler/admin-actions.test.ts`（仅在任务页面行为测试需要时）

- [ ] **Step 1: 写失败测试**

断言模板列表使用 `resolveCrawlerIngestionMode` 显示“主资料”或“仅线路”，任务列表从对应版本快照显示相同模式。

- [ ] **Step 2: 运行测试确认 RED**

Run: `cmd /c pnpm exec tsx --test tests/crawler/profile-ui-wiring.test.ts tests/crawler/admin-actions.test.ts`

Expected: FAIL，页面尚未展示模式。

- [ ] **Step 3: 实现紧凑状态文字**

模板元信息追加：

```tsx
{mode === 'full' ? ' · 主资料' : ' · 仅线路'}
```

任务启动模板下拉项和历史任务行使用同一中文映射，不增加卡片或说明面板。

- [ ] **Step 4: 运行功能测试**

Run: `cmd /c pnpm exec tsx --test tests/crawler/profile-ui-wiring.test.ts tests/crawler/admin-actions.test.ts tests/crawler/form-config-maccms.test.ts tests/crawler/work-ingestion-domain.test.ts tests/crawler/catalog-ingestion.test.ts tests/crawler/mariadb-works-ingestion.test.ts`

Expected: PASS。

- [ ] **Step 5: 完整验证**

Run:

```bash
cmd /c pnpm run test:ts
cmd /c pnpm run test:python
cmd /c pnpm exec tsc --noEmit
cmd /c pnpm run check:legacy
cmd /c pnpm run check:worker-requirements
git diff --check
```

Expected: 全部退出码 0；只有显式可选的 Docker/MariaDB 测试跳过。按用户要求不在本地运行 Docker。

- [ ] **Step 6: 最终审阅并提交**

确认没有数据库迁移、没有 Worker 模式请求字段、没有补充路径资料更新 SQL，并提交：

Commit: `feat(crawler): expose multi-source ingestion modes`
