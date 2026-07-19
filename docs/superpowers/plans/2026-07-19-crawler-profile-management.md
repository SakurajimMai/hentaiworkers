# Crawler Profile Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为爬虫模板增加完整回填编辑和失败安全的软删除，同时保留历史任务快照并停用关联计划任务。

**Architecture:** 把现有新建表单抽成可接收初始配置的共享表单；配置服务增加显式编辑、查询和禁用用例。软删除先在调度事务中批量停用关联计划，再禁用模板；所有新启动路径在服务端校验模板启用状态。

**Tech Stack:** Next.js 15 Server Components/Server Actions、React 19、TypeScript、Zod、MariaDB/mysql2、Node test runner

**Repository Constraint:** 不自动 commit；每个任务用 `git diff --check` 和聚焦测试作为检查点。

---

### Task 1: 模板编辑默认值映射

**Files:**
- Modify: `app/admin/crawler/form-config.ts`
- Modify: `tests/crawler/form-config-maccms.test.ts`

- [ ] **Step 1: 写失败测试，覆盖 MacCMS 与 Hanime 全字段回填**

扩展导入：

```ts
import {
  profileConfigFromForm,
  profileFormDefaults,
} from '../../app/admin/crawler/form-config';
```

增加测试：

```ts
test('profileFormDefaults 完整映射已保存配置', () => {
  const config = parseCrawlerProfileConfig({
    schemaVersion: 1,
    requiredSource: 'ikun',
    source: {
      baseUrl: 'https://ikunzyapi.com/api.php/provide/vod/',
      provider: 'ikun',
      typeIds: [37, 59],
      playFrom: 'ikm3u8',
      maxPages: 6,
      maxItems: 120,
      hours: 48,
      pageOrder: 'from_end',
      autoDetectTypes: false,
      filterJpKr: true,
    },
    dateFilter: { years: [2025, 2026], months: [6, 7] },
    qualityPriority: ['1080', '720'],
    skipKeywords: ['preview', '中字後補'],
    concurrency: { download: 3, parse: 4, page: 5 },
    continueOnError: false,
    maxActiveJobs: 2,
  });

  const defaults = profileFormDefaults('日本动漫', config);
  assert.equal(defaults.name, '日本动漫');
  assert.equal(defaults.requiredSource, 'ikun');
  assert.equal(defaults.typeIds, '37,59');
  assert.equal(defaults.playFrom, 'ikm3u8');
  assert.equal(defaults.years, '2025,2026');
  assert.equal(defaults.months, '6,7');
  assert.equal(defaults.pageConcurrency, 5);
  assert.equal(defaults.filterJpKr, true);
  assert.equal(defaults.continueOnError, false);
});
```

- [ ] **Step 2: 运行测试并确认 RED**

Run: `cmd /c node_modules\.bin\tsx.cmd --test tests\crawler\form-config-maccms.test.ts`

Expected: FAIL，`profileFormDefaults` 尚未导出。

- [ ] **Step 3: 实现完整默认值映射**

在 `form-config.ts` 增加类型导入和函数：

```ts
import type { CrawlerProfileConfig } from '@/lib/server/crawler/domain/config';

export function profileFormDefaults(name: string, config: CrawlerProfileConfig) {
  return {
    name,
    requiredSource: config.requiredSource ?? 'hanime',
    baseUrl: config.source.baseUrl,
    typeIds: config.source.typeIds?.join(',') ?? '',
    playFrom: config.source.playFrom ?? '',
    hours: config.source.hours ?? '',
    type: config.source.type ?? '',
    genre: config.source.genre ?? '',
    sort: config.source.sort ?? '',
    maxPages: config.source.maxPages ?? 3,
    maxItems: config.source.maxItems ?? config.maxItems ?? '',
    pageOrder: config.source.pageOrder ?? 'reverse',
    filterJpKr: config.source.filterJpKr ?? false,
    years: config.dateFilter.years.join(','),
    months: config.dateFilter.months.join(','),
    qualityPriority: config.qualityPriority.join(','),
    skipKeywords: config.skipKeywords.join(','),
    downloadConcurrency: config.concurrency.download,
    parseConcurrency: config.concurrency.parse,
    pageConcurrency: config.concurrency.page ?? config.concurrency.parse,
    maxActiveJobs: config.maxActiveJobs,
    continueOnError: config.continueOnError,
    skipExisting: config.skipExisting ?? false,
    requestDelaySeconds: config.requestDelaySeconds ?? 1,
    enableCover: config.media?.enableCover ?? true,
    enableFanart: config.media?.enableFanart ?? true,
    maxFanartImages: config.media?.maxFanartImages ?? 50,
    storageDriver: config.storageDriver ?? 'external',
  } as const;
}

export type ProfileFormDefaults = ReturnType<typeof profileFormDefaults>;
```

