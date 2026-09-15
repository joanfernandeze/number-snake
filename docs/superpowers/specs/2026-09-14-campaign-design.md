# Campaign: Boards, Levels and Stars — Design

**Date:** 2026-09-14
**Author:** Joan Fernández Esmerats (with Claude)
**Status:** Approved (design reviewed section by section; the author waived the written-spec review
and asked for implementation to start at once)
**Builds on:** `2026-06-30-number-snake-design.md` (the game), the difficulty levels and obstacles of
2026-09-10, and `2026-09-14-retention-and-analytics-design.md` (daily, share card, analytics).

---

## 1. Why

The game has a loop that pulls retries, a daily ritual, and a way to measure whether anyone comes
back. What it lacks is a **reason to keep going** beyond a high score: nothing to finish, nowhere
to be. The author's words: it needs to make sense *as a game*. The cheapest thing that does that in
this genre is a **campaign**: a short sequence of levels, each on a board with its own shape, each
with a goal you can actually reach, graded with stars so there is a reason to come back to one.

This is the first time the game has a way to **win** a run. Until now every run ended in death.

## 2. What the player sees

- **Opening the game shows the map.** A panel over the board, like the game-over panel: the title
  `Campaign · N ★`, three rows labelled by act, twelve level tiles (number, board name, three star
  slots), the current level highlighted, locked levels dimmed. Below: **Play level N ▸** (primary),
  **Endless** (the free-play mode as it exists today, with its three speeds), and the **Daily**
  button with today's state, as on the game-over panel.
- **Picking a level** hides the map and shows a **goal card** floating over the board: `Level 5 ·
  The lanes`, the goal in large type (`Reach 64`), the two extra-star conditions (`★★ 24 tiles or
  fewer`, `★★★ under 75 s`), and `Swipe to start`. The card lets gestures pass through; the first
  swipe or arrow key removes it and starts the run.
- **During a campaign run** the right-hand HUD stat shows the goal instead of the best tile: label
  `REACH` / `CHAIN` / `EAT`, value `64` / `×3` / `12/30` (eaten over target).
- **Winning** stops the snake at once: no death flash, no shake, a short rising chord. The panel
  reads `Level cleared!`, the three conditions each with ✓ or ✗, the stars earned, then **Level 6
  ▸** / **Retry** / **Map**. The usual Share, Sound and Stats controls remain.
- **Dying** on a level uses the same panel: `Level 5 · not cleared`, how far you got (best tile,
  tiles eaten, seconds), the goal restated, **Retry** / **Map**.
- **Share** on a campaign panel produces `Number Snake · Level 5 ★★☆` over the usual second line.
- The **Daily** and **Endless** modes are unchanged and always play on the open board.
- All UI text is English, like the rest of the game.

## 3. Levels

A level is **a board plus three conditions from one small vocabulary**:

| Condition | Meaning | Facts it reads |
| --------- | ------- | -------------- |
| `tile ≥ V` | the snake has built a tile of value V | `bestTile` |
| `chain ≥ K` | one cascade of K or more merges has happened | `bestCombo` |
| `collect ≥ N` | the snake has eaten N tiles | `eaten` |
| `eats ≤ E` | at most E tiles eaten so far | `eaten` |
| `time ≤ T` | at most T seconds have passed | `elapsedMs` |

The **first condition is the goal**: the run ends in victory the moment it holds. The other two are
checked at that same moment and award the second and third star. Every condition can therefore be
judged at the instant of winning; a level never asks for "more" of the thing that already ended it.
A goal is always one of `tile`, `chain`, `collect`; the extra stars may use any of the five.

Twelve levels in three acts; each act adds one source of pressure on top of the walls:

