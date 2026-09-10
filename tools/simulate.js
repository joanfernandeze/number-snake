// Headless balance simulation. Plays many runs with simple AI policies and
// reports stats, so we can sanity-check feel/tuning before a human playtest.
//   node tools/simulate.js
//   node tools/simulate.js --level=frenzy --runs=500
import { createRng } from '../src/rng.js';
import { createGame, step, startRun, targetInterval } from '../src/game.js';
import * as Snake from '../src/snake.js';
import * as Board from '../src/board.js';
import { DIFFICULTIES } from '../src/constants.js';

const args = Object.fromEntries(process.argv.slice(2).map(a => {
  const m = a.match(/^--([^=]+)=(.*)$/);
  return m ? [m[1], m[2]] : [a.replace(/^--/, ''), ''];
}));

// A tuning tool must refuse bad input loudly: a NaN knob still prints a
// plausible-looking report, which is worse than no report.
function fail(msg) {
  console.error(`simulate: ${msg}\nusage: node tools/simulate.js [--level=chill|classic|frenzy] [--runs=500]`);
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
for (const k of Object.keys(args)) if (!['level', 'runs'].includes(k)) fail(`unknown option --${k}`);
if ('level' in args && !(args.level in DIFFICULTIES)) {
  fail(`--level must be one of ${Object.keys(DIFFICULTIES).join(', ')}, got "${args.level}"`);
}
const RUNS = 'runs' in args ? positiveInt('runs', args.runs) : 300;
const LEVELS = 'level' in args ? [args.level] : Object.keys(DIFFICULTIES);

const DIRS = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }];

function isSafe(g, d) {
  const s = g.snake, b = g.board, h = s.cells[0];
  if (s.cells.length > 1 && d.x === -s.direction.x && d.y === -s.direction.y) return false;
  const cell = { x: h.x + d.x, y: h.y + d.y };
  if (Snake.isWall(cell, b.cols, b.rows)) return false;
  const willEat = !!Board.tileAt(b, cell.x, cell.y);
  return !Snake.hitsSelf(s, cell, willEat);
}

// Greedy "skilled" policy: head for a value-matching tile (else the smallest-value
// nearest tile), choosing the first safe step toward it.
function greedyDir(g) {
  const s = g.snake, b = g.board, h = s.cells[0], hv = s.values[0];
  let target = null, best = Infinity;
  for (const t of b.tiles) {
    const dist = Math.abs(t.x - h.x) + Math.abs(t.y - h.y);
    const matchPenalty = t.value === hv ? 0 : 1000 + t.value;
    const sc = matchPenalty * 100 + dist;
    if (sc < best) { best = sc; target = t; }
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
    cause: g.lastCause ? g.lastCause.type : 'cap',
  };
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
  console.log(`\n=== ${label} (${RUNS} runs) ===`);
  console.log(`avg score      ${avg('score').toFixed(0)}`);
  console.log(`avg max tile   ${avg('maxTile').toFixed(0)}   (median ${maxTiles[Math.floor(RUNS / 2)]}, best ${maxTiles[maxTiles.length - 1]})`);
  console.log(`avg run ticks  ${avg('ticks').toFixed(0)}   avg length at death ${avg('len').toFixed(1)}`);
  console.log(`avg tiles eaten  ${avg('eaten').toFixed(1)}`);
  console.log(`finishing speed  ${targetInterval(medianEaten, cfg).toFixed(0)}ms per cell at the median run's tile count`);
  console.log(`reached >=32   ${pct(r => r.maxTile >= 32)}%   >=64 ${pct(r => r.maxTile >= 64)}%   >=128 ${pct(r => r.maxTile >= 128)}%   >=256 ${pct(r => r.maxTile >= 256)}%`);
  console.log(`death cause    ${JSON.stringify(causes)}`);
}

console.log(`Number Snake simulator — runs=${RUNS} level(s)=${LEVELS.join(', ')}`);
for (const key of LEVELS) {
  const cfg = DIFFICULTIES[key];
  console.log(`\n=== LEVEL ${cfg.name} — start ${cfg.tickStartMs}ms, floor ${cfg.tickFloorMs}ms, half-life ${cfg.halfLifeEats} tiles, ${cfg.maxTiles} tiles, window ${cfg.window} ===`);
  summarize('Random-safe policy (baseline / button-masher)', 'random', cfg);
  summarize('Greedy policy (plays for matches)', 'greedy', cfg);
}
