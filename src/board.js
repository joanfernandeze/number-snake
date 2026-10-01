import { GRID, SPAWN, OBSTACLE, GATE } from './constants.js';
import { randInt } from './rng.js';

// walls: Set<'x,y'> of cells that are part of the board's shape. Lethal like the frame, and
// nothing ever spawns on them. gates: [{x, y, set}] from a parsed board; set A starts open and set
// B closed, eating swaps them (swapGates) and a closing gate turns solid a few moves later
// (tickGates). openSet names the set that is open now.
export function createBoard(cols = GRID.cols, rows = GRID.rows, walls = new Set(), gates = []) {
  return {
    cols, rows, tiles: [], obstacles: [], walls, // tiles: [{x, y, value}], obstacles: [{x, y}]
    gates: gates.map(g => ({ x: g.x, y: g.y, set: g.set, state: g.set === 'A' ? 'open' : 'closed', warn: 0 })),
    openSet: 'A',
  };
}

export function wallAt(board, x, y) {
  return board.walls.has(`${x},${y}`);
}

export function tileAt(board, x, y) {
  return board.tiles.find(t => t.x === x && t.y === y) || null;
}

export function obstacleAt(board, x, y) {
  return board.obstacles.find(o => o.x === x && o.y === y) || null;
}

export function gateAt(board, x, y) {
  return (board.gates || []).find(g => g.x === x && g.y === y) || null;
}

// Only a closed gate stops the snake; an open or a closing one can be crossed.
export function closedGateAt(board, x, y) {
  const g = gateAt(board, x, y);
  return g && g.state === 'closed' ? g : null;
}

// Eating swaps the sets: the closed set opens at once and the open set starts closing, crossable
// for GATE.warnTicks more moves. A set still closing from the previous swap simply reopens.
// Returns whether anything swapped (false on a board without gates).
export function swapGates(board) {
  if (!board.gates || board.gates.length === 0) return false;
  board.openSet = board.openSet === 'A' ? 'B' : 'A';
  for (const g of board.gates) {
    if (g.set === board.openSet) { g.state = 'open'; g.warn = 0; }
    else { g.state = 'closing'; g.warn = GATE.warnTicks; }
  }
  return true;
}

// One move has passed: every closing gate counts down and turns solid once its count is spent and
// no part of the snake is on it. One under the snake keeps blinking until the cell is free, so a
// gate never shuts on the body. Returns the cells that just turned solid.
export function tickGates(board, snakeCells) {
  const closed = [];
  for (const g of board.gates || []) {
    if (g.state !== 'closing') continue;
    if (g.warn > 0) g.warn -= 1;
    if (g.warn > 0) continue;
    if (snakeCells.some(c => c.x === g.x && c.y === g.y)) continue;
    g.state = 'closed';
    closed.push({ x: g.x, y: g.y });
  }
  return closed;
}

// Cells the head can get to right now: walls, gates that are not open and armed obstacles block;
// the snake's own body does not, because it moves out of the way. Keeps a tile from spawning in a
// region a closed gate has sealed off. With passClosing a closing gate counts as passable too (it
// still can be crossed for a move or two), so only a fully closed gate blocks.
export function reachableFrom(board, head, passClosing = false) {
  const key = (x, y) => `${x},${y}`;
  const seen = new Set([key(head.x, head.y)]);
  const queue = [head];
  for (let i = 0; i < queue.length; i++) {
    const { x, y } = queue[i];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy, k = key(nx, ny);
      if (nx < 0 || ny < 0 || nx >= board.cols || ny >= board.rows || seen.has(k)) continue;
      if (wallAt(board, nx, ny) || armedObstacleAt(board, nx, ny)) continue;
      const g = gateAt(board, nx, ny);
      if (g && (passClosing ? g.state === 'closed' : g.state !== 'open')) continue;
      seen.add(k);
      queue.push({ x: nx, y: ny });
    }
  }
  return seen;
}

export function removeTile(board, x, y) {
  board.tiles = board.tiles.filter(t => !(t.x === x && t.y === y));
}

// Pick a tile value from the top `span` powers of two ending at maxValue, weighted toward the
// low end by `decay`. As the biggest piece grows, the smallest values stop appearing: with a 32
// on the snake no 2s spawn, with a 64 no 4s. The bottom of the window is what a player most
// likely holds after eating the wrong tile, so it is also the rung that climbs back fastest.
export function pickValue(rng, maxValue, decay = SPAWN.decay, base = SPAWN.baseValue, span = SPAWN.span) {
  const maxExp = Math.max(1, Math.round(Math.log2(maxValue / base)) + 1);
  const minExp = Math.max(1, maxExp - span + 1);
  const weights = [];
  let total = 0;
  for (let e = minExp; e <= maxExp; e++) {
    const w = Math.pow(decay, e - minExp);
    weights.push(w);
    total += w;
  }
  let r = rng() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r <= 0) return base * Math.pow(2, minExp - 1 + i);
  }
  return base * Math.pow(2, maxExp - 1);
}

