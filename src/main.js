import { createRng } from './rng.js';
import * as Game from './game.js';
import * as Render from './render.js';
import * as Snake from './snake.js';
import * as Fx from './fx.js';
import { initInput } from './input.js';
import { GRID, STORAGE_KEY, DEATH, UI } from './constants.js';
import { loadRuns, saveRuns, buildRun, summarize, formatStats } from './telemetry.js';

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
let game, fx, lastTick, motion, prevNow, interval;

const SESSION = Date.now().toString(36); // one page load = one "player session"
let runs = loadRuns();
let run; // { session, t0, firstMergeMs } for the run in progress
window.numberSnakeStats = () => summarize(runs); // call from DevTools during a playtest

function start() {
  const seed = (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0;
  game = Game.createGame(createRng(seed));
  fx = Fx.createFx();
  motion = { kind: 'none', progress: 1 };
  interval = Game.targetInterval(0);
  lastTick = performance.now();
  $('overlay').classList.add('hidden');
  $('stats').classList.add('hidden');
  $('statsCopied').classList.add('hidden');
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
  motion = { kind: 'none', progress: 1 };
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
  $('statsText').textContent = formatStats(summarize(runs));
  console.log('[Number Snake] run', rec);
  console.log('[Number Snake] stats', summarize(runs));
  setTimeout(() => { if (game.over) $('overlay').classList.remove('hidden'); }, DEATH.overlayDelayMs);
}

function frame(now) {
  const dt = prevNow === undefined ? 0 : now - prevNow;
  prevNow = now;
  interval = Game.smoothInterval(interval, Game.targetInterval(game.score), dt);

  const elapsed = now - lastTick;
  if (game.started && !game.over && Game.tickDue(elapsed, interval, game.snake.queue.length > 0)) {
    const early = elapsed < interval; // a queued turn cut the slide short
    const prevCells = game.snake.cells.map(c => ({ x: c.x, y: c.y })); // where the body slides from
    const ev = Game.step(game);
    // An early tick starts its slide now — advancing by a full interval would put the
    // clock ahead of `now` and run the next slide backwards. A tick that came due keeps
    // its leftover time so the body never stands still for a frame.
    lastTick = early ? now : Game.nextTickTime(lastTick, interval, now);
    if (ev.over) {
      onGameOver(ev, now);
    } else {
      const kind = ev.ate ? 'grow' : 'slide';
      motion = { kind, progress: 0, from: Render.motionFrom(kind, prevCells, game.snake.cells) };
      if (ev.merges > 0) {
        Fx.addMerge(fx, ev.cell, ev.merges, Render.colorFor(game.snake.values[0]), now);
        if (run.firstMergeMs === null) run.firstMergeMs = Math.round(now - run.t0);
      }
    }
  }
  // The slide lasts as long as the interval that will fire the next tick. That interval
  // eases rather than jumps, so the slide it paces cannot lurch either.
  if (motion.kind !== 'none') motion.progress = Math.min(1, (now - lastTick) / interval);

  Fx.update(fx, now, dt);
  $('score').textContent = game.score;
  $('bestTile').textContent = Math.max(best.tile, game.bestTile);
  ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0); // canvas resizes reset the transform
  Render.draw(ctx, view, game, fx, now, motion);
  requestAnimationFrame(frame);
}

// Clipboard API needs https or localhost. On a LAN http:// URL fall back to selecting
// the text and the legacy copy command; the selection is cleared on success and left
// in place on failure so the player can long-press it.
async function copyText(el) {
  try { await navigator.clipboard.writeText(el.textContent); return true; } catch { /* fall through */ }
  const range = document.createRange();
  range.selectNodeContents(el);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
  let ok = false;
  try { ok = document.execCommand('copy'); } catch { ok = false; }
  if (ok) sel.removeAllRanges();
  return ok;
}

initInput(canvas, onDirection);
$('playAgain').addEventListener('click', start);
$('statsToggle').addEventListener('click', () => $('stats').classList.toggle('hidden'));
$('statsCopy').addEventListener('click', async () => {
  const note = $('statsCopied');
  note.textContent = (await copyText($('statsText'))) ? 'Copied' : 'Text selected — long-press to copy';
  note.classList.remove('hidden');
  setTimeout(() => note.classList.add('hidden'), UI.copiedNoteMs);
});
window.addEventListener('resize', fitCanvas);
window.addEventListener('orientationchange', fitCanvas);

fitCanvas();
start();
requestAnimationFrame(frame);
