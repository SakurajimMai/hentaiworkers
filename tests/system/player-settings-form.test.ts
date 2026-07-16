import assert from 'node:assert/strict';
import test from 'node:test';
import { parsePlayerSettingsFromForm } from '../../lib/server/system/domain/player-settings-form';

function form(entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    fd.set(key, value);
  }
  return fd;
}

test('parsePlayerSettingsFromForm defaults when fields missing', () => {
  const parsed = parsePlayerSettingsFromForm(form({}));
  assert.equal(parsed.enableContextMenu, false);
  assert.equal(parsed.theme, '#E53935');
  assert.equal(parsed.worksFallbackArtPlayer, false);
  assert.equal(parsed.preRollAd.enabled, false);
  assert.equal(parsed.preRollAd.videoUrl, '');
  assert.equal(parsed.preRollAd.playDuration, 5);
  assert.equal(parsed.preRollAd.totalDuration, 10);
  assert.equal(parsed.preRollAd.muted, false);
  assert.equal(parsed.pauseAd.enabled, false);
  assert.equal(parsed.pauseAd.videoUrl, '');
  assert.equal(parsed.pauseAd.muted, false);
  assert.deepEqual(parsed.lineParsers, []);
});

test('parsePlayerSettingsFromForm reads pause video url and muted on/off', () => {
  const on = parsePlayerSettingsFromForm(
    form({
      playerPauseAdEnabled: '1',
      playerPauseAdVideoUrl: 'https://cdn.example/pause.mp4',
      playerPauseAdMuted: '1',
    }),
  );
  assert.equal(on.pauseAd.enabled, true);
  assert.equal(on.pauseAd.videoUrl, 'https://cdn.example/pause.mp4');
  assert.equal(on.pauseAd.muted, true);

  const off = parsePlayerSettingsFromForm(
    form({
      playerPauseAdEnabled: '1',
      playerPauseAdVideoUrl: 'https://cdn.example/pause.mp4',
    }),
  );
  assert.equal(off.pauseAd.muted, false);
});

test('parsePlayerSettingsFromForm clamps pre-roll durations 0-120 / 0-180', () => {
  const high = parsePlayerSettingsFromForm(
    form({
      playerPreRollPlayDuration: '999',
      playerPreRollTotalDuration: '999',
    }),
  );
  assert.equal(high.preRollAd.playDuration, 120);
  assert.equal(high.preRollAd.totalDuration, 180);

  const neg = parsePlayerSettingsFromForm(
    form({
      playerPreRollPlayDuration: '-4',
      playerPreRollTotalDuration: 'abc',
    }),
  );
  // parseInt('-4') = -4 → Math.max(0, ...) = 0; invalid total falls back to 0 via || 0
  assert.equal(neg.preRollAd.playDuration, 0);
  assert.equal(neg.preRollAd.totalDuration, 0);

  const emptyDefaults = parsePlayerSettingsFromForm(
    form({
      playerPreRollPlayDuration: '',
      playerPreRollTotalDuration: '',
    }),
  );
  assert.equal(emptyDefaults.preRollAd.playDuration, 5);
  assert.equal(emptyDefaults.preRollAd.totalDuration, 10);
});

test('parsePlayerSettingsFromForm truncates long strings', () => {
  const longUrl = `https://cdn.example/${'a'.repeat(1200)}`;
  const longHtml = `<div>${'x'.repeat(5000)}</div>`;
  const parsed = parsePlayerSettingsFromForm(
    form({
      playerPreRollVideoUrl: longUrl,
      playerPreRollHtml: longHtml,
      playerPauseAdImageUrl: longUrl,
      playerPauseAdHtml: longHtml,
    }),
  );
  assert.equal(parsed.preRollAd.videoUrl.length, 1000);
  assert.equal(parsed.preRollAd.html.length, 4000);
  assert.equal(parsed.pauseAd.imageUrl.length, 1000);
  assert.equal(parsed.pauseAd.html.length, 4000);
});
