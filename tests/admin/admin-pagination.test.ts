import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  buildAdminPaginationHref,
  getAdminPaginationModel,
  paginateItems,
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

test('内存列表按页切片并钳制页码', () => {
  const rows = Array.from({ length: 65 }, (_, index) => index + 1);
  const first = paginateItems(rows, 1, 30);
  assert.deepEqual(first.items[0], 1);
  assert.deepEqual(first.items.at(-1), 30);
  assert.equal(first.total, 65);
  assert.equal(first.totalPages, 3);

  const last = paginateItems(rows, 99, 30);
  assert.equal(last.page, 3);
  assert.deepEqual(last.items, [61, 62, 63, 64, 65]);
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
  assert.equal(
    buildAdminPaginationHref('/admin/mangas/14', 3, { chapter: '8' }, 'pages'),
    '/admin/mangas/14?chapter=8&pages=3',
  );
  assert.equal(buildAdminPaginationHref('/admin/animes', 1), '/admin/animes');
});

test('后台分页渲染数字链接、当前页和禁用边界箭头', async () => {
  (globalThis as typeof globalThis & { React: typeof React }).React = React;
  const { AdminPagination } = await import(
    '../../components/admin/admin-pagination'
  );
  const firstPage = renderToStaticMarkup(
    React.createElement(AdminPagination, {
      page: 1,
      totalPages: 10,
      total: 96,
      basePath: '/admin/users',
      query: { q: 'sakura' },
    }),
  );

  assert.match(firstPage, /aria-label="分页"/);
  assert.match(
    firstPage,
    /aria-label="上一页"[^>]*aria-disabled="true"/,
  );
  assert.match(firstPage, /aria-current="page"[^>]*>1<\/span>/);
  assert.match(
    firstPage,
    /href="\/admin\/users\?q=sakura&amp;page=2"/,
  );
  assert.match(firstPage, />首页<\/span>/);
  assert.match(firstPage, /href="\/admin\/users\?q=sakura&amp;page=10"[^>]*>末页<\/a>/);
  assert.match(firstPage, /name="page"/);
  assert.match(firstPage, />…<\/span>/);

  const lastPage = renderToStaticMarkup(
    React.createElement(AdminPagination, {
      page: 10,
      totalPages: 10,
      total: 96,
      basePath: '/admin/users',
    }),
  );
  assert.match(
    lastPage,
    /aria-label="下一页"[^>]*aria-disabled="true"/,
  );
});
