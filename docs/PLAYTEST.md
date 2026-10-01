# Number Snake — Playtest guide (v0.3 · campaign · spawn window)

**Play it:** https://joanfernandeze.github.io/number-snake/ — GitHub Pages, redeploys a minute or two after each push to `main`. Source: https://github.com/joanfernandeze/number-snake

**Question to answer:** does eat → merge → cascade → don't-trap-yourself pull *voluntary* retries?
Spec: `docs/superpowers/specs/2026-06-30-number-snake-design.md` (§2 targets).
What changed for this pass: `docs/superpowers/plans/2026-09-08-feel-pass.md`,
`docs/superpowers/plans/2026-09-14-retention-and-analytics.md`,
`docs/superpowers/plans/2026-09-14-campaign.md`, the spec
`docs/superpowers/specs/2026-09-14-campaign-design.md`, and the spawn-window retune
`docs/superpowers/specs/2026-09-15-spawn-window-and-retune-design.md` /
`docs/superpowers/plans/2026-09-15-spawn-window-and-retune.md`.

## Run it
- From this folder: `python -m http.server 8765` → open `http://localhost:8765/`.
- On a phone: open `http://<your-PC-LAN-IP>:8765/` on the same Wi-Fi. Use the phone — the design is portrait + swipe.
- The run does not start until the first swipe / arrow key. Play Again returns to that waiting state.

## Protocol (per tester, ~10 min)
1. Hand over the phone with **no explanation**. Say only: "try this". They land on the campaign
   map — do not point at anything on it.
2. Watch silently. Note whether they read the goal card before swiping, or swipe it away
   unread. Tally runs, levels cleared and retries per level, and the moment they visibly get
   "same numbers merge".
3. Stop when *they* stop. Then ask: (a) did any death feel unfair? (b) what were you trying to do?
4. On the Game Over panel tap **Stats**, then **Copy**, and have them paste the text to you (a screenshot also works). On a desktop, `numberSnakeStats()` in DevTools returns the same data.
5. **The daily, and coming back.** Have them tap the **Daily** chip for one run — the first attempt
   of the day is the one that counts, and practice on the same board afterwards is fine and
   expected. Ask them to tap **Share** once and paste you whatever came out (a screenshot works
   too); that alone satisfies "share used by anyone but the author". Then ask them to **come back
   tomorrow and play the daily again**. Retention is what this pass measures, and one session tells
   you nothing about it.

## Reading the numbers
Every game over logs `[Number Snake] run {...}` and `[Number Snake] stats {...}` to the console.
`numberSnakeStats()` returns the aggregate over the last 50 runs stored in `localStorage`
(key `numberSnake.runs`). One page load = one session.

| Field                    | Spec target (§2)                          |
| ------------------------ | ----------------------------------------- |
| `runsPerSession`         | 5+ voluntary runs per player              |
| `medianFirstMergeMs`     | < 20 000                                  |
| `neverMerged`            | should be a small share of `runs`         |
| `medianBestTile`         | climbs across a tester's first runs       |
| `levels`                 | which levels they chose, and whether they went back |
| `causes.self` vs `.wall` | self should dominate as skill grows       |
| `medianDurationMs`       | informational: 30–90 s is a healthy loop  |

Thirteen of these fields also travel to a Cloudflare Worker when `ANALYTICS.endpoint` is configured,
picked on the device — see "Retention numbers" below.

Also note by eye: did they say "one more"? Did they notice the **Merge! / Combo x2 / Chain x3!** bursts?
Did the red flash on the cell (or wall edge) they hit make the death feel like their own fault?

## Three levels, and obstacles

This is **Endless** — the free-play mode reached from the map. A row of buttons under the board
picks the level; the choice is remembered. **Classic is the default, and Endless still opens on
Classic** — the levels are for replay value, not a way to dodge the tuning question. The tester's
first screen is the campaign map, not this mode directly; see "The campaign" below.

