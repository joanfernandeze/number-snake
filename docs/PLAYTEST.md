# Number Snake — Playtest guide (v0.1 feel pass)

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
4. Open DevTools (or ask them to) and run `numberSnakeStats()`; screenshot it.

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
| `causes.self` vs `.wall` | self should dominate as skill grows       |
| `medianDurationMs`       | informational: 30–90 s is a healthy loop  |

Also note by eye: did they say "one more"? Did they notice the **Merge! / Combo x2 / Chain x3!** bursts?
Did the red flash on the cell (or wall edge) they hit make the death feel like their own fault?

## Knobs (`src/constants.js`) — symptom → knob
| Symptom                                       | Knob                                                          |
| --------------------------------------------- | ------------------------------------------------------------- |
| Climb stalls: never sees the value they need  | `SPAWN.window = 'head'`, or raise `SPAWN.decay` (0.45 → 0.6)  |
| Never in danger                               | lower `TIMING.tickStartMs` / `tickFloorMs`, or shrink `GRID`  |
| Chaos at speed                                | raise `TIMING.tickFloorMs`, or lower `TIMING.tickPerPoint`    |
| Turns feel late                               | lower `INPUT.swipeThresholdPx` (16 → 12)                      |
| Start feels slow / too fast                   | `TIMING.tickStartMs` (now 170; was 200 before the 2026-09-08 playtest) |
| Diagonal swipes flip direction                | raise `INPUT.turnBias` (1.5 → 2)                              |
| Cascades go unnoticed                         | raise `FX.burstMs` / `FX.particlesPerMerge`                   |
| Death reads as abrupt                         | raise `DEATH.flashMs` / `DEATH.overlayDelayMs`                |

Check any spawn/timing change with the simulator before and after:

```bash
node tools/simulate.js
node tools/simulate.js --window=head --decay=0.6
```

### Simulator baseline (2026-09-08, 300 runs each, greedy "plays for matches" policy)

| Config                        | Median best tile | Reach ≥128 | Reach ≥256 | Deaths self / wall |
| ----------------------------- | ---------------- | ---------- | ---------- | ------------------ |
| `window=max` (current default) | 64              | 14 %       | 0 %        | 234 / 66           |
| `window=head`                 | 128              | 80 %       | 35 %       | 197 / 103          |

The head-relative window removes the tile-64 plateau in simulation. It is **not** switched on by
default: the spec (§14) leaves the spawn rule to feel, and a much easier climb may also make runs
long enough to lose the "one more try" rhythm. Decide with humans, not with the sim.

## Decision gate
- Retries happen on their own → v0.2 (share card, daily seed, sound) per spec §13.
- Loop is "fine" but nobody replays → change the mechanic, don't polish (spec §2).
