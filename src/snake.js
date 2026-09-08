import { GRID } from './constants.js';

// A snake is parallel arrays:
//   cells:  [{x,y}, ...] head-first, always a contiguous path
//   values: [n, ...]     aligned by index to cells
//   direction / pending: current and queued {x,y} unit vectors
export function createSnake(len, value, start, direction) {
  const cells = [], values = [];
  for (let i = 0; i < len; i++) {
    cells.push({ x: start.x - direction.x * i, y: start.y - direction.y * i });
    values.push(value);
  }
  return { cells, values, direction: { ...direction }, pending: { ...direction } };
}

export const head = (s) => s.cells[0];
export const length = (s) => s.cells.length;

export function maxValue(s) {
  let m = 0;
  for (const v of s.values) if (v > m) m = v;
  return m;
}

export function setDirection(s, dir) {
  // Reject an exact 180-degree reverse while there is a body to crash into.
  if (s.cells.length > 1 && dir.x === -s.direction.x && dir.y === -s.direction.y) return;
  s.pending = { x: dir.x, y: dir.y };
}

export function nextHeadCell(s) {
  return { x: s.cells[0].x + s.pending.x, y: s.cells[0].y + s.pending.y };
}

export function isWall(cell, cols = GRID.cols, rows = GRID.rows) {
  return cell.x < 0 || cell.y < 0 || cell.x >= cols || cell.y >= rows;
}

// Would moving the head to `cell` hit the snake's own body?
// On a normal move the tail vacates, so the current tail cell is NOT a hazard.
// On an eat (willEat=true) the snake grows, so every current cell is a hazard.
export function hitsSelf(s, cell, willEat) {
  const last = willEat ? s.cells.length : s.cells.length - 1;
  for (let i = 0; i < last; i++) {
    if (s.cells[i].x === cell.x && s.cells[i].y === cell.y) return true;
  }
  return false;
}

// Normal forward move (no eat): unshift a new head cell, pop the tail. Values untouched.
export function move(s) {
  s.direction = { ...s.pending };
  s.cells.unshift({ x: s.cells[0].x + s.direction.x, y: s.cells[0].y + s.direction.y });
  s.cells.pop();
}

// Eat a tile of `value` at the head's next cell, then resolve cascading merges.
// Returns { merges, gained } for scoring and combo tracking.
//   - prepend the new head cell + value (grow by one)
//   - while the front two values are equal: double the front, drop the 2nd value,
//     and pop one tail cell so cells/values stay aligned and contiguous.
export function eat(s, cell, value) {
  s.direction = { ...s.pending };
  s.cells.unshift({ x: cell.x, y: cell.y });
  s.values.unshift(value);
  let merges = 0, gained = 0;
  while (s.values.length > 1 && s.values[0] === s.values[1]) {
    s.values[0] *= 2;
    s.values.splice(1, 1);
    s.cells.pop();
    merges += 1;
    gained += s.values[0];
  }
  return { merges, gained };
}
