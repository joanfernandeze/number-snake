import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  LEVELS, ACTS, levelById, conditionMet, describe, evaluate, cfgFor, boardFor,
  loadCampaign, saveCampaign, starsFor, isUnlocked, recordResult, nextLevel, totalStars,
} from '../src/campaign.js';
import { BOARDS } from '../src/boards.js';
import { DIFFICULTIES, CAMPAIGN } from '../src/constants.js';

function fakeStorage(initial) {
  const m = new Map(initial !== undefined ? [[CAMPAIGN.storageKey, initial]] : []);
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v), dump: () => m.get(CAMPAIGN.storageKey) };
}

const GOALS = new Set(['tile', 'chain', 'collect']);
const CONDS = new Set(['tile', 'chain', 'collect', 'eats', 'time']);

test('twenty-four levels, numbered 1-24, four per act, on shipped boards and speeds', () => {
  assert.equal(LEVELS.length, 24);
  assert.deepEqual(ACTS, ['Learn', 'Pressure', 'Mastery', 'Gates', 'Crossings', 'Vault']);
  LEVELS.forEach((l, i) => {
    assert.equal(l.id, i + 1);
    assert.equal(l.act, Math.floor(i / 4) + 1, `level ${l.id} act`);
    assert.ok(BOARDS[l.board], `level ${l.id} board ${l.board}`);
    assert.ok(DIFFICULTIES[l.speed], `level ${l.id} speed ${l.speed}`);
    assert.ok(Number.isInteger(l.obstacleEvery) && l.obstacleEvery >= 0, `level ${l.id} obstacles`);
    assert.ok(GOALS.has(l.goal.type), `level ${l.id} goal type`);
    assert.equal(l.stars.length, 2);
    for (const c of l.stars) assert.ok(CONDS.has(c.type) && Number.isInteger(c.value) && c.value > 0, `level ${l.id} star`);
    // A star must be judgeable at the moment of victory: a tile goal cannot ask for a higher tile.
    if (l.goal.type === 'tile') for (const c of l.stars) assert.notEqual(c.type, 'tile', `level ${l.id} asks for a tile beyond its goal`);
    // A star of the goal's own type must ask for strictly more, or it is automatic at the moment of victory.
    for (const c of l.stars) if (c.type === l.goal.type) assert.ok(c.value > l.goal.value, `level ${l.id} has an automatic ${c.type} star`);
    // A collect goal already counts eaten tiles as the win condition; an eats star would double up.
    if (l.goal.type === 'collect') for (const c of l.stars) assert.notEqual(c.type, 'eats', `level ${l.id} has both a collect goal and an eats star`);
  });
  assert.equal(LEVELS[0].matchHint, true);
  assert.equal(LEVELS[0].maxTiles, 4);
  assert.equal(levelById(7).board, 'lanes');
  assert.equal(levelById(25), null);
  for (const l of LEVELS.filter(l => l.id >= 13)) {
    assert.ok(BOARDS[l.board].gates.length > 0, `level ${l.id} is played on a gate board`);
  }
  for (const l of LEVELS.filter(l => l.id <= 12)) {
    assert.equal(BOARDS[l.board].gates.length, 0, `level ${l.id} keeps its gate-free board`);
  }
});

test('each new act opens gently: acts 1 and 4 are classic without obstacles, act 6 is frenzy', () => {
  for (const l of LEVELS.filter(l => l.act === 1 || l.act === 4)) {
    assert.equal(l.speed, 'classic', `level ${l.id} speed`);
    assert.equal(l.obstacleEvery, 0, `level ${l.id} obstacles`);
  }
  for (const l of LEVELS.filter(l => l.act === 6)) assert.equal(l.speed, 'frenzy', `level ${l.id} speed`);
});

test('conditionMet judges each condition type from the run facts', () => {
  const f = { bestTile: 64, bestCombo: 3, eaten: 24, elapsedMs: 75000 };
  assert.equal(conditionMet({ type: 'tile', value: 64 }, f), true);
  assert.equal(conditionMet({ type: 'tile', value: 128 }, f), false);
  assert.equal(conditionMet({ type: 'chain', value: 3 }, f), true);
  assert.equal(conditionMet({ type: 'chain', value: 4 }, f), false);
  assert.equal(conditionMet({ type: 'collect', value: 24 }, f), true);
  assert.equal(conditionMet({ type: 'collect', value: 24 }, { ...f, eaten: 23 }), false);
  assert.equal(conditionMet({ type: 'eats', value: 24 }, f), true);
  assert.equal(conditionMet({ type: 'eats', value: 23 }, f), false);
  assert.equal(conditionMet({ type: 'time', value: 75 }, f), true);
  assert.equal(conditionMet({ type: 'time', value: 74 }, f), false);
  assert.equal(conditionMet({ type: 'nonsense', value: 1 }, f), false);
});

