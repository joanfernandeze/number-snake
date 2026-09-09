import { test } from 'node:test';
import assert from 'node:assert/strict';
import { layout, colorFor, eyeOffsets, tailDirection } from '../src/render.js';
import { POWER_COLORS, FALLBACK_COLOR } from '../src/constants.js';
import { createSnake } from '../src/snake.js';

test('layout fits a 7x11 grid into the view and centres it', () => {
  const L = layout({ width: 420, height: 660 }, 7, 11);
  assert.equal(L.cell, 60);
  assert.equal(L.ox, 0);
  assert.equal(L.oy, 0);
  assert.equal(L.cols, 7);
  assert.equal(L.rows, 11);
});

test('layout is limited by the tighter axis and centres the slack', () => {
  const L = layout({ width: 420, height: 400 }, 7, 11); // height-bound: 400/11 = 36.36 -> 36
  assert.equal(L.cell, 36);
  assert.equal(L.ox, 84);
  assert.equal(L.oy, 2);
});

test('layout is width-bound in a narrow view', () => {
  const L = layout({ width: 210, height: 660 }, 7, 11); // 210/7 = 30 < 660/11 = 60
  assert.equal(L.cell, 30);
  assert.equal(L.ox, 0);
  assert.equal(L.oy, 165);
});

test('colorFor maps powers of two onto the palette and falls back past the end', () => {
  assert.equal(colorFor(2), POWER_COLORS[0]);
  assert.equal(colorFor(4), POWER_COLORS[1]);
  assert.equal(colorFor(1024), POWER_COLORS[9]);
  assert.equal(colorFor(2048), FALLBACK_COLOR);
});

test('eyeOffsets puts both eyes on the leading edge, spread across it', () => {
  const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} !== ${b}`);
  const [a, b] = eyeOffsets({ x: 0, y: -1 }, 100); // heading up
  near(a.dy, -36); near(b.dy, -36);
  near(a.dx, 18); near(b.dx, -18);
  const [c, d] = eyeOffsets({ x: 1, y: 0 }, 100); // heading right
  near(c.dx, 36); near(d.dx, 36);
  near(Math.abs(c.dy), 18); near(c.dy, -d.dy);
});

test('tailDirection points away from the body, or backwards for a lone head', () => {
  const UP = { x: 0, y: -1 };
  const s = createSnake(3, 2, { x: 3, y: 5 }, UP); // cells (3,5),(3,6),(3,7): tail points down
  assert.deepEqual(tailDirection(s), { x: 0, y: 1 });
  s.cells = [{ x: 3, y: 5 }, { x: 4, y: 5 }];       // body to the right: tail points right
  assert.deepEqual(tailDirection(s), { x: 1, y: 0 });
  const one = createSnake(1, 2, { x: 3, y: 5 }, UP);
  assert.deepEqual(tailDirection(one), { x: 0, y: 1 }); // opposite the heading
});
