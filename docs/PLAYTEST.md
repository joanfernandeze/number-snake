# Number Snake — Playtest guide (v0.2 · daily, share, retention)

**Play it:** https://joanfernandeze.github.io/number-snake/ — GitHub Pages, redeploys a minute or two after each push to `main`. Source: https://github.com/joanfernandeze/number-snake

**Question to answer:** does eat → merge → cascade → don't-trap-yourself pull *voluntary* retries?
Spec: `docs/superpowers/specs/2026-06-30-number-snake-design.md` (§2 targets).
What changed for this pass: `docs/superpowers/plans/2026-09-08-feel-pass.md` and
`docs/superpowers/plans/2026-09-14-retention-and-analytics.md`.

## Run it
- From this folder: `python -m http.server 8765` → open `http://localhost:8765/`.
- On a phone: open `http://<your-PC-LAN-IP>:8765/` on the same Wi-Fi. Use the phone — the design is portrait + swipe.
- The run does not start until the first swipe / arrow key. Play Again returns to that waiting state.

## Protocol (per tester, ~10 min)
1. Hand over the phone with **no explanation**. Say only: "try this".
2. Watch silently. Tally runs. Note the moment they visibly get "same numbers merge".
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

The same record now also travels to a Cloudflare Worker when `ANALYTICS.endpoint` is configured,
with one field added: `mode` (`free`, `daily`, or `practice`) — see "Retention numbers" below.

Also note by eye: did they say "one more"? Did they notice the **Merge! / Combo x2 / Chain x3!** bursts?
Did the red flash on the cell (or wall edge) they hit make the death feel like their own fault?

## Three levels, and obstacles

A row of buttons under the board picks the level; the choice is remembered. **Classic is the
default, and the playtest runs on Classic** — the levels are for replay value, not a way to dodge
the tuning question.

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

## Retention numbers, without identifying anyone

Every game over sends one record to a Cloudflare Worker (`POST <ANALYTICS.endpoint>`) via
`sendBeacon`, fire-and-forget: sending can never block the game and a failure is silently dropped.
Alongside the existing run record the device adds three facts it computes about itself:
`daySince` (days since its first play, 0 on day one), `daysPlayed` (distinct days played,
including today), and `firstOfDay` (true on the first run of a calendar day) — `mode` is `free`,
`daily` or `practice`. No identifier of any kind travels; the device keeps its own history under
`numberSnake.device`, capped at `ANALYTICS.maxDays`. The server counts: new devices are records
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

## Decision gate
- D1 ≥ 30 % and the daily is played on a second day → the loop is a habit; the next pass can look
  at where an ad could sit.
- D1 under 20 % → change the mechanic, don't polish (spec §6).
- Loop is "fine" but nobody replays → change the mechanic, don't polish (spec §2).
