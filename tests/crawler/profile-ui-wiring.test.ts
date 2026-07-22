import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

function source(relativePath: string): string {
  const url = new URL(relativePath, import.meta.url);
  assert.equal(existsSync(url), true, `${relativePath} 必须存在`);
  return readFileSync(url, 'utf8');
}

test('shared crawler profile form owns create and edit defaults wiring', () => {
  const profileForm = source('../../components/admin/crawler/profile-form.tsx');
  const sourceFields = source(
    '../../components/admin/crawler/profile-source-fields.tsx',
  );
  const listPage = source('../../app/admin/crawler/profiles/page.tsx');

  assert.match(profileForm, /export function CrawlerProfileForm/);
  assert.match(profileForm, /useActionState\(action, \{\}\)/);
  assert.match(profileForm, /formData:\s*FormData/);
  assert.match(profileForm, /defaults\?:\s*ProfileFormDefaults/);
  assert.match(profileForm, /profileId\?:\s*number/);
  assert.match(profileForm, /name="profileId"/);
  assert.match(profileForm, /<ProfileSourceFields[\s\S]*defaults=\{defaults\}/);
  for (const field of [
    'qualityPriority',
    'skipKeywords',
    'downloadConcurrency',
    'parseConcurrency',
    'pageConcurrency',
    'maxActiveJobs',
    'continueOnError',
    'storageDriver',
  ]) {
    assert.match(profileForm, new RegExp(`name="${field}"`));
  }

  assert.match(
    sourceFields,
    /import type \{ ProfileFormDefaults \} from ['"]@\/app\/admin\/crawler\/form-config['"]/,
  );
  assert.match(sourceFields, /defaults\?:\s*ProfileFormDefaults/);
  assert.match(sourceFields, /defaults\?\.requiredSource/);
  assert.match(sourceFields, /defaults\?\.baseUrl/);
  assert.match(sourceFields, /defaults\?\.provider/);
  assert.match(sourceFields, /provider=\{/);
  assert.match(sourceFields, /initialTypeIds=\{/);
  assert.match(sourceFields, /defaults\.typeIds/);

  assert.match(listPage, /<CrawlerProfileForm/);
  assert.doesNotMatch(listPage, /<form action=\{actionCreateProfile\}/);
});

test('MacCMS profile fields separate line ids and expose unlimited and cover controls', () => {
  const sourceFields = source(
    '../../components/admin/crawler/profile-source-fields.tsx',
  );

  assert.match(sourceFields, /name="sourcePlayFrom"/);
  assert.match(sourceFields, /name="playFrom"/);
  assert.match(sourceFields, /源播放标识（用于匹配资源站）/);
  assert.match(sourceFields, /站内线路标识（播放器显示与解析）/);
  assert.match(
    sourceFields,
    /name="maxItems" type="number" min=\{0\} max=\{5000\}/,
  );
  assert.match(sourceFields, /0 = 本次已配置页数全部条目/);
  assert.equal(sourceFields.match(/name="enableCover"/g)?.length, 2);
  assert.match(sourceFields, /下载并保存封面/);
});

test('profile edit route validates and loads the enabled current snapshot', () => {
  const editPage = source('../../app/admin/crawler/profiles/[id]/page.tsx');

  assert.match(editPage, /await requireAdmin\(\)/);
  assert.match(editPage, /\.test\(rawId\)/);
  assert.match(editPage, /Number\.isSafeInteger\(id\)/);
  assert.match(editPage, /service\.getProfile\(id\)/);
  assert.match(editPage, /profile\?\.isEnabled/);
  assert.match(editPage, /profile\.currentVersionId/);
  assert.match(editPage, /service\.getProfileVersion\(profile\.currentVersionId\)/);
  assert.match(editPage, /profileFormDefaults\(profile\.name, version\.config\)/);
  assert.match(editPage, /action=\{actionUpdateProfile\}/);
  assert.match(editPage, /error/);
  assert.match(editPage, /返回模板列表/);
});

test('profile list exposes compact edit and confirmed delete actions', () => {
  const listPage = source('../../app/admin/crawler/profiles/page.tsx');

  assert.match(listPage, /href=\{`\/admin\/crawler\/profiles\/\$\{row\.id\}`\}/);
  assert.match(listPage, /action=\{actionDeleteProfile\}/);
  assert.match(listPage, /<ConfirmSubmitButton/);
  assert.match(
    listPage,
    /模板将从可用列表移除，关联定时任务将停用，历史任务不会删除。/,
  );
  assert.match(listPage, /flex flex-wrap items-center/);
  assert.match(listPage, /sp\.ok === 'updated'/);
  assert.match(listPage, /sp\.ok === 'deleted'/);
  assert.match(listPage, /sp\.error === 'delete'/);
});

test('profile server actions use strict ids, preserve validation failures, and route successes', () => {
  const actions = source('../../app/admin/crawler/actions.ts');

  assert.match(actions, /function parsePositiveProfileId\(formData: FormData\)/);
  assert.match(actions, /\.test\(raw\)/);
  assert.match(actions, /Number\.isSafeInteger\(id\)/);
  assert.match(actions, /export async function actionUpdateProfile/);
  assert.match(actions, /await adminUpdateProfile\(actionContext,/);
  assert.match(actions, /configJson:\s*profileConfigFromForm\(formData, currentVersion\.config\)/);
  assert.match(actions, /profiles\?ok=updated/);
  assert.match(actions, /profileActionError\(error\)/);
  assert.match(actions, /if \(state\) return state/);
  assert.match(actions, /export async function actionDeleteProfile/);
  assert.match(actions, /await adminDeleteProfile\(ctx\(\),/);
  assert.match(actions, /profiles\?ok=deleted/);
  assert.match(actions, /profiles\?error=delete/);
  assert.match(actions, /throw error/);
});