| # | Act | Board | Goal ★ | ★★ | ★★★ | Speed | Obstacles |
| - | --- | ----- | ------ | -- | --- | ----- | --------- |
| 1 | Learn | Open | tile 64 | eats ≤ 18 | chain ≥ 3 | Classic, match hints on, 4 tiles | none |
| 2 | Learn | The pillars | tile 128 | eats ≤ 24 | time ≤ 45 s | Classic | none |
| 3 | Learn | The pillars | chain 3 | eats ≤ 14 | tile ≥ 128 | Classic | none |
| 4 | Learn | The pillars | tile 256 | eats ≤ 30 | chain ≥ 3 | Classic | none |
| 5 | Pressure | The lanes | tile 128 | eats ≤ 24 | time ≤ 50 s | Classic | every 15 |
| 6 | Pressure | The lanes | collect 40 | tile ≥ 128 | chain ≥ 3 | Classic | every 15 |
| 7 | Pressure | The lanes | chain 4 | eats ≤ 26 | tile ≥ 128 | Classic | every 20 |
| 8 | Pressure | The chambers | tile 256 | eats ≤ 26 | chain ≥ 3 | Classic | every 15 |
| 9 | Mastery | The chambers | chain 4 | eats ≤ 16 | tile ≥ 128 | Frenzy | every 10 |
| 10 | Mastery | The chambers | tile 256 | eats ≤ 26 | time ≤ 40 s | Frenzy | every 10 |
| 11 | Mastery | The ring | collect 40 | tile ≥ 128 | chain ≥ 3 | Frenzy | every 15 |
| 12 | Mastery | The ring | tile 256 | eats ≤ 28 | chain ≥ 4 | Frenzy | every 10 |

Rules of the list: every new board opens one rung below its act's top so the shape is learnt
before it demands; act boundaries are where the pressure changes; the finale is the most enclosed
board at the fastest speed. **Recalibrated 2026-09-15:** the finale now asks for 256, the top of
the doubling ladder capped there, because the bot's Endless median sits one or two rungs above a
human's. The star thresholds above are recalibrated too — see
`2026-09-15-spawn-window-and-retune-design.md` §3.

`survive` was dropped after calibration showed it is won by circling without eating; `collect`
forces growth and the ramp.

**Unlocking** is linear: clearing level N (one star) unlocks N+1. Stars never gate anything; they
exist to bring the player back to a level. Attempts are unlimited. Each attempt uses a fresh random
seed, so a level cannot be memorised spawn by spawn.

## 4. Boards

Five boards on the game's 7 × 11 portrait grid, written as eleven rows of seven characters:
`#` wall, `S` where the snake starts (heading up), `.` free.

```
Open           The pillars    The lanes      The chambers   The ring
.......        .......        .......        .......        .......
.......        .......        .......        .......        .......
.......        .#...#.        .#...#.        .......        .##.##.
.......        .......        .#...#.        ###.###        .#...#.
.......        .......        .#...#.        .......        .#...#.
...S...        ...S...        .#.S.#.        ...S...        ...S...
.......        .......        .#...#.        .......        .#...#.
.......        .......        .#...#.        .......        .#...#.
.......        .#...#.        .#...#.        .......        .##.##.
.......        .......        .......        .......        .......
.......        .......        .......        .......        .......
```

- **Walls are part of the board.** They kill on contact exactly like the frame does (same cause,
  `wall`), tiles never spawn on them, falling obstacles never land on them, and the snake's start
  cell and the cell in front of it are never walls.
- A board is **valid** when it has eleven rows of seven characters, exactly one `S`, and every
  free cell is reachable from `S` without crossing a wall. A test enforces this for all five.
- **Look:** a wall is a solid dark block with a slightly lighter edge, drawn under the tiles. It
  does not use the hazard stripes or the red glow, which are reserved for things that arrive
  during a run (obstacles) and for the frame.

## 5. Engine and modules

Small, pure additions; the loop in `main.js` grows a mode and a screen.

- **`src/boards.js`** — the five boards as data, `parseBoard(rows)` → `{ key, name, walls:
  Set<'x,y'>, start: {x, y}, cols, rows }`, and `isValidBoard(rows)` used by the test.
- **`src/board.js`** — `createBoard(cols, rows, walls)` keeps the wall set; `wallAt(board, x, y)`;
  tile and obstacle placement treat walls as occupied.
- **`src/game.js`** — `createGame(rng, cfg, { board, start })` accepts a shaped board and start
  cell; `step` ends the run with cause `wall` when the next cell is a wall; `finish(game)` ends a
  run in victory (`game.over = true`, `game.won = true`, cause `won`); `obstacleEvery: 0` already
  means "no obstacles" and stays so.
