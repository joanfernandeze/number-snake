// Copies the web game into www/ for Capacitor. The game's files stay at the repo root so GitHub
// Pages keeps serving them unchanged; the app gets a copy. Run through `npm run app`.
import { cpSync, rmSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// What ships: the page, its stylesheet, and every module under src/.
export function shipList() {
  return ['index.html', 'style.css', 'src'];
}

// Every module reachable from `entry` through static `import ... from './x.js'` statements, as
// repo-relative paths with forward slashes. The test uses it to prove nothing loads from outside
// the shipped set.
export function moduleGraph(entry) {
  const seen = new Set();
  const queue = [entry];
  while (queue.length) {
    const file = queue.shift();
    if (seen.has(file)) continue;
    seen.add(file);
    const path = join(ROOT, file);
    if (!existsSync(path)) continue;
    const src = readFileSync(path, 'utf8');
    for (const m of src.matchAll(/^\s*import\s[^'"]*['"](\.[^'"]+)['"]/gm)) {
      queue.push(normalize(join(dirname(file), m[1])).replaceAll('\\', '/'));
    }
  }
  return [...seen];
}

export function copyWww() {
  const out = join(ROOT, 'www');
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out);
  for (const f of shipList()) cpSync(join(ROOT, f), join(out, f), { recursive: true });
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) copyWww();
