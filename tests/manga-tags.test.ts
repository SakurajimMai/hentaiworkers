import assert from 'node:assert/strict';
import test from 'node:test';
import {
  cleanMangaDisplayTitle,
  mangaRecordHasTag,
  mangaTagHref,
  normalizeMangaTagQuery,
  normalizeMangaTags,
  parseMangaTags,
} from '../lib/manga-tags';

test('解析 JSON 漫画标签并去掉空白', () => {
  assert.deepEqual(parseMangaTags('["萝莉", " 纯爱 ", ""]'), ['萝莉', '纯爱']);
});

test('解析旧的逗号分隔漫画标签', () => {
  assert.deepEqual(parseMangaTags('校园，后宫、NTR'), ['校园', '后宫', 'NTR']);
});

test('漫画标签去重并限制数量', () => {
  const tags = normalizeMangaTags(['A', 'a', 'A', ' B ']);
  assert.deepEqual(tags, ['A', 'a', 'B']);
});

test('漫画标签精确匹配，不把子串当成标签', () => {
  const raw = JSON.stringify(['超级萝莉', '纯爱']);
  assert.equal(mangaRecordHasTag(raw, '超级萝莉'), true);
  assert.equal(mangaRecordHasTag(raw, '萝莉'), false);
  assert.equal(mangaRecordHasTag(raw, '里番标签名'), false);
});

test('漫画标签链接只指向漫画目录', () => {
  assert.equal(mangaTagHref('校园'), '/manga?tag=%E6%A0%A1%E5%9B%AD');
  assert.equal(mangaTagHref('  '), '/manga');
});

test('查询标签会做 NFKC 规范化', () => {
  assert.equal(normalizeMangaTagQuery('  Ａ '), 'A');
});

test('漫画标题去掉原作/角色模板尾巴', () => {
  assert.equal(
    cleanMangaDisplayTitle('早乙女乱马 铃鹿御前 BBC 原作： Order'),
    '早乙女乱马 铃鹿御前 BBC',
  );
  assert.equal(cleanMangaDisplayTitle('kei SPH/BBC 原作: 角色:'), 'kei SPH/BBC');
});
