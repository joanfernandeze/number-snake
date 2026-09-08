import { createRng } from './rng.js';
import * as Game from './game.js';
import * as Render from './render.js';
import * as Snake from './snake.js';
import * as Fx from './fx.js';
import { initInput } from './input.js';
import { GRID, STORAGE_KEY, DEATH } from './constants.js';
import { loadRuns, saveRuns, buildRun, summarize } from './telemetry.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const $ = (id) => document.getElementById(id);
const view = { width: canvas.width, height: canvas.height, dpr: 1 }; // CSS px + device ratio

function loadBest() {
  const empty = { tile: 0, score: 0, combo: 0 };
  try { return { ...empty, ...(JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}) }; }
  catch { return empty; }
}
function saveBest(b) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(b)); } catch { /* ignore */ }
}

// Size the canvas to the largest GRID-shaped box that fits between the HUD and the
// hint, then match the backing store to CSS size x devicePixelRatio (crisp numbers).
function fitCanvas() {
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const app = $('app');
  const used = $('hud').offsetHeight + $('hint').offsetHeight + 48; // 2 gaps + 2 paddings of 12px
  const availW = Math.max(120, Math.min(420, app.clientWidth - 24));
  const availH = Math.max(120, app.clientHeight - used);
  const ratio = GRID.cols / GRID.rows;
  let w = availW, h = Math.round(w / ratio);
  if (h > availH) { h = availH; w = Math.round(h * ratio); }
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  const bw = Math.round(w * dpr), bh = Math.round(h * dpr);
  if (canvas.width !== bw || canvas.height !== bh) { canvas.width = bw; canvas.height = bh; }
  view.width = w; view.height = h; view.dpr = dpr;
}

let best = loadBest();
let game, fx, lastTick, motion, prevNow;

const SESSION = Date.now().toString(36); // one page load = one "player session"
let runs = loadRuns();
let run; // { session, t0, firstMergeMs } for the run in progress
window.numberSnakeStats = () => summarize(runs); // call from DevTools during a playtest

function start() {
  const seed = (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0;
  game = Game.createGame(createRng(seed));
  fx = Fx.createFx();
  motion = { kind: 'none', dir: { ...game.snake.direction }, progress: 1 };
  lastTick = performance.now();
  $('overlay').classList.add('hidden');
  run = { session: SESSION, t0: null, firstMergeMs: null };
}

function onDirection(dir) {
  if (!game || game.over) return;
  if (!game.started) { Game.startRun(game); lastTick = performance.now(); run.t0 = lastTick; }
  Snake.setDirection(game.snake, dir);
}

function onGameOver(ev, now) {
  Fx.addShake(fx, now);
  Fx.addDeath(fx, ev.cause, now);
  motion = { kind: 'none', dir: { ...game.snake.direction }, progress: 1 };
  if (game.bestTile > best.tile) best.tile = game.bestTile;
  if (game.score > best.score) best.score = game.score;
  if (game.bestCombo > best.combo) best.combo = game.bestCombo;
  saveBest(best);
  $('ovTile').textContent = game.bestTile;
  $('ovScore').textContent = game.score;
  $('ovCombo').textContent = game.bestCombo;
  $('ovBestTile').textContent = best.tile;
  $('ovBestScore').textContent = best.score;
  const rec = buildRun(run, game, ev, now);
  runs = saveRuns([...runs, rec]);
  console.log('[Number Snake] run', rec);
  console.log('[Number Snake] stats', summarize(runs));
  setTimeout(() => { if (game.over) $('overlay').classList.remove('hidden'); }, DEATH.overlayDelayMs);
}

function frame(now) {
  const dt = prevNow === undefined ? 0 : now - prevNow;
  prevNow = now;
  const interval = Game.tickInterval(game.score);

  if (game.started && !game.over && now - lastTick >= interval) {
    const ev = Game.step(game);
    lastTick = now;
    if (ev.over) {
      onGameOver(ev, now);
    } else {
      motion = { kind: ev.ate ? 'grow' : 'slide', dir: { ...game.snake.direction }, progress: 0 };
      if (ev.merges > 0) {
        Fx.addMerge(fx, ev.cell, ev.merges, Render.colorFor(game.snake.values[0]), now);
        if (run.firstMergeMs === null) run.firstMergeMs = Math.round(now - run.t0);
      }
    }
  }
  if (motion.kind !== 'none') motion.progress = Math.min(1, (now - lastTick) / interval);

  Fx.update(fx, now, dt);
  $('score').textContent = game.score;
  $('bestTile').textContent = Math.max(best.tile, game.bestTile);
  ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0); // canvas resizes reset the transform
  Render.draw(ctx, view, game, fx, now, motion);
  requestAnimationFrame(frame);
}

initInput(canvas, onDirection);
$('playAgain').addEventListener('click', start);
window.addEventListener('resize', fitCanvas);
window.addEventListener('orientationchange', fitCanvas);

fitCanvas();
start();
requestAnimationFrame(frame);
