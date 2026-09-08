import { test } from 'node:test';
import assert from 'node:assert/strict';
import { layout, colorFor } from '../src/render.js';
import { POWER_COLORS, FALLBACK_COLOR } from '../src/constants.js';

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
