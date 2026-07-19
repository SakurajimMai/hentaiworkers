import assert from 'node:assert/strict';
import test from 'node:test';
import {
  profileConfigFromForm,
  profileFormDefaults,
  type ProfileFormDefaults,
} from '../../app/admin/crawler/form-config';
import { parseCrawlerProfileConfig } from '../../lib/server/crawler/domain/config';
import { getMacCmsPreset } from '../../lib/server/crawler/domain/maccms-presets';

function form(entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) {
    fd.set(k, v);
  }
  return fd;
}

function defaultsForm(defaults: ProfileFormDefaults): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(defaults)) {
    if (typeof value === 'boolean') {
      if (value) fd.set(key, '1');
      continue;
    }
    fd.set(key, String(value));
  }
  return fd;
}

test('generic MacCMS preset requires an explicit API URL', () => {
  assert.equal(getMacCmsPreset('maccms')?.baseUrl, '');
});

test('profileConfigFromForm builds ikun MacCMS config with typeIds and filters', () => {
  const json = profileConfigFromForm(
    form({
      name: 'ikun-jp',
      requiredSource: 'ikun',
      baseUrl: 'https://ikunzyapi.com/api.php/provide/vod/',
      typeIds: '37',
      playFrom: 'ikm3u8',
      maxPages: '2',
      maxItems: '50',
      hours: '24',
      pageOrder: 'reverse',
      years: '2026',
      months: '7',
      qualityPriority: '1080,720',
      filterJpKr: '1',
      autoDetectTypes: '1',
      continueOnError: '1',
      downloadConcurrency: '2',
      parseConcurrency: '2',
      pageConcurrency: '4',
      maxActiveJobs: '1',
      storageDriver: 'external',
    }),
  );
  const config = parseCrawlerProfileConfig(JSON.parse(json));
  assert.equal(config.requiredSource, 'ikun');
  assert.equal(config.source.baseUrl, 'https://ikunzyapi.com/api.php/provide/vod/');
  assert.equal(config.source.provider, 'ikun');
  assert.deepEqual(config.source.typeIds, [37]);
  assert.equal(config.source.playFrom, 'ikm3u8');
  assert.equal(config.source.maxPages, 2);
  assert.equal(config.source.maxItems, 50);
  assert.equal(config.source.hours, 24);
  assert.equal(config.source.pageOrder, 'reverse');
  assert.equal(config.source.filterJpKr, true);
  assert.equal(config.source.autoDetectTypes, true);
  assert.equal(config.concurrency.page, 4);
  assert.deepEqual(config.dateFilter.years, [2026]);
});

test('profileConfigFromForm hanime omits MacCMS-only fields', () => {
  const json = profileConfigFromForm(
    form({
      requiredSource: 'hanime',
      baseUrl: 'https://hanime1.me',
      years: '2026',
      months: '1',
      qualityPriority: '1080',
      genre: 'foo',
      storageDriver: 's3',
      enableCover: '1',
      enableFanart: '1',
    }),
  );
  const config = parseCrawlerProfileConfig(JSON.parse(json));
  assert.equal(config.requiredSource, 'hanime');
  assert.equal(config.source.genre, 'foo');
  assert.equal(config.source.provider, undefined);
  assert.equal(config.source.typeIds, undefined);
  assert.equal(config.storageDriver, 's3');
  assert.equal(config.source.pageOrder, undefined);
});

test('profileConfigFromForm filterJpKr false when checkbox omitted', () => {
  const json = profileConfigFromForm(
    form({
      requiredSource: 'bfzy',
      baseUrl: 'https://bfzyapi.com/api.php/provide/vod/',
      years: '2026',
      months: '1,2',
      qualityPriority: '1080',
    }),
  );
  const config = parseCrawlerProfileConfig(JSON.parse(json));
  assert.equal(config.source.filterJpKr, false);
  assert.equal(config.source.autoDetectTypes, false);
  assert.deepEqual(config.source.typeIds, []);
  assert.equal(config.source.provider, 'bfzy');
});

