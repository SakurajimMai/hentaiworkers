import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { NextRequest } from 'next/server';
import { parse } from 'yaml';
import {
  createListAnimesDependency,
  createListAnimesHandler,
} from '../../app/api/animes/handler';
import {
  createAnimeDetailDependency,
  createAnimeDetailHandler,
} from '../../app/api/animes/[id]/handler';
import {
  createSimilarAnimesDependency,
  createSimilarAnimesHandler,
} from '../../app/api/animes/[id]/similar/handler';
import {
  createHealthHandler,
  createHealthQueryDependency,
} from '../../app/api/health/handler';
import {
  createTagsDependency,
  createTagsHandler,
  DEFAULT_TAG_LIMIT,
  MAX_TAG_LIMIT,
  parseTagsLimit,
} from '../../app/api/tags/handler';
import { createAndroidUpdateHandler } from '../../app/api/android/update/handler';
import {
  createAdsDependency,
  createAdsHandler,
} from '../../app/api/ads/handler';
import {
  createListMangasDependency,
  createListMangasHandler,
  type ListMangasOptions,
} from '../../app/api/mangas/handler';
import type {
  AnimeDetail,
  AnimeListResponse,
  AnimeSimilarItem,
  AndroidUpdateManifest,
  HealthError,
  HealthOk,
  ListAnimesOptions,
  PublicAdsConfig,
  TagSummary,
} from '../../lib/public-api-types';
import type { MangaListResult } from '../../lib/manga-service';
import { ANDROID_UPDATE_CACHE_CONTROL } from '../../lib/server/android-update';
import { PUBLIC_READ_CACHE_CONTROL } from '../../lib/server/shared/stale-read-cache';
import adsFixtureJson from './fixtures/ads.json';
import androidUpdateFixtureJson from './fixtures/android-update.json';
import detailFixtureJson from './fixtures/anime-detail.json';
import listFixtureJson from './fixtures/animes-list.json';
import healthFixtureJson from './fixtures/health.json';
import mangaListFixtureJson from './fixtures/mangas-list.json';
import similarFixtureJson from './fixtures/similar.json';
import tagsFixtureJson from './fixtures/tags.json';

type OpenApiSchema = {
  required?: string[];
  properties?: Record<string, unknown>;
};

type OpenApiDocument = {
  components?: {
    schemas?: Record<string, OpenApiSchema>;
  };
};

const listFixture = listFixtureJson satisfies AnimeListResponse;
const detailFixture = detailFixtureJson satisfies AnimeDetail;
const similarFixture = similarFixtureJson satisfies AnimeSimilarItem[];
const tagsFixture = tagsFixtureJson satisfies TagSummary[];
const adsFixture = adsFixtureJson satisfies PublicAdsConfig;
const androidUpdateFixture = androidUpdateFixtureJson satisfies AndroidUpdateManifest;
const mangaListFixture = mangaListFixtureJson;
const mangaServiceFixture = {
  data: mangaListFixture.data.map((item) => ({
    ...item,
    updatedAt: new Date(item.updatedAt),
  })),
  page: mangaListFixture.pagination.page,
  limit: mangaListFixture.pagination.limit,
  total: mangaListFixture.pagination.total,
  totalPages: mangaListFixture.pagination.totalPages,
} satisfies MangaListResult;
const healthFixture = healthFixtureJson satisfies {
  success: HealthOk;
  failure: HealthError;
};

async function loadRouteModules() {
  const [
    listRoute,
    detailRoute,
    similarRoute,
    tagsRoute,
    healthRoute,
    adsRoute,
    mangaListRoute,
    androidUpdateRoute,
  ] = await Promise.all([
    import('../../app/api/animes/route'),
    import('../../app/api/animes/[id]/route'),
    import('../../app/api/animes/[id]/similar/route'),
    import('../../app/api/tags/route'),
    import('../../app/api/health/route'),
    import('../../app/api/ads/route'),
    import('../../app/api/mangas/route'),
    import('../../app/api/android/update/route'),
  ]);

  return {
    listRoute,
    detailRoute,
    similarRoute,
    tagsRoute,
    healthRoute,
    adsRoute,
    mangaListRoute,
    androidUpdateRoute,
  };
}

