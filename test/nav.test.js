import { test } from 'node:test';
import assert from 'node:assert/strict';
import { backAction, shiftForPause } from '../src/nav.js';

const base = { mapOpen: false, panelOpen: false, started: false, over: false, paused: false };

test('back minimises from the map, pauses a moving run, and goes to the map otherwise', () => {
  assert.equal(backAction({ ...base, mapOpen: true }), 'minimize');
  assert.equal(backAction({ ...base, mapOpen: true, started: true }), 'minimize', 'the map wins over a run behind it');
  assert.equal(backAction({ ...base, started: true }), 'pause');
  assert.equal(backAction({ ...base, started: true, paused: true }), 'map', 'a paused run is abandoned');
  assert.equal(backAction({ ...base }), 'map', 'a run not started yet (goal card, swipe to start)');
  assert.equal(backAction({ ...base, started: true, over: true, panelOpen: true }), 'map', 'the end-of-run panel');
  assert.equal(backAction({ ...base, started: true, over: true }), 'map', 'during the death flash, before the panel');
});

test('a pause moves the run start forward by the time spent paused', () => {
  assert.equal(shiftForPause(1000, 5000, 8000), 4000);
  assert.equal(shiftForPause(1000, 5000, 5000), 1000, 'a zero-length pause changes nothing');
  assert.equal(shiftForPause(null, 5000, 8000), null, 'a run that never started has no start to move');
});
