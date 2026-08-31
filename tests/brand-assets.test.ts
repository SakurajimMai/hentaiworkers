import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import createManifest from '../app/manifest';

const root = process.cwd();
const densities = [
  ['mdpi', 48],
  ['hdpi', 72],
  ['xhdpi', 96],
  ['xxhdpi', 144],
  ['xxxhdpi', 192],
] as const;

function source(relativePath: string) {
  return readFileSync(join(root, relativePath), 'utf8');
}

function pngSize(relativePath: string) {
  const image = readFileSync(join(root, relativePath));
  assert.deepEqual(image.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  return {
    width: image.readUInt32BE(16),
    height: image.readUInt32BE(20),
  };
}

function pngColorType(relativePath: string) {
  const image = readFileSync(join(root, relativePath));
  assert.deepEqual(image.subarray(12, 16).toString('ascii'), 'IHDR');
  return image[25];
}

function webpSize(relativePath: string) {
  const image = readFileSync(join(root, relativePath));
  assert.equal(image.subarray(0, 4).toString('ascii'), 'RIFF');
  assert.equal(image.subarray(8, 12).toString('ascii'), 'WEBP');

  let offset = 12;
  while (offset + 8 <= image.length) {
    const chunk = image.subarray(offset, offset + 4).toString('ascii');
    const chunkSize = image.readUInt32LE(offset + 4);
    const data = offset + 8;

    if (chunk === 'VP8X') {
      return {
        width: image.readUIntLE(data + 4, 3) + 1,
        height: image.readUIntLE(data + 7, 3) + 1,
      };
    }
    if (chunk === 'VP8L') {
      assert.equal(image[data], 0x2f);
      const bits = image.readUInt32LE(data + 1);
      return {
        width: (bits & 0x3fff) + 1,
        height: ((bits >>> 14) & 0x3fff) + 1,
      };
    }
    if (chunk === 'VP8 ') {
      assert.deepEqual(image.subarray(data + 3, data + 6), Buffer.from([0x9d, 0x01, 0x2a]));
      return {
        width: image.readUInt16LE(data + 6) & 0x3fff,
        height: image.readUInt16LE(data + 8) & 0x3fff,
      };
    }

    offset = data + chunkSize + (chunkSize % 2);
  }

  assert.fail(`${relativePath} does not contain a supported WebP image chunk`);
}

test('web install surfaces use the shared AnimeStream brand mark', () => {
  const manifest = createManifest();
  assert.equal(manifest.name, 'AnimeStream');
  assert.equal(manifest.short_name, 'AnimeStream');
  assert.equal(manifest.start_url, '/');
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.background_color, '#F6F4EF');
  assert.equal(manifest.theme_color, '#121318');
  assert.deepEqual(manifest.icons, [
    {
      src: '/brand/animestream-icon-192.png',
      sizes: '192x192',
      type: 'image/png',
      purpose: 'any',
    },
    {
      src: '/brand/animestream-icon-512.png',
      sizes: '512x512',
      type: 'image/png',
      purpose: 'any',
    },
    {
      src: '/brand/animestream-icon-maskable-512.png',
      sizes: '512x512',
      type: 'image/png',
      purpose: 'maskable',
    },
  ]);

  for (const relativePath of [
    'app/icon.svg',
    'public/brand/animestream-icon.svg',
    'public/brand/animestream-mark.svg',
  ]) {
    const svg = source(relativePath);
    assert.match(svg, /viewBox="0 0 108 108"/);
    assert.match(svg, /#F6F4EF/i);
    assert.match(svg, /#D36322/i);
    assert.match(svg, /#121318/i);
    assert.doesNotMatch(svg, /#(?:5C6BC0|6D28D9|7C3AED|8B5CF6)/i);
  }

  assert.deepEqual(pngSize('app/apple-icon.png'), { width: 180, height: 180 });
  assert.equal(pngColorType('app/apple-icon.png'), 2, 'Apple icon must be opaque RGB');
  assert.deepEqual(pngSize('public/brand/animestream-icon-192.png'), {
    width: 192,
    height: 192,
  });
  assert.deepEqual(pngSize('public/brand/animestream-icon-512.png'), {
    width: 512,
    height: 512,
  });
  assert.deepEqual(pngSize('public/brand/animestream-icon-maskable-512.png'), {
    width: 512,
    height: 512,
  });
  assert.notDeepEqual(
    readFileSync(join(root, 'public/brand/animestream-icon-512.png')),
    readFileSync(join(root, 'public/brand/animestream-icon-maskable-512.png')),
  );
});

test('Android launcher resources keep adaptive layers, themed icon and splash separate', () => {
  const manifest = source('mobile/android/app/src/main/AndroidManifest.xml');
  assert.match(manifest, /android:icon="@mipmap\/ic_launcher"/);
  assert.match(manifest, /android:roundIcon="@mipmap\/ic_launcher_round"/);

  for (const version of ['v26', 'v33']) {
    for (const name of ['ic_launcher.xml', 'ic_launcher_round.xml']) {
      const adaptive = source(`mobile/android/app/src/main/res/mipmap-anydpi-${version}/${name}`);
      assert.match(adaptive, /<adaptive-icon\b/);
      assert.match(adaptive, /<background android:drawable="@color\/iconBackground"\s*\/>/);
      assert.match(adaptive, /<foreground android:drawable="@drawable\/ic_launcher_foreground"\s*\/>/);
      assert.doesNotMatch(adaptive, /@mipmap\/ic_launcher_foreground/);
      if (version === 'v33') {
        assert.match(
          adaptive,
          /<monochrome android:drawable="@drawable\/ic_launcher_monochrome"\s*\/>/,
        );
      } else {
        assert.doesNotMatch(adaptive, /<monochrome\b/);
      }
    }
  }

  const foreground = source('mobile/android/app/src/main/res/drawable/ic_launcher_foreground.xml');
  assert.match(foreground, /android:viewportWidth="108"/);
  assert.match(foreground, /android:viewportHeight="108"/);
  assert.match(foreground, /#FFF6F4EF/i);
  assert.match(foreground, /#FFD36322/i);
  assert.match(foreground, /#FF121318/i);
  assert.doesNotMatch(foreground, /#(?:FF)?(?:5C6BC0|6D28D9|7C3AED|8B5CF6)/i);

  const monochrome = source('mobile/android/app/src/main/res/drawable/ic_launcher_monochrome.xml');
  assert.match(monochrome, /android:viewportWidth="108"/);
  assert.match(monochrome, /android:fillColor="#FFFFFFFF"/i);
  assert.match(monochrome, /android:fillType="evenOdd"/);

  const styles = source('mobile/android/app/src/main/res/values/styles.xml');
  assert.match(
    styles,
    /<item name="windowSplashScreenAnimatedIcon">@drawable\/splashscreen_icon<\/item>/,
  );
  assert.doesNotMatch(styles, /@drawable\/ic_launcher_background/);
  const splash = source('mobile/android/app/src/main/res/drawable/splashscreen_icon.xml');
  assert.match(splash, /android:viewportWidth="108"/);
  assert.match(splash, /#FFF6F4EF/i);
  assert.match(splash, /#FFD36322/i);

  for (const relativePath of [
    'mobile/android/app/src/main/res/values/colors.xml',
    'mobile/android/app/src/main/res/values-night/colors.xml',
  ]) {
    const colors = source(relativePath);
    assert.match(colors, /<color name="iconBackground">#121318<\/color>/i);
    assert.match(colors, /<color name="splashscreen_background">#121318<\/color>/i);
  }
});

test('legacy Android launchers are real WebP files at every density', () => {
  for (const [density, size] of densities) {
    for (const name of ['ic_launcher.webp', 'ic_launcher_round.webp']) {
      const relativePath = `mobile/android/app/src/main/res/mipmap-${density}/${name}`;
      assert.deepEqual(webpSize(relativePath), { width: size, height: size });
    }
  }
});

test('Android CI verifies branded resources inside every assembled APK', () => {
  const workflow = source('.github/workflows/build-android.yml');
  assert.match(workflow, /dump resources "\$apk" > "\$resources_report"/);
  for (const resourceName of [
    'drawable/ic_launcher_foreground',
    'drawable/ic_launcher_monochrome',
    'drawable/splashscreen_icon',
    'mipmap/ic_launcher',
    'mipmap/ic_launcher_round',
  ]) {
    assert.match(workflow, new RegExp(resourceName.replace('/', '\\/')));
  }
});

test('obsolete purple and flattened launcher resources cannot return', () => {
  for (const relativePath of [
    'public/dm.svg',
    'mobile/assets/icon.png',
    'mobile/assets/adaptive-icon.png',
    'mobile/assets/splash-icon.png',
    'mobile/assets/favicon.png',
    'mobile/android/app/src/main/res/drawable/ic_launcher_background.xml',
  ]) {
    assert.equal(existsSync(join(root, relativePath)), false, `${relativePath} must stay removed`);
  }

  for (const [density] of densities) {
    for (const relativePath of [
      `mobile/android/app/src/main/res/mipmap-${density}/ic_launcher_foreground.webp`,
      `mobile/android/app/src/main/res/drawable-${density}/splashscreen_logo.png`,
    ]) {
      assert.equal(existsSync(join(root, relativePath)), false, `${relativePath} must stay removed`);
    }
  }
});
