import { GRID, INPUT } from './constants.js';

// A snake is parallel arrays:
//   cells:  [{x,y}, ...] head-first, always a contiguous path
//   values: [n, ...]     aligned by index to cells
//   direction: heading used for the last move ({x,y} unit vector)
//   queue:     up to INPUT.queueDepth upcoming turns, consumed one per tick
export function createSnake(len, value, start, direction) {
  const cells = [], values = [];
  for (let i = 0; i < len; i++) {
    cells.push({ x: start.x - direction.x * i, y: start.y - direction.y * i });
    values.push(value);
  }
  return { cells, values, direction: { ...direction }, queue: [] };
}

export const head = (s) => s.cells[0];
export const length = (s) => s.cells.length;

export function maxValue(s) {
  let m = 0;
  for (const v of s.values) if (v > m) m = v;
  return m;
}

// The heading the next tick will use.
export function nextDirection(s) {
  return s.queue.length ? s.queue[0] : s.direction;
}

// Queue a turn. It is compared against the last queued turn (or the current
// heading if nothing is queued): a repeat is a no-op, a 180-degree reverse is
// rejected while there is a body to crash into, and the queue holds at most
// INPUT.queueDepth turns so a fast LEFT-then-UP lands both.
export function setDirection(s, dir) {
  const ref = s.queue.length ? s.queue[s.queue.length - 1] : s.direction;
  const same = ref.x === dir.x && ref.y === dir.y;
  const reverse = ref.x === -dir.x && ref.y === -dir.y;
  if (same) return;
  if (reverse && s.cells.length > 1) return;
  if (s.queue.length >= INPUT.queueDepth) return;
  s.queue.push({ x: dir.x, y: dir.y });
}

export function nextHeadCell(s) {
  const d = nextDirection(s);
  return { x: s.cells[0].x + d.x, y: s.cells[0].y + d.y };
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

function consumeTurn(s) {
  if (s.queue.length) s.direction = s.queue.shift();
}

// Normal forward move (no eat): unshift a new head cell, pop the tail. Values untouched.
export function move(s) {
  consumeTurn(s);
  s.cells.unshift({ x: s.cells[0].x + s.direction.x, y: s.cells[0].y + s.direction.y });
  s.cells.pop();
}

// Eat a tile of `value` at the head's next cell, then resolve cascading merges.
// Returns { merges, gained } for scoring and combo tracking.
//   - prepend the new head cell + value (grow by one)
//   - while the front two values are equal: double the front, drop the 2nd value,
//     and pop one tail cell so cells/values stay aligned and contiguous.
export function eat(s, cell, value) {
  consumeTurn(s);
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
