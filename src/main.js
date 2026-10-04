import { createRng } from './rng.js';
import * as Game from './game.js';
import * as Render from './render.js';
import * as Snake from './snake.js';
import * as Fx from './fx.js';
import * as Sound from './sound.js';
import * as Music from './music.js';
import { shiftForPause } from './nav.js';
import { initInput } from './input.js';
import { GRID, STORAGE_KEY, DEATH, UI, DIFFICULTIES, DEFAULT_DIFFICULTY, DAILY, ANALYTICS } from './constants.js';
import { loadRuns, saveRuns, buildRun, summarize, formatStats } from './telemetry.js';
import { dayKey, dailyNumber, seedFor, loadDaily, saveDaily, streak, recordDaily } from './daily.js';
import { shareText } from './share.js';
import { deviceFacts, sendRun, runFacts } from './analytics.js';
import {
  LEVELS, ACTS, levelById, evaluate, describe, cfgFor, boardFor,
  loadCampaign, saveCampaign, starsFor, isUnlocked, recordResult, nextLevel, totalStars,
} from './campaign.js';

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
  const cs = getComputedStyle(app);
  const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
  const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
  const used = $('hud').offsetHeight + $('hint').offsetHeight + 24 + padY; // 2 gaps of 12px + the safe paddings
  const availW = Math.max(120, Math.min(420, app.clientWidth - padX));
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

// 'campaign' plays one of the twenty-four levels: a shaped board, a goal that ends the run in victory,
// and two extra-star conditions judged at that moment. `level` is the level object being played.
let campaign = loadCampaign();
let level = null;

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
  $('mapDaily').textContent = done ? `Daily #${n} ✓ ${done.bestTile}` : `Play Daily #${n}`;
}

// What the loop knows about the run, in the shape campaign.js judges. Time comes from here because
// the engine has no wall clock.
function facts(now) {
  return { bestTile: game.bestTile, bestCombo: game.bestCombo, eaten: game.eaten, elapsedMs: run.t0 === null ? 0 : now - run.t0 };
}

// The goal card floats over the board until the first move. It lets gestures through (CSS), so it
// never steals the swipe that starts the run.
function paintGoalCard() {
  const card = $('goalCard');
  if (!level) { card.classList.add('hidden'); return; }
  $('goalLevel').textContent = `Level ${level.id} · ${boardFor(level).name}`;
  $('goalMain').textContent = describe(level.goal);
  $('goalStar2').textContent = `★★ ${describe(level.stars[0])}`;
  $('goalStar3').textContent = `★★★ ${describe(level.stars[1])}`;
  card.classList.remove('hidden');
}

// In a campaign run the right-hand HUD stat is the goal: what to reach, or how many eaten so far.
function paintHud() {
  if (!level) {
    $('bestLabel').textContent = 'BEST TILE';
    $('bestTile').textContent = Math.max(best.tile, game.bestTile);
    return;
  }
  const g = level.goal;
  if (g.type === 'tile') { $('bestLabel').textContent = 'REACH'; $('bestTile').textContent = String(g.value); }
  else if (g.type === 'chain') { $('bestLabel').textContent = 'CHAIN'; $('bestTile').textContent = `×${g.value}`; }
  else { $('bestLabel').textContent = 'EAT'; $('bestTile').textContent = `${game.eaten}/${g.value}`; }
}

// The map: six acts of four levels, stars per level, the next level highlighted, locked ones
// dimmed. Built from LEVELS so a twenty-fifth level is one line of data.
function paintMap() {
  $('mapStars').textContent = totalStars(campaign);
  const acts = $('mapActs');
  acts.textContent = '';
  const nextId = nextLevel(campaign);
  ACTS.forEach((name, ai) => {
    const h = document.createElement('div');
    h.className = 'act';
    h.textContent = `Act ${ai + 1} · ${name}`;
    acts.appendChild(h);
    const grid = document.createElement('div');
    grid.className = 'lv';
    for (const l of LEVELS.filter(l => l.act === ai + 1)) {
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset.level = String(l.id);
      b.disabled = !isUnlocked(campaign, l.id);
      b.dataset.now = String(l.id === nextId);
      const st = starsFor(campaign, l.id);
      const num = document.createElement('b'); num.textContent = String(l.id);
      const boardName = document.createElement('small'); boardName.textContent = boardFor(l).name;
      const stars = document.createElement('span'); stars.className = 'st'; stars.textContent = '★'.repeat(st);
      const off = document.createElement('span'); off.className = 'o'; off.textContent = '★'.repeat(3 - st);
      stars.appendChild(off);
      b.append(num, boardName, stars);
      grid.appendChild(b);
    }
    acts.appendChild(grid);
  });
  $('mapPlay').textContent = `Play level ${nextId} ▸`;
  $('mapPlay').dataset.level = String(nextId);
}