function isOccupied(board, snakeCells, x, y) {
  if (wallAt(board, x, y) || gateAt(board, x, y) || tileAt(board, x, y) || obstacleAt(board, x, y)) return true;
  return snakeCells.some(c => c.x === x && c.y === y);
}

// Spawn one tile on a random empty cell. Returns the tile, or null if the board is full. On a board
// with gates a tile only lands where the head can reach now; a board without gates skips that
// search, so its spawns — and every seeded run on it — are exactly what they were before gates.
// Right after a swap the head can be shut in by gates that are still closing, with no free cell
// in reach: tiles only refill and gates only swap on an eat, so that would soft-lock the run. In
// that case closing gates count as passable, because the player can still get through them.
export function spawnTile(board, rng, maxValue, snakeCells, decay, span) {
  const gated = board.gates && board.gates.length && snakeCells.length;
  const collect = (reach) => {
    const cells = [];
    for (let y = 0; y < board.rows; y++) {
      for (let x = 0; x < board.cols; x++) {
        if (!isOccupied(board, snakeCells, x, y) && (!reach || reach.has(`${x},${y}`))) cells.push({ x, y });
      }
    }
    return cells;
  };
  let empties = collect(gated ? reachableFrom(board, snakeCells[0]) : null);
  if (gated && empties.length === 0) empties = collect(reachableFrom(board, snakeCells[0], true));
  if (empties.length === 0) return null;
  const cell = empties[randInt(rng, empties.length)];
  const tile = { x: cell.x, y: cell.y, value: pickValue(rng, maxValue, decay, SPAWN.baseValue, span) };
  board.tiles.push(tile);
  return tile;
}

// The tile count, the low-value bias and the window all come from the level, so the caller passes them.
export function refill(board, rng, maxValue, snakeCells, maxTiles, decay, span) {
  while (board.tiles.length < maxTiles) {
    if (!spawnTile(board, rng, maxValue, snakeCells, decay, span)) break;
  }
}

// Place one obstacle. It keeps clear of the head so it can never appear in the player's
// face, and prefers not to sit beside another obstacle so a chain of them cannot wall the
// board in half. A cell beside a gate is treated the same way, so an obstacle cannot seal a gate
// shut; it only lands there when nowhere else qualifies. Returns the obstacle, or null when nowhere qualifies at all.
export function spawnObstacle(board, rng, snakeCells, head, minHeadDist = OBSTACLE.minHeadDist) {
  const clear = [], beside = [];
  for (let y = 0; y < board.rows; y++) {
    for (let x = 0; x < board.cols; x++) {
      if (isOccupied(board, snakeCells, x, y)) continue;
      if (head && Math.abs(x - head.x) + Math.abs(y - head.y) < minHeadDist) continue;
      const touching = obstacleAt(board, x - 1, y) || obstacleAt(board, x + 1, y)
        || obstacleAt(board, x, y - 1) || obstacleAt(board, x, y + 1)
        || gateAt(board, x - 1, y) || gateAt(board, x + 1, y)
        || gateAt(board, x, y - 1) || gateAt(board, x, y + 1);
      (touching ? beside : clear).push({ x, y });
    }
  }
  const pool = clear.length ? clear : beside;
  if (!pool.length) return null;
  const cell = pool[randInt(rng, pool.length)];
  const obstacle = { x: cell.x, y: cell.y, armed: false, warn: OBSTACLE.warnTicks };
  board.obstacles.push(obstacle);
  return obstacle;
}

// Only an armed obstacle can end a run; a blinking one is still a warning.
export function armedObstacleAt(board, x, y) {
  const o = obstacleAt(board, x, y);
  return o && o.armed ? o : null;
}

// Count every blinking obstacle down one move. Returns the cells that just turned solid.
// One about to arm under the snake gives up instead of killing from underneath.
export function armObstacles(board, snakeCells) {
  const armed = [];
  const kept = [];
  for (const o of board.obstacles) {
    if (o.armed) { kept.push(o); continue; }
    // A hand-made obstacle with no countdown arms at once; that is the sane default for
    // a fixture, and it should not depend on NaN comparing false.
    o.warn = Number.isFinite(o.warn) ? o.warn - 1 : 0;
    if (o.warn > 0) { kept.push(o); continue; }
    if (snakeCells.some(c => c.x === o.x && c.y === o.y)) continue; // cancelled
    o.armed = true;
    armed.push({ x: o.x, y: o.y });
    kept.push(o);
  }
  board.obstacles = kept;
  return armed;
}
