import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BOARDS, parseBoard, isValidBoard } from '../src/boards.js';
import { GRID, GATE } from '../src/constants.js';

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

const DOOR = ['.......', '.......', '.......', '##A#B##', '.......', '...S...',
  '.......', '.......', '.......', '.......', '.......'];

test('parseBoard reads A and B as gates in two sets, not as walls', () => {
  const b = parseBoard(DOOR);
  assert.deepEqual(b.gates, [{ x: 2, y: 3, set: 'A' }, { x: 4, y: 3, set: 'B' }]);
  assert.equal(b.walls.size, 5);
  assert.equal(b.walls.has('2,3'), false, 'a gate is not a wall');
  assert.deepEqual(parseBoard(BOARDS.open.rows).gates, []);
  assert.throws(() => parseBoard(DOOR.map((r, i) => (i === 0 ? 'C......' : r))), /bad board character/);
});

test('isValidBoard: every cell reachable with all gates open, and no region under the minimum in either gate position', () => {
  assert.equal(isValidBoard(DOOR), true);
  // A 3x3 room around the start whose only way out is a B gate: 9 cells with B closed, under 20.
  const boxed = ['.......', '.......', '.......', '.#####.', '.#...#.', '.#.S.#.',
    '.#...#.', '.##B##.', '.......', '.......', '.......'];
  assert.equal(isValidBoard(boxed), false, 'start area too small while B is closed');
  // Now invalid too: eating inside the room while A is open closes its only exit and seals the snake in.
  assert.equal(isValidBoard(boxed.map(r => r.replace('B', 'A'))), false, 'a room whose only exit is one set is a trap');
  // A gate may not stand directly ahead of the start.
  const blocked = BOARDS.open.rows.map((r, i) => (i === 4 ? '...A...' : r));
  assert.equal(isValidBoard(blocked), false);
});

test('isValidBoard: a region must hold at least GATE.minRegion cells', () => {
  // The two left columns (22 cells) are cut off by a wall column whose only gap at row 5 is a B gate.
  // Walls at (0,0) and (0,1) leave 20 cells for the start with B closed; one more at (0,2) leaves 19.
  const room = tops => ['.', '.', '.', '.', '.', '.', '.', '.', '.', '.', '.']
    .map((_, y) => (tops.includes(y) ? '#' : '.') + (y === 5 ? 'SB' : '.#') + '....');
  const enough = room([0, 1]);
  const short = room([0, 1, 2]);
  assert.equal(GATE.minRegion, 20, 'the boards below are counted against 20');
  assert.equal(isValidBoard(enough), true, 'exactly 20 cells');
  assert.equal(isValidBoard(short), false, '19 cells');
});

test('the old rooms layout is invalid (its right room is all B gates); the new one is valid', () => {
  const old = ['...#...', '...B...', '...#...', '#A###B#', '.......', '...S...', '.......', '.......',
    '.......', '.......', '.......'];
  assert.equal(isValidBoard(old), false, 'the right room is reached only through B gates');
  assert.equal(isValidBoard(BOARDS.rooms.rows), true);
});

test('every shipped gate board leaves no region under GATE.minRegion in either gate position', () => {
  for (const [key, b] of Object.entries(BOARDS)) {
    if (b.gates.length === 0) continue;
    for (const closedSet of ['A', 'B']) {
      const blocked = new Set(b.walls);
      for (const g of b.gates) if (g.set === closedSet) blocked.add(`${g.x},${g.y}`);
      const seen = new Set();
      for (let y = 0; y < GRID.rows; y++) for (let x = 0; x < GRID.cols; x++) {
        if (blocked.has(`${x},${y}`) || seen.has(`${x},${y}`)) continue;
        let size = 0;
        const stack = [[x, y]];
        seen.add(`${x},${y}`);
        while (stack.length) {
          const [cx, cy] = stack.pop();
          size++;
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = cx + dx, ny = cy + dy, k = `${nx},${ny}`;
            if (nx < 0 || ny < 0 || nx >= GRID.cols || ny >= GRID.rows || blocked.has(k) || seen.has(k)) continue;
            seen.add(k);
            stack.push([nx, ny]);
          }
        }
        assert.ok(size >= GATE.minRegion, `${key} with ${closedSet} closed has a region of ${size} cells`);
      }
    }
  }
});

test('the five gate boards ship, each with both sets', () => {
  const counts = { door: 2, locks: 2, halves: 2, rooms: 3, vault: 4 };
  for (const [key, n] of Object.entries(counts)) {
    const b = BOARDS[key];
    assert.ok(b, `${key} ships`);
    assert.equal(b.gates.length, n, `${key} gate count`);
    assert.ok(b.gates.some(g => g.set === 'A') && b.gates.some(g => g.set === 'B'), `${key} has both sets`);
  }
  for (const key of ['open', 'pillars', 'lanes', 'chambers', 'ring']) assert.deepEqual(BOARDS[key].gates, []);
});
