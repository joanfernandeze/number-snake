// Rasterises assets/icon.svg into the PNG inputs @capacitor/assets reads (icon-only,
// icon-foreground with the #bg rect stripped, icon-background, splash, splash-dark)
// plus the 512 px Play Store icon, all in assets/. Runs via `npm run app:icons`,
// which then calls `capacitor-assets generate --android` on them.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import sharp from 'sharp';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const assets = path.join(root, 'assets');
const BG = '#111935';

const svg = await readFile(path.join(assets, 'icon.svg'), 'utf8');
const foregroundSvg = svg.replace(/<rect\b[^>]*\bid="bg"[^>]*\/>\s*/, '');
if (foregroundSvg === svg) throw new Error('icon.svg: no <rect id="bg" .../> to strip');

// Render an SVG string at `size` px; density scales the 1024 viewBox so it stays crisp.
const render = (text, size) =>
  sharp(Buffer.from(text), { density: Math.max(72, (72 * size) / 1024) }).resize(size, size).png();
const out = (name) => path.join(assets, name);
const solid = (size) =>
  sharp({ create: { width: size, height: size, channels: 4, background: BG } });

await render(svg, 1024).toFile(out('icon-only.png'));
await render(foregroundSvg, 1024).toFile(out('icon-foreground.png'));
await solid(1024).png().toFile(out('icon-background.png'));
await render(svg, 512).toFile(out('store-icon-512.png'));

const splashIcon = await render(svg, 800).toBuffer();
for (const name of ['splash.png', 'splash-dark.png']) {
  await solid(2732).composite([{ input: splashIcon, gravity: 'centre' }]).png().toFile(out(name));
}
console.log('icon-png: wrote icon-only, icon-foreground, icon-background, splash, splash-dark, store-icon-512');