async function responseJson(response: Response): Promise<unknown> {
  return response.json() as Promise<unknown>;
}

async function withMutedConsoleError<T>(run: () => Promise<T>): Promise<T> {
  const original = console.error;
  console.error = () => {};
  try {
    return await run();
  } finally {
    console.error = original;
  }
}

function assertOwnKeys(value: object, keys: readonly string[]) {
  for (const key of keys) {
    assert.equal(Object.hasOwn(value, key), true, `响应缺少必选字段：${key}`);
  }
}

function getOpenApiSchemas(): Record<string, OpenApiSchema> {
  const source = readFileSync('docs/api/openapi.yaml', 'utf8');
  const document = parse(source) as OpenApiDocument;
  assert.ok(document.components?.schemas, 'OpenAPI 必须声明 components.schemas');
  return document.components.schemas;
}

function assertSchemaRequired(
  schemas: Record<string, OpenApiSchema>,
  schemaName: string,
  expected: readonly string[],
) {
  const schema = schemas[schemaName];
  assert.ok(schema, `OpenAPI 缺少 schema：${schemaName}`);
  assert.deepEqual(schema.required, [...expected]);
  for (const key of expected) {
    assert.ok(schema.properties?.[key], `${schemaName} 缺少属性：${key}`);
  }
}

test('TypeScript 测试脚本使用跨平台递归测试入口', () => {
  const packageJson = JSON.parse(readFileSync('package.json', 'utf8')) as {
    scripts?: Record<string, string>;
  };

  assert.equal(packageJson.scripts?.['test:ts'], 'node scripts/run-tests.mjs');
});

test('八个公开路由不初始化数据库且使用同源可注入 handler 工厂', async () => {
  const databaseUrl = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;
  let routes: Awaited<ReturnType<typeof loadRouteModules>>;
  try {
    routes = await loadRouteModules();
  } finally {
    if (databaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = databaseUrl;
    }
  }

  for (const route of Object.values(routes)) {
    assert.equal(typeof route.GET, 'function');
  }

  for (const factory of [
    createListAnimesHandler,
    createAnimeDetailHandler,
    createSimilarAnimesHandler,
    createTagsHandler,
    createHealthHandler,
    createAdsHandler,
    createListMangasHandler,
    createAndroidUpdateHandler,
  ]) {
    assert.equal(typeof factory, 'function');
  }
});

test('生产惰性适配器选择正确导出并原样转发参数', async () => {
  const listOptions: ListAnimesOptions = {
    page: 3,
    limit: 24,
    tagId: 920001,
    search: 'synthetic search',
    sort: 'popular',
  };
  let receivedListOptions: ListAnimesOptions | undefined;
  const listDependency = createListAnimesDependency(async () => ({
    listAnimes: async (options) => {
      receivedListOptions = options;
      return listFixture;
    },
  }));
  const detailDependency = createAnimeDetailDependency(async () => ({
    getAnimeById: async (id) => {
      assert.equal(id, detailFixture.id);
      return detailFixture;
    },
  }));
  const similarDependency = createSimilarAnimesDependency(async () => ({
    getSimilarAnimes: async (id) => {
      assert.equal(id, detailFixture.id);
      return similarFixture;
    },
  }));
  const tagsDependency = createTagsDependency(async () => ({
    listTags: async () => tagsFixture,
  }));
  const mangaOptions: ListMangasOptions = {
    page: 2,
    limit: 10,
    q: 'synthetic manga',
    tag: 'Synthetic Tag',
    rank: 'week',
  };
  let receivedMangaOptions: ListMangasOptions | undefined;
  const mangaDependency = createListMangasDependency(async () => ({
    isMangaEnabled: async () => true,
    listMangas: async (options) => {
      receivedMangaOptions = options;
      return mangaServiceFixture;
    },
  }));

  assert.deepEqual(await listDependency(listOptions), listFixture);
  assert.deepEqual(receivedListOptions, listOptions);
  assert.deepEqual(await detailDependency(detailFixture.id), detailFixture);
  assert.deepEqual(await similarDependency(detailFixture.id), similarFixture);
  assert.deepEqual(await tagsDependency(), tagsFixture);
  assert.deepEqual(await mangaDependency(mangaOptions), mangaServiceFixture);
  assert.deepEqual(receivedMangaOptions, mangaOptions);
});

