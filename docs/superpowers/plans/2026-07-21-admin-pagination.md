# 后台数字分页实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将后台通用分页改为带首尾页、省略号和左右箭头的数字分页，同时保留现有筛选参数。

**Architecture:** 使用独立纯函数生成规范化页码模型和 URL，组件只负责把模型渲染为服务端 `Link`。用户列表和标签列表继续复用同一个 `AdminPagination`，不修改查询层。

**Tech Stack:** Next.js 15、React 19、TypeScript、Node.js test runner、Tailwind CSS

---

### Task 1：建立可测试的页码模型

**Files:**
- Create: `components/admin/admin-pagination-model.ts`
- Create: `tests/admin/admin-pagination.test.ts`

- [ ] **Step 1：先写页码窗口和 URL 的失败测试**

```ts
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
  assert.deepEqual(getAdminPaginationModel(1, 10).items, [1, 2, 3, 4, 5, 'ellipsis-end', 10]);
  assert.deepEqual(getAdminPaginationModel(6, 12).items, [1, 'ellipsis-start', 5, 6, 7, 'ellipsis-end', 12]);
  assert.deepEqual(getAdminPaginationModel(10, 10).items, [1, 'ellipsis-start', 6, 7, 8, 9, 10]);
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
```

- [ ] **Step 2：运行测试并确认因模型模块不存在而失败**

Run: `npx tsx --test tests/admin/admin-pagination.test.ts`

Expected: FAIL，错误包含 `Cannot find module '../../components/admin/admin-pagination-model'`。

- [ ] **Step 3：实现最小页码模型和 URL 构造函数**

```ts
export type AdminPaginationItem = number | 'ellipsis-start' | 'ellipsis-end';

export type AdminPaginationModel = Readonly<{
  page: number;
  totalPages: number;
  items: readonly AdminPaginationItem[];
}>;

function positiveInteger(value: number, fallback: number) {
  return Number.isFinite(value) && value > 0 ? Math.trunc(value) : fallback;
}

export function getAdminPaginationModel(page: number, totalPages: number): AdminPaginationModel {
  const normalizedTotalPages = positiveInteger(totalPages, 1);
  const normalizedPage = Math.min(
    normalizedTotalPages,
    positiveInteger(page, 1),
  );

  let items: AdminPaginationItem[];
  if (normalizedTotalPages <= 7) {
    items = Array.from({ length: normalizedTotalPages }, (_, index) => index + 1);
  } else if (normalizedPage <= 4) {
    items = [1, 2, 3, 4, 5, 'ellipsis-end', normalizedTotalPages];
  } else if (normalizedPage >= normalizedTotalPages - 3) {
    items = [
      1,
      'ellipsis-start',
      normalizedTotalPages - 4,
      normalizedTotalPages - 3,
      normalizedTotalPages - 2,
      normalizedTotalPages - 1,
      normalizedTotalPages,
    ];
  } else {
    items = [
      1,
      'ellipsis-start',
      normalizedPage - 1,
      normalizedPage,
      normalizedPage + 1,
      'ellipsis-end',
      normalizedTotalPages,
    ];
  }

  return { page: normalizedPage, totalPages: normalizedTotalPages, items };
}

export function buildAdminPaginationHref(
  basePath: string,
  page: number,
  query?: Record<string, string | undefined>,
) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value && key !== 'page') params.set(key, value);
  }
  params.set('page', String(page));
  return `${basePath}?${params.toString()}`;
}
```

- [ ] **Step 4：运行目标测试并确认模型测试通过**

Run: `npx tsx --test tests/admin/admin-pagination.test.ts`

Expected: 4 tests passed, 0 failed。

- [ ] **Step 5：提交页码模型**

```bash
git add components/admin/admin-pagination-model.ts tests/admin/admin-pagination.test.ts
git commit -m "feat(admin): add numeric pagination model"
```

### Task 2：将后台组件渲染为数字分页

**Files:**
- Modify: `components/admin/admin-pagination.tsx`
- Modify: `tests/admin/admin-pagination.test.ts`

- [ ] **Step 1：先写组件渲染的失败测试**

```ts
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AdminPagination } from '../../components/admin/admin-pagination';

test('后台分页渲染数字链接、当前页和禁用边界箭头', () => {
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
  assert.match(firstPage, /aria-label="上一页"[^>]*aria-disabled="true"/);
  assert.match(firstPage, /aria-current="page"[^>]*>1<\/span>/);
  assert.match(firstPage, /href="\/admin\/users\?q=sakura&amp;page=2"/);
  assert.match(firstPage, />…<\/span>/);

  const lastPage = renderToStaticMarkup(
    React.createElement(AdminPagination, {
      page: 10,
      totalPages: 10,
      total: 96,
      basePath: '/admin/users',
    }),
  );
  assert.match(lastPage, /aria-label="下一页"[^>]*aria-disabled="true"/);
});
```

- [ ] **Step 2：运行测试并确认旧组件缺少数字分页语义**

Run: `npx tsx --test tests/admin/admin-pagination.test.ts`

Expected: FAIL，错误指向缺少 `aria-label="分页"` 或 `aria-current="page"`。

- [ ] **Step 3：升级 `AdminPagination` 渲染**

实现时：

- 从 `@/components/icons` 导入 `IconChevronLeft`、`IconChevronRight`。
- 从模型模块导入 `buildAdminPaginationHref`、`getAdminPaginationModel`。
- 外层保留总数摘要，导航使用 `<nav aria-label="分页">`。
- 可点击箭头和页码使用服务端 `Link`；边界箭头及当前页使用不可点击 `span`。
- 所有控件使用固定 `h-10 min-w-10`，当前页为深色底，普通页为白底描边，窄屏通过 `flex-wrap` 换行。
- 省略号渲染为 `aria-hidden="true"` 的不可点击文本。

- [ ] **Step 4：运行目标测试并确认全部通过**

Run: `npx tsx --test tests/admin/admin-pagination.test.ts`

Expected: 5 tests passed, 0 failed。

- [ ] **Step 5：运行完整验证**

Run: `npm test`

Expected: TypeScript 与 Python 测试全部通过。

Run: `npm run lint`

Expected: ESLint 退出码 0 且无 warning。

Run: `npx tsc --noEmit`

Expected: TypeScript 退出码 0。

- [ ] **Step 6：提交组件实现**

```bash
git add components/admin/admin-pagination.tsx tests/admin/admin-pagination.test.ts
git commit -m "feat(admin): render numeric pagination"
```
