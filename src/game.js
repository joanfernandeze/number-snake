import { GRID, TIMING, START, DIFFICULTIES, DEFAULT_DIFFICULTY } from './constants.js';
import * as Snake from './snake.js';
import * as Board from './board.js';

// The interval the run is climbing toward after eating this many tiles. The gap to the
// floor halves every cfg.halfLifeEats tiles, so the climb is spread evenly across a run
// instead of arriving with the late, lumpy points. It approaches the floor without ever
// reaching it, so there is no wall where the climb suddenly stops.
export function targetInterval(eaten, cfg = DIFFICULTIES[DEFAULT_DIFFICULTY]) {
  const gap = cfg.tickStartMs - cfg.tickFloorMs;
  return cfg.tickFloorMs + gap * Math.pow(2, -Math.max(0, eaten) / cfg.halfLifeEats);
}

// Ease the live interval toward that target rather than snapping to it. Score arrives in
// lumps — one bite can pay for a whole cascade — and a step change in speed reads as a
// jolt even when it is small. Framerate-independent: the fraction of the gap closed
// depends only on how much time passed, so 30fps and 120fps ramp identically.
export function smoothInterval(current, target, dt, tau = TIMING.smoothTauMs) {
  if (!(dt > 0)) return current;
  return current + (target - current) * (1 - Math.exp(-dt / tau));
}

// Is a step due? A queued turn fires its tick early, once most of the slide has played
// out, so a swipe lands within a fraction of a cell instead of waiting out the whole
// interval — the difference between steering the snake and asking it politely.
export function tickDue(elapsed, interval, hasTurn) {
  if (elapsed >= interval) return true;
  return hasTurn && elapsed >= interval * TIMING.turnEarlyFrac;
}

// Clock for the next tick after stepping at `now`. Advancing by one interval (not to
// `now`) lets the leftover time flow into the next slide, so the snake never stands
// still for a frame at each cell. After a long gap (hidden tab) resync to `now`
// instead of fast-forwarding through the missed ticks.
// A frame that lands between one and two intervals late keeps its leftover, so the
// following frame may tick again almost at once — one extra tick at most, then caught up.
export function nextTickTime(lastTick, interval, now) {
  const next = lastTick + interval;
  return now - next > interval ? now : next;
}

// Upper bound of the tile-value window (spec §5). 'max' keeps every value the player has
// ever built reachable; 'head' tracks what the head can use right now, so the climb cannot
// stall — that is what makes Chill gentle.
function spawnRef(game) {
  return game.cfg.window === 'head' ? game.snake.values[0] : Snake.maxValue(game.snake);
}

export function createGame(rng, cfg = DIFFICULTIES[DEFAULT_DIFFICULTY]) {
  const board = Board.createBoard();
  const start = { x: Math.floor(GRID.cols / 2), y: Math.floor(GRID.rows / 2) };
  const snake = Snake.createSnake(START.snakeLength, START.snakeValue, start, START.direction);
  const game = {
    rng, board, snake, cfg,
    started: false,   // the run does not move until the player's first input
    ticks: 0,         // ticks stepped since the run started
    eaten: 0,         // tiles eaten: the clock the speed ramp runs on
    score: 0,
    bestTile: Snake.maxValue(snake),
    bestCombo: 0,
    over: false,
    lastCause: null,
  };
  Board.refill(board, rng, spawnRef(game), snake.cells, cfg.maxTiles, cfg.decay);
  return game;
}

// Called on the player's first direction input; until then step() waits.
export function startRun(game) {
  game.started = true;
}

// Advance the game by one tick. Returns an event object for render/FX:
//   { over, ate, merges, gained, cell, cause }
export function step(game) {
  if (game.over) return { over: true };
  if (!game.started) return { over: false, waiting: true };
  game.ticks += 1;
  const s = game.snake, b = game.board;
  const next = Snake.nextHeadCell(s);

  if (Snake.isWall(next, b.cols, b.rows)) {
    game.over = true;
    game.lastCause = { type: 'wall', cell: next };
    return { over: true, cause: game.lastCause };
  }

  const tile = Board.tileAt(b, next.x, next.y);
  const willEat = !!tile;

  if (Snake.hitsSelf(s, next, willEat)) {
    game.over = true;
    game.lastCause = { type: 'self', cell: next };
    return { over: true, cause: game.lastCause };
  }

  if (willEat) {
    const r = Snake.eat(s, next, tile.value);
    game.eaten += 1;
    Board.removeTile(b, next.x, next.y);
    game.score += r.gained;
    if (r.merges > game.bestCombo) game.bestCombo = r.merges;
    const mv = Snake.maxValue(s);
    if (mv > game.bestTile) game.bestTile = mv;
    Board.refill(b, game.rng, spawnRef(game), s.cells, game.cfg.maxTiles, game.cfg.decay);
    return { over: false, ate: true, merges: r.merges, gained: r.gained, cell: next };
  }

  Snake.move(s);
  return { over: false, ate: false, merges: 0, gained: 0, cell: next };
}