test('漫画生产依赖在功能关闭时不读取列表', async () => {
  let listCalls = 0;
  const dependency = createListMangasDependency(async () => ({
    isMangaEnabled: async () => false,
    listMangas: async () => {
      listCalls += 1;
      return mangaServiceFixture;
    },
  }));

  assert.equal(await dependency({ page: 1, limit: 24 }), null);
  assert.equal(listCalls, 0);
});

test('健康检查惰性适配器只执行 SELECT 1', async () => {
  const queries: string[] = [];
  const dependency = createHealthQueryDependency(async () => ({
    pool: {
      query: async (sql) => {
        queries.push(sql);
        return [healthFixture.success.result, []];
      },
    },
  }));

  assert.deepEqual(await dependency(), healthFixture.success.result);
  assert.deepEqual(queries, ['SELECT 1 AS ok']);
});

test('动漫列表保持 200 黄金响应和默认查询参数', async () => {
  let received: ListAnimesOptions | undefined;
  const handler = createListAnimesHandler(async (options) => {
    received = options;
    return listFixture;
  });

  const response = await handler(new NextRequest('http://fixture.invalid/api/animes'));

  assert.equal(response.status, 200);
  assert.deepEqual(await responseJson(response), listFixture);
  assert.equal(response.headers.get('cache-control'), PUBLIC_READ_CACHE_CONTROL);
  assert.deepEqual(received, {
    page: 1,
    limit: 48,
    tagId: undefined,
    search: undefined,
    sort: 'latest',
  });
});

test('动漫列表依赖异常保持 500 和 error 字符串', async () => {
  const handler = createListAnimesHandler(async () => {
    throw new Error('synthetic list failure');
  });

  const response = await withMutedConsoleError(() =>
    handler(new NextRequest('http://fixture.invalid/api/animes')),
  );

  assert.equal(response.status, 500);
  assert.deepEqual(await responseJson(response), { error: 'synthetic list failure' });
});

