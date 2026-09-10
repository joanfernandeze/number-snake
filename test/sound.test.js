import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeHz, loadMuted, saveMuted } from '../src/sound.js';
import { SOUND } from '../src/constants.js';

function fakeStorage(initial) {
  const m = new Map(initial ? [[SOUND.storageKey, initial]] : []);
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v) };
}

test('a cascade climbs: each merge sounds a step above the last', () => {
  assert.equal(mergeHz(0), SOUND.mergeBaseHz);
  assert.ok(Math.abs(mergeHz(1) - SOUND.mergeBaseHz * SOUND.mergeStep) < 1e-9);
  assert.ok(mergeHz(3) > mergeHz(2) && mergeHz(2) > mergeHz(1), 'it keeps climbing');
  assert.equal(mergeHz(-5), SOUND.mergeBaseHz, 'a nonsense index still sounds something');
});

test('the mute preference survives a reload and defaults to sound on', () => {
  assert.equal(loadMuted(fakeStorage()), false, 'a first-time player hears the game');
  assert.equal(loadMuted(fakeStorage('off')), true);
  assert.equal(loadMuted(fakeStorage('on')), false);
  const s = fakeStorage();
  assert.equal(saveMuted(true, s), true);
  assert.equal(loadMuted(s), true);
  saveMuted(false, s);
  assert.equal(loadMuted(s), false);
});

test('reading and writing the preference survive storage being unavailable', () => {
  const broken = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
  assert.equal(loadMuted(broken), false);
  assert.equal(saveMuted(true, broken), true);
});

test('the module imports cleanly where there is no Web Audio at all', () => {
  assert.equal(typeof globalThis.AudioContext, 'undefined', 'Node has none, which is the point');
  assert.doesNotThrow(() => { mergeHz(2); }, 'importing and using the pure parts must not need it');
});