- [ ] **Step 4: 运行测试并确认 GREEN**

Run: `cmd /c node_modules\.bin\tsx.cmd --test tests\crawler\form-config-maccms.test.ts`

Expected: 全部 PASS。

### Task 2: 配置服务的查询、编辑和软删除端口

**Files:**
- Modify: `lib/server/crawler/ports/config-repository.ts`
- Modify: `lib/server/crawler/application/crawler-config-service.ts`
- Modify: `lib/server/crawler/testing/in-memory-config-repos.ts`
- Modify: `lib/server/infrastructure/database/mariadb-crawler-repositories.ts`
- Modify: `tests/crawler/config-service.test.ts`

- [ ] **Step 1: 写失败测试，锁定名称更新、版本递增、列表隐藏和幂等禁用**

在 `config-service.test.ts` 增加：

```ts
test('crawler profile edit updates name and soft delete hides it idempotently', async () => {
  const repo = new InMemoryCrawlerConfigRepository();
  const service = new CrawlerConfigService(repo);
  const v1 = await service.createProfile('旧名称', sampleProfile());

  const v2 = await service.editProfile(v1.profileId, '新名称', {
    ...sampleProfile(),
    concurrency: { download: 5, parse: 3 },
  });
  assert.equal(v2.version, 2);
  assert.equal((await service.getProfile(v1.profileId))?.name, '新名称');

  await service.disableProfile(v1.profileId);
  await service.disableProfile(v1.profileId);
  assert.equal((await service.listProfiles()).length, 0);
  assert.ok(await service.getVersion(v1.id));
});
```

- [ ] **Step 2: 运行测试并确认 RED**

Run: `cmd /c node_modules\.bin\tsx.cmd --test tests\crawler\config-service.test.ts`

Expected: FAIL，缺少 `editProfile`、`getProfile` 和 `disableProfile`。

- [ ] **Step 3: 扩展仓储接口**

在 `CrawlerConfigRepository` 增加：

```ts
getProfile(profileId: number): Promise<ProfileSummary | null>;
updateProfile(
  profileId: number,
  name: string,
  config: CrawlerProfileConfig,
): Promise<ProfileVersionRecord>;
disableProfile(profileId: number): Promise<void>;
```

保留 `getProfileVersion` 和 `listProfileVersions` 供历史读取；删除旧的 `appendProfileVersion`，并更新所有实现和调用点。

- [ ] **Step 4: 实现应用服务校验**

```ts
async editProfile(profileId: number, name: string, configInput: unknown) {
  if (!Number.isSafeInteger(profileId) || profileId <= 0) {
    throw new AppError('RESULT_INVALID', '无效模板 ID', 400);
  }
  const trimmed = name.trim();
  if (!trimmed) throw new AppError('RESULT_INVALID', '模板名称必填', 400);
  return this.repository.updateProfile(
    profileId,
    trimmed,
    parseCrawlerProfileConfig(configInput),
  );
}

getProfile(profileId: number) {
  return this.repository.getProfile(profileId);
}

async disableProfile(profileId: number) {
  if (!Number.isSafeInteger(profileId) || profileId <= 0) {
    throw new AppError('RESULT_INVALID', '无效模板 ID', 400);
  }
  await this.repository.disableProfile(profileId);
}
```

`listProfiles()` 必须只返回启用模板；`getProfile()` 仍返回已禁用模板供启用状态校验。

