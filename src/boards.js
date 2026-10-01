import { GRID, GATE } from './constants.js';

// The boards, as eleven rows of seven characters: '#' wall, 'S' where the snake starts (heading
// up), '.' free. Data, not code, so a new shape is a picture, and the test proves it playable.
const ROWS = {
  open: {
    name: 'Open',
    rows: [
      '.......',
      '.......',
      '.......',
      '.......',
      '.......',
      '...S...',
      '.......',
      '.......',
      '.......',
      '.......',
      '.......',
    ],
  },
  pillars: {
    name: 'The pillars',
    rows: [
      '.......',
      '.......',
      '.#...#.',
      '.......',
      '.......',
      '...S...',
      '.......',
      '.......',
      '.#...#.',
      '.......',
      '.......',
    ],
  },
  lanes: {
    name: 'The lanes',
    rows: [
      '.......',
      '.......',
      '.#...#.',
      '.#...#.',
      '.#...#.',
      '.#.S.#.',
      '.#...#.',
      '.#...#.',
      '.#...#.',
      '.......',
      '.......',
    ],
  },
  chambers: {
    name: 'The chambers',
    rows: [
      '.......',
      '.......',
      '.......',
      '###.###',
      '.......',
      '...S...',
      '.......',
      '.......',
      '.......',
      '.......',
      '.......',
    ],
  },
  ring: {
    name: 'The ring',
    rows: [
      '.......',
      '.......',
      '.##.##.',
      '.#...#.',
      '.#...#.',
      '...S...',
      '.#...#.',
      '.#...#.',
      '.##.##.',
      '.......',
      '.......',
    ],
  },
};

export const cellKey = (x, y) => `${x},${y}`;

// rows -> { walls: Set<'x,y'>, gates: [{ x, y, set: 'A'|'B' }], start: {x, y}, cols, rows }. Throws
// only on a bad character or the wrong number of starts; a wrong size or an unreachable layout
// parses without complaint, so run isValidBoard first when the rows come from anywhere but this
// file's own validated BOARDS.
export function parseBoard(rows) {
  const walls = new Set();
  const gates = [];
  let start = null;
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === '#') walls.add(cellKey(x, y));
      else if (ch === 'A' || ch === 'B') gates.push({ x, y, set: ch });
      else if (ch === 'S') {
        if (start) throw new Error('board has two starts');
        start = { x, y };
      } else if (ch !== '.') throw new Error(`bad board character '${ch}'`);
    }
  });
  if (!start) throw new Error('board has no start');
  return { walls, gates, start, cols: rows[0].length, rows: rows.length };
}

// How many cells the start reaches without crossing a wall or a cell `blocked(key)` refuses.
function reachCount(b, blocked) {
  const seen = new Set([cellKey(b.start.x, b.start.y)]);
  const queue = [b.start];
  while (queue.length) {
    const { x, y } = queue.shift();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy, k = cellKey(nx, ny);
      if (nx < 0 || ny < 0 || nx >= GRID.cols || ny >= GRID.rows) continue;
      if (b.walls.has(k) || seen.has(k) || blocked(k)) continue;
      seen.add(k);
      queue.push({ x: nx, y: ny });
    }
  }
  return seen.size;
}

// 7x11, exactly one start, the cell ahead of the start free (no wall, no gate), every non-wall
// cell reachable from the start with all gates open, and — on a board with gates — at least
// GATE.minStartArea cells reachable in the opening position (A open, B closed). A board that fails
// this would spawn tiles the snake can never eat, start it facing a wall, or box it in.
export function isValidBoard(rows) {
  if (!Array.isArray(rows) || rows.length !== GRID.rows) return false;
  if (!rows.every(r => typeof r === 'string' && r.length === GRID.cols)) return false;
  let b;
  try { b = parseBoard(rows); } catch { return false; }
  const ahead = cellKey(b.start.x, b.start.y - 1);
  if (b.start.y === 0 || b.walls.has(ahead) || b.gates.some(g => cellKey(g.x, g.y) === ahead)) return false;
  const free = GRID.cols * GRID.rows - b.walls.size;
  if (reachCount(b, () => false) !== free) return false;
  if (b.gates.length === 0) return true;
  const closedB = new Set(b.gates.filter(g => g.set === 'B').map(g => cellKey(g.x, g.y)));
  return reachCount(b, k => closedB.has(k)) >= GATE.minStartArea;
}

// key -> { key, name, rows (the strings), walls, gates, start, cols }. Validated at module load: a
// shipped board that is the wrong size, has no reachable start, or seals off a pocket throws here
// instead of shipping a level the player (or a tile spawn) can never actually reach.
export const BOARDS = Object.fromEntries(Object.entries(ROWS).map(([key, { name, rows }]) => {
  if (!isValidBoard(rows)) {
    throw new Error(`board '${key}' is not valid: 7x11, one start, free cell ahead, all cells reachable, room to start`);
  }
  const parsed = parseBoard(rows);
  return [key, { key, name, rows, walls: parsed.walls, gates: parsed.gates, start: parsed.start, cols: parsed.cols }];
}));
