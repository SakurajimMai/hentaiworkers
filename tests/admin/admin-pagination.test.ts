import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildAdminPaginationHref,
  getAdminPaginationModel,
} from '../../components/admin/admin-pagination-model';

test('后台分页为短列表输出全部页码', () => {
  assert.deepEqual(getAdminPaginationModel(3, 5), {
    page: 3,
    totalPages: 5,
    items: [1, 2, 3, 4, 5],
  });
});

test('后台分页在首部、中部和尾部生成紧凑窗口', () => {
  assert.deepEqual(getAdminPaginationModel(1, 10).items, [
    1,
    2,
    3,
    4,
    5,
    'ellipsis-end',
    10,
  ]);
  assert.deepEqual(getAdminPaginationModel(6, 12).items, [
    1,
    'ellipsis-start',
    5,
    6,
    7,
    'ellipsis-end',
    12,
  ]);
  assert.deepEqual(getAdminPaginationModel(10, 10).items, [
    1,
    'ellipsis-start',
    6,
    7,
    8,
    9,
    10,
  ]);
});

test('后台分页规范化越界页码', () => {
  assert.equal(getAdminPaginationModel(0, 0).page, 1);
  assert.equal(getAdminPaginationModel(99, 8).page, 8);
});

test('后台分页链接保留筛选条件并覆盖 page', () => {
  assert.equal(
    buildAdminPaginationHref('/admin/tags', 4, {
      q: '动画',
      scope: 'used',
      page: '99',
      empty: undefined,
    }),
    '/admin/tags?q=%E5%8A%A8%E7%94%BB&scope=used&page=4',
  );
});