function showMap() {
  paintMap();
  paintDaily();
  $('overlay').classList.add('hidden');
  $('mapOverlay').classList.remove('hidden');
  // Twenty-four tiles do not fit a phone screen at once: bring the level on offer into view.
  const offered = $('mapActs').querySelector('button[data-now="true"]');
  if (offered && offered.scrollIntoView) offered.scrollIntoView({ block: 'center' });
}

// The game-over panel reads differently for a daily, a campaign level and free play. It describes
// the run that just ended, so it takes its day from `run.day`, not from the live clock; only called
// from onGameOver, where `run` is always set. `verdict` is evaluate()'s result for a campaign run,
// null otherwise.
function paintPanel(verdict) {
  const day = run.day, n = dailyNumber(day);
  const isDaily = mode === 'daily' || mode === 'practice';
  const isCampaign = mode === 'campaign';
  const won = !!(verdict && verdict.won);
  let title = 'Game Over';
  if (mode === 'daily') title = `Daily #${n}`;
  else if (mode === 'practice') title = `Daily #${n} · practice`;
  else if (isCampaign) title = won ? 'Level cleared!' : `Level ${level.id} · not cleared`;
  $('ovTitle').textContent = title;
  $('ovLevel').textContent = isCampaign ? `Level ${level.id} · ${boardFor(level).name} · ${describe(level.goal)}` : '';
  $('ovLevel').classList.toggle('hidden', !isCampaign);
  $('playAgain').textContent = isCampaign ? 'Retry' : isDaily ? 'Practise this board' : 'Play Again';
  $('levels').classList.toggle('hidden', isDaily || isCampaign);
  $('levels').previousElementSibling.classList.toggle('hidden', isDaily || isCampaign); // the "Pick a level" hint
  const s = streak(daily.results, day);
  $('ovStreak').textContent = s > 0 ? `🔥 ${s}-day streak · best ${daily.bestStreak}` : '';
  $('ovStreak').classList.toggle('hidden', !(isDaily && s > 0));

  const stars = $('ovStars'), checks = $('ovChecks'), next = $('nextLevel'), mapBtn = $('mapBtn');
  stars.textContent = ''; checks.textContent = '';
  if (isCampaign && verdict) {
    for (let i = 0; i < 3; i++) {
      const sp = document.createElement('span');
      sp.className = i < verdict.stars ? 'on' : 'off';
      sp.textContent = '★';
      stars.appendChild(sp);
    }
    [level.goal, ...level.stars].forEach((c, i) => {
      const row = document.createElement('div');
      row.className = verdict.checks[i] ? 'ok' : 'ko';
      row.textContent = `${verdict.checks[i] ? '✓' : '✗'} ${describe(c)}`;
      checks.appendChild(row);
    });
    const hasNext = won && levelById(level.id + 1) !== null;
    next.textContent = hasNext ? `Level ${level.id + 1} ▸` : 'Campaign complete!';
    next.disabled = !hasNext;
  }
  stars.classList.toggle('hidden', !won);
  checks.classList.toggle('hidden', !(isCampaign && verdict));
  next.classList.toggle('hidden', !won);
  mapBtn.classList.toggle('hidden', !isCampaign);
}

function paintSound() {
  $('soundToggle').textContent = `Sound: ${Sound.isMuted() ? 'off' : 'on'}`;
}

function paintMusic() {
  $('musicToggle').textContent = `Music: ${Music.isMuted() ? 'off' : 'on'}`;
}

// The board the run is played on, for its music: a campaign level's board, else the open board
// (Endless and the Daily).
function runBoardKey() {
  return level ? boardFor(level).key : 'open';
}
let game, fx, lastTick, motion, prevNow, interval;
let pausedAt = null; // performance.now() when the run was paused; null while it plays

