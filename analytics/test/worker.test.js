import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allowedOrigin } from '../src/worker.js';

test('the site, local development and the Android app may send runs; nobody else', () => {
  assert.equal(allowedOrigin('https://joanfernandeze.github.io'), 'https://joanfernandeze.github.io');
  assert.equal(allowedOrigin('http://localhost:8765'), 'http://localhost:8765');
  assert.equal(allowedOrigin('http://127.0.0.1'), 'http://127.0.0.1');
  assert.equal(allowedOrigin('https://localhost'), 'https://localhost', 'the Capacitor app on Android');
  assert.equal(allowedOrigin('https://localhost:8443'), null, 'the app origin has no port');
  assert.equal(allowedOrigin('https://evil.example'), null);
});
