# Stats Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Implementation subagents run on **Sonnet**.

**Goal:** Let a playtester on a phone (no DevTools) see and copy the spec §2 metrics from the game-over panel, so remote testers can send their numbers back.

**Architecture:** unchanged. A pure `formatStats(summary)` in `src/telemetry.js` (tested) renders the aggregate as text; `index.html` gains a "Stats" toggle, a `<pre>` and a "Copy" button inside the game-over panel; `main.js` fills the text on game over and copies with `navigator.clipboard`.

**Tech Stack:** unchanged.

---

### Task 1: Stats text + panel controls

**Files:**
- Modify: `src/telemetry.js` (add `formatStats`)
- Modify: `test/telemetry.test.js`
- Modify: `index.html` (overlay panel)
- Modify: `style.css`
- Modify: `src/main.js` (fill text, toggle, copy)

- [x] **Step 1: Write the failing tests**

Add `formatStats` to the import in `test/telemetry.test.js` and append:

```js
test('formatStats renders the summary as readable lines', () => {
  const text = formatStats({
    runs: 7, runsPerSession: 1.75, neverMerged: 2,
    medianFirstMergeMs: 6400, medianDurationMs: 41000,
    bestTile: 128, medianBestTile: 32, causes: { self: 5, wall: 2 },
  });
  assert.equal(text.split('\n')[0], 'Number Snake stats');
  assert.ok(text.includes('runs: 7 (1.75 per session, 2 never merged)'), text);
  assert.ok(text.includes('first merge: median 6.4 s'), text);
  assert.ok(text.includes('run length: median 41.0 s'), text);
  assert.ok(text.includes('best tile: 128 (median 32)'), text);
  assert.ok(text.includes('deaths: self 5 · wall 2'), text);
});

test('formatStats shows dashes when there is nothing to report', () => {
  const text = formatStats(summarize([]));
  assert.ok(text.includes('runs: 0 (0 per session, 0 never merged)'), text);
  assert.ok(text.includes('first merge: median –'), text);
  assert.ok(text.includes('run length: median –'), text);
  assert.ok(text.includes('best tile: 0 (median –)'), text);
  assert.ok(text.includes('deaths: –'), text);
});
```

- [x] **Step 2: Run to verify failure** — `node --test test/telemetry.test.js` → FAIL, `formatStats` not exported.

- [x] **Step 3: Implement `formatStats`** — append to `src/telemetry.js`:

```js
// Human-readable summary for the game-over panel; short enough to paste into a chat.
export function formatStats(s) {
  const sec = (ms) => (ms === null ? '–' : `${(ms / 1000).toFixed(1)} s`);
  const entries = Object.entries(s.causes);
  const causes = entries.length ? entries.map(([k, v]) => `${k} ${v}`).join(' · ') : '–';
  return [
    'Number Snake stats',
    `runs: ${s.runs} (${s.runsPerSession} per session, ${s.neverMerged} never merged)`,
    `first merge: median ${sec(s.medianFirstMergeMs)}`,
    `run length: median ${sec(s.medianDurationMs)}`,
    `best tile: ${s.bestTile} (median ${s.medianBestTile === null ? '–' : s.medianBestTile})`,
    `deaths: ${causes}`,
  ].join('\n');
}
```

- [x] **Step 4: Run tests** — `node --test` → 69 pass.

- [x] **Step 5: Panel markup** — in `index.html`, replace the `<button id="playAgain">Play Again</button>` line with:

```html
        <button id="playAgain">Play Again</button>
        <button id="statsToggle" class="link" type="button">Stats</button>
        <div id="stats" class="hidden">
          <pre id="statsText"></pre>
          <button id="statsCopy" class="link" type="button">Copy</button>
          <span id="statsCopied" class="hidden"></span>
        </div>
```

- [x] **Step 6: Styles** — append to `style.css`:

```css
.hidden { display: none; }
.link {
  display: block; margin: 12px auto 0; padding: 4px 8px;
  background: none; border: none; color: #93a4c3; font-size: 13px;
  text-decoration: underline; cursor: pointer;
}
#statsText {
  margin-top: 10px; padding: 10px 12px; text-align: left; white-space: pre-wrap;
  font: 12px/1.5 ui-monospace, Menlo, Consolas, monospace; color: #c7d2fe;
  background: #111935; border-radius: 10px; user-select: text; -webkit-user-select: text;
}
#statsCopied { display: block; margin-top: 6px; font-size: 12px; color: #93a4c3; }
```

- [x] **Step 7: Wire it in `src/main.js`**

Import: `import { loadRuns, saveRuns, buildRun, summarize, formatStats } from './telemetry.js';`

In `start()`, after `$('overlay').classList.add('hidden');` add:

```js
  $('stats').classList.add('hidden');
  $('statsCopied').classList.add('hidden');
```

In `onGameOver`, right after `runs = saveRuns([...runs, rec]);` add:

```js
  $('statsText').textContent = formatStats(summarize(runs));
```

After the `$('playAgain').addEventListener('click', start);` line add:

```js
$('statsToggle').addEventListener('click', () => $('stats').classList.toggle('hidden'));
$('statsCopy').addEventListener('click', async () => {
  const note = $('statsCopied');
  try {
    await navigator.clipboard.writeText($('statsText').textContent);
    note.textContent = 'Copied';
  } catch {
    note.textContent = 'Copy blocked — long-press the text to select it';
  }
  note.classList.remove('hidden');
  setTimeout(() => note.classList.add('hidden'), 1800);
});
```

- [x] **Step 8: Verify** — `node --test` 69 pass; `node --check src/main.js`; in the browser: die once → "Stats" under Play Again → tap → six lines → Copy → "Copied" → paste somewhere. Play Again hides the stats again.

- [x] **Step 9: Commit**

```bash
git add src/telemetry.js test/telemetry.test.js index.html style.css src/main.js
git commit -m "feat(stats): show and copy the spec metrics from the game-over panel"
```

---

### Task 2: Publish on GitHub Pages (main agent, with the author)

- [x] Add an empty `.nojekyll` at the repo root (Pages serves the folder as-is).
- [x] Create a public GitHub repo, push `main`, enable Pages from `main` / root.
- [ ] Open `https://<user>.github.io/<repo>/` on a phone; hard-refresh after each push.
- [x] Put the public URL at the top of `docs/PLAYTEST.md`.