| Knob                       | Chill  | Classic | Frenzy |
| -------------------------- | ------ | ------- | ------ |
| Opening speed (ms/cell)    | 360    | 300     | 240    |
| Floor it climbs toward     | 180    | 120     | 90     |
| Half-life (tiles eaten)    | 20     | 14      | 10     |
| Tiles on the board         | 4      | 3       | 2      |
| Spawn window               | `head` | `max`   | `max`  |
| Window width (span)        | 3      | 4       | 4      |
| Low-end weight (decay)     | 0.9    | 0.8     | 0.65   |
| An obstacle every … tiles  | 20     | 10      | 10     |

**The ramp keys off tiles eaten, not score.** Score arrives late and in lumps, so a score-keyed
ramp put the whole speed climb after the run was effectively over; five rounds of hand-tuning
could not fix that. A run eats about 58 tiles, and eating grows steadily with time played, so the
climb is now spread across the run.

**Obstacles** are permanent hazard-striped blocks that land every few tiles eaten, up to eight per
board. Running into one ends the run like a wall. They never appear within four cells of the head
and avoid lining up beside each other, so they cannot materialise in your face or wall the board
in half. Chill keeps its cadence at 20 because its runs are long; Frenzy deliberately keeps
Classic's 10, because at every 7 the obstacles flattened its climb from a median tile of 64 to 32,
and a hard level should make the player fail rather than deny them the climb.

## How tiles appear (2026-09-15)

A new tile's value is drawn from the top `span` powers of two ending at the snake's biggest piece,
weighted toward the low end by `decay^i` (`i = 0` at the bottom of the window) — so as the pieces
you carry get bigger, the small tiles stop appearing. With a 32 on the snake no 2s spawn; with a 64
no 4s; with a 128 no 8s.

| Biggest piece | Window (span 4) |
| ------------- | ---------------- |
| 2 … 16        | everything from 2 up (nothing is cut yet) |
| 32            | 4, 8, 16, 32 |
| 64            | 8, 16, 32, 64 |
| 128           | 16, 32, 64, 128 |

Knobs per difficulty (`DIFFICULTIES[k].span` / `.decay`): Chill `span 3, decay 0.9` (and it keeps
its `head` window — values never above the head); Classic `span 4, decay 0.8`; Frenzy `span 4,
decay 0.65`. With a 64 on the snake and Classic, 8/16/32/64 spawn at ≈ 34/27/22/17 %.

**Why it plays well.** The bottom of the window is what a player most likely holds after eating
the wrong tile — head 8 behind a 64 — and 8s are now the most common tile, so the ladder 8 → 16 →
32 → 64 is fast and ends on the 64 already carried. Mistakes cost eats, not the run. Eating a tile
**bigger** than the head still buries the smaller one for good — that trap stays, and it is more
frequent now that big tiles are common.

**Endless medians for the greedy bot** (300 runs each, `node tools/simulate.js --runs=300
--level=<k>`): Classic 512, Frenzy 128, Chill 256. The bot path-finds and always takes the match,
so a human sits one or two rungs lower on the same board.

## Sound, teaching, and the cascade reward

**Sound** is synthesised with oscillators, so nothing is downloaded. A merge chain climbs one
note per merge, so a big cascade is audibly bigger; eating without a merge is a quiet blip; an
obstacle turning solid is a low thud; death slides down. There is a **Sound: on/off** toggle on
the game-over panel and the choice is remembered.

**Obstacles are telegraphed.** One lands hollow, with a dashed red outline, and blinks for five
moves before it turns into a solid hazard block. Only the solid ones end a run. If the snake is
lying across the cell when it would turn solid, the obstacle gives up rather than kill from
underneath. Watch for whether a tester still calls an obstacle death unfair.

**The merge rule is taught without words.** A player who has never merged sees a white ring
around every tile matching their head, until their first merge. After that, never again. Chill
keeps the rings on permanently, which is most of what makes it gentle. Watch how long the rings
stay on: that is the time-to-first-merge metric, made visible.

