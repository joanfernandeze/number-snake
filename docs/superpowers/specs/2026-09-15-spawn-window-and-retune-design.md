# Spawn Window and Campaign Retune — Design

**Date:** 2026-09-15
**Author:** Joan Fernández Esmerats (with Claude)
**Status:** Approved in conversation; implementation starts at once
**Builds on:** `2026-06-30-number-snake-design.md` §5 (tile spawning) and
`2026-09-14-campaign-design.md` (levels, stars, calibration).

---

## 1. Why

The author's group played the campaign on 2026-09-14 and stalled on level 4 (`Reach 128`). An
independent analysis measured the same wall with the simulator: on level 7, removing every
obstacle moved the bot's win rate from 4 % to 8 %, while lowering the goal from 128 to 64 moved it
to 47 %. **The goal value dominates everything else**, because climbing a value is a matter of
luck: the only way up is to eat a tile equal to the head, and with the biggest piece at 64 the
chance that a new tile is a 64 is 1 %. Players wait for a miracle while the speed climbs.

The author's rule fixes the root cause instead of lowering goals: **as the pieces you carry get
bigger, the small tiles stop appearing.** With a 32 in the body no 2s spawn; with a 64 no 4s; with
a 128 no 8s. The snake's disorder stays: eating something bigger than the head still leaves dead
weight behind, and the author likes that tension.

## 2. The spawn window

A new tile's value is drawn from **the top `span` powers of two ending at the snake's biggest
piece** (`span` = 4 on Classic: with a 64 on the snake the window is `{8, 16, 32, 64}`), weighted
toward the low end with a **flatter decay** than today so the top of the window shows up often.

| Biggest piece | Window (span 4) |
| ------------- | --------------- |
| 2 … 16        | everything from 2 up (nothing is cut yet) |
| 32            | 4, 8, 16, 32 |
| 64            | 8, 16, 32, 64 |
| 128           | 16, 32, 64, 128 |

Weights are `decay^i` with `i = 0` at the bottom of the window. With `decay = 0.8`, a 64 appears
in 17 % of spawns when the biggest piece is 64 (today: 1 %), a 32 in 22 %, and with three tiles on
the board there is a 64 waiting 43 % of the time (today: 3 %).

**Why it plays well.** The bottom of the window is what a player most likely holds after eating
the wrong tile: head 8 behind a 64, and the 8s are now the most common tile, so the ladder 8 → 16
→ 32 → 64 is fast and ends on the 64 already carried: 128. Mistakes cost eats, not the run. Eating
a tile **bigger** than the head still buries the smaller one for good; those traps are more
frequent now because big tiles are common, which is the skill the author wants to keep.

**Knobs (per difficulty, in `DIFFICULTIES`):** `span` — Chill 3, Classic 4, Frenzy 4; `decay` —
Chill 0.9, Classic 0.8, Frenzy 0.65. Chill keeps its `head` window (values never above the head).
The simulator's Endless report is the check: Classic's median best tile should move from 64
toward 128; if it passes 256 the decays come down.

## 3. Campaign retune

Everything measured before this change is stale, so the campaign is recalibrated after it, with
these structural changes taken from the independent analysis where they are good design
regardless of difficulty:

- **Level 7** goal becomes `chain 4` (stars `eats ≤ E`, `tile ≥ 64`): The lanes trio reads
  build (5) / accumulate (6) / chain (7) instead of repeating `Reach` twice on one board.
- **Level 11** obstacles every 15 (was 10); stars `chain ≥ 4`, `tile ≥ V`.
- **★★★ `tile 128` on `collect`/`chain` goals (levels 6, 9, 11)** hit 2 % of bot wins: a lottery,
  not a star. Every `tile`/`chain` star is now set by measurement (below).
- **Level 12 stays on Frenzy** — it is the finale and the author asked for hard. Its obstacle
  cadence and, last of all, its speed are the levers if it stays under the floor.
- `maxTiles` stays at the difficulty's value; raising it is a reserve lever, not a default.

**Calibration rule (300 greedy-bot attempts per level, BFS bot, deterministic seeds):**

| Quantity | Target |
| -------- | ------ |
| Bot win rate, act 1 | 40–80 % |
| Bot win rate, act 2 | 20–50 % |
| Bot win rate, act 3 | 10–30 % |
| `eats ≤` stars | ★★ = p50 of eats among wins (rounded up to 2), ★★★ = p20 |
| `time ≤` stars | ★★★ = p50 seconds × 1.4, rounded up to 5 (the bot does not think) |
| `tile ≥` / `chain ≥` stars | the value whose hit rate among wins is nearest 20 %, within 15–30 %; candidates 64/128/256 and 3/4/5 |

If a level's win rate is above its band, raise the goal one notch (64 → 128 → 256, chain +1,
collect +10); below it, ease obstacles one notch first (10 → 15 → 20), then the goal one notch
down. At most two rounds. Level 1 keeps its teaching setup (hints, four tiles) whatever the numbers.

The `time` stars are known to be trivial for the bot and possibly right for humans; they are not
tightened until the analytics say what humans actually hit (§4).

## 4. Analytics: stars travel

The run record gains `stars` (0–3 for a campaign run, `null` otherwise). The Worker accepts and
stores it, and `/stats` adds `threeStars` per level, so the ★★★ rates of real players are readable
next to the win rates. The author runs two `ALTER TABLE` statements (one for `level`, still
pending from 2026-09-14, one for `stars`) and redeploys; the README lists both.

## 5. Housekeeping

`analytics/wrangler.toml` with the real `database_id` and `analytics/package-lock.json` go into
git: an identifier, not a secret, and without them a redeploy from another machine fails.

## 6. Success criteria

- The author's group clears level 4 within a session.
- Every level inside its win-rate band for the bot; every ★★★ between 15 % and 30 % of bot wins
  where the condition is a tile or chain.
- `/stats` shows campaign runs once the Worker is upgraded, with `threeStars` per level.
