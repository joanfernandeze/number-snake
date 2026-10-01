import { test } from 'node:test';
import assert from 'node:assert/strict';
import { draw } from '../src/render.js';
import { createFx } from '../src/fx.js';
import { createBoard } from '../src/board.js';
import { GATE } from '../src/constants.js';

// Records the fillStyle of every fill() and the strokeStyle of every stroke(); every other call is
// a no-op, so draw() runs without a browser. (fillRect/strokeRect are not recorded.) The dash of
// every stroke() is recorded too.
function styleCtx() {
  const t = { fills: [], strokes: [], dashes: [], dash: [], fillStyle: null, strokeStyle: null };
  t.setLineDash = (d) => { t.dash = d; };
  t.fill = () => t.fills.push(t.fillStyle);
  t.stroke = () => { t.strokes.push(t.strokeStyle); t.dashes.push(t.dash); };
  return new Proxy(t, {
    get: (o, k) => (k in o ? o[k] : () => {}),
    set: (o, k, v) => { o[k] = v; return true; },
  });
}

function gateFrame() {
  const board = createBoard(7, 11, new Set(), [{ x: 2, y: 2, set: 'A' }, { x: 4, y: 2, set: 'B' }]);
  return {
    board,
    snake: { cells: [{ x: 3, y: 8 }], values: [2], direction: { x: 0, y: -1 }, queue: [] },
    started: true, over: false,
  };
}
const view = { width: 420, height: 660, dpr: 1 };
const rest = { kind: 'none', progress: 1 };

test('a closed gate is a solid block, an open one a dashed outline', () => {
  const ctx = styleCtx();
  draw(ctx, view, gateFrame(), createFx(), 0, rest);
  assert.ok(ctx.fills.includes(GATE.colors.B), 'B (closed) is filled');
  assert.ok(!ctx.fills.includes(GATE.colors.A), 'A (open) is not filled');
  assert.ok(ctx.strokes.includes(GATE.colors.A), 'A (open) is outlined');
  assert.ok(!ctx.strokes.includes(GATE.colors.B), 'B (closed) is not stroked');
  assert.ok(ctx.dashes[ctx.strokes.indexOf(GATE.colors.A)].length > 0, 'the outline is dashed');
});

test('a closing gate alternates between block and outline, anchored to the bite', () => {
  const game = gateFrame();
  game.board.gates[0].state = 'closing';
  const fx = createFx();
  fx.gateSwapAt = 0;
  const on = styleCtx();
  draw(on, view, game, fx, 0, rest);
  assert.ok(on.fills.includes(GATE.colors.A), 'blink on: filled');
  const off = styleCtx();
  draw(off, view, game, fx, GATE.blinkMs, rest);
  assert.ok(!off.fills.includes(GATE.colors.A), 'blink off: not filled');
  assert.ok(off.strokes.includes(GATE.colors.A), 'blink off: outlined');
  fx.gateSwapAt = 1000;
  const anchored = styleCtx();
  draw(anchored, view, game, fx, 1000, rest);
  assert.ok(anchored.fills.includes(GATE.colors.A), 'solid at the moment of the bite, not by the global clock');
});
