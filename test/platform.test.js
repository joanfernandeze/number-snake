import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isApp, appPlugin } from '../src/platform.js';

test('outside the app there is no native platform and no plugin', () => {
  assert.equal(isApp(), false);
  assert.equal(appPlugin('App'), null);
});

test('inside the app the Capacitor bridge answers', () => {
  const App = { minimizeApp() {} };
  globalThis.Capacitor = { isNativePlatform: () => true, Plugins: { App } };
  try {
    assert.equal(isApp(), true);
    assert.equal(appPlugin('App'), App);
    assert.equal(appPlugin('Nope'), null);
  } finally {
    delete globalThis.Capacitor;
  }
});
