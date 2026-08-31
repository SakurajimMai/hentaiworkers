import { mkdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const brandDir = join(root, 'public/brand');
const androidRes = join(root, 'mobile/android/app/src/main/res');
const densitySizes = {
  mdpi: 48,
  hdpi: 72,
  xhdpi: 96,
  xxhdpi: 144,
  xxxhdpi: 192,
};

const iconSvg = await readFile(join(brandDir, 'animestream-icon.svg'));
const markSvg = await readFile(join(brandDir, 'animestream-mark.svg'), 'utf8');
const markBody = markSvg
  .replace(/^<svg[^>]*>/, '')
  .replace(/<\/svg>\s*$/, '');
const roundIconSvg = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 108 108" fill="none"><circle cx="54" cy="54" r="54" fill="#121318" />${markBody}</svg>`,
);
const maskableIconSvg = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 108 108" fill="none"><rect width="108" height="108" fill="#121318" />${markBody}</svg>`,
);

async function png(input, size, output, opaque = false) {
  await mkdir(dirname(output), { recursive: true });
  let image = sharp(input).resize(size, size);
  if (opaque) image = image.flatten({ background: '#121318' }).removeAlpha();
  await image.png({ compressionLevel: 9 }).toFile(output);
}

async function losslessWebp(input, size, output) {
  await mkdir(dirname(output), { recursive: true });
  await sharp(input).resize(size, size).webp({ lossless: true, effort: 6 }).toFile(output);
}

await Promise.all([
  png(maskableIconSvg, 180, join(root, 'app/apple-icon.png'), true),
  png(iconSvg, 192, join(brandDir, 'animestream-icon-192.png')),
  png(iconSvg, 512, join(brandDir, 'animestream-icon-512.png')),
  png(maskableIconSvg, 512, join(brandDir, 'animestream-icon-maskable-512.png')),
  ...Object.entries(densitySizes).flatMap(([density, size]) => {
    const target = join(androidRes, `mipmap-${density}`);
    return [
      losslessWebp(iconSvg, size, join(target, 'ic_launcher.webp')),
      losslessWebp(roundIconSvg, size, join(target, 'ic_launcher_round.webp')),
    ];
  }),
]);