test('profileFormDefaults maps every editable MacCMS field and round-trips it', () => {
  const original = parseCrawlerProfileConfig({
    schemaVersion: 1,
    source: {
      baseUrl: 'https://custom.example/api.php/provide/vod/',
      provider: 'custom-provider',
      typeIds: [59, 37],
      playFrom: 'customm3u8',
      hours: 36,
      type: 'anime',
      genre: '动画',
      sort: 'time',
      maxPages: 8,
      maxItems: 321,
      pageOrder: 'from_end',
      filterJpKr: true,
      autoDetectTypes: false,
    },
    dateFilter: { years: [2025, 2026], months: [1, 7, 12] },
    qualityPriority: ['2160', '1080', '720'],
    skipKeywords: ['预告', '中字後補'],
    concurrency: { download: 3, parse: 4, page: 5 },
    continueOnError: false,
    maxActiveJobs: 2,
    requiredSource: 'maccms',
  });

  const defaults = profileFormDefaults('自定义动漫源', original);
  assert.deepEqual(defaults, {
    name: '自定义动漫源',
    requiredSource: 'maccms',
    provider: 'custom-provider',
    baseUrl: 'https://custom.example/api.php/provide/vod/',
    typeIds: '59,37',
    playFrom: 'customm3u8',
    hours: 36,
    type: 'anime',
    genre: '动画',
    sort: 'time',
    maxPages: 8,
    maxItems: 321,
    pageOrder: 'from_end',
    filterJpKr: true,
    autoDetectTypes: false,
    years: '2025,2026',
    months: '1,7,12',
    qualityPriority: '2160,1080,720',
    skipKeywords: '预告,中字後補',
    downloadConcurrency: 3,
    parseConcurrency: 4,
    pageConcurrency: 5,
    maxActiveJobs: 2,
    continueOnError: false,
    skipExisting: true,
    requestDelaySeconds: 1,
    enableCover: true,
    enableFanart: true,
    maxFanartImages: 50,
    storageDriver: 'external',
  });

  const roundTrip = parseCrawlerProfileConfig(
    JSON.parse(profileConfigFromForm(defaultsForm(defaults))),
  );
  assert.deepEqual(roundTrip.source, original.source);
  assert.deepEqual(roundTrip.dateFilter, original.dateFilter);
  assert.deepEqual(roundTrip.qualityPriority, original.qualityPriority);
  assert.deepEqual(roundTrip.skipKeywords, original.skipKeywords);
  assert.deepEqual(roundTrip.concurrency, original.concurrency);
  assert.equal(roundTrip.continueOnError, original.continueOnError);
  assert.equal(roundTrip.maxActiveJobs, original.maxActiveJobs);
  assert.equal(roundTrip.requiredSource, original.requiredSource);
});

test('profileFormDefaults maps every editable Hanime field and round-trips it', () => {
  const original = parseCrawlerProfileConfig({
    schemaVersion: 1,
    source: {
      baseUrl: 'https://hanime.example',
      genre: '裏番',
      sort: 'likes',
      type: 'ova',
    },
    dateFilter: { years: [2024, 2026], months: [2, 8] },
    qualityPriority: ['1080', '720'],
    skipKeywords: ['preview'],
    concurrency: { download: 7, parse: 6, page: 4 },
    continueOnError: true,
    maxActiveJobs: 3,
    maxItems: 88,
    skipExisting: false,
    requestDelaySeconds: 2.5,
    media: {
      enableVideo: true,
      enableCover: false,
      enableFanart: true,
      maxFanartImages: 17,
    },
    requiredSource: 'hanime',
    storageDriver: 'sftp',
  });

  const defaults = profileFormDefaults('Hanime 完整模板', original);
  assert.equal(defaults.name, 'Hanime 完整模板');
  assert.equal(defaults.requiredSource, 'hanime');
  assert.equal(defaults.provider, '');
  assert.equal(defaults.maxItems, 88);
  assert.equal(defaults.skipExisting, false);
  assert.equal(defaults.requestDelaySeconds, 2.5);
  assert.equal(defaults.enableCover, false);
  assert.equal(defaults.enableFanart, true);
  assert.equal(defaults.maxFanartImages, 17);
  assert.equal(defaults.storageDriver, 'sftp');

  const roundTrip = parseCrawlerProfileConfig(
    JSON.parse(profileConfigFromForm(defaultsForm(defaults))),
  );
  assert.deepEqual(roundTrip.source, original.source);
  assert.deepEqual(roundTrip.dateFilter, original.dateFilter);
  assert.deepEqual(roundTrip.qualityPriority, original.qualityPriority);
  assert.deepEqual(roundTrip.skipKeywords, original.skipKeywords);
  assert.deepEqual(roundTrip.concurrency, original.concurrency);
  assert.equal(roundTrip.continueOnError, original.continueOnError);
  assert.equal(roundTrip.maxActiveJobs, original.maxActiveJobs);
  assert.equal(roundTrip.maxItems, original.maxItems);
  assert.equal(roundTrip.skipExisting, original.skipExisting);
  assert.equal(roundTrip.requestDelaySeconds, original.requestDelaySeconds);
  assert.deepEqual(roundTrip.media, original.media);
  assert.equal(roundTrip.requiredSource, original.requiredSource);
  assert.equal(roundTrip.storageDriver, original.storageDriver);
});