- [ ] **Step 5: 实现内存仓储**

把 profile 元数据改为保存 `{ name, isEnabled }`，并实现：

```ts
async getProfile(profileId: number) {
  const profile = this.profiles.get(profileId);
  return profile
    ? {
        id: profileId,
        name: profile.name,
        currentVersionId: this.profileCurrent.get(profileId) ?? null,
        isEnabled: profile.isEnabled,
      }
    : null;
}

async updateProfile(profileId: number, name: string, config: CrawlerProfileConfig) {
  const profile = this.profiles.get(profileId);
  if (!profile || !profile.isEnabled) {
    throw new AppError('RESULT_INVALID', '模板不存在', 404);
  }
  this.profiles.set(profileId, { ...profile, name });
  return this.appendVersion(profileId, config);
}

async disableProfile(profileId: number) {
  const profile = this.profiles.get(profileId);
  if (!profile) throw new AppError('RESULT_INVALID', '模板不存在', 404);
  this.profiles.set(profileId, { ...profile, isEnabled: false });
}
```

- [ ] **Step 6: 实现 MariaDB 仓储**

`listProfiles` SQL 增加 `WHERE is_enabled = 1`。新增 `getProfile` 查询所有状态，并把更新实现为单条 SQL：

```sql
UPDATE crawler_profiles
SET name = ?, version = version + 1, schema_version = ?,
    config_json = ?, updated_at = UTC_TIMESTAMP()
WHERE id = ? AND is_enabled = 1
```

禁用流程先查询存在性，再执行幂等更新：

```sql
UPDATE crawler_profiles
SET is_enabled = 0, updated_at = UTC_TIMESTAMP()
WHERE id = ? AND is_enabled = 1
```

不存在时抛出 `RESULT_INVALID / 模板不存在 / 404`；已禁用时成功返回。

- [ ] **Step 7: 运行测试并确认 GREEN**

Run: `cmd /c node_modules\.bin\tsx.cmd --test tests\crawler\config-service.test.ts`

Expected: 全部 PASS。

### Task 3: 关联计划停用和新任务启用门禁

**Files:**
- Modify: `lib/server/crawler/ports/crawler-unit-of-work.ts`
- Modify: `lib/server/crawler/testing/in-memory-crawler-uow.ts`
- Modify: `lib/server/infrastructure/database/mariadb-crawler-repositories.ts`
- Modify: `lib/server/crawler/application/crawler-schedule-service.ts`
- Modify: `lib/server/crawler/application/admin-crawler-service.ts`
- Modify: `tests/crawler/admin-actions.test.ts`

- [ ] **Step 1: 写失败测试，证明删除会停用计划并阻止再次启动**

在 `admin-actions.test.ts` 增加 `adminDeleteProfile` 导入和测试：

```ts
test('soft deleting a profile disables schedules and rejects new starts', async () => {
  const deps = createInMemoryAdminDeps();
  const crawler = createAdminCrawlerService(deps);
  const ctx = makeCtxFromCrawler(crawler);
  const version = await adminCreateProfile(ctx, {
    name: 'to-delete',
    configJson: JSON.stringify(validProfile),
  });
  await adminSaveSchedule(ctx, {
    profileId: version.profileId,
    profileVersionId: version.id,
    name: 'hourly',
    kind: 'interval',
    intervalSeconds: 3600,
    timezone: 'Asia/Shanghai',
    overlapPolicy: 'skip',
    misfirePolicy: 'latest_only',
    maxActiveJobs: 1,
    catchUpLimit: 3,
    configSnapshotJson: JSON.stringify(validProfile),
  });

  await adminDeleteProfile(ctx, version.profileId);
  const enabledSchedules = await deps.uow.runInTransaction((repos) =>
    repos.schedules.listEnabled(),
  );
  assert.equal(enabledSchedules.length, 0);
  await assert.rejects(
    () => crawler.startProfileJob(version.id),
    (error: unknown) => error instanceof AppError && error.status === 404,
  );
  assert.ok(await crawler.getProfileVersion(version.id));
});
```

