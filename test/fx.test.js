import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFx, labelFor, addMerge, addShake, addDeath, addObstacle, ageOf, update } from '../src/fx.js';
import { FX } from '../src/constants.js';

const half = () => 0.5; // deterministic stand-in for Math.random

test('labelFor escalates with the cascade size', () => {
  assert.equal(labelFor(0), null);
  assert.equal(labelFor(1), 'Merge!');
  assert.equal(labelFor(2), 'Combo x2');
  assert.equal(labelFor(3), 'Chain x3!');
  assert.equal(labelFor(5), 'Chain x5!');
});

test('addMerge adds one ring, one burst and particles scaled by merges', () => {
  const fx = createFx();
  addMerge(fx, { x: 2, y: 3 }, 3, '#fff', 1000, half);
  assert.equal(fx.rings.length, 1);
  assert.deepEqual({ x: fx.rings[0].x, y: fx.rings[0].y }, { x: 2, y: 3 });
  assert.equal(fx.bursts.length, 1);
  assert.equal(fx.bursts[0].text, 'Chain x3!');
  assert.equal(fx.bursts[0].level, 3);
  assert.equal(fx.bursts[0].color, '#fff');
  assert.equal(fx.particles.length, FX.particlesPerMerge * 3);
});

test('addMerge caps particles and ignores zero merges', () => {
  const fx = createFx();
  addMerge(fx, { x: 0, y: 0 }, 0, '#fff', 0, half);
  assert.equal(fx.bursts.length, 0);
  assert.equal(fx.particles.length, 0);
  addMerge(fx, { x: 0, y: 0 }, 50, '#fff', 0, half);
  assert.equal(fx.particles.length, FX.particlesMax);
});

test('ageOf runs 0..1 over the item life and is null once expired', () => {
  const item = { born: 1000, life: 200 };
  assert.equal(ageOf(item, 1000), 0);
  assert.equal(ageOf(item, 1100), 0.5);
  assert.equal(ageOf(item, 1200), null);
});

test('update moves particles, then drops expired items and a finished shake', () => {
  const fx = createFx();
  addMerge(fx, { x: 1, y: 1 }, 1, '#fff', 0, half);
  addShake(fx, 0, 100, 8);
  const p = fx.particles[0];
  const x0 = p.x;
  update(fx, 16, 16);
  assert.ok(p.x !== x0, 'particle should have moved');
  assert.ok(fx.shake !== null, 'shake still active at 16ms');
  update(fx, FX.burstMs + 1, 16);
  assert.equal(fx.rings.length, 0);
  assert.equal(fx.particles.length, 0);
  assert.equal(fx.bursts.length, 0);
  assert.equal(fx.shake, null);
});

test('addDeath records the offending cell and survives update', () => {
  const fx = createFx();
  addDeath(fx, { type: 'wall', cell: { x: 3, y: -1 } }, 0);
  update(fx, 5000, 16);
  assert.deepEqual(fx.death.cell, { x: 3, y: -1 });
  assert.equal(fx.death.type, 'wall');
});

test('addObstacle rings the cell so a new obstacle cannot land unnoticed', () => {
  const fx = createFx();
  addObstacle(fx, { x: 4, y: 6 }, 1000);
  assert.equal(fx.rings.length, 1);
  assert.equal(fx.rings[0].x, 4);
  assert.equal(fx.rings[0].y, 6);
  assert.equal(ageOf(fx.rings[0], 1000), 0);
  update(fx, 1000 + FX.ringMs + 1, 16);
  assert.equal(fx.rings.length, 0, 'and it fades like any other ring');
});
