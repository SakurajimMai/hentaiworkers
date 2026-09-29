import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { buildPlayerHtmlAd } from '../../lib/client/html-ad';

const css = readFileSync('app/globals.css', 'utf8');

function declarations(block: string): Map<string, string> {
  return new Map([...block.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((match) => [match[1], match[2].trim()]));
}

function darkBlocks(): [Map<string, string>, Map<string, string>] {
  const toggled = css.match(/:root\[data-theme="dark"\]\s*\{([^}]*)\}/);
  const system = css.match(/:root:not\(\[data-theme="light"\]\)\s*\{([^}]*)\}/);
  assert.ok(toggled && system, 'both dark theme blocks exist');
  return [declarations(toggled[1]), declarations(system[1])];
}

test('the chosen dark theme and the system dark theme declare the same tokens', () => {
  const [toggled, system] = darkBlocks();
  assert.deepEqual([...system.entries()].sort(), [...toggled.entries()].sort());
});

test('overlays on artwork use a scrim that stays dark at night', () => {
  const root = declarations(css.match(/:root\s*\{([^}]*)\}/)![1]);
  assert.ok(root.has('--scrim') && root.has('--scrim-foreground'));
  const [dark] = darkBlocks();
  assert.equal(dark.has('--scrim'), false, '--scrim must not turn light with --ink');
  assert.ok(dark.has('--destructive'), 'the destructive red needs a dark-theme value that reads on dark surfaces');

  for (const file of [
    'components/hero-carousel.tsx',
    'components/AnimeCard.tsx',
    'components/MangaCard.tsx',
    'components/favorite-toggle.tsx',
    'components/site-header-client.tsx',
  ]) {
    const source = readFileSync(file, 'utf8');
    assert.doesNotMatch(source, /\b(?:bg|from|via|to)-ink\b/, `${file}: --ink is the text colour and turns light at night; use scrim`);
  }
});

test('ad frames keep the normal color scheme so their canvas stays transparent at night', () => {
  assert.match(readFileSync('components/html-ad.tsx', 'utf8'), /colorScheme:\s*'normal'/);
  assert.match(buildPlayerHtmlAd('<p>x</p>'), /color-scheme:normal/);
  assert.doesNotMatch(css, /rgba\(255,\s*255,\s*255,\s*0\.45\)/, 'the skeleton shine follows the theme');
});
