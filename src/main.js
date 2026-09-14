import { createRng } from './rng.js';
import * as Game from './game.js';
import * as Render from './render.js';
import * as Snake from './snake.js';
import * as Fx from './fx.js';
import * as Sound from './sound.js';
import { initInput } from './input.js';
import { GRID, STORAGE_KEY, DEATH, UI, DIFFICULTIES, DEFAULT_DIFFICULTY, DAILY, ANALYTICS } from './constants.js';
import { loadRuns, saveRuns, buildRun, summarize, formatStats } from './telemetry.js';
import { dayKey, dailyNumber, seedFor, loadDaily, saveDaily, streak, recordDaily } from './daily.js';
import { shareText } from './share.js';
import { deviceFacts, sendRun } from './analytics.js';

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

// Every page load starts on Classic, so a tester's first run is always the same game. A level
// picked on the game-over panel sticks for the rest of the session.
let difficulty = DEFAULT_DIFFICULTY;

// 'free' is an ordinary run on the chosen level. 'daily' is today's seeded board on Classic and
// the first one counts; 'practice' replays that board without touching the record or streak.
let mode = 'free';
let daily = loadDaily();

function paintLevels() {
  for (const b of $('levels').querySelectorAll('button')) {
    b.setAttribute('aria-pressed', String(b.dataset.level === difficulty));
  }
}

// The HUD chip and the panel button both say where today's daily stands. During a run the chip
// is out of reach: a tap there must never restart the game under the player.
function paintDaily() {
  const today = dayKey(), n = dailyNumber(today), done = daily.results[today];
  const label = done ? `Daily #${n} ✓ ${done.bestTile}` : `Daily #${n}`;
  const chip = $('dailyBtn');
  chip.textContent = label;
  chip.dataset.done = String(!!done);
  chip.disabled = !!(game && game.started && !game.over);
  $('dailyPanelBtn').textContent = done ? `Practise Daily #${n}` : `Play Daily #${n}`;
}

// The game-over panel reads differently for a daily than for free play. It describes the run
// that just ended, so it takes its day from `run.day`, not from the live clock; only called
// from onGameOver, where `run` is always set.
function paintPanel() {
  const day = run.day, n = dailyNumber(day);
  const isDaily = mode !== 'free';
  $('ovTitle').textContent = mode === 'daily' ? `Daily #${n}` : mode === 'practice' ? `Daily #${n} · practice` : 'Game Over';
  $('playAgain').textContent = isDaily ? 'Practise this board' : 'Play Again';
  $('levels').classList.toggle('hidden', isDaily);
  $('levels').previousElementSibling.classList.toggle('hidden', isDaily); // the "Pick a level" hint
  const s = streak(daily.results, day);
  $('ovStreak').textContent = s > 0 ? `🔥 ${s}-day streak · best ${daily.bestStreak}` : '';
  $('ovStreak').classList.toggle('hidden', !(isDaily && s > 0));
}

function paintSound() {
  $('soundToggle').textContent = `Sound: ${Sound.isMuted() ? 'off' : 'on'}`;
}
let game, fx, lastTick, motion, prevNow, interval;

const SESSION = Date.now().toString(36); // one page load = one "player session"
let runs = loadRuns();
// A player with no runs on record has never merged: ring the matching tiles until they do,
// then never again. That is the whole tutorial.
let teaching = runs.length === 0;
let run; // { session, t0, firstMergeMs } for the run in progress
window.numberSnakeStats = () => summarize(runs); // call from DevTools during a playtest

function start(opts = {}) {
  mode = opts.mode || 'free';
  const today = dayKey();
  const seed = mode === 'free' ? ((Date.now() ^ (Math.random() * 0xffffffff)) >>> 0) : seedFor(today);
  const level = mode === 'free' ? difficulty : DAILY.level;
  game = Game.createGame(createRng(seed), DIFFICULTIES[level]);
  fx = Fx.createFx();
  motion = { kind: 'none', progress: 1 };
  interval = Game.currentTarget(game);
  lastTick = performance.now();
  $('overlay').classList.add('hidden');
  $('stats').classList.add('hidden');
  $('statsCopied').classList.add('hidden');
  $('shareText').classList.add('hidden');
  $('shareNote').classList.add('hidden');
  run = { session: SESSION, t0: null, firstMergeMs: null, mode, day: today };
  paintLevels();
  paintDaily();
}

function onDirection(dir) {
  if (!game || game.over) return;
  if (!game.started) { Game.startRun(game); lastTick = performance.now(); run.t0 = lastTick; paintDaily(); }
  Snake.setDirection(game.snake, dir);
}