const SESSION = Date.now().toString(36); // one page load = one "player session"
let runs = loadRuns();
// A player with no runs on record has never merged: ring the matching tiles until they do,
// then never again. That is the whole tutorial.
let teaching = runs.length === 0;
let run; // { session, t0, firstMergeMs } for the run in progress
window.numberSnakeStats = () => summarize(runs); // call from DevTools during a playtest
// Playtest hook: finish the current campaign run now (DevTools only). It records whatever the run
// has actually earned, so a run that has not met its goal shows "not cleared".
window.numberSnakeWin = () => {
  if (level && game && game.started && !game.over) onGameOver(Game.finish(game), performance.now());
};
// Playtest hook: the live game object, for inspection from DevTools (e.g. to force a state and
// watch the victory path: numberSnakeGame().bestTile = 64).
// Driving the engine directly from here (Game.step, setDirection) bypasses the loop's own game-over dispatch, so a death caused that way is not reported; use it to inspect or force facts, not to play.
window.numberSnakeGame = () => game;

function start(opts = {}) {
  mode = opts.mode || 'free';
  level = mode === 'campaign' ? levelById(opts.level) : null;
  if (mode === 'campaign' && !level) { mode = 'free'; }
  const today = dayKey();
  const seeded = mode === 'daily' || mode === 'practice';
  const seed = seeded ? seedFor(today) : ((Date.now() ^ (Math.random() * 0xffffffff)) >>> 0);
  const cfg = level ? cfgFor(level) : DIFFICULTIES[mode === 'free' ? difficulty : DAILY.level];
  game = Game.createGame(createRng(seed), cfg, level ? { board: boardFor(level) } : {});
  fx = Fx.createFx();
  Music.stop(true); // a new run is silent until its first move
  pausedAt = null;
  $('pauseCard').classList.add('hidden');
  motion = { kind: 'none', progress: 1 };
  interval = Game.currentTarget(game);
  lastTick = performance.now();
  $('overlay').classList.add('hidden');
  $('mapOverlay').classList.add('hidden');
  $('stats').classList.add('hidden');
  $('statsCopied').classList.add('hidden');
  $('shareText').classList.add('hidden');
  $('shareNote').classList.add('hidden');
  run = { session: SESSION, t0: null, firstMergeMs: null, mode, day: today, level: level ? level.id : null };
  paintLevels();
  paintDaily();
  paintGoalCard();
  paintHud();
}

function onDirection(dir) {
  // Keyboard input reaches window even with the map up, and would start the hidden run behind it
  // (and its music). Touch is unaffected: the map covers the canvas.
  if (!$('mapOverlay').classList.contains('hidden')) return;
  if (!game || game.over) return;
  if (pausedAt !== null) resumeRun(performance.now());
  if (!game.started) { Game.startRun(game); lastTick = performance.now(); run.t0 = lastTick; paintDaily(); $('goalCard').classList.add('hidden'); Music.setTempoFromInterval(interval); Music.start(runBoardKey()); }
  Snake.setDirection(game.snake, dir);
}

// Freeze a moving run: leaving the page (a call, another app) or the back button. The card asks for
// a swipe, which resumes it in onDirection.
function pauseRun() {
  if (!game || !game.started || game.over || pausedAt !== null) return;
  pausedAt = performance.now();
  Music.pause();
  $('pauseCard').classList.remove('hidden');
}

function resumeRun(now) {
  run.t0 = shiftForPause(run.t0, pausedAt, now);
  lastTick = shiftForPause(lastTick, pausedAt, now); // the slide picks up exactly where it froze
  pausedAt = null;
  $('pauseCard').classList.add('hidden');
  Music.resume();
}

