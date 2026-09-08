import { GRID, TIMING, START } from './constants.js';
import * as Snake from './snake.js';
import * as Board from './board.js';

export function tickInterval(score) {
  return Math.max(TIMING.tickFloorMs, TIMING.tickStartMs - score * TIMING.tickPerPoint);
}

export function createGame(rng) {
  const board = Board.createBoard();
  const start = { x: Math.floor(GRID.cols / 2), y: Math.floor(GRID.rows / 2) };
  const snake = Snake.createSnake(START.snakeLength, START.snakeValue, start, START.direction);
  Board.refill(board, rng, Snake.maxValue(snake), snake.cells);
  return {
    rng, board, snake,
    started: false,   // the run does not move until the player's first input
    ticks: 0,         // ticks stepped since the run started
    score: 0,
    bestTile: Snake.maxValue(snake),
    bestCombo: 0,
    over: false,
    lastCause: null,
  };
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
    Board.removeTile(b, next.x, next.y);
    game.score += r.gained;
    if (r.merges > game.bestCombo) game.bestCombo = r.merges;
    const mv = Snake.maxValue(s);
    if (mv > game.bestTile) game.bestTile = mv;
    Board.refill(b, game.rng, mv, s.cells);
    return { over: false, ate: true, merges: r.merges, gained: r.gained, cell: next };
  }

  Snake.move(s);
  return { over: false, ate: false, merges: 0, gained: 0, cell: next };
}
