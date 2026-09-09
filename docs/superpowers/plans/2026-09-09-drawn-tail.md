# Drawn Tail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Implementation subagents run on **Sonnet**.

**Goal:** Remove the permanent junk segment. The snake starts as a **single** numbered segment; the tail is a drawn tapered tip with no number. Eating a matching tile collapses back to one segment; only mismatched eating grows the body.

**Why:** the snake started as `[2, 2]`. Merges only resolve at the head, so the second segment's `2` could never merge and rode along forever — the author found it maddening, and it contradicts the design's "clean matching keeps you short".

**Architecture:** one constant (`START.snakeLength` 2 → 1), a pure `tailDirection(snake)` in `render.js` (tested), and a `drawTail` pass drawn before the segments (like bridges) so the join is clean. No rules change: `createSnake` already handles length 1, `hitsSelf`/`move`/`eat` are length-agnostic, and a single segment may legally reverse (tested earlier).

---

### Task 1: Single starting segment + drawn tail tip

**Files:**
- Modify: `src/constants.js` (`START.snakeLength`)
- Modify: `test/game.test.js`
- Modify: `src/render.js`
- Modify: `test/render.test.js`

- [x] **Step 1: Write the failing tests**

`test/game.test.js`: add `START` to the constants import (`import { SPAWN, TIMING, START } from '../src/constants.js';`) and in `'createGame seeds a snake and fills the board'` replace `assert.ok(g.snake.cells.length >= 2);` with `assert.equal(g.snake.cells.length, START.snakeLength);` and add `assert.equal(START.snakeLength, 1); // a lone head: no permanent junk segment behind it`.

`test/render.test.js`: add `tailDirection` to the import from `../src/render.js`, add `import { createSnake } from '../src/snake.js';`, and append:

```js
test('tailDirection points away from the body, or backwards for a lone head', () => {
  const UP = { x: 0, y: -1 };
  const s = createSnake(3, 2, { x: 3, y: 5 }, UP); // cells (3,5),(3,6),(3,7): tail points down
  assert.deepEqual(tailDirection(s), { x: 0, y: 1 });
  s.cells = [{ x: 3, y: 5 }, { x: 4, y: 5 }];       // body to the right: tail points right
  assert.deepEqual(tailDirection(s), { x: 1, y: 0 });
  const one = createSnake(1, 2, { x: 3, y: 5 }, UP);
  assert.deepEqual(tailDirection(one), { x: 0, y: 1 }); // opposite the heading
});
```

- [x] **Step 2: Run to verify failure** — `node --test` → the render test fails (`tailDirection` not exported) and the game test fails (length is 2).

- [x] **Step 3: Implement**

`src/constants.js`: `snakeLength: 2,` → `snakeLength: 1,` and update its comment to `// a lone head; the tail is drawn, not a number, so nothing is stuck behind you`.

`src/render.js` — add after `eyeOffsets`:

```js
// Where the tail tip points: away from the segment before it, or straight back from
// the heading when the snake is a single segment.
export function tailDirection(snake) {
  const n = snake.cells.length;
  if (n >= 2) {
    const a = snake.cells[n - 2], b = snake.cells[n - 1];
    return { x: Math.sign(b.x - a.x), y: Math.sign(b.y - a.y) };
  }
  return { x: -snake.direction.x, y: -snake.direction.y };
}
```

Add after `drawBridge`:

```js
// A tapered tip behind the last segment: the snake has a tail, not a junk number.
// Its base starts inside the segment body (the segment paints over it) and it is
// clipped to the board so it never spills over the wall frame.
function drawTail(ctx, L, last, snake) {
  const d = tailDirection(snake);
  const cell = L.cell, pad = cell * PAD;
  const cx = last.px + cell / 2, cy = last.py + cell / 2;
  const half = (cell - pad * 2) / 2 * 0.8;     // a little narrower than the body
  const base = cell / 2 - pad * 2;             // inside the body's back edge
  const len = cell * 0.55;                     // how far the tip reaches past the body
  const bx = cx + d.x * base, by = cy + d.y * base;
  const ax = cx + d.x * (base + len), ay = cy + d.y * (base + len);
  const px = -d.y, py = d.x;
  ctx.save();
  ctx.beginPath();
  ctx.rect(L.ox, L.oy, L.cols * cell, L.rows * cell);
  ctx.clip();
  ctx.fillStyle = colorFor(snake.values[snake.values.length - 1]);
  ctx.beginPath();
  ctx.moveTo(bx + px * half, by + py * half);
  ctx.quadraticCurveTo(ax + px * half * 0.3, ay + py * half * 0.3, ax, ay);
  ctx.quadraticCurveTo(ax - px * half * 0.3, ay - py * half * 0.3, bx - px * half, by - py * half);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}
```

In `drawSnake`, right after the bridges loop and before the cells loop, add:

```js
  drawTail(ctx, L, pos[pos.length - 1], snake);
```

- [x] **Step 4: Run tests** — `node --test` → 71 pass (70 + 1). `node --check src/render.js`. Run `node tools/simulate.js` and paste the two greedy blocks into the commit body (the shorter start changes the baseline).

- [x] **Step 5: Commit**

```bash
git add src/constants.js test/game.test.js src/render.js test/render.test.js
git commit -m "feat: lone starting head with a drawn tail; no permanent junk segment" -m "<simulator greedy blocks>"
```

---

### Task 2: Verify, document, publish (main agent)

- [x] Browser: the snake starts as one `2` with a tapered tail pointing down; eating a `2` yields a single `4`; eating a mismatch grows the body and the tail moves to the new last segment; the tail slides with the body and never draws over the red frame.
- [x] Update the simulator baseline table in `docs/PLAYTEST.md` with the new numbers.
- [x] Merge to `main`, push (Pages redeploys).