function onGameOver(ev, now) {
  Music.stop();
  const won = !!ev.won;
  if (won) {
    Sound.playWin();
  } else {
    Sound.playDeath();
    Fx.addShake(fx, now);
    Fx.addDeath(fx, ev.cause, now);
  }
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
  let verdict = null;
  if (level) {
    verdict = evaluate(level, facts(now));
    if (verdict.won && recordResult(campaign, level.id, verdict.stars)) saveCampaign(campaign);
  }
  run.stars = verdict ? verdict.stars : null; // travels with the record so /stats can show what humans earn
  run.verdict = verdict; // the share card reads the stars from here
  paintDaily();
  paintPanel(verdict);
  paintHud();
  $('ovTile').textContent = game.bestTile;
  $('ovScore').textContent = game.score;
  $('ovCombo').textContent = game.bestCombo;
  $('ovBestTile').textContent = best.tile;
  $('ovBestScore').textContent = best.score;
  const rec = buildRun(run, game, ev, now);
  runs = saveRuns([...runs, rec]);
  // The retention facts travel without any identifier; see analytics.js.
  sendRun(runFacts(rec, deviceFacts(run.day)), ANALYTICS.endpoint);
  $('statsText').textContent = formatStats(summarize(runs));
  console.log('[Number Snake] run', rec);
  console.log('[Number Snake] stats', summarize(runs));
  setTimeout(() => { if (game.over) $('overlay').classList.remove('hidden'); }, won ? UI.winPanelDelayMs : DEATH.overlayDelayMs);
}

function frame(now) {
  const dt = prevNow === undefined ? 0 : now - prevNow;
  prevNow = now;
  const paused = pausedAt !== null;
  if (!paused) interval = Game.smoothInterval(interval, Game.currentTarget(game), dt);
  Music.setTempoFromInterval(interval);

  const elapsed = now - lastTick;
  if (!paused && game.started && !game.over && Game.tickDue(elapsed, interval, game.snake.queue.length > 0)) {
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
      if (ev.swapped) { Fx.addGateSwap(fx, now); Sound.playGateSwap(); }
      // The thud lands when the block turns solid, which is the moment it starts to matter.
      if (ev.armed && ev.armed.length) Sound.playObstacle();
    }
  }
  // A campaign goal is judged every frame; it can only change on a tick, but the check is cheap
  // and keeps the loop simple.
  if (!paused && level && game.started && !game.over && evaluate(level, facts(now)).won) {
    onGameOver(Game.finish(game), now);
  }
  // The slide lasts as long as the interval that will fire the next tick. That interval
  // eases rather than jumps, so the slide it paces cannot lurch either.
  if (!paused && motion.kind !== 'none') motion.progress = Math.min(1, (now - lastTick) / interval);

  Fx.update(fx, now, dt);
  $('score').textContent = game.score;
  paintHud();
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
$('playAgain').addEventListener('click', () => {
  if (mode === 'campaign') start({ mode: 'campaign', level: level.id });
  else start({ mode: mode === 'free' ? 'free' : 'practice' });
});
$('nextLevel').addEventListener('click', () => {
  if (level && levelById(level.id + 1)) start({ mode: 'campaign', level: level.id + 1 });
});
$('mapBtn').addEventListener('click', showMap);
// The map: a level tile starts that level; locked tiles are disabled buttons and never fire.
$('mapActs').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-level]');
  if (!btn || btn.disabled) return;
  start({ mode: 'campaign', level: Number(btn.dataset.level) });
});
$('mapPlay').addEventListener('click', () => start({ mode: 'campaign', level: Number($('mapPlay').dataset.level) }));
$('mapEndless').addEventListener('click', () => start({ mode: 'free' }));
$('mapDaily').addEventListener('click', onDaily);
$('statsToggle').addEventListener('click', () => $('stats').classList.toggle('hidden'));
$('statsCopy').addEventListener('click', async () => {
  flashNote($('statsCopied'), (await copyText($('statsText'))) ? 'Copied' : 'Text selected — long-press to copy');
});
$('soundToggle').addEventListener('click', () => {
  Sound.saveMuted(Sound.setMuted(!Sound.isMuted()));
  paintSound();
});
$('musicToggle').addEventListener('click', () => {
  Music.saveMuted(Music.setMuted(!Music.isMuted()));
  paintMusic();
});
// Never play in the background: another app, a locked phone.
// Leaving the page pauses a moving run (and its music); coming back shows the pause card and waits
// for a swipe — the snake never moves on while the player is not looking.
document.addEventListener('visibilitychange', () => { if (document.hidden) pauseRun(); });
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
    campaignLevel: mode === 'campaign' ? level.id : null,
    stars: run.verdict ? run.verdict.stars : 0,
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
Music.setMuted(Music.loadMuted());
paintMusic();
showMap();
requestAnimationFrame(frame);
