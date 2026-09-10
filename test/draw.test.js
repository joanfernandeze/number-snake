import { test } from 'node:test';
import assert from 'node:assert/strict';
import { draw, layout, motionFrom, PAD } from '../src/render.js';
import { createFx } from '../src/fx.js';

// A canvas context that records the rectangles it is asked to fill, tallies every
// stroke-family call (stroke/strokeRect), and shrugs off everything else, so draw()
// can be exercised without a browser.
function recordingCtx() {
  const rects = [];
  const noop = () => {};
  const target = {
    rects,
    strokeCount: 0,
    fillRect: (x, y, w, h) => rects.push({ x, y, w, h }),
    stroke: () => { target.strokeCount++; },
    strokeRect: () => { target.strokeCount++; },
  };
  return new Proxy(target, {
    get: (t, k) => (k in t ? t[k] : noop),
    set: () => true,
  });
}
const covers = (rects, x, y) =>
  rects.some(r => x >= Math.min(r.x, r.x + r.w) && x <= Math.max(r.x, r.x + r.w)
                && y >= Math.min(r.y, r.y + r.h) && y <= Math.max(r.y, r.y + r.h));

// Board fixture for obstacle rendering: a single obstacle at (2,2), nothing else on
// the board, snake tucked away so it never overlaps the obstacle cell.
function obstacleFrame(obstacles) {
  return {
    view: { width: 420, height: 660, dpr: 1 }, // cell 60, ox/oy 0
    game: {
      board: { tiles: [], obstacles, cols: 7, rows: 11 },
      snake: { cells: [{ x: 5, y: 5 }], values: [2], direction: { x: 0, y: -1 }, queue: [] },
      started: true, over: false, score: 0,
    },
    motion: { kind: 'none', progress: 1 },
  };
}

// Board fixture for the match-hint ring: head value 4, tiles 2/4/4 so exactly two
// tiles should qualify.
function hintFrame() {
  return {
    view: { width: 420, height: 660, dpr: 1 },
    game: {
      board: {
        tiles: [{ x: 1, y: 1, value: 2 }, { x: 3, y: 3, value: 4 }, { x: 5, y: 5, value: 4 }],
        obstacles: [], cols: 7, rows: 11,
      },
      snake: { cells: [{ x: 0, y: 0 }], values: [4], direction: { x: 0, y: -1 }, queue: [] },
      started: true, over: false, score: 0,
    },
    motion: { kind: 'none', progress: 1 },
  };
}

// Ran right along y=3, head has just turned up; half way into the slide.
function cornerFrame() {
  const cells = [{ x: 5, y: 2 }, { x: 5, y: 3 }, { x: 4, y: 3 }];
  const prev = [{ x: 5, y: 3 }, { x: 4, y: 3 }, { x: 3, y: 3 }];
  return {
    view: { width: 420, height: 660, dpr: 1 }, // cell 60, ox/oy 0
    game: {
      // Mirrors createBoard(): the renderer draws obstacles, so a fixture without them lies.
      board: { tiles: [], obstacles: [], cols: 7, rows: 11 },
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

test('an armed obstacle paints its cell solid; an unarmed one does not', () => {
  const armed = obstacleFrame([{ x: 2, y: 2, armed: true }]);
  const unarmed = obstacleFrame([{ x: 2, y: 2, armed: false, warn: 3 }]);
  const armedCtx = recordingCtx(), unarmedCtx = recordingCtx();
  draw(armedCtx, armed.view, armed.game, createFx(), 1000, armed.motion);
  draw(unarmedCtx, unarmed.view, unarmed.game, createFx(), 1000, unarmed.motion);

  const c = layout(armed.view, 7, 11).cell;
  const cx = 2 * c + c / 2, cy = 2 * c + c / 2;

  // The two call streams must differ...
  assert.notDeepEqual(armedCtx.rects, unarmedCtx.rects, 'armed and unarmed obstacles should paint differently');
  // ...and specifically: armed fills the block solid, unarmed does not.
  assert.ok(covers(armedCtx.rects, cx, cy), 'an armed obstacle should fill its cell solid');
  assert.ok(!covers(unarmedCtx.rects, cx, cy), 'an unarmed obstacle must not fill its cell solid');
});

test('a blinking obstacle still marks its cell instead of drawing nothing', () => {
  const unarmed = obstacleFrame([{ x: 2, y: 2, armed: false, warn: 3 }]);
  const empty = obstacleFrame([]);
  const unarmedCtx = recordingCtx(), emptyCtx = recordingCtx();
  draw(unarmedCtx, unarmed.view, unarmed.game, createFx(), 1000, unarmed.motion);
  draw(emptyCtx, empty.view, empty.game, createFx(), 1000, empty.motion);

  // Everything else about the frame is identical, so any extra stroke work is the
  // blinking obstacle's own outline/cross, not background noise.
  assert.ok(unarmedCtx.strokeCount > emptyCtx.strokeCount,
    'a blinking obstacle should still add stroke calls, not be a no-op');
});

test('hint rings only the tiles that match the head value', () => {
  const { view, game, motion } = hintFrame();
  const offCtx = recordingCtx();
  const onCtx = recordingCtx();
  draw(offCtx, view, game, createFx(), 1000, motion, false);
  draw(onCtx, view, game, createFx(), 1000, motion, true);

  // Same board, same everything else: the only source of extra stroke calls is the
  // ring drawn once per matching tile. There are exactly two tiles of value 4.
  assert.equal(onCtx.strokeCount - offCtx.strokeCount, 2,
    'exactly the two value-4 tiles should gain a ring stroke');
});

test('hint = false changes nothing: the default path is untouched', () => {
  const { view, game, motion } = hintFrame();
  const defaultCtx = recordingCtx();
  const explicitCtx = recordingCtx();
  draw(defaultCtx, view, game, createFx(), 1000, motion);
  draw(explicitCtx, view, game, createFx(), 1000, motion, false);

  assert.deepEqual(defaultCtx.rects, explicitCtx.rects);
  assert.equal(defaultCtx.strokeCount, explicitCtx.strokeCount);
});