function onGameOver(ev, now) {
  Sound.playDeath();
  Fx.addShake(fx, now);
  Fx.addDeath(fx, ev.cause, now);
  motion = { kind: 'none', progress: 1 };
  if (game.bestTile > best.tile) best.tile = game.bestTile;
  if (game.score > best.score) best.score = game.score;
  if (game.bestCombo > best.combo) best.combo = game.bestCombo;
  saveBest(best);
  run.durationMs = Math.round(now - run.t0);
  if (mode === 'daily') {
    recordDaily(daily, run.day, { bestTile: game.bestTile, score: game.score, durationMs: run.durationMs });
    saveDaily(daily);
  }
  paintDaily();
  paintPanel();
  $('ovTile').textContent = game.bestTile;
  $('ovScore').textContent = game.score;
  $('ovCombo').textContent = game.bestCombo;
  $('ovBestTile').textContent = best.tile;
  $('ovBestScore').textContent = best.score;
  const rec = buildRun(run, game, ev, now);
  runs = saveRuns([...runs, rec]);
  // The retention facts travel without any identifier; see analytics.js.
  sendRun({ ...rec, ...deviceFacts(run.day) }, ANALYTICS.endpoint);
  $('statsText').textContent = formatStats(summarize(runs));
  console.log('[Number Snake] run', rec);
  console.log('[Number Snake] stats', summarize(runs));
  setTimeout(() => { if (game.over) $('overlay').classList.remove('hidden'); }, DEATH.overlayDelayMs);
}

function frame(now) {
  const dt = prevNow === undefined ? 0 : now - prevNow;
  prevNow = now;
  interval = Game.smoothInterval(interval, Game.currentTarget(game), dt);

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
        Sound.playMerge(ev.merges);
        teaching = false; // they have merged: the lesson is over for good
        if (run.firstMergeMs === null) run.firstMergeMs = Math.round(now - run.t0);
      } else if (ev.ate) {
        Sound.playEat();
      }
      if (ev.obstacle) Fx.addObstacle(fx, ev.obstacle, now);
      // The thud lands when the block turns solid, which is the moment it starts to matter.
      if (ev.armed && ev.armed.length) Sound.playObstacle();
    }
  }
  // The slide lasts as long as the interval that will fire the next tick. That interval
  // eases rather than jumps, so the slide it paces cannot lurch either.
  if (motion.kind !== 'none') motion.progress = Math.min(1, (now - lastTick) / interval);

  Fx.update(fx, now, dt);
  $('score').textContent = game.score;
  $('bestTile').textContent = Math.max(best.tile, game.bestTile);
  ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0); // canvas resizes reset the transform
  const hint = game.cfg.matchHint || (teaching && !game.over);
  Render.draw(ctx, view, game, fx, now, motion, hint);
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

// Show a short-lived note; a new call restarts the clock so a repeated tap is not cut short by
// the previous tap's timer.
const noteTimers = new WeakMap();
function flashNote(el, text, ms = UI.copiedNoteMs) {
  el.textContent = text;
  el.classList.remove('hidden');
  clearTimeout(noteTimers.get(el));
  noteTimers.set(el, setTimeout(() => el.classList.add('hidden'), ms));
}

initInput(canvas, onDirection);
$('playAgain').addEventListener('click', () => start({ mode: mode === 'free' ? 'free' : 'practice' }));
$('statsToggle').addEventListener('click', () => $('stats').classList.toggle('hidden'));
$('statsCopy').addEventListener('click', async () => {
  flashNote($('statsCopied'), (await copyText($('statsText'))) ? 'Copied' : 'Text selected — long-press to copy');
});
$('soundToggle').addEventListener('click', () => {
  Sound.saveMuted(Sound.setMuted(!Sound.isMuted()));
  paintSound();
});
window.addEventListener('resize', fitCanvas);
window.addEventListener('orientationchange', fitCanvas);
// Tapping a level starts a run on it straight away: the panel is already the "play again" moment.
$('levels').addEventListener('click', (e) => {
  const key = e.target && e.target.dataset && e.target.dataset.level;
  if (!key || !DIFFICULTIES[key]) return;
  difficulty = key;
  start({ mode: 'free' });
});

// The daily: today's board if it is still unplayed, practice on it otherwise. Ignored mid-run.
function onDaily() {
  if (game && game.started && !game.over) return;
  start({ mode: daily.results[dayKey()] ? 'practice' : 'daily' });
}
$('dailyBtn').addEventListener('click', onDaily);
$('dailyPanelBtn').addEventListener('click', onDaily);

$('shareBtn').addEventListener('click', async () => {
  const day = run.day; // the run that just ended, not the live clock
  const text = shareText({
    daily: mode === 'daily' ? dailyNumber(day) : null,
    level: DIFFICULTIES[game.cfg.key].name,
    bestTile: game.bestTile,
    durationMs: run.durationMs ?? (run.t0 === null ? 0 : Math.round(performance.now() - run.t0)),
    streak: streak(daily.results, day),
  });
  let how = 'copied';
  try {
    if (navigator.share) { await navigator.share({ text }); how = 'shared'; }
    else if (!(await navigator.clipboard.writeText(text).then(() => true).catch(() => false))) how = 'shown';
  } catch { how = 'shown'; }
  $('shareText').textContent = text;
  $('shareText').classList.remove('hidden');
  flashNote($('shareNote'), how === 'shared' ? 'Shared' : how === 'copied' ? 'Copied to clipboard' : 'Long-press the text to copy it');
});

fitCanvas();
start();
paintLevels();
paintDaily();
Sound.setMuted(Sound.loadMuted());
paintSound();
requestAnimationFrame(frame);