- **`src/campaign.js`** — `LEVELS` (the table above, as data), `conditionMet(cond, facts)`,
  `evaluate(level, facts)` → `{ won, stars, checks: [bool, bool, bool] }`, `describe(cond)` → the
  English label, `cfgFor(level)` → the difficulty object the engine runs on, `loadCampaign` /
  `saveCampaign` (`localStorage['numberSnake.campaign']` = `{ stars: { '1': 3, '2': 1 } }`, any
  corrupt value → `{ stars: {} }`), `recordResult(state, id, stars)` (keeps the maximum, returns
  whether it improved), `isUnlocked(state, id)`, `nextLevel(state)` (first uncleared unlocked
  level; the last level once all are cleared), `totalStars(state)`.
- **`src/render.js`** — draws walls; nothing else changes.
- **`src/sound.js`** — `playWin()`: three rising notes, the opposite of the death slide.
- **`src/share.js`** — `shareText` accepts `campaignLevel` and `stars`.
- **`src/main.js`** — `mode: 'campaign'` and `level` state; the map panel built from `LEVELS`;
  the goal card; the HUD goal stat; after each tick and once per frame (the `time` star reads the
  wall clock), `evaluate` runs on `{ bestTile, bestCombo, eaten, elapsedMs }` and a met goal calls
  `finish`;
  the game-over handler branches on `ev.won`; buttons for Next / Retry / Map; the map opens on
  load and from any panel.

Facts are computed in the loop because the engine has no wall clock: `elapsedMs` is `now -
run.t0`, the same value the telemetry already uses.

## 6. Progress, persistence and the landing rule

Progress is one small object in `localStorage`, like the daily. It stores stars per level and
nothing else; unlocking is derived (level 1, or the previous level has a star). Clearing storage
resets the campaign; accepted, as for the daily.

**Landing rule:** the game opens on the map. `Endless` and `Daily` are one tap away and behave as
they do today. This changes the first thing a tester sees; the daily's retention measurement is
unaffected because the daily chip is still on the map and in the HUD.

## 7. Analytics

The run record gains `mode: 'campaign'`, `cause: 'won'` and `level` (1–12, or `null` outside the
campaign). The client picks these into the twelve-plus-one fields it sends. The Worker's validator
accepts the new mode, the new cause and a nullable integer `level`; the table gains a `level`
column; `/stats` adds `campaignRuns`, `campaignWins` and per-level `{ level, runs, wins }` so we
can see where players stall.

**Deploy order matters:** the Worker first (one `ALTER TABLE` and one `npm run deploy`, documented
in `analytics/README.md`), then the game. Until the Worker is redeployed the old validator rejects
campaign records, so campaign runs would simply not be counted; nothing else breaks.

## 8. Calibration

The simulator learns to play a level: it respects walls, stops when the goal holds, and estimates
elapsed time from the tick intervals it stepped through. `node tools/simulate.js --campaign`
plays every level 300 times with the greedy policy and prints, per level, the win rate and, among
wins, how often the ★★ and ★★★ conditions held. Thresholds are then adjusted so that among the
bot's wins **★★ holds in roughly half and ★★★ in roughly a fifth**, and the bot wins at least one
attempt in ten on acts 1–2 and one in thirty on act 3 (it is a much weaker player than a human who
has reached that level; if it cannot win a level at all, the level is too hard). The calibrated
values are what ships; the table in §3 is the starting point.

The bot finds its way to the target tile by breadth-first search over the board, so a wall segment
between it and a tile no longer strands it; a `time` star is still scaled ×1.4 before rounding,
because the bot moves the instant a path is clear and a human takes a beat to look.

Recalibrated 2026-09-15 on the spawn window: goals by design as a doubling ladder per act,
`eats`/`time` by simulator — see `2026-09-15-spawn-window-and-retune-design.md`.

## 9. Not in this pass

A level editor; using the shaped boards in Endless or in the Daily; more than twelve levels;
star-gated unlocks; translations; server-side progress.

## 10. Success criteria

After a week on the public URL, from `/stats` and the playtest guide:

| Metric | Good sign |
| ------ | --------- |
| Share of runs that are campaign runs | most runs of a new tester |
| Levels cleared per device on day one | 3 or more |
| Deepest level reached by returning devices | climbs day over day |
| Where the win rate collapses | a level, not the whole act (then tune that level) |
| D1 with the campaign as the landing screen | not below the daily-only baseline |
