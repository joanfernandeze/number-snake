# Number Snake — Playtest guide (v0.1 feel pass)

**Play it:** https://joanfernandeze.github.io/number-snake/ — GitHub Pages, redeploys a minute or two after each push to `main`. Source: https://github.com/joanfernandeze/number-snake

**Question to answer:** does eat → merge → cascade → don't-trap-yourself pull *voluntary* retries?
Spec: `docs/superpowers/specs/2026-06-30-number-snake-design.md` (§2 targets).
What changed for this pass: `docs/superpowers/plans/2026-09-08-feel-pass.md`.

## Run it
- From this folder: `python -m http.server 8765` → open `http://localhost:8765/`.
- On a phone: open `http://<your-PC-LAN-IP>:8765/` on the same Wi-Fi. Use the phone — the design is portrait + swipe.
- The run does not start until the first swipe / arrow key. Play Again returns to that waiting state.

## Protocol (per tester, ~10 min)
1. Hand over the phone with **no explanation**. Say only: "try this".
2. Watch silently. Tally runs. Note the moment they visibly get "same numbers merge".
3. Stop when *they* stop. Then ask: (a) did any death feel unfair? (b) what were you trying to do?
4. On the Game Over panel tap **Stats**, then **Copy**, and have them paste the text to you (a screenshot also works). On a desktop, `numberSnakeStats()` in DevTools returns the same data.

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
| Turns feel late                               | lower `INPUT.swipeThresholdPx` (12), or `TIMING.turnEarlyFrac` |
| Diagonal swipes flip direction                | raise `INPUT.turnBias` (1.5)                                   |
| Cascades go unnoticed                         | raise `FX.burstMs` / `FX.particlesPerMerge`                    |
| Death reads as abrupt                         | raise `DEATH.flashMs` / `DEATH.overlayDelayMs`                 |

Check any change with the simulator before and after:

```bash
node tools/simulate.js --runs=200
node tools/simulate.js --runs=200 --noObstacles
node tools/simulate.js --runs=100 --level=frenzy
```

### Simulator baseline (2026-09-10, 300 runs, the greedy "plays for matches" policy)

| Level   | Median best tile | Tiles eaten | Run length | Cells/s at the end | Deaths: obstacle / self / wall |
| ------- | ---------------- | ----------- | ---------- | ------------------ | ------------------------------ |
| Chill   | 128              | 81          | 84 s       | 5.2                | 42 % / 17 % / 40 %             |
| Classic | 64               | 44          | 44 s       | 7.1                | 32 % / 32 % / 35 %             |
| Frenzy  | 32               | 42          | 34 s       | 10.2               | 35 % / 31 % / 32 %             |

Classic sits in the spec's 30–90 s band with the three hazards killing in near-equal thirds, which
is the balance we want: no single way to die dominates. Note the simulated player only looks one
cell ahead, so it walks into obstacles far more than a human should; treat its obstacle share as a
ceiling rather than a prediction.

## Decision gate
- Retries happen on their own → v0.2 (share card, daily seed, sound) per spec §13.
- Loop is "fine" but nobody replays → change the mechanic, don't polish (spec §2).
