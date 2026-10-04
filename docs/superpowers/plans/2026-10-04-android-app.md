# Android App (Monetisation Phase A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Package Number Snake as an Android app with Capacitor (no ads yet): pause when leaving, the Android back button, safe areas, an icon, analytics from the app, and a debug build verified on an emulator.

**Architecture:** The web files stay at the repo root (GitHub Pages unchanged); `npm run app` copies them into `www/` and syncs Capacitor's `android/` project. Two small pure modules carry the new logic — `src/platform.js` (are we in the app?) and `src/nav.js` (what the back button does; pause bookkeeping) — and `src/main.js` wires them. Plugins are reached through `globalThis.Capacitor.Plugins`, so there is still no bundler.

**Tech Stack:** Capacitor 8 (`@capacitor/core`, `cli`, `android` 8.5.x; `@capacitor/app` 8.1.x; `@capacitor/assets` 3.0.x), Android SDK 36, Android Studio's bundled JDK, `node --test`.

**Spec:** `docs/superpowers/specs/2026-10-04-android-app-design.md`.

**Before you start:** `node --test` green (208 tests on 2026-10-04). Branch: `git switch -c feat/android`. Commits end with a blank line then `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. If `git commit` fails with "unable to append to '.git/logs/HEAD'", run `git config windows.appendAtomically false`. Keep each file's line-ending style. The shell is Git Bash on Windows; the author's own terminal is PowerShell 5 (no `&&` — give them `;`).

---

## File map

| File | Change |
| --- | --- |
| `src/platform.js` (new) | `isApp()`, `appPlugin(name)` |
| `src/nav.js` (new) | `backAction(state)`, `shiftForPause(t0, pausedAt, now)` |
| `src/main.js` | pause / resume, back button, padding-aware `fitCanvas` |
| `index.html`, `style.css` | pause card, `viewport-fit=cover`, safe-area padding |
| `analytics/src/worker.js` (+ test) | accept the app origin `https://localhost` |
| `package.json`, `capacitor.config.json`, `scripts/copy-www.mjs`, `.gitignore` | Capacitor setup |
| `android/` (generated) | the native project, SDK 36, portrait, version 1.0.0 |
| `assets/icon.svg`, `scripts/icon-png.mjs` | the icon and its PNG export |
| `docs/ANDROID.md` (new) | the author's steps: SDK 36, Worker redeploy, keystore, signed AAB |
| tests | `test/nav.test.js`, `test/platform.test.js`, `test/www.test.js`, `analytics/test/worker.test.js` |

---

### Task 1: Platform detection and navigation logic

**Files:** Create `src/platform.js`, `src/nav.js`; Test `test/platform.test.js`, `test/nav.test.js`.

- [ ] **Step 1: Write the failing tests**

`test/platform.test.js`:

```js
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
```

`test/nav.test.js`:

```js
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
```

- [ ] **Step 2: Run** — `node --test test/platform.test.js test/nav.test.js`; expected FAIL (modules not found).

- [ ] **Step 3: Implement**

`src/platform.js`:

```js
// Are we running inside the Android app? Capacitor's bridge injects `window.Capacitor` there; on the
// web it is absent, so every app-only path in the game is a no-op. Plugins are reached through the
// bridge too, so the game keeps loading its ES modules directly, with no bundler.
export function isApp() {
  return !!globalThis.Capacitor?.isNativePlatform?.();
}

// A native plugin by name (e.g. 'App'), or null outside the app or when it is not installed.
export function appPlugin(name) {
  return (isApp() && globalThis.Capacitor.Plugins?.[name]) || null;
}
```

`src/nav.js`:

```js
// What the Android back button does in each state of the game (spec 2026-10-04 §4):
//   the map is open                       → 'minimize' (leave the app the Android way)
//   a run is moving                       → 'pause'
//   anything else (paused, not started,
//   the end-of-run panel, the death flash) → 'map' (a paused or unstarted run is abandoned)
// state: { mapOpen, panelOpen, started, over, paused }
export function backAction(state) {
  if (state.mapOpen) return 'minimize';
  if (state.started && !state.over && !state.paused) return 'pause';
  return 'map';
}

// The run's start time after a pause from `pausedAt` to `now`: moved forward by the paused span, so
// the elapsed time — a `time ≤ T` star, the telemetry's duration — never counts a phone call.
export function shiftForPause(t0, pausedAt, now) {
  return t0 === null ? null : t0 + (now - pausedAt);
}
```