若测试文件没有 `makeCtxFromCrawler`，新增一个接收 `AdminCrawlerService` 的测试 helper，复用现有管理员对象。

- [ ] **Step 2: 运行测试并确认 RED**

Run: `cmd /c node_modules\.bin\tsx.cmd --test tests\crawler\admin-actions.test.ts`

Expected: FAIL，缺少删除动作和批量停用能力。

- [ ] **Step 3: 扩展计划仓储端口**

```ts
disableByProfileId(profileId: number): Promise<number>;
```

内存实现遍历计划，匹配 `profileId` 且 `isEnabled` 时写回 `isEnabled: false` 并返回数量。MariaDB 实现使用：

```sql
UPDATE crawler_schedules
SET is_enabled = 0, updated_at = UTC_TIMESTAMP()
WHERE profile_id = ? AND is_enabled = 1
```

- [ ] **Step 4: 在计划服务中提供事务化批量停用**

```ts
async disableByProfileId(profileId: number): Promise<number> {
  if (!Number.isSafeInteger(profileId) || profileId <= 0) {
    throw new AppError('RESULT_INVALID', '无效模板 ID', 400);
  }
  return this.uow.runInTransaction((repos) =>
    repos.schedules.disableByProfileId(profileId),
  );
}
```

- [ ] **Step 5: 管理服务按失败安全顺序执行软删除**

```ts
async deleteProfile(profileId: number): Promise<void> {
  await this.deps.schedules.disableByProfileId(profileId);
  await this.deps.profiles.disableProfile(profileId);
}
```

同时新增 `updateProfile`、`getProfile` 门面。`resolveProfileSnapshot` 在读取 version 后执行：

```ts
const profile = await this.deps.profiles.getProfile(version.profileId);
if (!profile?.isEnabled) {
  throw new AppError('RESULT_INVALID', '模板不存在或已删除', 404);
}
```

- [ ] **Step 6: 新增授权边界动作**

在 `admin-crawler-actions.ts` 增加：

```ts
export async function adminUpdateProfile(
  ctx: AdminActionContext,
  input: { profileId: number; name: string; configJson: string },
) {
  await ctx.identity.requireAdmin();
  return ctx.crawler.updateProfile(
    input.profileId,
    input.name,
    parseJson(input.configJson),
  );
}

export async function adminDeleteProfile(ctx: AdminActionContext, profileId: number) {
  await ctx.identity.requireAdmin();
  return ctx.crawler.deleteProfile(profileId);
}
```

使用文件现有 JSON 解析 helper；不要复制不一致的解析逻辑。

- [ ] **Step 7: 运行测试并确认 GREEN**

Run: `cmd /c node_modules\.bin\tsx.cmd --test tests\crawler\admin-actions.test.ts tests\crawler\config-service.test.ts`

Expected: 全部 PASS。

### Task 4: 共享模板表单和完整回填

**Files:**
- Create: `components/admin/crawler/profile-form.tsx`
- Modify: `components/admin/crawler/profile-source-fields.tsx`
- Modify: `app/admin/crawler/profiles/page.tsx`
- Modify: `tests/crawler/form-config-maccms.test.ts`

- [ ] **Step 1: 写失败测试，证明编辑默认值可往返配置 JSON**

构造一个带 typeIds、来源策略、日期、并发和媒体设置的配置，调用 `profileFormDefaults` 后把所有字符串、数字和真值 checkbox 放入 `FormData`，再执行 `profileConfigFromForm`。断言 `requiredSource`、`source`、`dateFilter`、`concurrency`、`continueOnError`、`maxActiveJobs`、`skipExisting`、`media` 和 `storageDriver` 与原配置一致。

- [ ] **Step 2: 运行测试并确认 RED**

Run: `cmd /c node_modules\.bin\tsx.cmd --test tests\crawler\form-config-maccms.test.ts`

Expected: 若有字段未映射则 FAIL，并明确缺失字段。

- [ ] **Step 3: 扩展来源字段组件 props**

```tsx
type ProfileSourceFieldsProps = Readonly<{
  defaultYear: number;
  defaults?: ProfileFormDefaults;
}>;
```

