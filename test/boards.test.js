import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BOARDS, parseBoard, isValidBoard } from '../src/boards.js';
import { GRID } from '../src/constants.js';

test('every shipped board is 7x11, has one start, and every free cell is reachable', () => {
  for (const [key, b] of Object.entries(BOARDS)) {
    assert.equal(b.key, key);
    assert.ok(b.name && typeof b.name === 'string', `${key} has a name`);
    assert.equal(b.rows.length, GRID.rows, `${key} rows`);
    for (const r of b.rows) assert.equal(r.length, GRID.cols, `${key} row width`);
    assert.equal(isValidBoard(b.rows), true, `${key} is valid`);
  }
});

test('parseBoard reads walls and the start, and the start faces a free cell', () => {
  const b = parseBoard(BOARDS.lanes.rows);
  assert.deepEqual(b.start, { x: 3, y: 5 });
  assert.equal(b.walls.has('1,2'), true);
  assert.equal(b.walls.has('5,8'), true);
  assert.equal(b.walls.has('3,5'), false);
  assert.equal(b.walls.has('3,4'), false, 'the cell in front of the start is free');
  assert.equal(b.walls.size, 14);
  assert.equal(parseBoard(BOARDS.open.rows).walls.size, 0);
});

test('isValidBoard rejects the wrong size, no start, two starts, and an unreachable pocket', () => {
  const ok = BOARDS.pillars.rows;
  assert.equal(isValidBoard(ok), true);
  assert.equal(isValidBoard(ok.slice(1)), false, 'ten rows');
  assert.equal(isValidBoard(ok.map(r => r + '.')), false, 'eight wide');
  assert.equal(isValidBoard(ok.map(r => r.replace('S', '.'))), false, 'no start');
  assert.equal(isValidBoard(ok.map((r, i) => (i === 0 ? 'S' + r.slice(1) : r))), false, 'two starts');
  // (0,0) stays free but its two neighbours are walls, so it cannot be reached from S.
  const fenced = ok.map((r, i) => (i === 0 ? '.#.....' : i === 1 ? '#' + r.slice(1) : r));
  assert.equal(isValidBoard(fenced), false, 'sealed pocket');
});

test('isValidBoard rejects a wall directly ahead of the start, and a start on row 0', () => {
  // BOARDS.open: row 4 is the cell above the row-5 start, and both start life as '.......'.
  const aheadWalled = BOARDS.open.rows.map((r, i) => (i === 4 ? '...#...' : r));
  assert.equal(isValidBoard(aheadWalled), false, 'wall directly ahead of the start');
  const topStart = BOARDS.open.rows.map((r, i) => (i === 0 ? '...S...' : i === 5 ? '.......' : r));
  assert.equal(isValidBoard(topStart), false, 'a start on row 0 has no cell above to check');
});

// BOARDS is a module-level constant built by validating every entry with isValidBoard before
// parseBoard runs (see src/boards.js); there is no way to hand it a bad picture from here to prove
// the throw without breaking a shipped board. Verified by hand instead: copy src/boards.js to a
// scratch file, corrupt one shipped board's rows (wrong width), `node -e` import it, confirm the
// module throws at load time, then discard the scratch copy — never commit that broken variant.