- [ ] **Step 4: Run** — `node --test`; expected all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/platform.js src/nav.js test/platform.test.js test/nav.test.js
git commit -m "feat(app): platform detection and the back-button and pause rules as pure functions"
```

---

### Task 2: Pause when the page is hidden; swipe to continue

**Files:** Modify `index.html`, `style.css`, `src/main.js`. No unit test beyond Task 1's helpers; verified in the browser (Step 5).

- [ ] **Step 1: `index.html`** — inside `#stage`, right after the `goalCard` div:

```html
      <div id="pauseCard" class="hidden" aria-live="polite">
        <div class="goalMain">Paused</div>
        <div class="goalGo">Swipe to continue</div>
      </div>
```

- [ ] **Step 2: `style.css`** — make the goal card's rule cover the pause card: change the selector `#goalCard {` to `#goalCard, #pauseCard {`.

- [ ] **Step 3: `src/main.js`**

Add to the imports: `import { shiftForPause } from './nav.js';`.

Next to the other run state (`let game, fx, lastTick, motion, prevNow, interval;`) add:

```js
let pausedAt = null; // performance.now() when the run was paused; null while it plays
```

Add these two functions after `onDirection`:

```js
// Freeze a moving run: leaving the page (a call, another app) or the back button. The card asks for
// a swipe, which resumes it in onDirection.
function pauseRun() {
  if (!game || !game.started || game.over || pausedAt !== null) return;
  pausedAt = performance.now();
  Music.pause();
  $('pauseCard').classList.remove('hidden');
}

function resumeRun(now) {
  run.t0 = shiftForPause(run.t0, pausedAt, now);
  lastTick = now; // the next move is a full interval away, as at the start of a run
  pausedAt = null;
  $('pauseCard').classList.add('hidden');
  Music.resume();
}
```

In `onDirection`, right after the `if (!game || game.over) return;` line, add:

```js
  if (pausedAt !== null) resumeRun(performance.now());
```

In `start(opts)`, right after `Music.stop(true); ...`, add:

```js
  pausedAt = null;
  $('pauseCard').classList.add('hidden');
```

In `frame`, guard the tick block, the campaign check and the slide progress so a paused run stands still. Change:

```js
  if (game.started && !game.over && Game.tickDue(elapsed, interval, game.snake.queue.length > 0)) {
```
to
```js
  const paused = pausedAt !== null;
  if (!paused && game.started && !game.over && Game.tickDue(elapsed, interval, game.snake.queue.length > 0)) {
```

change `if (level && game.started && !game.over && evaluate(level, facts(now)).won) {` to
`if (!paused && level && game.started && !game.over && evaluate(level, facts(now)).won) {`

and change `if (motion.kind !== 'none') motion.progress = Math.min(1, (now - lastTick) / interval);` to
`if (!paused && motion.kind !== 'none') motion.progress = Math.min(1, (now - lastTick) / interval);`

Replace the existing `visibilitychange` line with:

```js
// Leaving the page pauses a moving run (and its music); coming back shows the pause card and waits
// for a swipe — the snake never moves on while the player is not looking.
document.addEventListener('visibilitychange', () => { if (document.hidden) pauseRun(); });
```

- [ ] **Step 4: Run** — `node --test` (all PASS) and `node --check src/main.js`.

- [ ] **Step 5: Browser check** — preview (`.claude/launch.json` `number-snake`); refresh cached modules (`await Promise.all(['index.html','style.css','src/main.js','src/nav.js','src/platform.js'].map(f => fetch('/' + f, {cache: 'reload'})))`, then reload). Start Endless, move once; then simulate leaving: `Object.defineProperty(document, 'hidden', {configurable: true, get: () => true}); document.dispatchEvent(new Event('visibilitychange'))`. Check: `#pauseCard` visible, the snake does not move for 2 s (`numberSnakeGame().snake.cells[0]` unchanged). Restore `hidden` to false, press an arrow key: card hidden, the snake moves again, `numberSnakeGame().over` false right after. No console errors.

