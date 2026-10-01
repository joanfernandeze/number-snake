// Headless balance simulation. Plays many runs with simple AI policies and
// reports stats, so we can sanity-check feel/tuning before a human playtest.
//   node tools/simulate.js
//   node tools/simulate.js --level=frenzy --runs=500
//   node tools/simulate.js --runs=200 --noObstacles
import { createRng } from '../src/rng.js';
import { createGame, step, startRun, targetInterval, finish, currentTarget } from '../src/game.js';
import * as Snake from '../src/snake.js';
import * as Board from '../src/board.js';
import { DIFFICULTIES } from '../src/constants.js';
import { LEVELS, levelById, evaluate, cfgFor, boardFor, describe } from '../src/campaign.js';

const args = Object.fromEntries(process.argv.slice(2).map(a => {
  const m = a.match(/^--([^=]+)=(.*)$/);
  return m ? [m[1], m[2]] : [a.replace(/^--/, ''), ''];
}));

// A tuning tool must refuse bad input loudly: a NaN knob still prints a
// plausible-looking report, which is worse than no report.
function fail(msg) {
  console.error(`simulate: ${msg}\nusage: node tools/simulate.js [--level=chill|classic|frenzy] [--runs=500] [--noObstacles] [--campaign[=N]]`);
  process.exit(1);
}
function positiveNumber(name, raw) {
  const n = Number(raw);
  if (raw === '' || !Number.isFinite(n) || n <= 0) fail(`--${name} needs a positive number, got "${raw}"`);
  return n;
}
function positiveInt(name, raw) {
  const n = positiveNumber(name, raw);
  if (!Number.isInteger(n)) fail(`--${name} needs a whole number, got "${raw}"`);
  return n;
}
for (const k of Object.keys(args)) if (!['level', 'runs', 'noObstacles', 'campaign'].includes(k)) fail(`unknown option --${k}`);
if ('level' in args && !(args.level in DIFFICULTIES)) {
  fail(`--level must be one of ${Object.keys(DIFFICULTIES).join(', ')}, got "${args.level}"`);
}
const RUNS = 'runs' in args ? positiveInt('runs', args.runs) : 300;
const LEVELS_ARG = 'level' in args ? [args.level] : Object.keys(DIFFICULTIES);
const NO_OBSTACLES = 'noObstacles' in args;

// --campaign plays every level; --campaign=7 plays one. It takes over from --level.
const CAMPAIGN = 'campaign' in args;
const CAMPAIGN_LEVELS = !CAMPAIGN ? [] : args.campaign === '' ? LEVELS : [levelById(positiveInt('campaign', args.campaign))];
if (CAMPAIGN && CAMPAIGN_LEVELS[0] === null) fail(`--campaign must be 1..${LEVELS.length}, got "${args.campaign}"`);

const DIRS = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }];

function isSafe(g, d) {
  const s = g.snake, b = g.board, h = s.cells[0];
  if (s.cells.length > 1 && d.x === -s.direction.x && d.y === -s.direction.y) return false;
  const cell = { x: h.x + d.x, y: h.y + d.y };
  if (Snake.isWall(cell, b.cols, b.rows)) return false;
  if (Board.wallAt(b, cell.x, cell.y)) return false;         // a wall cell kills like the frame
  if (Board.obstacleAt(b, cell.x, cell.y)) return false;   // a dropped block kills like a wall
  if (Board.closedGateAt(b, cell.x, cell.y)) return false; // a closed gate kills like a wall
  const willEat = !!Board.tileAt(b, cell.x, cell.y);
  return !Snake.hitsSelf(s, cell, willEat);
}

// Cells the BFS below may not enter: every obstacle (armed or not — a countdown still turns
// solid before the bot could act on the warning), every gate that is not open, and the snake's own body, except the tail,
// which vacates on a move that does not eat. A snapshot of the board as it is now, not a
// step-by-step simulation of the tail following the head along the path.
function blockedCells(g) {
  const s = g.snake, b = g.board;
  const blocked = new Set();
  for (const o of b.obstacles) blocked.add(`${o.x},${o.y}`);
  // A closing gate still lets the snake through, but it turns solid within a move or two — sooner
  // than a path through it would be walked — so the planner treats it as shut, like a closed one.
  for (const gt of b.gates || []) if (gt.state !== 'open') blocked.add(`${gt.x},${gt.y}`);
  const bodyLen = s.cells.length > 1 ? s.cells.length - 1 : s.cells.length;
  for (let i = 0; i < bodyLen; i++) blocked.add(`${s.cells[i].x},${s.cells[i].y}`);
  return blocked;
}

