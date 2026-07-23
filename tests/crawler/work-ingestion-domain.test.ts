import assert from 'node:assert/strict';
import test from 'node:test';
import {
  matchUniqueWork,
  mergeWorkPlayLines,
  normalizedWorkTitles,
  type WorkCandidate,
} from '../../lib/server/crawler/domain/work-ingestion';

function candidate(patch: Partial<WorkCandidate> = {}): WorkCandidate {
  return {
    id: 7,
    title: '東京 猫猫!',
    titleEnglish: null,
    titleJapanese: null,
    aliases: null,
    releaseYear: 2026,
    playLinesJson: null,
    ...patch,
  };
}

test('normalizes title variants and splits aliases', () => {
  assert.deepEqual(
    normalizedWorkTitles({
      title: ' 東京 猫猫！ ',
      aliases: 'Tokyo Cats／東京猫猫',
    }),
    ['東京猫猫', 'tokyocats'],
  );
});

test('matches one work by normalized title and compatible year', () => {
  const result = matchUniqueWork(
    { title: '東京猫猫', releaseYear: 2026 },
    [candidate()],
  );

  assert.equal(result.kind, 'matched');
  assert.equal(result.kind === 'matched' ? result.candidate.id : null, 7);
});

test('year mismatch rejects a title match while a missing candidate year remains compatible', () => {
  assert.deepEqual(
    matchUniqueWork(
      { title: '東京猫猫', releaseYear: 2026 },
      [candidate({ releaseYear: 2025 })],
    ),
    { kind: 'not_found' },
  );
  assert.equal(
    matchUniqueWork(
      { title: '東京猫猫', releaseYear: 2026 },
      [candidate({ releaseYear: null })],
    ).kind,
    'matched',
  );
});

test('returns ambiguous when multiple works share a normalized title', () => {
  assert.deepEqual(
    matchUniqueWork(
      { title: '東京猫猫' },
      [candidate({ id: 7 }), candidate({ id: 8, releaseYear: 2025 })],
    ),
    { kind: 'ambiguous', candidateIds: [7, 8] },
  );
});

test('merges one provider line without deleting other providers', () => {
  const existing = [
    {
      name: 'ik',
      flag: 'ik',
      episodes: [{ name: '第1集', url: 'https://ik.example/1.m3u8' }],
    },
    {
      name: '红牛',
      flag: 'hongniu',
      episodes: [{ name: '第1集', url: 'https://old.example/1.m3u8' }],
    },
  ];
  const incoming = [{
    name: '红牛新线路',
    flag: ' HONGNIU ',
    episodes: [{ name: '第1集', url: 'https://new.example/1.m3u8' }],
  }];

  assert.deepEqual(mergeWorkPlayLines(JSON.stringify(existing), incoming), [
    existing[0],
    incoming[0],
  ]);
});

test('appends new lines and falls back to name when flag is absent', () => {
  const existing = [{
    name: 'IK',
    episodes: [{ name: '第1集', url: 'https://old.example/1.m3u8' }],
  }];
  const replacement = {
    name: ' ik ',
    episodes: [{ name: '第2集', url: 'https://new.example/2.m3u8' }],
  };
  const extra = {
    name: '红牛',
    flag: 'hongniu',
    episodes: [{ name: '第1集', url: 'https://hn.example/1.m3u8' }],
  };

  assert.deepEqual(
    mergeWorkPlayLines(JSON.stringify(existing), [replacement, extra]),
    [replacement, extra],
  );
});

test('treats damaged JSON as empty and keeps existing lines for an empty update', () => {
  const line = {
    name: 'ik',
    flag: 'ik',
    episodes: [{ name: '第1集', url: 'https://ik.example/1.m3u8' }],
  };

  assert.deepEqual(mergeWorkPlayLines('{broken', [line]), [line]);
  assert.deepEqual(mergeWorkPlayLines(JSON.stringify([line]), []), [line]);
});