test('describe gives the English label the UI shows', () => {
  assert.equal(describe({ type: 'tile', value: 64 }), 'Reach 64');
  assert.equal(describe({ type: 'chain', value: 3 }), 'Chain ×3');
  assert.equal(describe({ type: 'collect', value: 30 }), 'Eat 30 tiles');
  assert.equal(describe({ type: 'eats', value: 24 }), '24 tiles or fewer');
  assert.equal(describe({ type: 'time', value: 75 }), 'Under 75 s');
});

test('evaluate: the goal decides the win, the other two conditions add stars', () => {
  const level = { goal: { type: 'tile', value: 64 }, stars: [{ type: 'eats', value: 24 }, { type: 'time', value: 75 }] };
  assert.deepEqual(evaluate(level, { bestTile: 32, bestCombo: 0, eaten: 10, elapsedMs: 1000 }), { won: false, stars: 0, checks: [false, true, true] });
  assert.deepEqual(evaluate(level, { bestTile: 64, bestCombo: 0, eaten: 30, elapsedMs: 80000 }), { won: true, stars: 1, checks: [true, false, false] });
  assert.deepEqual(evaluate(level, { bestTile: 64, bestCombo: 0, eaten: 20, elapsedMs: 80000 }), { won: true, stars: 2, checks: [true, true, false] });
  assert.deepEqual(evaluate(level, { bestTile: 64, bestCombo: 0, eaten: 20, elapsedMs: 60000 }), { won: true, stars: 3, checks: [true, true, true] });
});

test('cfgFor runs the level on its speed with its own obstacle cadence, hints and tile count', () => {
  const l1 = cfgFor(levelById(1));
  assert.equal(l1.key, 'classic', 'the key stays a real difficulty so telemetry accepts it');
  assert.equal(l1.obstacleEvery, 0);
  assert.equal(l1.matchHint, true);
  assert.equal(l1.maxTiles, 4);
  assert.equal(l1.tickStartMs, DIFFICULTIES.classic.tickStartMs);
  const l9 = cfgFor(levelById(9));
  assert.equal(l9.key, 'frenzy');
  assert.equal(l9.obstacleEvery, 10);
  assert.equal(l9.matchHint, false);
  assert.equal(l9.maxTiles, DIFFICULTIES.frenzy.maxTiles);
  assert.equal(boardFor(levelById(12)), BOARDS.ring);
  assert.equal(boardFor(levelById(13)), BOARDS.door);
  assert.equal(boardFor(levelById(24)), BOARDS.vault);
});

test('progress: corrupt storage is a fresh campaign; stars round-trip and never exceed 3', () => {
  assert.deepEqual(loadCampaign(fakeStorage()), { stars: {} });
  assert.deepEqual(loadCampaign(fakeStorage('{nope')), { stars: {} });
  assert.deepEqual(loadCampaign(fakeStorage('[1,2]')), { stars: {} });
  assert.deepEqual(loadCampaign(fakeStorage('{"stars":[3]}')), { stars: {} });
  assert.deepEqual(loadCampaign(fakeStorage('{"stars":{"1":3,"2":"x","3":7,"4":-1,"5":2}}')), { stars: { 1: 3, 5: 2 } });
  const s = fakeStorage();
  saveCampaign({ stars: { 1: 2 } }, s);
  assert.deepEqual(loadCampaign(s), { stars: { 1: 2 } });
  assert.deepEqual(Object.keys(JSON.parse(s.dump())), ['stars'], 'only stars are stored');
});

test('unlocking is linear on one star; recordResult keeps the best; nextLevel walks the campaign', () => {
  const st = { stars: {} };
  assert.equal(isUnlocked(st, 1), true);
  assert.equal(isUnlocked(st, 2), false);
  assert.equal(nextLevel(st), 1);
  assert.equal(totalStars(st), 0);
  assert.equal(recordResult(st, 1, 2), true);
  assert.equal(starsFor(st, 1), 2);
  assert.equal(recordResult(st, 1, 1), false, 'a worse result does not overwrite');
  assert.equal(starsFor(st, 1), 2);
  assert.equal(isUnlocked(st, 2), true);
  assert.equal(isUnlocked(st, 3), false);
  assert.equal(nextLevel(st), 2);
  assert.equal(recordResult(st, 1, 3), true);
  for (let id = 2; id <= 24; id++) recordResult(st, id, 1);
  assert.equal(nextLevel(st), 24, 'all cleared: the campaign points at the finale');
  assert.equal(totalStars(st), 3 + 23);
  assert.equal(recordResult(st, 5, 0), false, 'a loss records nothing');
});
