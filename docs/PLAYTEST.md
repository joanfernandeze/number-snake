# Number Snake — Playtest guide (v0.3 · campaign)

**Play it:** https://joanfernandeze.github.io/number-snake/ — GitHub Pages, redeploys a minute or two after each push to `main`. Source: https://github.com/joanfernandeze/number-snake

**Question to answer:** does eat → merge → cascade → don't-trap-yourself pull *voluntary* retries?
Spec: `docs/superpowers/specs/2026-06-30-number-snake-design.md` (§2 targets).
What changed for this pass: `docs/superpowers/plans/2026-09-08-feel-pass.md`,
`docs/superpowers/plans/2026-09-14-retention-and-analytics.md`,
`docs/superpowers/plans/2026-09-14-campaign.md` and the spec
`docs/superpowers/specs/2026-09-14-campaign-design.md`.

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
| Low-value bias (decay)     | 0.55   | 0.45    | 0.35   |
| An obstacle every … tiles  | 20     | 10      | 10     |

**The ramp keys off tiles eaten, not score.** Score arrives late and in lumps, so a score-keyed
ramp put the whole speed climb after the run was effectively over; five rounds of hand-tuning
could not fix that. A run eats about 45 tiles, and eating grows steadily with time played, so the
climb is now spread across the run.

**Obstacles** are permanent hazard-striped blocks that land every few tiles eaten, up to eight per
board. Running into one ends the run like a wall. They never appear within four cells of the head
and avoid lining up beside each other, so they cannot materialise in your face or wall the board
in half. Chill keeps its cadence at 20 because its runs are long; Frenzy deliberately keeps
Classic's 10, because at every 7 the obstacles flattened its climb from a median tile of 64 to 32,
and a hard level should make the player fail rather than deny them the climb.

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

The game now opens on a **map**: three acts — Learn, Pressure, Mastery — of four levels each, plus
the unchanged **Endless** and **Daily** one tap away (`Play level N ▸`, `Endless`, `Play Daily #N`).
Picking a level shows a **goal card** over the board (`Level 5 · The lanes`, the goal in large type
e.g. `Reach 64`, the two extra-star conditions as `★★ …` / `★★★ …`, and `Swipe to start`) that lets
gestures through, so the first swipe or arrow key dismisses it and starts the run. During a
campaign run the HUD's right-hand stat becomes the goal (`REACH 64` / `CHAIN ×3` / `EAT 12/30`)
instead of the best tile. Winning stops the snake at once — no death flash, no shake, a short
rising chord — and the panel reads `Level cleared!`, the three conditions each with a ✓ or ✗ and
the stars earned, then `Level N ▸` (`Campaign complete!` in its place after level 12) / `Retry` /
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

The twelve levels, as shipped (`src/campaign.js`, `LEVELS`):

| #  | Act      | Board        | Goal         | ★★                 | ★★★         | Speed   | Obstacles |
| -- | -------- | ------------ | ------------ | -------------------- | ------------- | ------- | --------- |
| 1  | Learn    | Open         | Reach 64     | 24 tiles or fewer     | Chain ×2      | Classic | none      |
| 2  | Learn    | The pillars  | Reach 64     | 28 tiles or fewer     | Under 45 s    | Classic | none      |
| 3  | Learn    | The pillars  | Chain ×3     | 12 tiles or fewer     | Reach 64      | Classic | none      |
| 4  | Learn    | The pillars  | Reach 128    | 46 tiles or fewer     | Chain ×4      | Classic | none      |
| 5  | Pressure | The lanes    | Reach 64     | 26 tiles or fewer     | Under 50 s    | Classic | every 15  |
| 6  | Pressure | The lanes    | Eat 30 tiles | Reach 64              | Reach 128     | Classic | every 15  |
| 7  | Pressure | The lanes    | Reach 128    | 40 tiles or fewer     | Chain ×4      | Classic | every 20  |
| 8  | Pressure | The chambers | Reach 128    | 40 tiles or fewer     | Chain ×4      | Classic | every 15  |
| 9  | Mastery  | The chambers | Chain ×4     | 20 tiles or fewer     | Reach 128     | Frenzy  | every 10  |
| 10 | Mastery  | The chambers | Reach 128    | 36 tiles or fewer     | Under 90 s    | Frenzy  | every 10  |
| 11 | Mastery  | The ring     | Eat 40 tiles | Reach 64              | Reach 128     | Frenzy  | every 10  |
| 12 | Mastery  | The ring     | Reach 128    | 36 tiles or fewer     | Chain ×4      | Frenzy  | every 10  |

