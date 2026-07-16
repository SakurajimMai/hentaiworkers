import assert from 'node:assert/strict';
import test from 'node:test';
import { profileConfigFromForm } from '../../app/admin/crawler/form-config';
import { parseCrawlerProfileConfig } from '../../lib/server/crawler/domain/config';

function form(entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) {
    fd.set(k, v);
  }
  return fd;
}

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
  assert.equal(config.source.autoDetectTypes, false);
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
