import { DIFFICULTIES, CAMPAIGN } from './constants.js';
import { BOARDS } from './boards.js';

// The campaign: twelve levels, each a board plus three conditions from one small vocabulary. The
// first condition is the goal and ends the run in victory the moment it holds; the other two are
// judged at that instant and award the second and third star. Pure; storage is injected.
//
// condition: { type: 'tile'|'chain'|'collect'|'eats'|'time', value }
// facts:     { bestTile, bestCombo, eaten, elapsedMs }  — what the loop knows about a run

const tile = (value) => ({ type: 'tile', value });
const chain = (value) => ({ type: 'chain', value });
const collect = (value) => ({ type: 'collect', value });
const eats = (value) => ({ type: 'eats', value });
const time = (value) => ({ type: 'time', value });

export const ACTS = ['Learn', 'Pressure', 'Mastery'];

// The star thresholds are starting values; tools/simulate.js --campaign calibrates them (spec §8).
export const LEVELS = [
  { id: 1,  act: 1, board: 'open',     speed: 'classic', obstacleEvery: 0,  goal: tile(64),     stars: [eats(24), chain(2)],  matchHint: true, maxTiles: 4 },
  { id: 2,  act: 1, board: 'pillars',  speed: 'classic', obstacleEvery: 0,  goal: tile(64),     stars: [eats(28), time(45)] },
  { id: 3,  act: 1, board: 'pillars',  speed: 'classic', obstacleEvery: 0,  goal: chain(3),     stars: [eats(12), tile(64)] },
  { id: 4,  act: 1, board: 'pillars',  speed: 'classic', obstacleEvery: 0,  goal: tile(128),    stars: [eats(46), chain(4)] },
  { id: 5,  act: 2, board: 'lanes',    speed: 'classic', obstacleEvery: 15, goal: tile(64),     stars: [eats(26), time(45)] },
  { id: 6,  act: 2, board: 'lanes',    speed: 'classic', obstacleEvery: 15, goal: collect(30),  stars: [tile(64), tile(128)] },
  { id: 7,  act: 2, board: 'lanes',    speed: 'classic', obstacleEvery: 20, goal: tile(128),    stars: [eats(40), chain(4)] },
  { id: 8,  act: 2, board: 'chambers', speed: 'classic', obstacleEvery: 15, goal: tile(128),    stars: [eats(40), chain(4)] },
  { id: 9,  act: 3, board: 'chambers', speed: 'frenzy',  obstacleEvery: 10, goal: chain(4),     stars: [eats(20), tile(128)] },
  { id: 10, act: 3, board: 'chambers', speed: 'frenzy',  obstacleEvery: 10, goal: tile(128),    stars: [eats(36), time(90)] },
  { id: 11, act: 3, board: 'ring',     speed: 'frenzy',  obstacleEvery: 10, goal: collect(40),  stars: [tile(64), tile(128)] },
  { id: 12, act: 3, board: 'ring',     speed: 'frenzy',  obstacleEvery: 10, goal: tile(128),    stars: [eats(36), chain(4)] },
];

export function levelById(id) {
  return LEVELS.find(l => l.id === id) || null;
}

export function conditionMet(cond, facts) {
  switch (cond.type) {
    case 'tile': return facts.bestTile >= cond.value;
    case 'chain': return facts.bestCombo >= cond.value;
    case 'collect': return facts.eaten >= cond.value;
    case 'eats': return facts.eaten <= cond.value;
    case 'time': return facts.elapsedMs <= cond.value * 1000;
    default: return false;
  }
}

// The label the UI shows for a condition. English, like the rest of the game.
export function describe(cond) {
  switch (cond.type) {
    case 'tile': return `Reach ${cond.value}`;
    case 'chain': return `Chain ×${cond.value}`;
    case 'collect': return `Eat ${cond.value} tiles`;
    case 'eats': return `${cond.value} tiles or fewer`;
    case 'time': return `Under ${cond.value} s`;
    default: return '';
  }
}

// { won, stars: 0-3, checks: [goal, star2, star3] } for a level at this moment of a run.
export function evaluate(level, facts) {
  const checks = [level.goal, ...level.stars].map(c => conditionMet(c, facts));
  const won = checks[0];
  const stars = won ? 1 + (checks[1] ? 1 : 0) + (checks[2] ? 1 : 0) : 0;
  return { won, stars, checks };
}

// The difficulty object the engine runs a level on: the level's speed curve, its own obstacle
// cadence, and (for the teaching level) hints and a fuller board. `key` stays the real difficulty
// so the run record's `difficulty` remains one the analytics accept.
export function cfgFor(level) {
  const base = DIFFICULTIES[level.speed];
  return {
    ...base,
    obstacleEvery: level.obstacleEvery,
    matchHint: !!level.matchHint,
    maxTiles: level.maxTiles ?? base.maxTiles,
  };
}

export function boardFor(level) {
  return BOARDS[level.board];
}

// Progress: { stars: { [levelId]: 0-3 } }. Unlocking is derived, so nothing else is stored.
export function loadCampaign(storage = globalThis.localStorage, key = CAMPAIGN.storageKey) {
  try {
    const v = JSON.parse(storage.getItem(key));
    if (v && typeof v === 'object' && !Array.isArray(v)
        && v.stars && typeof v.stars === 'object' && !Array.isArray(v.stars)) {
      const stars = {};
      for (const [id, n] of Object.entries(v.stars)) {
        if (Number.isInteger(n) && n >= 0 && n <= 3) stars[id] = n;
      }
      return { stars };
    }
  } catch { /* fall through */ }
  return { stars: {} };
}

export function saveCampaign(state, storage = globalThis.localStorage, key = CAMPAIGN.storageKey) {
  try { storage.setItem(key, JSON.stringify({ stars: state.stars })); } catch { /* ignore */ }
  return state;
}

export function starsFor(state, id) {
  return state.stars[id] || 0;
}

// Linear: level 1 is open; level N opens when N-1 has at least one star.
export function isUnlocked(state, id) {
  return id === 1 || starsFor(state, id - 1) >= 1;
}

// Mutates `state` in place (the caller holds the single live object and saves it right after).
// Returns true when the result improved on what was stored.
export function recordResult(state, id, stars) {
  if (stars > starsFor(state, id)) {
    state.stars[id] = stars;
    return true;
  }
  return false;
}

// The level the map offers to play: the first uncleared level that is open, or the finale once
// everything is cleared.
export function nextLevel(state) {
  const first = LEVELS.find(l => starsFor(state, l.id) === 0 && isUnlocked(state, l.id));
  return first ? first.id : LEVELS[LEVELS.length - 1].id;
}

export function totalStars(state) {
  return LEVELS.reduce((sum, l) => sum + starsFor(state, l.id), 0);
}
