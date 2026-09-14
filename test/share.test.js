import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shareText } from '../src/share.js';
import { GAME } from '../src/constants.js';

test('a daily card names the day, the tile, the time and the streak', () => {
  const t = shareText({ daily: 42, bestTile: 128, durationMs: 54321, streak: 7 });
  assert.deepEqual(t.split('\n'), [
    `${GAME.name} · Daily #42`,
    '🐍 Best tile 128 · 54 s · 🔥 7-day streak',
    GAME.url,
  ]);
});

test('a free-play card names the level and never a streak', () => {
  const t = shareText({ level: 'Frenzy', bestTile: 32, durationMs: 9800, streak: 5 });
  assert.equal(t.split('\n')[0], `${GAME.name} · Frenzy`);
  assert.equal(t.split('\n')[1], '🐍 Best tile 32 · 10 s');
});

test('a daily with no streak yet leaves the flame out', () => {
  assert.equal(shareText({ daily: 1, bestTile: 16, durationMs: 30000, streak: 0 }).split('\n')[1], '🐍 Best tile 16 · 30 s');
});

test('daily #0 is a real daily, not free play', () => {
  const t = shareText({ daily: 0, bestTile: 8, durationMs: 5000, streak: 2 });
  assert.equal(t.split('\n')[0], `${GAME.name} · Daily #0`);
  assert.equal(t.split('\n')[1], '🐍 Best tile 8 · 5 s · 🔥 2-day streak');
});

test('a campaign card names the level and its stars, and never a streak', () => {
  const t = shareText({ campaignLevel: 5, stars: 2, bestTile: 64, durationMs: 52000, streak: 9 });
  assert.deepEqual(t.split('\n'), [
    `${GAME.name} · Level 5 ★★☆`,
    '🐍 Best tile 64 · 52 s',
    GAME.url,
  ]);
  assert.equal(shareText({ campaignLevel: 12, stars: 0, bestTile: 32, durationMs: 9000 }).split('\n')[0], `${GAME.name} · Level 12 ☆☆☆`);
  assert.equal(shareText({ campaignLevel: 1, stars: 3, bestTile: 64, durationMs: 40000 }).split('\n')[0], `${GAME.name} · Level 1 ★★★`);
  assert.equal(shareText({ campaignLevel: 4, bestTile: 16, durationMs: 5000 }).split('\n')[0], `${GAME.name} · Level 4 ☆☆☆`, 'stars default to none');
});