客户端组件通过 `import type { ProfileFormDefaults } from '@/app/admin/crawler/form-config'` 引入类型，不运行或打包服务端默认值映射函数。

初始 state 使用 `defaults?.requiredSource` 和 `defaults?.baseUrl`。所有 input/select/checkbox 使用对应 `defaultValue`、`value` 或 `defaultChecked`；`MacCmsTypePicker.initialTypeIds` 使用已保存 `typeIds`。只有用户主动切换来源时才加载 preset。

- [ ] **Step 4: 抽取共享表单**

`CrawlerProfileForm` props：

```tsx
type CrawlerProfileFormProps = Readonly<{
  action: (formData: FormData) => void | Promise<void>;
  defaults?: ProfileFormDefaults;
  profileId?: number;
  heading: string;
  submitLabel: string;
}>;
```

组件包含当前 `profiles/page.tsx` 的全部表单区块。编辑模式输出隐藏 `profileId`；质量、跳过、并发、策略和媒体控件全部从 `defaults` 回填，新建模式保持现有默认值。

- [ ] **Step 5: 新建页改用共享表单**

把页面原有长表单替换为：

```tsx
<CrawlerProfileForm
  action={actionCreateProfile}
  heading="新建模板"
  submitLabel="保存模板"
/>
```

- [ ] **Step 6: 运行回填测试、类型检查并确认 GREEN**

Run: `cmd /c node_modules\.bin\tsx.cmd --test tests\crawler\form-config-maccms.test.ts`

Run: `cmd /c node_modules\.bin\tsc.cmd --noEmit`

Expected: 两条命令均 exit 0。

### Task 5: 编辑页、编辑动作和删除入口

**Files:**
- Create: `app/admin/crawler/profiles/[id]/page.tsx`
- Modify: `app/admin/crawler/actions.ts`
- Modify: `app/admin/crawler/profiles/page.tsx`
- Modify: `tests/crawler/admin-actions.test.ts`

- [ ] **Step 1: 写失败的应用层管理动作测试**

在 `tests/crawler/admin-actions.test.ts` 增加对 `adminUpdateProfile` 和 `adminDeleteProfile` 的测试：管理员可更新模板名称和配置；非管理员更新/删除返回 `AUTH_REQUIRED`；无效 profile ID 在调用服务前返回 `RESULT_INVALID`。Next Server Action 的重定向结果在本任务的静态接线检查和 Task 6 浏览器验收中验证。

- [ ] **Step 2: 运行测试并确认 RED**

Run: `cmd /c node_modules\.bin\tsx.cmd --test tests\crawler\admin-actions.test.ts`

Expected: FAIL，Server Action 及授权动作尚未接线。

- [ ] **Step 3: 实现 Server Actions**

```ts
export async function actionUpdateProfile(formData: FormData): Promise<void> {
  const rawProfileId = String(formData.get('profileId') || '');
  try {
    const profileId = parsePositiveProfileId(formData);
    await adminUpdateProfile(ctx(), {
      profileId,
      name: String(formData.get('name') || ''),
      configJson: profileConfigFromForm(formData),
    });
    revalidateCrawler();
    redirect('/admin/crawler/profiles?ok=updated');
  } catch (error) {
    if (error instanceof AppError) {
      const fallback = /^\d+$/.test(rawProfileId)
        ? `/admin/crawler/profiles/${rawProfileId}?error=1`
        : '/admin/crawler/profiles?error=update';
      redirect(fallback);
    }
    throw error;
  }
}

export async function actionDeleteProfile(formData: FormData): Promise<void> {
  try {
    await adminDeleteProfile(ctx(), parsePositiveProfileId(formData));
    revalidateCrawler();
    redirect('/admin/crawler/profiles?ok=deleted');
  } catch (error) {
    if (error instanceof AppError) redirect('/admin/crawler/profiles?error=delete');
    throw error;
  }
}
```

`parsePositiveProfileId` 使用与 job ID helper 相同的严格正整数规则。

- [ ] **Step 4: 实现编辑页**

