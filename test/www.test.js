import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { shipList, moduleGraph } from '../scripts/copy-www.mjs';

test('every file the page loads is in the app bundle', () => {
  const ship = shipList();
  assert.ok(ship.includes('index.html') && ship.includes('style.css'));
  for (const f of moduleGraph('src/main.js')) {
    assert.ok(existsSync(f), `${f} exists`);
    assert.ok(ship.some(s => f === s || f.startsWith(s + '/')), `${f} is shipped`);
  }
});

test('the module graph follows imports from main.js', () => {
  const g = moduleGraph('src/main.js');
  for (const f of ['src/main.js', 'src/game.js', 'src/music.js', 'src/tracks.js', 'src/nav.js']) {
    assert.ok(g.includes(f), `${f} reached`);
  }
});