// Shortest path from the head to `target`, breadth-first over the grid (frame, walls, obstacles
// and body are impassable). Returns the direction of the path's first step, or null when no path
// exists — a wall segment can genuinely cut the reachable board in two.
function bfsDir(g, target) {
  const s = g.snake, b = g.board, h = s.cells[0];
  const blocked = blockedCells(g);
  const key = (x, y) => `${x},${y}`;
  const startKey = key(h.x, h.y), goalKey = key(target.x, target.y);
  if (startKey === goalKey) return null;
  const cameFrom = new Map([[startKey, null]]);
  const queue = [h];
  for (let qi = 0; qi < queue.length; qi++) {
    const cur = queue[qi];
    if (key(cur.x, cur.y) === goalKey) break;
    for (const d of DIRS) {
      const nx = cur.x + d.x, ny = cur.y + d.y, nk = key(nx, ny);
      if (cameFrom.has(nk) || blocked.has(nk)) continue;
      if (Snake.isWall({ x: nx, y: ny }, b.cols, b.rows)) continue;
      if (Board.wallAt(b, nx, ny)) continue;
      cameFrom.set(nk, key(cur.x, cur.y));
      queue.push({ x: nx, y: ny });
    }
  }
  if (!cameFrom.has(goalKey)) return null;
  let cur = goalKey, prev = cameFrom.get(cur);
  while (prev !== startKey) { cur = prev; prev = cameFrom.get(cur); }
  const [cx, cy] = cur.split(',').map(Number);
  return { x: cx - h.x, y: cy - h.y };
}

// Greedy "skilled" policy: head for a value-matching tile (else the smallest-value nearest
// tile), path-finding around walls to reach it. A wall segment used to send this policy into an
// endless left-right bounce (spec follow-up, 2026-09-14); BFS is the fix, and the old "first
// safe step" heuristic still covers the rare case where no path exists at all.
function greedyDir(g) {
  const s = g.snake, b = g.board, h = s.cells[0], hv = s.values[0];
  let target = null, best = Infinity;
  for (const t of b.tiles) {
    const dist = Math.abs(t.x - h.x) + Math.abs(t.y - h.y);
    const matchPenalty = t.value === hv ? 0 : 1000 + t.value;
    const sc = matchPenalty * 100 + dist;
    if (sc < best) { best = sc; target = t; }
  }
  if (target) {
    const d = bfsDir(g, target);
    if (d && isSafe(g, d)) return d;
  }
  const ordered = [];
  if (target) {
    const dx = target.x - h.x, dy = target.y - h.y;
    const horiz = { x: Math.sign(dx), y: 0 }, vert = { x: 0, y: Math.sign(dy) };
    const first = Math.abs(dx) >= Math.abs(dy) ? [horiz, vert] : [vert, horiz];
    for (const d of first) if (d.x || d.y) ordered.push(d);
  }
  for (const d of DIRS) ordered.push(d);
  for (const d of ordered) if (isSafe(g, d)) return d;
  return null; // trapped
}

// Baseline "random safe" policy: any safe step, ignoring tiles.
function randomDir(g, rng) {
  const safe = DIRS.filter(d => isSafe(g, d));
  if (safe.length === 0) return null;
  return safe[Math.floor(rng() * safe.length)];
}

function runOne(seed, policy, cfg, maxTicks = 5000) {
  const g = createGame(createRng(seed), cfg);
  startRun(g);
  const prng = createRng(seed ^ 0x9e3779b9);
  let ticks = 0;
  while (!g.over && ticks < maxTicks) {
    const d = policy === 'greedy' ? greedyDir(g) : randomDir(g, prng);
    if (d) Snake.setDirection(g.snake, d);
    step(g);
    ticks += 1;
  }
  return {
    maxTile: g.bestTile, score: g.score, ticks,
    len: g.snake.cells.length,
    eaten: g.eaten,
    obstacles: g.board.obstacles.length,
    cause: g.lastCause ? g.lastCause.type : 'cap',
  };
}

// One attempt at a level with the greedy policy. The engine has no clock, so elapsed time is the
// sum of the intervals the run was aiming at when each move happened; close enough to calibrate.
function runLevel(seed, level, maxTicks = 8000) {
  const g = createGame(createRng(seed), cfgFor(level), { board: boardFor(level) });
  startRun(g);
  let elapsedMs = 0, ticks = 0;
  const facts = () => ({ bestTile: g.bestTile, bestCombo: g.bestCombo, eaten: g.eaten, elapsedMs });
  while (!g.over && ticks < maxTicks) {
    const d = greedyDir(g);
    if (d) Snake.setDirection(g.snake, d);
    elapsedMs += currentTarget(g);
    step(g);
    ticks += 1;
    if (!g.over && evaluate(level, facts()).won) { finish(g); break; }
  }
  const v = evaluate(level, facts());
  return { won: v.won, stars: v.stars, checks: v.checks, eaten: g.eaten, secs: elapsedMs / 1000,
           bestTile: g.bestTile, bestCombo: g.bestCombo, cause: g.lastCause ? g.lastCause.type : 'cap' };
}

const pctile = (sorted, p) => sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] : null;