- [ ] **Step 6: Commit**

```bash
git add index.html style.css src/main.js
git commit -m "feat(game): leaving the page pauses the run; a swipe continues it and the pause does not count as playing time"
```

---

### Task 3: Safe areas

**Files:** Modify `index.html`, `style.css`, `src/main.js` (`fitCanvas`).

Capacitor 8's SystemBars injects `--safe-area-inset-*` CSS variables on Android because the WebView's `env(safe-area-inset-*)` is unreliable there; on the web, `env()` is the fallback.

- [ ] **Step 1: `index.html`** — the viewport meta becomes:

```html
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" />
```

- [ ] **Step 2: `style.css`** — in the `#app` rule replace `padding: 12px;` with:

```css
  /* Keep clear of the notch and the gesture bar: Capacitor sets --safe-area-inset-* in the app,
     env() covers the browser, and 12px is the floor everywhere. */
  padding:
    max(12px, var(--safe-area-inset-top, env(safe-area-inset-top, 0px)))
    max(12px, var(--safe-area-inset-right, env(safe-area-inset-right, 0px)))
    max(12px, var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px)))
    max(12px, var(--safe-area-inset-left, env(safe-area-inset-left, 0px)));
```

and add to both the `#overlay` and the `#mapOverlay` rules:

```css
  padding:
    var(--safe-area-inset-top, env(safe-area-inset-top, 0px))
    var(--safe-area-inset-right, env(safe-area-inset-right, 0px))
    var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px))
    var(--safe-area-inset-left, env(safe-area-inset-left, 0px));
```

- [ ] **Step 3: `src/main.js` `fitCanvas`** — it assumes 12 px paddings; read the real ones. Replace its `used` and `availW` lines with:

```js
  const cs = getComputedStyle(app);
  const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
  const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
  const used = $('hud').offsetHeight + $('hint').offsetHeight + 24 + padY; // 2 gaps of 12px + the safe paddings
  const availW = Math.max(120, Math.min(420, app.clientWidth - padX));
```

- [ ] **Step 4: Run** — `node --test`; `node --check src/main.js`.

- [ ] **Step 5: Browser check** — at 375×812 and 360×640 the board, HUD and hint fit as before (no scrollbars, canvas the same size as before this change within a pixel or two). Then simulate a notch: `document.documentElement.style.setProperty('--safe-area-inset-top', '40px'); document.documentElement.style.setProperty('--safe-area-inset-bottom', '24px'); dispatchEvent(new Event('resize'))` — the HUD moves down 28 px, the canvas shrinks to fit, nothing overflows.

- [ ] **Step 6: Commit**

```bash
git add index.html style.css src/main.js
git commit -m "feat(app): the layout keeps clear of the notch and the gesture bar"
```

---

### Task 4: The Worker accepts the app's origin

**Files:** Modify `analytics/src/worker.js`, `analytics/README.md`; Create `analytics/test/worker.test.js`.

- [ ] **Step 1: Write the failing test** — `analytics/test/worker.test.js`:

```js
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
```

- [ ] **Step 2: Run** — `node --test analytics/test/worker.test.js`; expected FAIL (`allowedOrigin` is not exported).

- [ ] **Step 3: Implement** — in `analytics/src/worker.js`, export the function and accept the app origin:

```js
// Origins allowed to send runs: the published site, local development, and the Android app (Capacitor
// serves the game from https://localhost inside the WebView).
const APP = 'https://localhost';

export function allowedOrigin(origin) {
  if (!origin) return SITE;
  if (origin === SITE || origin === APP || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return origin;
  return null;
}
```

(replacing the existing `function allowedOrigin`). If importing `worker.js` in Node fails because of its default export or Workers-only globals, report it rather than restructuring the Worker.

In `analytics/README.md`, add after the gates upgrade section:

```markdown
## Upgrading an existing deployment (Android app, 2026-10-04)

The Android app sends runs from the origin `https://localhost`. A Worker deployed before this
rejects them silently, so redeploy **before** the closed test: `npm run deploy` from `analytics/`
(in PowerShell: `cd analytics; npm run deploy`). No schema change.
```

- [ ] **Step 4: Run** — `node --test`; all PASS.

- [ ] **Step 5: Commit**

```bash
git add analytics/src/worker.js analytics/test/worker.test.js analytics/README.md
git commit -m "feat(analytics): the Worker accepts runs from the Android app"
```

---

### Task 5: Capacitor and the Android project

**Files:** Modify `package.json`, `.gitignore`; Create `capacitor.config.json`, `scripts/copy-www.mjs`, `test/www.test.js`; generate `android/`.

- [ ] **Step 1: Install** (network):

```bash
npm install @capacitor/core@^8.5.2 @capacitor/app@^8.1.2
npm install -D @capacitor/cli@^8.5.2 @capacitor/android@^8.5.2 @capacitor/assets@^3.0.5
```

- [ ] **Step 2: Write the failing test** — `test/www.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { shipList, moduleGraph } from '../scripts/copy-www.mjs';

test('every file the page loads is in the app bundle', () => {
  const ship = shipList();
  assert.ok(ship.includes('index.html') && ship.includes('style.css'));
  for (const f of moduleGraph('src/main.js')) {
    assert.ok(existsSync(f), `${f} exists`);
    assert.ok(ship.some(s => f === s || f.startsWith(s + '/')), `${f} is shipped`);
  }
});