The five boards (`src/boards.js`):

| Board        | What the shape does to play                                                                    |
| ------------ | ------------------------------------------------------------------------------------------------ |
| Open         | no walls at all — a bare test of speed and space                                                 |
| The pillars  | two single-cell blocks, one above the start and one below — a couple of dodges a lap, nothing more |
| The lanes    | solid columns down both sides of the middle rows box most of the board into one narrow vertical corridor |
| The chambers | one wall clean across the middle with a single gap — every route between the two halves goes through that doorway |
| The ring     | a broken box walls the centre off from the corners — the inside loop is short, breaking out to a corner takes the long way round |

**Unlocking is linear:** clearing a level (one star) unlocks the next; stars never gate anything —
they exist to bring a player back to a level, not to block one. Attempts are unlimited, and **each
attempt uses a fresh random seed**, so a level cannot be memorised spawn by spawn.

**What to watch in a tester:** which level they stall on; whether they retry a failed level or
leave for the map; whether they ever come back to replay a cleared level for its missing stars;
whether they read the goal card or swiped it away unread; whether a wall death feels as fair as an
obstacle or self death; and, if they get there, whether the finale (level 12: The ring at Frenzy
speed) reads as hard-but-possible rather than a wall.

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
`eaten`, `firstMergeMs`, `cause` (now including `won`, on a cleared campaign level), `level` (1–12
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
| `levels`                                            | per level `{ level, runs, wins }` — the level whose win rate collapses is the one to tune |

These three campaign fields only appear once the Worker has been upgraded for the campaign — see
`analytics/README.md`, "Upgrading an existing deployment"; a Worker still on the old schema simply
omits them.

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
| A level's stars feel too easy or too hard      | `LEVELS[n].stars` (tune with the simulator)                    |
| A level's goal, board, speed or obstacle cadence needs to change | `LEVELS[n].goal` / `board` / `speed` / `obstacleEvery` (a design change — change it with a reason and re-run the simulator) |
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

### Campaign calibration (2026-09-14, 300 greedy-bot attempts per level)

`node tools/simulate.js --campaign --runs=300` plays every level 300 times with the greedy
"plays for matches" policy — which now path-finds around walls by breadth-first search — and
prints, per level, the win rate and, among wins, how often ★★ and ★★★ held (`node
tools/simulate.js --campaign=7` runs one level alone). Thresholds are tuned so that among the
bot's wins **★★ holds in roughly half and ★★★ in roughly a fifth**, and the bot wins at least one
attempt in ten on acts 1–2 and one in thirty on act 3 (it is a much weaker player than a human who
has reached that level; if it cannot win a level at all, the level is too hard); any `time`
threshold is scaled ×1.4 before rounding, because the bot moves the instant a path is clear and a
human takes a beat to look:

```
 #  board         goal           win%   ★★%   ★★★%  eats p50/p20   secs p50/p20
 1  Open          Reach 64        93     52    100     24/19          24/20
 2  The pillars   Reach 64        82     52     85     28/20          31/23
 3  The pillars   Chain ×3        93     51     18     12/7           16/9
 4  The pillars   Reach 128       20     51     69     46/37          47/39
 5  The lanes     Reach 64        39     53     88     25/19          32/25
 6  The lanes     Eat 30 tiles    68     33      2     30/30          38/34
 7  The lanes     Reach 128        4     46     77     41/29          45/36   (obstacles eased to every 20)
 8  The chambers  Reach 128       10     52     79     40/31          44/33
 9  The chambers  Chain ×4        43     53      2     19/13          20/15
10  The chambers  Reach 128        2     20    100     44/41          40/34
11  The ring      Eat 40 tiles    18     47      2     40/40          39/36
12  The ring      Reach 128        1     50    100     45/33          41/36
```

Levels 7, 10 and 12 are hard even for a good player; the plan is to read each level's win rate from
`/stats` after a week and tune that level, not the whole act. A `survive T s` goal was tried and
dropped: the bot won it by circling without eating, since nothing in the game ramps unless the
snake eats.

## Decision gate
- D1 ≥ 30 % and the daily is played on a second day → the loop is a habit; the next pass can look
  at where an ad could sit.
- D1 under 20 % → change the mechanic, don't polish (spec §6).
- Loop is "fine" but nobody replays → change the mechanic, don't polish (spec §2).
- Levels cleared per new device on day one ≥ 3 and the daily's D1 not below its earlier baseline →
  the campaign pulls its weight.
- Most testers stalling at one level → tune that level, not the campaign.
