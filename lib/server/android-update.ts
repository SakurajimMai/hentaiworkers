import type {
  AndroidUpdateAbi,
  AndroidUpdateAsset,
  AndroidUpdateManifest,
} from '@/lib/public-api-types';

/**
 * GitHub repository (`owner/name`) whose Releases publish the APKs. It is injected per deployment
 * through `ANDROID_UPDATE_REPOSITORY`; the code never assumes a specific account or repository.
 */
export const ANDROID_UPDATE_REPOSITORY_ENV = 'ANDROID_UPDATE_REPOSITORY';
const GITHUB_REPOSITORY_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?\/[A-Za-z0-9_.-]{1,100}$/;

export function resolveAndroidUpdateRepository(
  value: string | undefined = process.env[ANDROID_UPDATE_REPOSITORY_ENV],
): string | null {
  const candidate = value?.trim();
  if (!candidate) return null;
  if (!GITHUB_REPOSITORY_PATTERN.test(candidate)) {
    throw new Error(`${ANDROID_UPDATE_REPOSITORY_ENV} 必须是 owner/repository 形式`);
  }
  return candidate;
}

export function androidUpdateGithubApiUrl(repository: string): string {
  return `https://api.github.com/repos/${repository}/releases?per_page=100`;
}

export function androidUpdateReleaseOrigin(repository: string): string {
  return `https://github.com/${repository}`;
}

export class AndroidUpdateNotConfiguredError extends Error {
  constructor() {
    super(`Android updates are disabled: set ${ANDROID_UPDATE_REPOSITORY_ENV}`);
    this.name = 'AndroidUpdateNotConfiguredError';
  }
}

export const ANDROID_UPDATE_FETCH_TIMEOUT_MS = 5_000;
export const ANDROID_UPDATE_FRESH_TTL_MS = 15 * 60_000;
export const ANDROID_UPDATE_STALE_TTL_MS = 24 * 60 * 60_000;
export const ANDROID_UPDATE_RETRY_DELAY_MS = 5 * 60_000;
export const ANDROID_UPDATE_CACHE_CONTROL =
  'public, max-age=300, stale-while-revalidate=900, stale-if-error=86400';

export const ANDROID_UPDATE_ABIS = [
  'arm64-v8a',
  'armeabi-v7a',
  'x86_64',
  'x86',
  'universal',
] as const satisfies readonly AndroidUpdateAbi[];

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;
type JsonObject = Record<string, unknown>;

function asObject(value: unknown): JsonObject | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as JsonObject
    : null;
}

function parseVersionCode(tag: unknown): number | null {
  if (typeof tag !== 'string') return null;
  const match = /^build-([1-9]\d*)$/.exec(tag);
  if (!match) return null;
  const versionCode = Number(match[1]);
  return Number.isSafeInteger(versionCode) && versionCode <= 2_100_000_000
    ? versionCode
    : null;
}

function parsePublishedAt(value: unknown): string | null {
  if (
    typeof value !== 'string'
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(value)
  ) {
    return null;
  }
  return Number.isFinite(Date.parse(value)) ? value : null;
}

function parseAsset(
  value: unknown,
  expectedName: string,
  expectedUrl: string,
): AndroidUpdateAsset | null {
  const asset = asObject(value);
  if (
    !asset
    || asset.name !== expectedName
    || asset.state !== 'uploaded'
    || asset.browser_download_url !== expectedUrl
    || !Number.isSafeInteger(asset.size)
    || (asset.size as number) <= 0
    || typeof asset.digest !== 'string'
  ) {
    return null;
  }

  const digest = /^sha256:([0-9a-fA-F]{64})$/.exec(asset.digest);
  if (!digest) return null;

  return {
    name: expectedName,
    url: expectedUrl,
    size: asset.size as number,
    sha256: digest[1].toLowerCase(),
  };
}

function findUniqueAsset(
  assets: readonly unknown[],
  expectedName: string,
  expectedUrl: string,
): AndroidUpdateAsset | null {
  const matches = assets.filter((value) => asObject(value)?.name === expectedName);
  return matches.length === 1
    ? parseAsset(matches[0], expectedName, expectedUrl)
    : null;
}

function parseRelease(value: unknown, repository: string): AndroidUpdateManifest | null {
  const release = asObject(value);
  if (
    !release
    || release.draft !== false
    || typeof release.prerelease !== 'boolean'
    || release.target_commitish !== 'main'
    || typeof release.name !== 'string'
    || release.name.trim().length === 0
    || !Array.isArray(release.assets)
  ) {
    return null;
  }

  const versionCode = parseVersionCode(release.tag_name);
  const publishedAt = parsePublishedAt(release.published_at);
  if (versionCode === null || publishedAt === null) return null;

  const releaseTag = `build-${versionCode}`;
  const releaseOrigin = androidUpdateReleaseOrigin(repository);
  const releasePageUrl = `${releaseOrigin}/releases/tag/${releaseTag}`;
  if (release.html_url !== releasePageUrl) return null;

  const downloadPrefix = `${releaseOrigin}/releases/download/${releaseTag}/`;
  const apks = {} as Record<AndroidUpdateAbi, AndroidUpdateAsset>;
  for (const abi of ANDROID_UPDATE_ABIS) {
    const name = `AnimeStream-${versionCode}-${abi}.apk`;
    const asset = findUniqueAsset(release.assets, name, `${downloadPrefix}${name}`);
    if (!asset) return null;
    apks[abi] = asset;
  }

  const checksumName = 'SHA256SUMS';
  const checksums = findUniqueAsset(
    release.assets,
    checksumName,
    `${downloadPrefix}${checksumName}`,
  );
  if (!checksums) return null;

  return {
    schemaVersion: 1,
    packageName: 'de.ixacg.animestream',
    versionCode,
    releaseTag,
    releaseName: release.name,
    publishedAt,
    releasePageUrl,
    apks,
    checksums,
  };
}

export function parseLatestAndroidUpdate(value: unknown, repository: string): AndroidUpdateManifest {
  if (!Array.isArray(value)) {
    throw new Error('GitHub releases response must be an array');
  }

  let latest: AndroidUpdateManifest | null = null;
  for (const release of value) {
    const candidate = parseRelease(release, repository);
    if (candidate && (!latest || candidate.versionCode > latest.versionCode)) {
      latest = candidate;
    }
  }

  if (!latest) throw new Error('No complete Android release is available');
  return latest;
}

export async function fetchLatestAndroidUpdate(
  repository: string | null,
  fetchImpl: FetchLike = fetch,
  timeoutMs = ANDROID_UPDATE_FETCH_TIMEOUT_MS,
): Promise<AndroidUpdateManifest> {
  if (!repository) throw new AndroidUpdateNotConfiguredError();
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new RangeError('timeoutMs must be a positive finite number');
  }

  const abortController = new AbortController();
  const timeout = setTimeout(() => {
    abortController.abort(new Error('GitHub releases request timed out'));
  }, timeoutMs);

  try {
    const response = await fetchImpl(androidUpdateGithubApiUrl(repository), {
      method: 'GET',
      cache: 'no-store',
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'AnimeStream-Android-Update',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      signal: abortController.signal,
    });

    if (!response.ok) {
      throw new Error(`GitHub releases request failed with status ${response.status}`);
    }

    return parseLatestAndroidUpdate(await response.json(), repository);
  } finally {
    clearTimeout(timeout);
  }
}