test('the module graph follows imports from main.js', () => {
  const g = moduleGraph('src/main.js');
  for (const f of ['src/main.js', 'src/game.js', 'src/music.js', 'src/tracks.js', 'src/nav.js', 'src/platform.js']) {
    assert.ok(g.includes(f), `${f} reached`);
  }
});
```

- [ ] **Step 3: Run** — `node --test test/www.test.js`; expected FAIL (script not found).

- [ ] **Step 4: Implement**

`scripts/copy-www.mjs`:

```js
// Copies the web game into www/ for Capacitor. The game's files stay at the repo root so GitHub
// Pages keeps serving them unchanged; the app gets a copy. Run through `npm run app`.
import { cpSync, rmSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// What ships: the page, its stylesheet, and every module under src/.
export function shipList() {
  return ['index.html', 'style.css', 'src'];
}

// Every module reachable from `entry` through static `import ... from './x.js'` statements, as
// repo-relative paths with forward slashes. The test uses it to prove nothing loads from outside
// the shipped set.
export function moduleGraph(entry) {
  const seen = new Set();
  const queue = [entry];
  while (queue.length) {
    const file = queue.shift();
    if (seen.has(file)) continue;
    seen.add(file);
    const path = join(ROOT, file);
    if (!existsSync(path)) continue;
    const src = readFileSync(path, 'utf8');
    for (const m of src.matchAll(/^\s*import\s[^'"]*['"](\.[^'"]+)['"]/gm)) {
      queue.push(normalize(join(dirname(file), m[1])).replaceAll('\\', '/'));
    }
  }
  return [...seen];
}

export function copyWww() {
  const out = join(ROOT, 'www');
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out);
  for (const f of shipList()) cpSync(join(ROOT, f), join(out, f), { recursive: true });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) copyWww();
```

`package.json` scripts become:

```json
  "scripts": {
    "test": "node --test",
    "app": "node scripts/copy-www.mjs && npx cap sync android",
    "app:icons": "node scripts/icon-png.mjs && npx capacitor-assets generate --android"
  }
```

(keep the dependency blocks npm added).

`capacitor.config.json`:

```json
{
  "appId": "com.numbersnake.game",
  "appName": "Number Snake",
  "webDir": "www",
  "plugins": {
    "SystemBars": { "insetsHandling": "css", "style": "DARK" }
  }
}
```

`.gitignore` — append:

```
www/
*.jks
*.keystore
keystore.properties
```

- [ ] **Step 5: Run** — `node --test`; all PASS.

- [ ] **Step 6: Generate the Android project** — `npm run app` must work first (it creates `www/`), then:

```bash
npx cap add android
npm run app
```

Then in the generated project:
- `android/variables.gradle`: `compileSdkVersion` and `targetSdkVersion` at least **36** (if Capacitor 8 already sets 36, leave them). If the SDK platform 36 is not installed and the build in Task 8 fails for that reason, stop and report: the author installs it from Android Studio's SDK Manager (`docs/ANDROID.md`).
- `android/app/build.gradle`: `versionCode 1`, `versionName "1.0.0"`.
- `android/app/src/main/AndroidManifest.xml`: on the main `<activity>`, add `android:screenOrientation="portrait"`.
- `android/app/src/main/res/values/strings.xml`: `app_name` and `title_activity_main` = `Number Snake` (the store title "Number Snake: Merge 2048" is set in Play Console, not here).

- [ ] **Step 7: Commit** (the generated `android/` is committed; its own `.gitignore` keeps build outputs out — check `git status` shows no `build/` folders before committing):

```bash
git add package.json package-lock.json capacitor.config.json scripts/copy-www.mjs test/www.test.js .gitignore android
git commit -m "feat(app): Capacitor 8 Android project — com.numbersnake.game, SDK 36, portrait, 1.0.0"
```

---

### Task 6: The Android back button

**Files:** Modify `src/main.js`.

- [ ] **Step 1** — in `src/main.js`, change the nav import to `import { backAction, shiftForPause } from './nav.js';`, add `import { appPlugin } from './platform.js';`, and after the `visibilitychange` listener add:

```js
// The Android back button (app only; on the web this does nothing): see nav.js for the rules.
const AppPlugin = appPlugin('App');
if (AppPlugin) {
  AppPlugin.addListener('backButton', () => {
    const action = backAction({
      mapOpen: !$('mapOverlay').classList.contains('hidden'),
      panelOpen: !$('overlay').classList.contains('hidden'),
      started: !!(game && game.started),
      over: !!(game && game.over),
      paused: pausedAt !== null,
    });
    if (action === 'minimize') AppPlugin.minimizeApp();
    else if (action === 'pause') pauseRun();
    else { Music.stop(true); showMap(); } // a paused or unstarted run is simply left behind: no game over, no telemetry
  });
}
```

(Adding a `backButton` listener replaces Capacitor's default of closing the app.)

- [ ] **Step 2: Run** — `node --test`; `node --check src/main.js`. On the web nothing changes (`appPlugin` returns null).

- [ ] **Step 3: Commit**

```bash
git add src/main.js
git commit -m "feat(app): the back button pauses a run, returns to the map, or minimises from the map"
```

---

### Task 7: The icon

**Files:** Create `assets/icon.svg`, `scripts/icon-png.mjs`; generated Android resources.

- [ ] **Step 1: `assets/icon.svg`** — 1024×1024, the board's dark blue `#111935` as background (full bleed; the launcher masks it), and centred inside the inner ~60 % (the adaptive-icon safe zone) three rounded snake segments in an L: a teal `#2dd4bf` head (with two small white eyes with dark pupils, looking along the turn), a blue `#3b82f6` segment and a purple `#8b5cf6` tail, joined by short bars in their colours like the in-game body, no text. Show it to the controller (render it in the browser preview or convert to PNG and attach) — **the author approves it before Step 2**.

- [ ] **Step 2: `scripts/icon-png.mjs`** — rasterise the SVG with `sharp` (installed by `@capacitor/assets`) into the inputs `@capacitor/assets` expects:

```js
// Rasterises assets/icon.svg into the PNG inputs @capacitor/assets reads (icon-only, foreground,
// background, splash). Run through `npm run app:icons`.
import sharp from 'sharp';
import { readFileSync } from 'node:fs';

const svg = readFileSync('assets/icon.svg');
const BG = '#111935';

await sharp(svg).resize(1024, 1024).png().toFile('assets/icon-only.png');
await sharp(svg).resize(1024, 1024).png().toFile('assets/icon-foreground.png');
await sharp({ create: { width: 1024, height: 1024, channels: 4, background: BG } }).png().toFile('assets/icon-background.png');
// Splash: the icon small in the middle of a 2732×2732 dark square.
const mark = await sharp(svg).resize(800, 800).png().toBuffer();
await sharp({ create: { width: 2732, height: 2732, channels: 4, background: BG } })
  .composite([{ input: mark, gravity: 'center' }]).png().toFile('assets/splash.png');
await sharp({ create: { width: 2732, height: 2732, channels: 4, background: BG } })
  .composite([{ input: mark, gravity: 'center' }]).png().toFile('assets/splash-dark.png');
// The 512 px icon for the Play listing.
await sharp(svg).resize(512, 512).png().toFile('assets/store-icon-512.png');
```

If the foreground for the adaptive icon needs a transparent background (so the launcher's background layer shows through), export the foreground from a copy of the SVG without its background rect — implement that by reading the SVG text and removing the element with `id="bg"` (give the background rect that id in Step 1).

- [ ] **Step 3: Generate** — `npm run app:icons`. Check `android/app/src/main/res/mipmap-*/ic_launcher*.png`, `drawable*/splash.png` and `assets/store-icon-512.png` were written.

- [ ] **Step 4: Commit**

```bash
git add assets scripts/icon-png.mjs android/app/src/main/res package.json
git commit -m "feat(app): the icon — three snake segments turning a corner — and the splash"
```

---

### Task 8: Build, try it, and write the author's steps

**Files:** Create `docs/ANDROID.md`.

- [ ] **Step 1: Debug build** (Git Bash):

```bash
export JAVA_HOME="/c/Program Files/Android/Android Studio/jbr"
export ANDROID_HOME="$LOCALAPPDATA/Android/Sdk"
npm run app
cd android && ./gradlew assembleDebug && cd ..
```

Expected: `android/app/build/outputs/apk/debug/app-debug.apk`. If Gradle reports a missing SDK platform 36, stop: the author installs it (SDK Manager → SDK Platforms → Android 16 / API 36), then retry.

- [ ] **Step 2: Emulator** — an AVD exists (`emulator -list-avds`; e.g. `wardossier` on an API 35 image). Start it headless-capable: `"$ANDROID_HOME/emulator/emulator" -avd <name> -no-snapshot-save &`, wait for `adb wait-for-device` and `adb shell getprop sys.boot_completed` = 1, then `adb install -r android/app/build/outputs/apk/debug/app-debug.apk` and `adb shell monkey -p com.numbersnake.game 1`. Take screenshots with `adb exec-out screencap -p > $TEMP/s1.png` and look at them. Check:
  - the app opens on the map; the HUD and the map title are below the status bar;
  - tap Endless, swipe (`adb shell input swipe 540 1200 540 900 120`): the run starts;
  - `adb shell input keyevent KEYCODE_HOME`, then reopen the app: the pause card shows; a swipe resumes;
  - back (`adb shell input keyevent KEYCODE_BACK`) during a run → paused card; again → the map; again on the map → the app goes to the background (still in `adb shell dumpsys activity recents`), not killed;
  - `adb logcat -d | grep -i -E "chromium|capacitor|console"` shows no JS errors.
  Report what was seen, with the screenshots' paths. Analytics from the emulator only work after the author redeploys the Worker (Task 4); note it, don't block on it.

- [ ] **Step 3: `docs/ANDROID.md`** — the author's steps, in English, short, with PowerShell commands (`;` not `&&`):
  1. Install SDK Platform 36 (Android Studio → Settings → Languages & Frameworks → Android SDK → SDK Platforms → Android 16.0 / API 36).
  2. Redeploy the Worker: `cd analytics; npm run deploy`.
  3. Build the app web bundle: `npm run app` (from the repo root).
  4. Open `android/` in Android Studio. Build → Generate Signed App Bundle or APK → Android App Bundle → Create new… keystore: store it OUTSIDE the repo (e.g. `Documents\keys\numbersnake-upload.jks`), choose a strong password, alias `upload`; keep the file and passwords in a password manager — losing them means asking Google for an upload-key reset.
  5. Build variant `release` → the AAB lands in `android/app/release/app-release.aab`.
  6. In Play Console (phase D): enable Play App Signing when uploading the first AAB.
  7. Every new release: bump `versionCode` (+1) and `versionName` in `android/app/build.gradle`, run `npm run app`, build the signed AAB again.

- [ ] **Step 4: Commit**

```bash
git add docs/ANDROID.md
git commit -m "docs: how to build, sign and ship the Android app"
```