// p20 (eats and secs) prints for information only — no threshold is set from it any more; every
// eats/time star comes from p50 (spec 2026-09-15 §3).
function summarizeLevel(level) {
  const rows = [];
  for (let i = 0; i < RUNS; i++) rows.push(runLevel(2000 + i, level));
  const wins = rows.filter(r => r.won);
  const pct = (n) => Math.round(100 * n / rows.length);
  const winPct = (n) => (wins.length ? Math.round(100 * n / wins.length) : null);
  const eats = wins.map(r => r.eaten).sort((a, b) => a - b);
  const secs = wins.map(r => r.secs).sort((a, b) => a - b);
  const causes = {};
  for (const r of rows) causes[r.cause] = (causes[r.cause] || 0) + 1;
  const fmt = (v) => (v === null ? '  —' : String(Math.round(v)).padStart(3));
  const hit = (pred) => (wins.length ? Math.round(100 * wins.filter(pred).length / wins.length) : null);
  const cand = `  tile≥64/128/256 ${fmt(hit(r => r.bestTile >= 64))}/${fmt(hit(r => r.bestTile >= 128))}/${fmt(hit(r => r.bestTile >= 256))}%`
    + `  chain≥3/4/5 ${fmt(hit(r => r.bestCombo >= 3))}/${fmt(hit(r => r.bestCombo >= 4))}/${fmt(hit(r => r.bestCombo >= 5))}%`;
  console.log(
    `${String(level.id).padStart(2)}  ${boardFor(level).name.padEnd(13)} ${describe(level.goal).padEnd(14)}`
    + ` win ${String(pct(wins.length)).padStart(3)}%`
    + `  ★★ ${fmt(winPct(wins.filter(r => r.checks[1]).length))}%  ★★★ ${fmt(winPct(wins.filter(r => r.checks[2]).length))}%`
    + `  eats p50/p20 ${fmt(pctile(eats, 0.5))}/${fmt(pctile(eats, 0.2))}`
    + `  secs p50/p20 ${fmt(pctile(secs, 0.5))}/${fmt(pctile(secs, 0.2))}`
    + cand
    + `  ${JSON.stringify(causes)}`,
  );
}

function summarize(label, policy, cfg) {
  const rows = [];
  for (let i = 0; i < RUNS; i++) rows.push(runOne(1000 + i, policy, cfg));
  const avg = (k) => (rows.reduce((s, r) => s + r[k], 0) / rows.length);
  const pct = (f) => Math.round(100 * rows.filter(f).length / rows.length);
  const causes = {};
  for (const r of rows) causes[r.cause] = (causes[r.cause] || 0) + 1;
  const maxTiles = rows.map(r => r.maxTile).sort((a, b) => a - b);
  const eatenSorted = rows.map(r => r.eaten).sort((a, b) => a - b);
  const medianEaten = eatenSorted[Math.floor(RUNS / 2)];
  const obstaclesSorted = rows.map(r => r.obstacles).sort((a, b) => a - b);
  const medianObstacles = obstaclesSorted[Math.floor(RUNS / 2)];
  console.log(`\n=== ${label} (${RUNS} runs) ===`);
  console.log(`avg score      ${avg('score').toFixed(0)}`);
  console.log(`avg max tile   ${avg('maxTile').toFixed(0)}   (median ${maxTiles[Math.floor(RUNS / 2)]}, best ${maxTiles[maxTiles.length - 1]})`);
  console.log(`avg run ticks  ${avg('ticks').toFixed(0)}   avg length at death ${avg('len').toFixed(1)}`);
  console.log(`avg tiles eaten  ${avg('eaten').toFixed(1)}`);
  console.log(`obstacles      ${medianObstacles} on the board at death (median)`);
  console.log(`finishing speed  ${targetInterval(medianEaten, cfg).toFixed(0)}ms per cell at the median run's tile count`);
  console.log(`reached >=32   ${pct(r => r.maxTile >= 32)}%   >=64 ${pct(r => r.maxTile >= 64)}%   >=128 ${pct(r => r.maxTile >= 128)}%   >=256 ${pct(r => r.maxTile >= 256)}%`);
  console.log(`death cause    ${JSON.stringify(causes)}`);
}

if (CAMPAIGN) {
  console.log(`Number Snake simulator — campaign, ${RUNS} attempts per level, greedy policy`);
  console.log('Goals and tile/chain stars are design (spec 2026-09-15 §3); the simulator sets eats (p50 of eats among wins, up to 2) and time (p50 s × 1.4, up to 5). Win and hit rates are informational.');
  console.log(' #  board         goal           win%   ★★%   ★★★%  eats p50/p20   secs p50/p20   tile≥64/128/256   chain≥3/4/5   causes');
  for (const level of CAMPAIGN_LEVELS) summarizeLevel(level);
} else {
  console.log(`Number Snake simulator — runs=${RUNS} level(s)=${LEVELS_ARG.join(', ')}${NO_OBSTACLES ? ' (obstacles off)' : ''}`);
  for (const key of LEVELS_ARG) {
    const cfg = NO_OBSTACLES ? { ...DIFFICULTIES[key], obstacleEvery: 0 } : DIFFICULTIES[key];
    console.log(`\n=== LEVEL ${cfg.name} — start ${cfg.tickStartMs}ms, floor ${cfg.tickFloorMs}ms, half-life ${cfg.halfLifeEats} tiles, ${cfg.maxTiles} tiles, window ${cfg.window} ===`);
    summarize('Random-safe policy (baseline / button-masher)', 'random', cfg);
    summarize('Greedy policy (plays for matches)', 'greedy', cfg);
  }
}
