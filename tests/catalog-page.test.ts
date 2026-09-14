import assert from 'node:assert/strict';
import test from 'node:test';
import { catalogPageForPrecedingCount } from '../lib/catalog-page';

test('the first full page holds exactly one page size of works', () => {
  assert.equal(catalogPageForPrecedingCount(0, 30), 1, 'the newest work opens page 1');
  assert.equal(catalogPageForPrecedingCount(29, 30), 1, 'the last slot on page 1');
  assert.equal(catalogPageForPrecedingCount(30, 30), 2, 'the next work rolls to page 2');
  assert.equal(catalogPageForPrecedingCount(59, 30), 2);
  assert.equal(catalogPageForPrecedingCount(60, 30), 3);
});

test('page size is honoured per catalog', () => {
  // /browse shows 40 per page, /manga shows 30.
  assert.equal(catalogPageForPrecedingCount(39, 40), 1);
  assert.equal(catalogPageForPrecedingCount(40, 40), 2);
  assert.equal(catalogPageForPrecedingCount(40, 30), 2);
  assert.equal(catalogPageForPrecedingCount(828, 30), 28);
});

test('unusable inputs fall back to page 1 rather than producing a broken link', () => {
  assert.equal(catalogPageForPrecedingCount(-1, 30), 1);
  assert.equal(catalogPageForPrecedingCount(Number.NaN, 30), 1);
  assert.equal(catalogPageForPrecedingCount(Number.POSITIVE_INFINITY, 30), 1);
  assert.equal(catalogPageForPrecedingCount(10, 0), 11, 'a zero page size behaves as one per page');
  assert.equal(catalogPageForPrecedingCount(10, Number.NaN), 11);
  assert.equal(catalogPageForPrecedingCount(30.9, 30), 2, 'fractional counts never skip a page');
});