**A three-merge chain buys breathing room:** the speed eases by 18 % for twelve moves. Measured
at about twice a run on Classic, roughly a tenth of the time. At a two-merge threshold it fired
seven times a run and stopped reading as a reward, which is why the bar is three.

## The daily challenge, the streak and the share card

A **Daily #N** chip sits in the HUD between SCORE and BEST TILE, and is disabled mid-run. `N`
counts local calendar days since `DAILY.epoch` (2026-09-14 is Daily #1) — the board is seeded from
the local date, so everyone gets the same layout each day and it resets at the player's own
midnight. The daily always plays on **Classic**.

The **first attempt of the day counts** and is recorded; after that the same board can be
**practised** as often as wanted, and practice runs never touch the record or the streak. After a
daily death the panel title reads `Daily #N` (or `Daily #N · practice`), the level picker is
hidden, **Play Again** becomes **Practise this board**, and the chip shows `Daily #N ✓ <best
tile>`. Tapping a level button on the panel returns to free play.

**Streak** = consecutive local days with a daily completed, no grace days: an unplayed today keeps
it open, a missed yesterday resets it to 0. When positive, the panel shows `🔥 N-day streak · best
M`. State lives in `localStorage` under `numberSnake.daily` as
`{ results: { 'YYYY-MM-DD': { bestTile, score, durationMs } }, bestStreak }`.

**Share** (game-over panel) builds spoiler-free text — game name plus Daily #N or the level, best
tile, duration, a streak line if positive on a daily, and the game URL — then uses the phone's
share sheet where available or falls back to the clipboard, always showing the text in the panel
with a note (`Shared` / `Copied to clipboard` / `Long-press the text to copy it`).

**To force a fresh day for testing:** clear `numberSnake.daily` and `numberSnake.device` in
DevTools (Application → Local Storage), or edit the `results` map in either directly to add or
remove a date.

## The campaign

The game now opens on a **map**: six acts — Learn, Pressure, Mastery, Gates, Crossings, Vault — of
four levels each, plus the unchanged **Endless** and **Daily** one tap away (`Play level N ▸`, `Endless`, `Play Daily #N`).
Picking a level shows a **goal card** over the board (`Level 5 · The lanes`, the goal in large type
e.g. `Reach 128`, the two extra-star conditions as `★★ …` / `★★★ …`, and `Swipe to start`) that lets
gestures through, so the first swipe or arrow key dismisses it and starts the run. During a
campaign run the HUD's right-hand stat becomes the goal (`REACH 64` / `CHAIN ×3` / `EAT 12/30`)
instead of the best tile. Winning stops the snake at once — no death flash, no shake, a short
rising chord — and the panel reads `Level cleared!`, the three conditions each with a ✓ or ✗ and
the stars earned, then `Level N ▸` (`Campaign complete!` in its place after level 24) / `Retry` /
`Map`. Dying reads `Level N · not cleared`, restates
how far you got and the goal, then `Retry` / `Map`. Share on a campaign panel adds a line like
`Number Snake · Level 5 ★★☆`.

A level is a board plus three conditions from one small vocabulary — the first is the goal that
ends the run in victory the moment it holds, the other two are judged at that same instant and
award the second and third star:

| Condition     | Meaning                                              |
| -------------- | ----------------------------------------------------- |
| `tile ≥ V`    | the snake has built a tile of value V (`Reach V`)      |
| `chain ≥ K`   | one cascade of K or more merges has happened (`Chain ×K`) |
| `collect ≥ N` | the snake has eaten N tiles (`Eat N tiles`)            |
| `eats ≤ E`    | at most E tiles eaten so far (`E tiles or fewer`)      |
| `time ≤ T`    | at most T seconds have passed (`Under T s`)            |

The twenty-four levels, as shipped (`src/campaign.js`, `LEVELS`): levels 1–12 recalibrated
2026-09-15 as a doubling ladder per act (64 → 128 → 256, capped at 256), levels 13–24 (the gate
acts) calibrated the same way on 2026-10-01:

| #  | Act       | Board        | Goal         | ★★                 | ★★★         | Speed   | Obstacles |
| -- | --------- | ------------ | ------------ | -------------------- | ------------- | ------- | --------- |
| 1  | Learn     | Open         | Reach 64     | 18 tiles or fewer     | Chain ×3      | Classic | none      |
| 2  | Learn     | The pillars  | Reach 128    | 24 tiles or fewer     | Under 45 s    | Classic | none      |
| 3  | Learn     | The pillars  | Chain ×3     | 14 tiles or fewer     | Reach 128     | Classic | none      |
| 4  | Learn     | The pillars  | Reach 256    | 30 tiles or fewer     | Chain ×3      | Classic | none      |
| 5  | Pressure  | The lanes    | Reach 128    | 24 tiles or fewer     | Under 50 s    | Classic | every 15  |
| 6  | Pressure  | The lanes    | Eat 40 tiles | Reach 128              | Chain ×3      | Classic | every 15  |
| 7  | Pressure  | The lanes    | Chain ×4     | 26 tiles or fewer     | Reach 128     | Classic | every 20  |
| 8  | Pressure  | The chambers | Reach 256    | 26 tiles or fewer     | Chain ×3      | Classic | every 15  |
| 9  | Mastery   | The chambers | Chain ×4     | 16 tiles or fewer     | Reach 128     | Frenzy  | every 10  |
| 10 | Mastery   | The chambers | Reach 256    | 26 tiles or fewer     | Under 40 s    | Frenzy  | every 10  |
| 11 | Mastery   | The ring     | Eat 40 tiles | Reach 128              | Chain ×3      | Frenzy  | every 15  |
| 12 | Mastery   | The ring     | Reach 256    | 28 tiles or fewer     | Chain ×4      | Frenzy  | every 10  |
| 13 | Gates     | The door     | Reach 64     | 18 tiles or fewer     | Chain ×3      | Classic | none      |
| 14 | Gates     | The door     | Reach 128    | 24 tiles or fewer     | Under 40 s    | Classic | none      |
| 15 | Gates     | The locks    | Chain ×3     | 10 tiles or fewer     | Reach 64      | Classic | none      |
| 16 | Gates     | The locks    | Reach 256    | 26 tiles or fewer     | Chain ×3      | Classic | none      |
| 17 | Crossings | The halves   | Reach 128    | 22 tiles or fewer     | Under 50 s    | Classic | every 15  |
| 18 | Crossings | The halves   | Eat 40 tiles | Reach 128              | Chain ×3      | Classic | every 15  |
| 19 | Crossings | The rooms    | Chain ×3     | 10 tiles or fewer     | Reach 64      | Classic | every 20  |
| 20 | Crossings | The rooms    | Reach 256    | 26 tiles or fewer     | Chain ×3      | Classic | every 15  |
| 21 | Vault     | The rooms    | Reach 128    | 22 tiles or fewer     | Under 30 s    | Frenzy  | every 15  |
| 22 | Vault     | The vault    | Eat 40 tiles | Reach 128              | Chain ×3      | Frenzy  | every 20  |
| 23 | Vault     | The vault    | Chain ×4     | 18 tiles or fewer     | Reach 64      | Frenzy  | every 15  |
| 24 | Vault     | The vault    | Reach 256    | 28 tiles or fewer     | Chain ×3      | Frenzy  | every 15  |

The ten boards (`src/boards.js`):

| Board        | What the shape does to play                                                                    |
| ------------ | ------------------------------------------------------------------------------------------------ |
| Open         | no walls at all — a bare test of speed and space                                                 |
| The pillars  | two single-cell blocks, one above the start and one below — a couple of dodges a lap, nothing more |
| The lanes    | solid columns down both sides of the middle rows box most of the board into one narrow vertical corridor |
| The chambers | one wall clean across the middle with a single gap — every route between the two halves goes through that doorway |
| The ring     | a broken box walls the centre off from the corners — the inside loop is short, breaking out to a corner takes the long way round |
| The door     | a wall across the middle with two doors, one of each set — one is always open, so the halves never disconnect |
| The locks    | two walls, each with one door of its own set — eating opens the bottom part and seals the top, and back |
| The halves   | a wall down the middle with a door of each set — the same idea on its side, starting in the left half |
| The rooms    | two small rooms up top, each with its own door down — eating in a room swaps you into the joined rooms, eating below seals them off |
| The vault    | an inner room and a one-cell-wide outer ring joined by four gates, two of each set — the finale's board |

**Gates** (the last five boards) are cells of two sets, A and B, drawn in two colours: at the start
A is open (a dashed outline on the floor) and B closed (a solid rounded block). Every bite swaps
them — the closed set opens at once, the open set starts closing: a closing gate blinks for two
moves and can still be crossed, then turns solid. Running into a closed gate ends the run like a
wall, with its own cause, `gate`, so `/stats` shows whether gates kill too often. Tiles and
obstacles never land on a gate, and a tile never spawns in a region the snake cannot reach at that
moment.

**Unlocking is linear:** clearing a level (one star) unlocks the next; stars never gate anything —
they exist to bring a player back to a level, not to block one. Attempts are unlimited, and **each
attempt uses a fresh random seed**, so a level cannot be memorised spawn by spawn.

**What to watch in a tester:** which level they stall on; whether they retry a failed level or
leave for the map; whether they ever come back to replay a cleared level for its missing stars;
whether they read the goal card or swiped it away unread; whether a wall death feels as fair as an
obstacle or self death; whether they understand that the small tiles have stopped coming and the
number they carry is what spawns; whether they discover the cascade (build `2 · 4 · 8 · 16`, eat a
2); and, if they get there, whether the finale (level 24: The vault at Frenzy speed) reads as
hard-but-possible rather than a wall.

**Testing shortcuts:** reset progress with `localStorage.removeItem('numberSnake.campaign')`; jump
ahead by setting `localStorage['numberSnake.campaign'] = '{"stars":{"1":1,"2":1,"3":1}}'` and
reloading; `numberSnakeGame()` (DevTools) returns the live game object, so e.g.
`numberSnakeGame().bestTile = 64` forces the victory path on a `Reach 64` level; `numberSnakeWin()`
ends the current campaign run as a finish right away — it records only what the run has actually
earned, so an unmet goal still shows `Level N · not cleared`.

## Retention numbers, without identifying anyone

Every game over sends one record to a Cloudflare Worker (`POST <ANALYTICS.endpoint>`) via
`sendBeacon`, fire-and-forget: sending can never block the game and a failure is silently dropped.
The device picks exactly thirteen fields for that record, on the device, so nothing else can leave
even by accident: `daySince` (days since its first play, 0 on day one), `daysPlayed` (distinct days
played, including today), `firstOfDay` (true on the first run of a calendar day), `mode` (`free`,
`daily`, `practice` or `campaign`), `difficulty`, `score`, `bestTile`, `bestCombo`, `durationMs`,
`eaten`, `firstMergeMs`, `cause` (now including `won`, on a cleared campaign level), `level` (1–24
in campaign mode, `null` otherwise). The per-page-load `session` id, the absolute `endedAt` timestamp and the
raw `ticks` count never leave the device — no identifier of any kind travels; the device keeps its
own history under `numberSnake.device`, capped at `ANALYTICS.maxDays`. The server counts: new devices are records
with `daySince = 0` and `firstOfDay`; D1 is `daySince = 1` and `firstOfDay` divided by new
devices; D7 is the same at `daySince = 7`. A device that clears its storage looks new again — an
accepted error for a prototype. The panel's fine print ("Anonymous play statistics help improve
the game. Nothing personal is collected.") is the whole consent story.

Sending is **off** until `ANALYTICS.endpoint` in `src/constants.js` is set to a deployed Worker's
URL — see `analytics/README.md` for the deploy steps (not repeated here).

**Reading `/stats`:** `GET <worker-url>/stats?key=<STATS_KEY>` returns:

| Field                                               | Meaning                                            |
| ---------------------------------------------------- | --------------------------------------------------- |
| `newDevices`                                        | devices seen on their first day                    |
| `d1Percent`                                         | share of them that played again exactly the next day |
| `d7Percent`                                         | share that played on day seven                     |
| `runs`, `avgDurationMs`, `avgBestTile`, `dailyRuns` | volume and quality                                 |
| `campaignRuns`, `campaignWins`                      | campaign attempts and how many ended in victory    |
| `levels`                                            | per level `{ level, runs, wins, threeStars }` — the level whose win rate collapses is the one to tune; `threeStars` says whether anyone earns the third star |

These campaign fields only appear once the Worker has run both `ALTER TABLE`s (`level` and
`stars`) and redeployed — see `analytics/README.md`, "Upgrading an existing deployment". A Worker
still fully on the old code and schema simply omits them; one redeployed with the new code but not
yet both `ALTER TABLE`s answers 500 to every `/run` and `/stats` instead, so run the ALTERs first.

**Success criteria** (spec §6, after one week with a handful of testers):

| Metric                                        | Good sign                          |
| ---------------------------------------------- | ----------------------------------- |
| D1 (returned the next day)                    | ≥ 30 % (report's winners: 48–52 %) |
| D7                                             | ≥ 10 %                             |
| Runs per session                              | 5+ (spec §2 of the original)       |
| Daily played on ≥ 2 distinct days per device  | most returning devices             |
| Share button used                             | at all, by anyone but the author   |

If D1 is under 20 % with the daily in place, the loop is not a habit and the next move is the
mechanic, not the monetisation.

## Knobs (`src/constants.js`) — symptom → knob
Speed and content knobs live inside `DIFFICULTIES`, one entry per level, so a change affects only
that level. Everything else is shared.

| Symptom                                       | Knob                                                          |
| --------------------------------------------- | ------------------------------------------------------------- |
| The speed climb is not felt during a run      | lower `halfLifeEats` for that level                            |
| Too slow / too fast off the line              | `tickStartMs`                                                  |
| The late game never gets frantic              | lower `tickFloorMs`                                            |
| A change of speed reads as a jolt             | raise `TIMING.smoothTauMs` (1200)                              |
| Climb stalls: never sees the value it needs   | set `window` to `'head'`, or raise `decay`                     |
| The spawn window feels too narrow or too wide | raise/lower `span` (`DIFFICULTIES[k].span`)                    |
| The low end doesn't dominate enough, or too much | raise/lower `decay` (`DIFFICULTIES[k].decay`); check with `node tools/simulate.js --runs=300 --level=classic` — the greedy median should sit around 256–512 |
| Too few routing choices                       | raise `maxTiles`                                               |
| Obstacles dominate the deaths                 | raise `obstacleEvery`, or lower `OBSTACLE.max` (8)             |
| An obstacle appeared unfairly close           | raise `OBSTACLE.minHeadDist` (4)                               |
| Obstacles feel like ambushes                  | raise `OBSTACLE.warnTicks` (5)                                 |
| The cascade reward goes unnoticed             | lower `RELIEF.minMerges` (3), or raise `RELIEF.factor` (1.18)  |
| The cascade reward makes the game feel slow   | raise `RELIEF.minMerges`, or lower `RELIEF.ticks` (12)         |
| Sound is intrusive                            | lower `SOUND.gain` (0.06)                                      |
| The merge rings are a crutch                  | set `matchHint: false` on Chill                                |
| Turns feel late                               | lower `INPUT.swipeThresholdPx` (12), or `TIMING.turnEarlyFrac` |
| Diagonal swipes flip direction                | raise `INPUT.turnBias` (1.5)                                   |
| Cascades go unnoticed                         | raise `FX.burstMs` / `FX.particlesPerMerge`                    |
| Death reads as abrupt                         | raise `DEATH.flashMs` / `DEATH.overlayDelayMs`                 |
| The daily should run on a different level     | `DAILY.level` (`'classic'`)                                    |
| A past daily must never renumber              | never change `DAILY.epoch` once players exist                 |
| Retention sending should stay off             | leave `ANALYTICS.endpoint` empty (default)                     |
| Device history grows too large in storage     | lower `ANALYTICS.maxDays` (400)                                |
| A level's `eats`/`time` star feels too easy or too hard | `LEVELS[n].stars` (re-run `node tools/simulate.js --campaign=N` and take the new p50) |
| A level's `tile`/`chain` star feels too easy or too hard | `LEVELS[n].stars` (a design call, not simulator-set — see the doubling ladder in the 2026-09-15 spec) |
| A level's goal, board, speed or obstacle cadence needs to change | `LEVELS[n].goal` / `board` / `speed` / `obstacleEvery` (a design change — change it with a reason, then re-run the simulator to reset its `eats`/`time` stars) |
| The victory panel arrives too soon or too late | `UI.winPanelDelayMs`                                            |
| The victory chord should sit at a different pitch | `SOUND.winHz`                                              |
| Walls should read as more or less distinct from obstacles | `WALL_COLORS`                                       |

Check any change with the simulator before and after:

```bash
node tools/simulate.js --runs=200
node tools/simulate.js --runs=200 --noObstacles
node tools/simulate.js --runs=100 --level=frenzy
```

### Simulator baseline (2026-09-10, 300 runs, the greedy "plays for matches" policy)

| Level   | Median best tile | Tiles eaten | Run length | Cells/s at the end | Deaths: obstacle / self / wall |
| ------- | ---------------- | ----------- | ---------- | ------------------ | ------------------------------ |
| Chill   | 128              | 81          | 90 s       | 5.2                | 44 % / 15 % / 39 %             |
| Classic | 64               | 44          | 45 s       | 7.1                | 34 % / 31 % / 33 %             |
| Frenzy  | 32               | 42          | 34 s       | 10.2               | 38 % / 31 % / 30 %             |

Classic sits in the spec's 30–90 s band with the three hazards killing in near-equal thirds, which
is the balance we want: no single way to die dominates. Note the simulated player only looks one
cell ahead, so it walks into obstacles far more than a human should; treat its obstacle share as a
ceiling rather than a prediction.

Superseded by the 2026-09-15 spawn window (median best tile climbs a lot on all three difficulties
now) — see "How tiles appear" above for the current Endless medians (Classic 512, Frenzy 128,
Chill 256).

### Campaign calibration (2026-10-01, 300 greedy-bot attempts per level)

`node tools/simulate.js --campaign --runs=300` plays every level 300 times with the greedy
"plays for matches" policy — which path-finds around walls by breadth-first search — and prints,
per level, the win rate and, among wins, how often ★★ and ★★★ held (`node
tools/simulate.js --campaign=7` runs one level alone).

Goals, boards, speeds, obstacle cadence and every `tile`/`chain` star are **design**, chosen as a
doubling ladder per act (64 → 128 → 256, capped at 256 because the bot's Endless median tile — 512
on Classic — sits one or two rungs above a human's); ★★ is always the easier star, ★★★ the harder.
Only the `eats` and `time` stars come from the simulator: `eats` is the p50 of eats among the
bot's wins, up to the nearest 2; `time` is the p50 seconds among the bot's wins × 1.4 (the bot
moves the instant a path is clear; a human takes a beat to look), up to the nearest 5. The win rate
and ★★/★★★ hit rates below are reported, not targeted: the bot path-finds and always takes the
matching tile, a human does not, so a win-rate band measured against the bot fit the bot's play,
not a person's — that is why goals stopped being tuned to it.

```
 #  board         goal            win%   ★★%   ★★★%
 1  Open          Reach 64         99     62     42
 2  The pillars   Reach 128        91     52     99
 3  The pillars   Chain ×3         59     54     34
 4  The pillars   Reach 256        82     58     53
 5  The lanes     Reach 128        60     54     98
 6  The lanes     Eat 40 tiles     26     91     63
 7  The lanes     Chain ×4          6     53     35
 8  The chambers  Reach 256        40     55     56
 9  The chambers  Chain ×4          7     55     10
10  The chambers  Reach 256        20     57    100
11  The ring      Eat 40 tiles     19     78     71
12  The ring      Reach 256        17     62     16
13  The door      Reach 64         87     67     39
14  The door      Reach 128        72     65     95
15  The locks     Chain ×3         47     58     18
16  The locks     Reach 256        12     57     68
17  The halves    Reach 128        56     58     98
18  The halves    Eat 40 tiles     11    100     79
19  The rooms     Chain ×3         40     56     23
20  The rooms     Reach 256        25     52     53
21  The rooms     Reach 128        23     56     94
22  The vault     Eat 40 tiles      9     64     75
23  The vault     Chain ×4          7     57     48
24  The vault     Reach 256         9     67     44
```

Levels 7 and 9 (`Chain ×4`) sit under 10 % win rate for the bot because it never plans a cascade; a
human who builds the ascending body `2 · 4 · 8 · 16` and detonates it with a 2 can clear either. A
`survive T s` goal was tried and dropped: the bot won it by circling without eating, since nothing
in the game ramps unless the snake eats.

Levels 13–24 were calibrated against targets the first twelve were not held to: the bot wins at
least 10 % on levels 13–20 and at least 7 % on 21–24 (the author asked for an easier campaign, so
act 6 must not be harder for the bot than act 3, whose floor is 7 %), and ★★★ holds in at least
15 % of wins on every level. Every `eats`/`time` star was then reset from the final p50s. The
levels that changed beyond their eats/time stars, and why:

- **Level 15** — ★★★ `Reach 128` → `Reach 64`: the bot held 128 in only 7 % of its wins (64: 18 %).
- **Level 19** — goal `Chain ×4` → `Chain ×3` and ★★★ `Reach 128` → `Reach 64`: the bot won 5 %,
  dying to walls rather than obstacles — dropping obstacles only reached 6 %, so the cadence stays
  every 20 and the goal moved a rung down instead (40 %); 128 then held in only 8 % of wins (64: 23 %).
- **Level 22** — obstacles every 15 → every 20: on the vault's one-cell ring obstacles ended 163 of
  300 runs and the bot won 3 % (now 9 %).
- **Level 23** — obstacles every 10 → every 15 and ★★★ `Reach 128` → `Reach 64`: win 5 % → 7 %;
  128 held in 0 % of wins (10 % after the cadence change), 64 holds in 48 %.
- **Level 24** — obstacles every 10 → every 15 and ★★★ `Chain ×4` → `Chain ×3`: win 3 % → 9 %; a
  ×4 chain held in 0 % of wins (still under 15 % after the cadence change), ×3 holds in 44 %.

Level 18's ★★ (`Reach 128` on `Eat 40 tiles`) holds in 100 % of the bot's wins, and the `time`
stars of levels 14, 17 and 21 in 94–98 %: the bot moves the instant a path is clear, so the × 1.4
margin is there for a human, not for it.

## Decision gate
- D1 ≥ 30 % and the daily is played on a second day → the loop is a habit; the next pass can look
  at where an ad could sit.
- D1 under 20 % → change the mechanic, don't polish (spec §6).
- Loop is "fine" but nobody replays → change the mechanic, don't polish (spec §2).
- Levels cleared per new device on day one ≥ 3 and the daily's D1 not below its earlier baseline →
  the campaign pulls its weight.
- Most testers stalling at one level → tune that level, not the campaign.