test('动漫详情保持 200 黄金响应', async () => {
  const handler = createAnimeDetailHandler(async (id) => {
    assert.equal(id, detailFixture.id);
    return detailFixture;
  });

  const response = await handler(new Request('http://fixture.invalid'), {
    params: Promise.resolve({ id: String(detailFixture.id) }),
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await responseJson(response), detailFixture);
});

test('动漫详情非法 id 与不存在记录均保持 404', async () => {
  let calls = 0;
  const handler = createAnimeDetailHandler(async () => {
    calls += 1;
    return null;
  });

  const invalidResponse = await handler(new Request('http://fixture.invalid'), {
    params: Promise.resolve({ id: 'invalid' }),
  });
  const missingResponse = await handler(new Request('http://fixture.invalid'), {
    params: Promise.resolve({ id: '910404' }),
  });

  assert.equal(invalidResponse.status, 404);
  assert.deepEqual(await responseJson(invalidResponse), { error: 'Not found' });
  assert.equal(missingResponse.status, 404);
  assert.deepEqual(await responseJson(missingResponse), { error: 'Not found' });
  assert.equal(calls, 1);
});

test('动漫详情依赖异常保持 500 和 error 字符串', async () => {
  const handler = createAnimeDetailHandler(async () => {
    throw new Error('synthetic detail failure');
  });

  const response = await handler(new Request('http://fixture.invalid'), {
    params: Promise.resolve({ id: String(detailFixture.id) }),
  });

  assert.equal(response.status, 500);
  assert.deepEqual(await responseJson(response), { error: 'synthetic detail failure' });
});

test('相似动漫保持 200 黄金响应，非法 id 保持 200 空数组', async () => {
  let calls = 0;
  const handler = createSimilarAnimesHandler(async (id) => {
    calls += 1;
    assert.equal(id, detailFixture.id);
    return similarFixture;
  });

  const successResponse = await handler(new Request('http://fixture.invalid'), {
    params: Promise.resolve({ id: String(detailFixture.id) }),
  });
  const invalidResponse = await handler(new Request('http://fixture.invalid'), {
    params: Promise.resolve({ id: 'invalid' }),
  });

  assert.equal(successResponse.status, 200);
  assert.deepEqual(await responseJson(successResponse), similarFixture);
  assert.equal(invalidResponse.status, 200);
  assert.deepEqual(await responseJson(invalidResponse), []);
  assert.equal(calls, 1);
});

test('相似动漫依赖异常保持 500 和 error 字符串', async () => {
  const handler = createSimilarAnimesHandler(async () => {
    throw new Error('synthetic similar failure');
  });

  const response = await handler(new Request('http://fixture.invalid'), {
    params: Promise.resolve({ id: String(detailFixture.id) }),
  });

  assert.equal(response.status, 500);
  assert.deepEqual(await responseJson(response), { error: 'synthetic similar failure' });
});

test('标签列表保持 200 黄金响应和 500 错误结构', async () => {
  const success = createTagsHandler(async () => tagsFixture);
  const failure = createTagsHandler(async () => {
    throw new Error('synthetic tags failure');
  });

  const successResponse = await success(
    new NextRequest('http://fixture.invalid/api/tags?limit=1'),
  );
  const failureResponse = await failure(
    new NextRequest('http://fixture.invalid/api/tags'),
  );

  assert.equal(successResponse.status, 200);
  assert.deepEqual(await responseJson(successResponse), tagsFixture.slice(0, 1));
  assert.equal(successResponse.headers.get('cache-control'), PUBLIC_READ_CACHE_CONTROL);
  assert.equal(failureResponse.status, 500);
  assert.deepEqual(await responseJson(failureResponse), { error: 'synthetic tags failure' });
});

test('标签 limit 缺省、非法和越界值始终钳制到有界范围', async () => {
  assert.equal(parseTagsLimit(null), DEFAULT_TAG_LIMIT);
  assert.equal(parseTagsLimit('invalid'), DEFAULT_TAG_LIMIT);
  assert.equal(parseTagsLimit('-5'), 1);
  assert.equal(parseTagsLimit('0'), 1);
  assert.equal(parseTagsLimit('999'), MAX_TAG_LIMIT);
  assert.equal(parseTagsLimit('2'), 2);

  const manyTags = Array.from({ length: MAX_TAG_LIMIT + 5 }, (_, index) => ({
    id: index + 1,
    name: `tag-${index + 1}`,
  }));
  const response = await createTagsHandler(async () => manyTags)(
    new NextRequest('http://fixture.invalid/api/tags?limit=999'),
  );
  assert.equal((await responseJson(response) as unknown[]).length, MAX_TAG_LIMIT);
});

test('Android 更新清单保持 200 黄金响应、缓存头和 502 错误结构', async () => {
  const success = createAndroidUpdateHandler(async () => androidUpdateFixture);
  const failure = createAndroidUpdateHandler(async () => {
    throw new Error('synthetic GitHub failure');
  });

  const successResponse = await success();
  const failureResponse = await withMutedConsoleError(() => failure());

  assert.equal(successResponse.status, 200);
  assert.deepEqual(await responseJson(successResponse), androidUpdateFixture);
  assert.equal(successResponse.headers.get('cache-control'), ANDROID_UPDATE_CACHE_CONTROL);
  assert.equal(failureResponse.status, 502);
  assert.deepEqual(await responseJson(failureResponse), {
    error: 'Update metadata unavailable',
  });
});

test('公开广告配置保持 200 黄金响应和 500 错误结构', async () => {
  const success = createAdsHandler(async () => adsFixture);
  const failure = createAdsHandler(async () => {
    throw new Error('synthetic ads failure');
  });

  const successResponse = await success();
  const failureResponse = await withMutedConsoleError(() => failure());

  assert.equal(successResponse.status, 200);
  assert.deepEqual(await responseJson(successResponse), adsFixture);
  assert.equal(successResponse.headers.get('cache-control'), PUBLIC_READ_CACHE_CONTROL);
  assert.equal(failureResponse.status, 500);
  assert.deepEqual(await responseJson(failureResponse), { error: 'synthetic ads failure' });
});

test('广告配置惰性适配器原样转发公开配置', async () => {
  const dependency = createAdsDependency(async () => ({
    getPublicAdsConfig: async () => adsFixture,
  }));
  assert.deepEqual(await dependency(), adsFixture);
});

test('漫画列表保持 200 黄金响应、查询参数和缓存策略', async () => {
  let received: ListMangasOptions | undefined;
  const handler = createListMangasHandler(async (options) => {
    received = options;
    return mangaServiceFixture;
  });

  const response = await handler(new NextRequest(
    'http://fixture.invalid/api/mangas?page=2&limit=10&q=synthetic%20manga&tag=Synthetic%20Tag&rank=week',
  ));

  assert.equal(response.status, 200);
  assert.deepEqual(await responseJson(response), mangaListFixture);
  assert.equal(response.headers.get('cache-control'), PUBLIC_READ_CACHE_CONTROL);
  assert.deepEqual(received, {
    page: 2,
    limit: 10,
    q: 'synthetic manga',
    tag: 'Synthetic Tag',
    rank: 'week',
  });
});

test('漫画列表保持功能关闭 404 和依赖异常 500 契约', async () => {
  const disabled = createListMangasHandler(async () => null);
  const failure = createListMangasHandler(async () => {
    throw new Error('synthetic manga failure');
  });

  const disabledResponse = await disabled(
    new NextRequest('http://fixture.invalid/api/mangas'),
  );
  const failureResponse = await withMutedConsoleError(() =>
    failure(new NextRequest('http://fixture.invalid/api/mangas')),
  );

  assert.equal(disabledResponse.status, 404);
  assert.deepEqual(await responseJson(disabledResponse), { error: 'Manga disabled' });
  assert.equal(disabledResponse.headers.get('cache-control'), null);
  assert.equal(failureResponse.status, 500);
  assert.deepEqual(await responseJson(failureResponse), { error: 'synthetic manga failure' });
  assert.equal(failureResponse.headers.get('cache-control'), null);
});

test('健康检查保持成功和失败黄金契约', async () => {
  const success = createHealthHandler(async () => healthFixture.success.result);
  const failure = createHealthHandler(async () => {
    throw new Error(healthFixture.failure.error);
  });

  const successResponse = await success();
  const failureResponse = await failure();

  assert.equal(successResponse.status, 200);
  assert.deepEqual(await responseJson(successResponse), healthFixture.success);
  assert.equal(failureResponse.status, 500);
  assert.deepEqual(await responseJson(failureResponse), healthFixture.failure);
});

test('null 字段仍作为公开契约必选键存在', () => {
  assertOwnKeys(listFixture.data[0], ['id', 'title', 'cover', 'viewCount', 'titleEnglish']);
  assert.equal(listFixture.data[0].cover, null);
  assertOwnKeys(detailFixture, [
    'id',
    'title',
    'titleEnglish',
    'titleJapanese',
    'description',
    'cover',
    'fanart',
    'videoUrl',
    'releaseYear',
    'releaseDate',
    'viewCount',
    'favoriteCount',
    'isActive',
    'categoryId',
    'createdAt',
    'updatedAt',
    'tags',
  ]);
  assert.equal(detailFixture.titleEnglish, null);
  assertOwnKeys(detailFixture.tags[0], ['id', 'name', 'description']);
  assert.equal(detailFixture.tags[0].description, null);
  assertOwnKeys(similarFixture[0], ['id', 'title', 'cover', 'fanart', 'viewCount']);
  assert.equal(similarFixture[0].fanart, null);
});

test('黄金 fixtures 与结构化 OpenAPI required 声明一致', () => {
  const schemas = getOpenApiSchemas();
  const required = {
    Error: ['error'],
    HealthOk: ['ok', 'database', 'result', 'version'],
    HealthError: ['ok', 'error'],
    Pagination: ['page', 'limit', 'total', 'totalPages'],
    AnimeListItem: ['id', 'title', 'cover', 'viewCount', 'titleEnglish'],
    AnimeListResponse: ['data', 'pagination'],
    Tag: ['id', 'name', 'description'],
    TagSummary: ['id', 'name'],
    AnimeDetail: [
      'id',
      'title',
      'titleEnglish',
      'titleJapanese',
      'description',
      'cover',
      'fanart',
      'videoUrl',
      'releaseYear',
      'releaseDate',
      'viewCount',
      'favoriteCount',
      'isActive',
      'categoryId',
      'createdAt',
      'updatedAt',
      'tags',
    ],
    AnimeSimilarItem: ['id', 'title', 'cover', 'fanart', 'viewCount'],
    PublicAdsConfig: ['feedSlots', 'reader', 'player'],
    PublicFeedAdSlot: ['enabled', 'name', 'interval', 'href', 'html'],
    PublicReaderAdSlot: ['enabled', 'html', 'interval'],
    PublicPlayerPreRollAd: [
      'enabled',
      'videoUrl',
      'imageUrl',
      'html',
      'clickUrl',
      'playDuration',
      'totalDuration',
      'muted',
    ],
    PublicPlayerPauseAd: ['enabled', 'videoUrl', 'imageUrl', 'html', 'clickUrl', 'muted'],
    AndroidUpdateAsset: ['name', 'url', 'size', 'sha256'],
    AndroidUpdateManifest: [
      'schemaVersion',
      'packageName',
      'versionCode',
      'releaseTag',
      'releaseName',
      'publishedAt',
      'releasePageUrl',
      'apks',
      'checksums',
    ],
  } as const;

  for (const [schemaName, keys] of Object.entries(required)) {
    assertSchemaRequired(schemas, schemaName, keys);
  }

  assertOwnKeys(listFixture, required.AnimeListResponse);
  assertOwnKeys(listFixture.data[0], required.AnimeListItem);
  assertOwnKeys(listFixture.pagination, required.Pagination);
  assertOwnKeys(detailFixture, required.AnimeDetail);
  assertOwnKeys(detailFixture.tags[0], required.Tag);
  assertOwnKeys(similarFixture[0], required.AnimeSimilarItem);
  assertOwnKeys(tagsFixture[0], required.TagSummary);
  assertOwnKeys(healthFixture.success, required.HealthOk);
  assertOwnKeys(healthFixture.failure, required.HealthError);
  assertOwnKeys(adsFixture, required.PublicAdsConfig);
  assertOwnKeys(adsFixture.feedSlots[0], required.PublicFeedAdSlot);
  assertOwnKeys(adsFixture.reader.top, required.PublicReaderAdSlot);
  assertOwnKeys(adsFixture.player.preRollAd, required.PublicPlayerPreRollAd);
  assertOwnKeys(adsFixture.player.pauseAd, required.PublicPlayerPauseAd);
  assertOwnKeys(androidUpdateFixture, required.AndroidUpdateManifest);
  for (const apk of Object.values(androidUpdateFixture.apks)) {
    assertOwnKeys(apk, required.AndroidUpdateAsset);
  }
  assertOwnKeys(androidUpdateFixture.checksums, required.AndroidUpdateAsset);
  assert.equal(schemas.AnimeSimilarItem.required?.includes('matches'), false);
});