test('editing preserves MacCMS compatibility fields that are not directly edited', () => {
  const original = parseCrawlerProfileConfig({
    schemaVersion: 1,
    source: {
      baseUrl: 'https://legacy.example/api.php/provide/vod/',
      provider: 'legacy',
      typeIds: [],
      autoDetectTypes: true,
      maxPages: 3,
      pageOrder: 'reverse',
    },
    dateFilter: { years: [2026], months: [7] },
    qualityPriority: ['1080'],
    skipKeywords: [],
    concurrency: { download: 2, parse: 2, page: 2 },
    continueOnError: true,
    maxActiveJobs: 1,
    maxItems: 17,
    skipExisting: false,
    requestDelaySeconds: 2.5,
    media: {
      enableVideo: true,
      enableCover: false,
      enableFanart: false,
      maxFanartImages: 9,
    },
    requiredSource: 'maccms',
    deprecated: { legacyFlag: true },
  });

  const defaults = profileFormDefaults('兼容模板', original);
  assert.equal(defaults.autoDetectTypes, true);
  const roundTrip = parseCrawlerProfileConfig(
    JSON.parse(profileConfigFromForm(defaultsForm(defaults), original)),
  );
  assert.deepEqual(roundTrip, original);
});

test('editing preserves legacy profiles without an explicit requiredSource', () => {
  const legacyHanime = parseCrawlerProfileConfig({
    schemaVersion: 1,
    source: { baseUrl: 'https://hanime.example', genre: '裏番' },
    dateFilter: { years: [2026], months: [7] },
    qualityPriority: ['1080'],
    skipKeywords: [],
    concurrency: { download: 2, parse: 2 },
    continueOnError: true,
    maxActiveJobs: 1,
  });
  const hanimeDefaults = profileFormDefaults('旧 Hanime', legacyHanime);
  assert.equal(hanimeDefaults.requiredSource, 'hanime');
  const hanimeRoundTrip = parseCrawlerProfileConfig(
    JSON.parse(profileConfigFromForm(defaultsForm(hanimeDefaults), legacyHanime)),
  );
  assert.deepEqual(hanimeRoundTrip, legacyHanime);

  const legacyMacCms = parseCrawlerProfileConfig({
    schemaVersion: 1,
    source: {
      baseUrl: 'https://custom.example/api.php/provide/vod/',
      provider: 'custom-provider',
      typeIds: [],
    },
    dateFilter: { years: [2026], months: [7] },
    qualityPriority: ['1080'],
    skipKeywords: [],
    concurrency: { download: 2, parse: 2 },
    continueOnError: true,
    maxActiveJobs: 1,
  });
  const macDefaults = profileFormDefaults('旧 MacCMS', legacyMacCms);
  assert.equal(macDefaults.requiredSource, 'maccms');
  assert.equal(macDefaults.provider, 'custom-provider');
  const macRoundTrip = parseCrawlerProfileConfig(
    JSON.parse(profileConfigFromForm(defaultsForm(macDefaults), legacyMacCms)),
  );
  assert.deepEqual(macRoundTrip, legacyMacCms);
});
