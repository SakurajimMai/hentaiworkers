import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ANDROID_UPDATE_ABIS,
  ANDROID_UPDATE_CACHE_CONTROL,
  ANDROID_UPDATE_FETCH_TIMEOUT_MS,
  ANDROID_UPDATE_FRESH_TTL_MS,
  ANDROID_UPDATE_STALE_TTL_MS,
  AndroidUpdateNotConfiguredError,
  androidUpdateGithubApiUrl,
  fetchLatestAndroidUpdate,
  parseLatestAndroidUpdate,
  resolveAndroidUpdateRepository,
} from '../../lib/server/android-update';

const REPOSITORY = 'example-owner/example-app';
const RELEASE_ORIGIN = `https://github.com/${REPOSITORY}`;

type JsonObject = Record<string, unknown>;

function githubAsset(build: number, name: string, overrides: JsonObject = {}) {
  return {
    name,
    state: 'uploaded',
    size: 1_000 + build,
    digest: `sha256:${'A'.repeat(64)}`,
    browser_download_url:
      `${RELEASE_ORIGIN}/releases/download/build-${build}/${name}`,
    ...overrides,
  };
}

function githubRelease(build: number, overrides: JsonObject = {}) {
  const apkAssets = ANDROID_UPDATE_ABIS.map((abi) =>
    githubAsset(build, `AnimeStream-${build}-${abi}.apk`));
  return {
    tag_name: `build-${build}`,
    name: `AnimeStream Build ${build}`,
    draft: false,
    prerelease: true,
    target_commitish: 'main',
    published_at: '2026-08-30T15:35:02Z',
    html_url: `${RELEASE_ORIGIN}/releases/tag/build-${build}`,
    assets: [...apkAssets, githubAsset(build, 'SHA256SUMS')],
    ...overrides,
  };
}

test('release parser accepts prereleases and selects the largest complete build', () => {
  const incomplete = githubRelease(70);
  incomplete.assets = incomplete.assets.slice(0, -1);
  const manifest = parseLatestAndroidUpdate([
    githubRelease(99, { draft: true }),
    githubRelease(69, { target_commitish: 'feature/wrong' }),
    incomplete,
    githubRelease(68),
    githubRelease(67),
  ], REPOSITORY);

  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.packageName, 'de.ixacg.animestream');
  assert.equal(manifest.versionCode, 68);
  assert.equal(manifest.releaseTag, 'build-68');
  assert.deepEqual(Object.keys(manifest.apks), [...ANDROID_UPDATE_ABIS]);
  assert.equal(manifest.apks['arm64-v8a'].sha256, 'a'.repeat(64));
  assert.equal(manifest.checksums.name, 'SHA256SUMS');
});

test('release parser rejects incomplete, duplicated, or untrusted assets', () => {
  const build = 66;
  const valid = githubRelease(build);
  const cases: Array<[string, unknown]> = [
    ['non-array payload', { message: 'rate limited' }],
    ['missing ABI', [{ ...valid, assets: valid.assets.slice(1) }]],
    ['duplicate ABI', [{ ...valid, assets: [...valid.assets, valid.assets[0]] }]],
    [
      'wrong download host',
      [{
        ...valid,
        assets: valid.assets.map((asset, index) => index === 0
          ? { ...asset, browser_download_url: 'https://example.com/fake.apk' }
          : asset),
      }],
    ],
    [
      'empty asset',
      [{
        ...valid,
        assets: valid.assets.map((asset, index) => index === 0
          ? { ...asset, size: 0 }
          : asset),
      }],
    ],
    [
      'missing digest',
      [{
        ...valid,
        assets: valid.assets.map((asset, index) => index === 0
          ? { ...asset, digest: null }
          : asset),
      }],
    ],
    [
      'wrong digest algorithm',
      [{
        ...valid,
        assets: valid.assets.map((asset, index) => index === 0
          ? { ...asset, digest: `sha512:${'a'.repeat(64)}` }
          : asset),
      }],
    ],
    [
      'wrong release page',
      [{ ...valid, html_url: 'https://github.com/other/repository/releases/tag/build-66' }],
    ],
    ['invalid tag', [{ ...valid, tag_name: 'release-66' }]],
    ['invalid prerelease flag', [{ ...valid, prerelease: 'true' }]],
    ['invalid published time', [{ ...valid, published_at: 'August 30, 2026' }]],
  ];

  for (const [name, payload] of cases) {
    assert.throws(
      () => parseLatestAndroidUpdate(payload, REPOSITORY),
      /GitHub releases response|No complete Android release/,
      name,
    );
  }
});

test('release repository comes from configuration and disables the endpoint when absent', async () => {
  assert.equal(resolveAndroidUpdateRepository(undefined), null);
  assert.equal(resolveAndroidUpdateRepository('  '), null);
  assert.equal(resolveAndroidUpdateRepository(` ${REPOSITORY} `), REPOSITORY);
  for (const bad of ['owner', 'owner/', '/repo', 'https://github.com/owner/repo', 'owner/repo/extra', 'ow ner/repo']) {
    assert.throws(() => resolveAndroidUpdateRepository(bad), /owner\/repository/, bad);
  }
  await assert.rejects(
    fetchLatestAndroidUpdate(null, async () => { throw new Error('must not be called'); }),
    AndroidUpdateNotConfiguredError,
  );
  assert.throws(
    () => parseLatestAndroidUpdate([githubRelease(66)], 'other-owner/other-app'),
    /No complete Android release/,
    'assets published under another repository are never accepted',
  );
});

test('GitHub loader uses the configured repository API, headers, no-store, and parses JSON', async () => {
  let receivedUrl = '';
  let receivedInit: RequestInit | undefined;
  const manifest = await fetchLatestAndroidUpdate(REPOSITORY, async (url, init) => {
    receivedUrl = url;
    receivedInit = init;
    return Response.json([githubRelease(66)]);
  });

  assert.equal(manifest.versionCode, 66);
  assert.equal(receivedUrl, androidUpdateGithubApiUrl(REPOSITORY));
  assert.equal(receivedUrl, `https://api.github.com/repos/${REPOSITORY}/releases?per_page=100`);
  assert.equal(receivedInit?.method, 'GET');
  assert.equal(receivedInit?.cache, 'no-store');
  assert.equal((receivedInit?.headers as Record<string, string>).Accept,
    'application/vnd.github+json');
  assert.ok(receivedInit?.signal instanceof AbortSignal);
  assert.equal(ANDROID_UPDATE_FETCH_TIMEOUT_MS, 5_000);
});

test('GitHub loader propagates HTTP failures and aborts a hung request', async () => {
  await assert.rejects(
    fetchLatestAndroidUpdate(REPOSITORY, async () => new Response('rate limited', { status: 403 })),
    /status 403/,
  );

  const hungFetch = (_url: string, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), {
        once: true,
      });
    });
  await assert.rejects(
    fetchLatestAndroidUpdate(REPOSITORY, hungFetch, 5),
    /timed out|timeout|aborted/i,
  );
});

test('update cache timing and public response cache policy stay bounded', () => {
  assert.equal(ANDROID_UPDATE_FRESH_TTL_MS, 15 * 60_000);
  assert.equal(ANDROID_UPDATE_STALE_TTL_MS, 24 * 60 * 60_000);
  assert.equal(
    ANDROID_UPDATE_CACHE_CONTROL,
    'public, max-age=300, stale-while-revalidate=900, stale-if-error=86400',
  );
});
