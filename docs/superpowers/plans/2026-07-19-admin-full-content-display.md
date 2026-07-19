# Admin Full Content Display Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让里番编辑页按数据库原值完整换行展示视频、封面、剧照和简介，不截断也不改写内容。

**Architecture:** 新增一个只负责高度同步的后台自适应文本域客户端组件，保留原生 `textarea` 表单语义。里番编辑页仅替换控件，不改变 Server Action、字段名或数据清洗规则。

**Tech Stack:** Next.js 15 App Router、React 19、TypeScript、Tailwind CSS、Node test runner、`react-dom/server`

**Repository Constraint:** 不自动 commit；每个任务用 `git diff --check` 和聚焦测试作为检查点。

---

### Task 1: 自适应文本域组件

**Files:**
- Create: `components/admin/auto-grow-textarea.tsx`
- Create: `tests/admin/full-content-fields.test.tsx`

- [ ] **Step 1: 写入失败测试，证明长原值完整进入 textarea**

```tsx
import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { AutoGrowTextarea } from '../../components/admin/auto-grow-textarea';

test('AutoGrowTextarea 原样输出长内容且不设置截断属性', () => {
  const value = 'https://static.example/2026/07/完整标题/完整标题.mp4';
  const html = renderToStaticMarkup(
    <AutoGrowTextarea name="videoUrl" defaultValue={value} />,
  );

  assert.match(html, /<textarea/);
  assert.match(html, /完整标题/);
  assert.equal(html.includes('maxlength='), false);
  assert.equal(html.includes('text-overflow'), false);
  assert.equal(html.includes('line-clamp'), false);
});
```

- [ ] **Step 2: 运行测试并确认 RED**

Run: `cmd /c node_modules\.bin\tsx.cmd --test tests\admin\full-content-fields.test.tsx`

Expected: FAIL，原因是 `components/admin/auto-grow-textarea` 尚不存在。

- [ ] **Step 3: 实现最小自适应文本域**

```tsx
'use client';

import {
  useEffect,
  useRef,
  type FormEvent,
  type TextareaHTMLAttributes,
} from 'react';
import { cn } from '@/lib/utils';

export type AutoGrowTextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>;

function resizeToContent(element: HTMLTextAreaElement) {
  element.style.height = 'auto';
  element.style.height = `${element.scrollHeight}px`;
}

export function AutoGrowTextarea({
  className,
  onInput,
  rows = 2,
  ...props
}: AutoGrowTextareaProps) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (ref.current) resizeToContent(ref.current);
  }, [props.defaultValue, props.value]);

  function handleInput(event: FormEvent<HTMLTextAreaElement>) {
    resizeToContent(event.currentTarget);
    onInput?.(event);
  }

  return (
    <textarea
      {...props}
      ref={ref}
      rows={rows}
      onInput={handleInput}
      className={cn(
        'admin-input overflow-hidden whitespace-pre-wrap [overflow-wrap:anywhere]',
        className,
      )}
    />
  );
}
```

- [ ] **Step 4: 运行测试并确认 GREEN**

Run: `cmd /c node_modules\.bin\tsx.cmd --test tests\admin\full-content-fields.test.tsx`

Expected: PASS 1，0 fail。

- [ ] **Step 5: 检查组件补丁**

Run: `git diff --check -- components/admin/auto-grow-textarea.tsx tests/admin/full-content-fields.test.tsx`

Expected: exit 0，无空白错误。

### Task 2: 里番编辑页接入完整内容显示

**Files:**
- Modify: `app/admin/animes/[id]/page.tsx:1-97`
- Modify: `tests/admin/full-content-fields.test.tsx`

- [ ] **Step 1: 扩展失败测试，锁定四个字段均使用自适应文本域**

在测试文件增加：

```tsx
import { readFileSync } from 'node:fs';

test('里番编辑页的长内容字段不再使用单行输入框', () => {
  const source = readFileSync('app/admin/animes/[id]/page.tsx', 'utf8');
  for (const field of ['videoUrl', 'cover', 'fanart', 'description']) {
    assert.match(
      source,
      new RegExp(`<AutoGrowTextarea[\\s\\S]*?name=["']${field}["']`),
    );
  }
  assert.doesNotMatch(source, /<input\s+name=["'](?:videoUrl|cover)["']/);
});
```

- [ ] **Step 2: 运行测试并确认 RED**

Run: `cmd /c node_modules\.bin\tsx.cmd --test tests\admin\full-content-fields.test.tsx`

Expected: FAIL，提示编辑页尚未包含 `AutoGrowTextarea`。

- [ ] **Step 3: 替换四个控件，保留字段名和 defaultValue**

在编辑页导入：

```tsx
import { AutoGrowTextarea } from '@/components/admin/auto-grow-textarea';
```

视频、封面、剧照和简介分别改为：

```tsx
<AutoGrowTextarea
  name="videoUrl"
  required
  rows={2}
  defaultValue={anime?.videoUrl || ''}
/>

<AutoGrowTextarea
  name="cover"
  rows={2}
  defaultValue={anime?.cover || ''}
/>

<AutoGrowTextarea
  name="fanart"
  rows={4}
  defaultValue={anime?.fanart || ''}
/>

<AutoGrowTextarea
  name="description"
  rows={6}
  defaultValue={anime?.description || ''}
/>
```

不要修改 `actionSaveAnime`，因为它已经原样读取四个字段。

- [ ] **Step 4: 运行聚焦测试并确认 GREEN**

Run: `cmd /c node_modules\.bin\tsx.cmd --test tests\admin\full-content-fields.test.tsx`

Expected: PASS 2，0 fail。

- [ ] **Step 5: 运行类型检查**

Run: `cmd /c node_modules\.bin\tsc.cmd --noEmit`

Expected: exit 0，无 TypeScript 错误。

### Task 3: 完整内容显示浏览器验收

**Files:**
- Verify only: `app/admin/animes/[id]/page.tsx`

- [ ] **Step 1: 启动本地开发服务**

Run: `cmd /c npm run dev`

Expected: Next.js 输出 ready URL；若默认端口占用，使用 `cmd /c npm run dev -- -p 3001`。

- [ ] **Step 2: 桌面视口验证**

使用 in-app Browser 打开一个现有里番编辑页，视口 `1440x900`。确认视频、封面、剧照和简介均自动换行，高度覆盖完整数据库内容，字段间无重叠。

- [ ] **Step 3: 移动视口验证**

使用 `390x844` 视口复查同一页面。确认长 URL 在控件内换行，不产生横向页面滚动，保存按钮不被遮挡。

- [ ] **Step 4: 保留截图并检查控制台**

保存桌面和移动截图；确认浏览器控制台无 hydration、受控/非受控字段或布局异常警告。

---

## Plan Verification

Run:

```powershell
cmd /c node_modules\.bin\tsx.cmd --test tests\admin\full-content-fields.test.tsx
cmd /c node_modules\.bin\tsc.cmd --noEmit
git diff --check
```

Expected: 聚焦测试全绿，类型检查和 diff check 均 exit 0。
