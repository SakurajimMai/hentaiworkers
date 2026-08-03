import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import React, { type InputEvent as ReactInputEvent, type InputEventHandler } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as autoGrowTextareaModule from '../../components/admin/auto-grow-textarea';

type HeightTarget = {
  style: { height: string };
  readonly scrollHeight: number;
};

type SyncTextareaHeight = (textarea: HeightTarget) => void;
type HandleTextareaInput = (
  event: ReactInputEvent<HTMLTextAreaElement>,
  onInput?: InputEventHandler<HTMLTextAreaElement>,
) => void;

function requireFunctionExport<T>(name: string): T {
  const moduleExports = autoGrowTextareaModule as unknown as Record<string, unknown>;
  const value = moduleExports[name];
  assert.equal(typeof value, 'function', `${name} 应由自动增高组件模块导出`);
  return value as T;
}

function createHeightTarget(initialScrollHeight: number) {
  const events: string[] = [];
  let height = '';
  let scrollHeight = initialScrollHeight;
  const style = {
    get height() {
      return height;
    },
    set height(value: string) {
      height = value;
      events.push(`height:${value}`);
    },
  };
  const target: HeightTarget = {
    style,
    get scrollHeight() {
      events.push(`scrollHeight:${scrollHeight}`);
      return scrollHeight;
    },
  };

  return {
    events,
    setScrollHeight(value: number) {
      scrollHeight = value;
    },
    target,
  };
}

test('高度同步先解除旧高度再使用当前 scrollHeight', () => {
  const syncTextareaHeight =
    requireFunctionExport<SyncTextareaHeight>('syncTextareaHeight');
  const { events, target } = createHeightTarget(168);

  syncTextareaHeight(target);

  assert.deepEqual(events, ['height:auto', 'scrollHeight:168', 'height:168px']);
});

test('高度同步把文本域边框计入最终高度', () => {
  const syncTextareaHeight =
    requireFunctionExport<SyncTextareaHeight>('syncTextareaHeight');
  const target = {
    style: { height: '' },
    scrollHeight: 168,
    clientHeight: 76,
    offsetHeight: 78,
  };

  syncTextareaHeight(target);

  assert.equal(target.style.height, '170px');
});

test('输入处理重新同步高度并继续调用外部 onInput', () => {
  const syncTextareaHeight =
    requireFunctionExport<SyncTextareaHeight>('syncTextareaHeight');
  const handleAutoGrowTextareaInput =
    requireFunctionExport<HandleTextareaInput>('handleAutoGrowTextareaInput');
  const { events, setScrollHeight, target } = createHeightTarget(96);
  syncTextareaHeight(target);
  events.length = 0;
  setScrollHeight(224);
  const inputEvent = { currentTarget: target } as unknown as ReactInputEvent<HTMLTextAreaElement>;
  let receivedEvent: ReactInputEvent<HTMLTextAreaElement> | undefined;

  handleAutoGrowTextareaInput(inputEvent, (event) => {
    events.push('onInput');
    receivedEvent = event;
  });

  assert.deepEqual(events, ['height:auto', 'scrollHeight:224', 'height:224px', 'onInput']);
  assert.equal(receivedEvent, inputEvent);
});

test('单行 URL 粘贴时移除真实换行但保留其余原值', () => {
  const normalizeSingleLineText =
    requireFunctionExport<(value: string) => string>('normalizeSingleLineText');
  assert.equal(
    normalizeSingleLineText('https://media.example/a\r\n日本語\nvideo.mp4'),
    'https://media.example/a日本語video.mp4',
  );
});

test('长 Unicode URL 在自动增高文本域中完整渲染且没有截断属性', () => {
  const longUnicodeUrl = `https://media.example.com/${'动画🚀'.repeat(80)}/播放列表.m3u8`;
  const markup = renderToStaticMarkup(
    React.createElement(autoGrowTextareaModule.AutoGrowTextarea, {
      className: 'custom-textarea',
      defaultValue: longUnicodeUrl,
    }),
  );

  assert.match(markup, /^<textarea\b/);
  assert.ok(markup.includes(longUnicodeUrl));
  assert.match(markup, /class="[^"]*admin-input/);
  assert.match(markup, /class="[^"]*overflow-hidden/);
  assert.match(markup, /class="[^"]*whitespace-pre-wrap/);
  assert.match(markup, /class="[^"]*\[overflow-wrap:anywhere\]/);
  assert.match(markup, /class="[^"]*custom-textarea/);
  assert.doesNotMatch(markup, /maxlength=|line-clamp|text-overflow/i);
});

test('自动增高组件在初始值变化时重新同步并透传原始值属性', () => {
  const source = readFileSync('components/admin/auto-grow-textarea.tsx', 'utf8');

  assert.match(source, /useRef<HTMLTextAreaElement>\(null\)/);
  assert.match(source, /useEffect\(\(\) => \{[\s\S]*?syncTextareaHeight\(textareaRef\.current\)[\s\S]*?\}, \[value, defaultValue\]\)/);
  assert.match(source, /handleAutoGrowTextareaInput\(event, onInput\)/);
  assert.match(source, /value=\{value\}/);
  assert.match(source, /defaultValue=\{defaultValue\}/);
});

test('后台里番编辑页为完整内容字段接入自动增高文本域', () => {
  const source = readFileSync('app/admin/animes/[id]/page.tsx', 'utf8');
  const textareas = source.match(/<AutoGrowTextarea\b[\s\S]*?\/>/g) ?? [];
  const expectedRows = new Map([
    ['videoUrl', 2],
    ['cover', 2],
    ['fanart', 4],
    ['description', 6],
  ]);

  for (const [name, rows] of expectedRows) {
    const field = textareas.find((textarea) => textarea.includes(`name="${name}"`));
    assert.ok(field, `${name} 应使用 AutoGrowTextarea`);
    assert.match(field, new RegExp(`\\brows=\\{${rows}\\}`));
    assert.match(field, new RegExp(`defaultValue=\\{anime\\?\\.${name} \\|\\| ''\\}`));
  }

  const videoUrl = textareas.find((textarea) => textarea.includes('name="videoUrl"'));
  assert.match(videoUrl ?? '', /\brequired\b/);
  for (const name of ['videoUrl', 'cover', 'fanart']) {
    const field = textareas.find((textarea) => textarea.includes(`name="${name}"`));
    assert.match(field ?? '', /\bsingleLine\b/);
  }
  assert.doesNotMatch(source, /<input\b[^>]*\bname="(?:videoUrl|cover)"/);
});
