import { GRID, SPAWN } from './constants.js';
import { randInt } from './rng.js';

export function createBoard(cols = GRID.cols, rows = GRID.rows) {
  return { cols, rows, tiles: [] }; // tiles: [{x, y, value}]
}

export function tileAt(board, x, y) {
  return board.tiles.find(t => t.x === x && t.y === y) || null;
}

export function removeTile(board, x, y) {
  board.tiles = board.tiles.filter(t => !(t.x === x && t.y === y));
}

// Pick a tile value: a power of two from base up to maxValue, weighted toward
// the low end by SPAWN.decay so 2s/4s dominate but high matches still appear.
export function pickValue(rng, maxValue, decay = 0.45, base = SPAWN.baseValue) {
  const maxExp = Math.max(1, Math.round(Math.log2(maxValue / base)) + 1);
  const weights = [];
  let total = 0;
  for (let e = 1; e <= maxExp; e++) {
    const w = Math.pow(decay, e - 1);
    weights.push(w);
    total += w;
  }
  let r = rng() * total;
  for (let e = 1; e <= maxExp; e++) {
    r -= weights[e - 1];
    if (r <= 0) return base * Math.pow(2, e - 1);
  }
  return base;
}

function isOccupied(board, snakeCells, x, y) {
  if (tileAt(board, x, y)) return true;
  return snakeCells.some(c => c.x === x && c.y === y);
}

// Spawn one tile on a random empty cell. Returns the tile, or null if the board is full.
export function spawnTile(board, rng, maxValue, snakeCells, decay) {
  const empties = [];
  for (let y = 0; y < board.rows; y++) {
    for (let x = 0; x < board.cols; x++) {
      if (!isOccupied(board, snakeCells, x, y)) empties.push({ x, y });
    }
  }
  if (empties.length === 0) return null;
  const cell = empties[randInt(rng, empties.length)];
  const tile = { x: cell.x, y: cell.y, value: pickValue(rng, maxValue, decay) };
  board.tiles.push(tile);
  return tile;
}

// The tile count and the low-value bias both come from the level, so the caller passes them.
export function refill(board, rng, maxValue, snakeCells, maxTiles, decay) {
  while (board.tiles.length < maxTiles) {
    if (!spawnTile(board, rng, maxValue, snakeCells, decay)) break;
  }
}
