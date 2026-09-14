import { GRID } from './constants.js';

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

// rows -> { walls: Set<'x,y'>, start: {x, y}, cols, rows }. Throws on a malformed picture; use
// isValidBoard first when the rows come from anywhere but this file.
export function parseBoard(rows) {
  const walls = new Set();
  let start = null;
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === '#') walls.add(cellKey(x, y));
      else if (ch === 'S') {
        if (start) throw new Error('board has two starts');
        start = { x, y };
      } else if (ch !== '.') throw new Error(`bad board character '${ch}'`);
    }
  });
  if (!start) throw new Error('board has no start');
  return { walls, start, cols: rows[0].length, rows: rows.length };
}

// 7x11, exactly one start, the cell ahead of the start free, and every free cell reachable from
// the start without crossing a wall: a board that fails this would spawn tiles the snake can never
// eat, or start it facing a wall.
export function isValidBoard(rows) {
  if (!Array.isArray(rows) || rows.length !== GRID.rows) return false;
  if (!rows.every(r => typeof r === 'string' && r.length === GRID.cols)) return false;
  let b;
  try { b = parseBoard(rows); } catch { return false; }
  if (b.start.y === 0 || b.walls.has(cellKey(b.start.x, b.start.y - 1))) return false;
  const free = GRID.cols * GRID.rows - b.walls.size;
  const seen = new Set([cellKey(b.start.x, b.start.y)]);
  const queue = [b.start];
  while (queue.length) {
    const { x, y } = queue.shift();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy, k = cellKey(nx, ny);
      if (nx < 0 || ny < 0 || nx >= GRID.cols || ny >= GRID.rows) continue;
      if (b.walls.has(k) || seen.has(k)) continue;
      seen.add(k);
      queue.push({ x: nx, y: ny });
    }
  }
  return seen.size === free;
}

// key -> { key, name, rows (the strings), walls, start, cols }
export const BOARDS = Object.fromEntries(Object.entries(ROWS).map(([key, { name, rows }]) => {
  const parsed = parseBoard(rows);
  return [key, { key, name, rows, walls: parsed.walls, start: parsed.start, cols: parsed.cols }];
}));