```tsx
export default async function EditCrawlerProfilePage({ params, searchParams }: Props) {
  await requireAdmin();
  const { id: rawId } = await params;
  const id = Number(rawId);
  if (!Number.isSafeInteger(id) || id <= 0) notFound();

  const service = getAdminCrawlerService();
  const profile = await service.getProfile(id);
  if (!profile?.isEnabled || !profile.currentVersionId) notFound();
  const version = await service.getProfileVersion(profile.currentVersionId);
  if (!version) notFound();

  return (
    <CrawlerProfileForm
      action={actionUpdateProfile}
      profileId={profile.id}
      defaults={profileFormDefaults(profile.name, version.config)}
      heading="编辑模板"
      submitLabel="保存更改"
    />
  );
}
```

页面同时渲染错误状态和返回模板列表的链接，并保留 `CrawlerNav`。

- [ ] **Step 5: 在列表增加编辑和删除**

每行操作区：

```tsx
<div className="flex flex-wrap items-center gap-3 shrink-0">
  <Link href="/admin/crawler/jobs" className="font-ui text-[12px] text-[#0B57D0] underline">
    启动
  </Link>
  <Link href={`/admin/crawler/profiles/${row.id}`} className="font-ui text-[12px] text-[#111] underline">
    编辑
  </Link>
  <form action={actionDeleteProfile}>
    <input type="hidden" name="profileId" value={row.id} />
    <ConfirmSubmitButton
      className="font-ui text-[12px] text-[#C5221F] underline"
      title="删除模板"
      confirmLabel="删除"
      message="模板将从可用列表移除，关联定时任务将停用，历史任务不会删除。"
    >
      删除
    </ConfirmSubmitButton>
  </form>
</div>
```

增加 `ok=updated`、`ok=deleted` 和 `error=delete` 状态文案。

- [ ] **Step 6: 运行聚焦测试和类型检查**

Run: `cmd /c node_modules\.bin\tsx.cmd --test tests\crawler\admin-actions.test.ts tests\crawler\config-service.test.ts tests\crawler\form-config-maccms.test.ts`

Run: `cmd /c node_modules\.bin\tsc.cmd --noEmit`

Expected: 全部 PASS，类型检查 exit 0。

- [ ] **Step 7: 静态检查 Server Action 接线**

Run: `rg -n "actionUpdateProfile|actionDeleteProfile|ok=updated|ok=deleted|error=update|error=delete" app/admin/crawler/actions.ts app/admin/crawler/profiles`

Expected: 编辑页和列表分别引用对应动作，成功与失败重定向状态均存在。

### Task 6: 模板管理完整验证

**Files:**
- Verify all modified files

- [ ] **Step 1: 运行相关测试**

Run: `cmd /c node_modules\.bin\tsx.cmd --test tests\crawler\admin-actions.test.ts tests\crawler\config-service.test.ts tests\crawler\form-config-maccms.test.ts tests\crawler\schedule-service.test.ts tests\crawler\job-service.test.ts`

Expected: 0 fail。

- [ ] **Step 2: 运行类型、Lint 和生产构建**

Run: `cmd /c node_modules\.bin\tsc.cmd --noEmit`

Run: `cmd /c npm run lint`

Run: `cmd /c npm run build`

Expected: 三条命令均 exit 0。

- [ ] **Step 3: 桌面浏览器验收**

在 `1440x900` 视口验证模板列表有启动、编辑、删除；编辑页完整回填；保存后版本递增；删除确认文案正确，删除后模板消失且关联计划不再显示为启用。

- [ ] **Step 4: 移动浏览器验收**

在 `390x844` 视口验证操作区可换行、按钮不遮挡模板元数据、编辑表单无横向滚动、确认对话框完整可见。

- [ ] **Step 5: 最终 diff 检查**

Run: `git diff --check`

Run: `git status --short`

Expected: 无空白错误；只包含计划内文件和已确认的规格/计划文档。

---

## Plan Verification

所有验收命令必须使用新输出，不复用历史结果。任何测试、类型、Lint、构建或浏览器异常都记录到 `progress.md`，修复后重跑受影响检查。
