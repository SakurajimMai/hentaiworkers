import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  buildPaginationHref,
  getPaginationModel,
} from '../components/pagination-model';
import { LibraryPagination } from '../components/library-pagination';

(globalThis as typeof globalThis & { React: typeof React }).React = React;

test('站点分页生成紧凑页码并钳制无效边界', () => {
  assert.deepEqual(getPaginationModel(0, 0), {
    page: 1,
    totalPages: 1,
    items: [1],
  });
  assert.deepEqual(getPaginationModel(99, 12), {
    page: 12,
    totalPages: 12,
    items: [1, 'ellipsis-start', 8, 9, 10, 11, 12],
  });
  assert.deepEqual(getPaginationModel(6, 12).items, [
    1,
    'ellipsis-start',
    5,
    6,
    7,
    'ellipsis-end',
    12,
  ]);
});

test('站点分页链接覆盖自身页码并保留其他查询参数', () => {
  const query = {
    animePage: '8',
    mangaPage: '3',
    view: 'grid',
    tag: ['剧情', '短篇'],
    blank: '',
    missing: undefined,
  } as const;

  assert.equal(
    buildPaginationHref('/favorites', 1, query, 'animePage'),
    '/favorites?mangaPage=3&view=grid&tag=%E5%89%A7%E6%83%85&tag=%E7%9F%AD%E7%AF%87&blank=',
  );
  assert.equal(
    buildPaginationHref('/favorites', 4, query, 'animePage'),
    '/favorites?mangaPage=3&view=grid&tag=%E5%89%A7%E6%83%85&tag=%E7%9F%AD%E7%AF%87&blank=&animePage=4',
  );
  assert.equal(
    buildPaginationHref('/history', Number.NaN, { page: '9', error: '1' }),
    '/history?error=1',
  );
});

test('站点分页渲染链接、当前页、边界状态和可见焦点环', () => {
  const markup = renderToStaticMarkup(
    React.createElement(LibraryPagination, {
      page: 1,
      totalPages: 10,
      total: 96,
      basePath: '/favorites',
      query: { animePage: '1', mangaPage: '3' },
      pageParam: 'animePage',
      ariaLabel: '里番收藏分页',
    }),
  );

  assert.match(markup, /aria-label="里番收藏分页"/);
  assert.match(markup, /第 1\/10 页 · 共 96 条/);
  assert.match(markup, /aria-label="上一页"[^>]*aria-disabled="true"/);
  assert.match(markup, /aria-current="page"[^>]*aria-label="第 1 页，当前页"/);
  assert.match(markup, /href="\/favorites\?mangaPage=3&amp;animePage=2"/);
  assert.match(markup, /focus-visible:ring-2/);
  assert.match(markup, /flex-wrap/);
  assert.match(markup, />…<\/span>/);
});

test('站点分页在末页禁用下一页且单页无需导航', () => {
  const lastPage = renderToStaticMarkup(
    React.createElement(LibraryPagination, {
      page: 99,
      totalPages: 3,
      basePath: '/history',
    }),
  );
  assert.match(lastPage, /aria-current="page"[^>]*aria-label="第 3 页，当前页"/);
  assert.match(lastPage, /aria-label="下一页"[^>]*aria-disabled="true"/);

  const onePage = renderToStaticMarkup(
    React.createElement(LibraryPagination, {
      page: 1,
      totalPages: 1,
      total: 7,
      basePath: '/history',
    }),
  );
  assert.equal(onePage, '<p class="font-ui text-sm text-soft">共 7 条</p>');
});
