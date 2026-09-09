import { test } from 'node:test';
import assert from 'node:assert/strict';
import { draw, layout, motionFrom, PAD } from '../src/render.js';
import { createFx } from '../src/fx.js';

// A canvas context that records the rectangles it is asked to fill and shrugs off
// every other call, so draw() can be exercised without a browser.
function recordingCtx() {
  const rects = [];
  const noop = () => {};
  return new Proxy({ rects, fillRect: (x, y, w, h) => rects.push({ x, y, w, h }) }, {
    get: (t, k) => (k in t ? t[k] : noop),
    set: () => true,
  });
}
const covers = (rects, x, y) =>
  rects.some(r => x >= Math.min(r.x, r.x + r.w) && x <= Math.max(r.x, r.x + r.w)
                && y >= Math.min(r.y, r.y + r.h) && y <= Math.max(r.y, r.y + r.h));

// Ran right along y=3, head has just turned up; half way into the slide.
function cornerFrame() {
  const cells = [{ x: 5, y: 2 }, { x: 5, y: 3 }, { x: 4, y: 3 }];
  const prev = [{ x: 5, y: 3 }, { x: 4, y: 3 }, { x: 3, y: 3 }];
  return {
    view: { width: 420, height: 660, dpr: 1 }, // cell 60, ox/oy 0
    game: {
      board: { tiles: [], cols: 7, rows: 11 },
      snake: { cells, values: [2, 2, 2], direction: { x: 0, y: -1 }, queue: [] },
      started: true, over: false, score: 0,
    },
    motion: { kind: 'slide', progress: 0.5, from: motionFrom('slide', prev, cells) },
  };
}

test('draw paints an unbroken body through a corner', () => {
  const { view, game, motion } = cornerFrame();
  const c = layout(view, 7, 11).cell;
  const ctx = recordingCtx();
  draw(ctx, view, game, createFx(), 1000, motion);

  // Half way through the turn the head centre sits at (5.5, 3.0) and the segment behind
  // it, still running right, at (5.0, 3.5). The connector has to bend at the elbow
  // (5.5, 3.5): every point along that L must be painted, or the corner reads as a
  // break in the body. Only the connectors use fillRect; the segments are round rects.
  for (const [gx, gy] of [[5.5, 3.0], [5.5, 3.25], [5.5, 3.5], [5.25, 3.5], [5.0, 3.5]]) {
    assert.ok(covers(ctx.rects, gx * c, gy * c), `gap at grid (${gx}, ${gy})`);
  }
});

test('draw keeps every segment on its own path, never a cell off it', () => {
  const { view, game, motion } = cornerFrame();
  const c = layout(view, 7, 11).cell;
  const ctx = recordingCtx();
  draw(ctx, view, game, createFx(), 1000, motion);

  // The old shared-offset slide dragged the whole body one cell along the new heading,
  // so the segments behind the corner were drawn a row below the row they ran along.
  for (const [gx, gy] of [[4.5, 4.5], [3.5, 4.5], [5.5, 4.5]]) {
    assert.ok(!covers(ctx.rects, gx * c, gy * c), `stray paint at grid (${gx}, ${gy})`);
  }
});
