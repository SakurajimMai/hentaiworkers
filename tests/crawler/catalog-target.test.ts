import assert from 'node:assert/strict';
import test from 'node:test';
import { catalogTargetForSource } from '../../lib/server/crawler/domain/catalog-target';

test('MacCMS provider keys route to anime_works', () => {
  for (const source of ['ikun', 'wujin', 'yaya', 'bfzy', 'okzy', 'hongniu', 'maccms', 'IKUN']) {
    assert.equal(catalogTargetForSource(source), 'anime_works', source);
  }
});

test('legacy sources stay on animes catalog', () => {
  assert.equal(catalogTargetForSource('hanime'), 'legacy_animes');
  assert.equal(catalogTargetForSource('getchu'), 'legacy_animes');
  assert.equal(catalogTargetForSource(''), 'legacy_animes');
});
