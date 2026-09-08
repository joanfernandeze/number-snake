# Number Snake — Feel-First Prototype Design (v0.1)

**Date:** 2026-06-30
**Author:** Joan Fernández Esmerats (with Claude)
**Status:** Approved for planning
**Source concept:** "Four Web-First Game Concepts for Monetization" (June 2026), Concept 1 — *Number Snake: 2048 Runner* (scored 9.0/10, the strongest commercial candidate).

---

## 1. Summary

Validate whether **Snake + 2048**, fused into one mechanic, produces voluntary retries. The
player is a snake made of numbered segments moving on a bounded grid. Eating a numbered tile
**grows** the snake by one segment; whenever two **adjacent** segments are equal they **merge**
into one of double value, **shrinking** the snake and climbing the number. The run ends when the
snake crashes into a wall or into its own body.

This is a **feel-first prototype (v0.1)**. Its only job is to answer one question: **is the
eat → merge → cascade → don't-trap-yourself loop fun enough that people replay it on their own?**
Art, monetization, accounts, daily mode, and sharing are explicitly out of scope and deferred
until the loop is proven.

The design philosophy is **easy to play, hard to master**: the controls and the rule are
understood in seconds, but keeping the snake short while the board speeds up is a deep skill
curve. Eating grows you (more danger); merging shrinks you (safer, more points, bigger number).

The technical foundation is **plain HTML + Canvas + vanilla JS** (no build step, no physics
engine), in a self-contained folder — matching the author's three other game prototypes.

---

## 2. Success criteria (validation targets)

The prototype is successful if a new player, **with no explanation**, plays **at least 5 runs
voluntarily**, understands merging on their own, and feels that death was **their own fault**
rather than unfair.

Track manually or via console logging:

| Metric                                    | Good sign       |
| ----------------------------------------- | --------------- |
| Average runs per player                   | 5+              |
| Understood without explanation            | yes (>80%)      |
| Time to first merge                       | < 20 seconds    |
| "One more try" behavior                   | visibly present |
| Best tile improves over first few runs    | yes             |
| "That was unfair" complaints              | low             |
| Mobile-web frame rate                     | stable 60 FPS   |

If the loop feels okay but does not pull retries, we change the mechanic rather than polishing
further.

---

## 3. Core gameplay loop

1. The snake moves continuously on a tick (classic Snake); the player only sets **direction**.
2. Numbered tiles sit on the board. Driving the **head onto a tile eats it**: a new head segment
   carrying that number is appended (**snake grows +1**), and a fresh tile spawns elsewhere.
3. **Merge-compress:** after eating, the snake is scanned head→tail; any two **adjacent equal**
   segments merge into a single segment of **double value**, **shrinking the snake −1** and
   awarding score. This **cascades** (see §7).
4. The player routes the snake to reach matching tiles **without trapping itself**.
5. The run ends on a wall hit or a self (tail) collision.
6. The player restarts instantly and tries to beat their best tile / score.

**The tension, in one line:** eating *grows* the snake (more danger); merging *shrinks* it
(safer + more points + bigger number). Greedy mismatched eating bloats the body into a deathtrap;
clean matching keeps it short and climbing.

---

## 4. Board & movement

- **Bounded portrait grid**, starting at **7 columns × 11 rows** (tunable in `constants.js`).
  Walls on all four sides.
- **Tick-based movement:** every tick the head advances one cell in the current direction; each
  body segment moves into the cell the segment ahead of it occupied (classic Snake follow).
- **Controls:**
  - **Mobile:** swipe/drag up/down/left/right to set direction.
  - **Desktop:** Arrow keys / WASD.
  - **No instant 180° reverse** — a direction directly opposite the current heading is ignored.
- The snake **never stops**; continuous motion is the source of time pressure.
- The snake starts short (e.g. length 2–3, low values) at the board center, moving upward.

---

## 5. Tile spawning — keeping the climb alive

This is the subtle, correctness-critical part. If only `2`s and `4`s ever spawned, the head value
would stall (a `64` head can never match a `4`). Therefore:

- Keep **~3 tiles** on the board simultaneously (forces real routing choices). Count is a knob.
- Tile values are drawn from a **window relative to the snake's current largest segment** — e.g.
  from the set `{2, 4, …, currentMax}`, **weighted toward the low end** (small values most common).
  This guarantees the player can **always** find *a* value that lets them keep doubling, while
  *reaching* it without self-trapping is the challenge. Higher-value tiles appear naturally as the
  player climbs.
- Tiles spawn only on **empty cells** (not on the snake, not on another tile).
- The spawn window, tile count, and value weights all live in `constants.js`.

---

## 6. Merge rule (correctness-critical)

**Append direction:** eating adds the new segment at the **head** (front). The previous head
becomes the second segment.

**Resolution:** immediately after an eat, walk the snake from the head toward the tail. The first
time two **adjacent** segments share a value, replace the pair with a single segment of **double
value** at the **front-most** of the two positions, and continue scanning from that segment so the
result can merge again (cascade). Each merge:

- shortens the snake by one segment,
- awards score equal to the **new** (doubled) value,
- increments the current **combo** counter.

**Only adjacent segments merge.** The body order is a frozen history of eating order and is never
reordered — so the player's only lever is *which tile to eat next* relative to the current head
value. In practice the head behaves as the "current number" the player is trying to keep doubling;
unmatched segments behind it are the accumulating length/danger.

**One eat → one resolution pass.** Merges are resolved fully (cascade to completion) within the
single tick the eat occurred, before the next tick.

---

## 7. Chains, combos & feedback

A **cascade** is multiple merges resolving from a single eat (e.g. eating `2` collapses
`[2,2,4,8]` → `[16]` in one bite). Because the validation target is specifically
`eat → merge → cascade`, cascade moments must be unmistakable:

- a particle pop + brief flash at each merge,
- escalating text bursts: `Merge!`, `Combo x2`, `Chain x3!`,
- the **best combo** in a run is tracked for scoring/share.

If players don't *notice* cascades, the prototype under-tests its own core loop.

---

## 8. Fail states

The run ends when, on a tick, the head would move into:

1. **Its own body** — tail collision. A long, junk-filled snake traps itself. This is the skill
   ceiling.
2. **A wall** — the board edge (classic Snake; readable and expected). *(Wrap-around is noted as a
   future tuning option but is NOT in v0.1.)*

No other fail sources in v0.1 — the snake's own length plus the speed ramp (§9) is the entire
difficulty. No obstacles, no power-ups.

### Game-over sequence (readable, not abrupt)

1. collision detected,
2. screen shake + the offending cell flashes,
3. motion freezes,
4. game-over overlay fades in ~300–500ms later showing **final score, best tile, best combo, best
   score**, and one large **Play Again** button for instant one-tap restart.

Making the cause visible (which cell was hit) is what keeps death feeling fair.

---

## 9. Difficulty ramp ("hard to master")

- **Tick interval** starts gentle (~**200ms**) and **decreases** as score/distance climbs, toward
  a floor (~**80ms**). Faster snake + longer body = the mastery curve.
- The speed curve (start, floor, and how it ramps with score) lives in `constants.js`.
- v0.1 ramps **speed only**. Tile count and spawn pressure are held constant so the variable under
  test is clean.

---

## 10. Scoring & sharing

- **Headline number: biggest tile reached** — the social object ("I hit 512").
- **Score** accrues from merge values (2048-style: each merge adds its new value).
- **Best combo** = longest single-eat cascade in the run.
- Best score and best tile persist in `localStorage`.
- A **spoiler-free share card** is **out of scope for v0.1**, but the values it will need (best
  tile, score, combo) are tracked from day one.

---

## 11. Look & feel (addresses the "cheap 2048 clone" risk)

The research's top risk for this concept is "looks like a cheap 2048 clone." Mitigation:

- **Neon arcade snake.** Segments are rounded cells, **color-coded by power** (e.g. 2→teal,
  4→blue, 8→purple, 16→pink, 32→orange, 64→red, climbing through a defined palette), with **big
  readable numbers** and a **glowing head**. Palette lives in `constants.js`.
- **Juice:** movement is **smoothly interpolated** between grid cells each frame (render lerps
  between the previous and current tick positions) so motion reads as fluid, not jerky; merges pop;
  cascades escalate; death shakes the screen.
- Numbers must stay readable at the fastest tick speed (large font, high-contrast color families
  by power) — this is also the "too hard to read at speed" mitigation from the research.

---

## 12. Architecture

Self-contained folder, **no build step**, modular vanilla JS (mirrors the Stackimals prototype
structure):

```
Number Snake/
  index.html          # canvas + HUD markup, loads modules
  style.css           # layout, HUD, overlay
  src/
    constants.js      # grid dims, tick timing + speed ramp, tile spawn window/count/weights,
                      #   color-by-power palette, scoring — ALL tuning values, no logic
    rng.js            # seedable random source (replaceable; daily mode later)
    board.js          # grid state, tile spawning (relative-window values), occupancy queries
    snake.js          # segment list; step/move; eat + append; merge-compress cascade;
                      #   wall + self collision tests
    render.js         # canvas draw loop: board, tiles, snake (interpolated, color-by-power,
                      #   numbers), HUD, merge/cascade FX, shake — the art/feel seam
    input.js          # pointer/swipe + Arrow/WASD -> direction; no-reverse guard; platform-aware
    game.js           # game loop, tick scheduler, speed ramp, score/combo/best-tile,
                      #   fail detection, restart; owns run state
    main.js           # composition root + frame loop; no game rules of its own
```

**Module responsibilities (one clear purpose each):**

- **constants** — single source of truth for every tunable number and the color-by-power palette.
  No logic.
- **rng** — deterministic, seedable random; the only randomness source for tile spawns (enables a
  future daily-seed mode with no rework).
- **board** — owns the grid and tiles; spawns tiles on empty cells using the relative-value window;
  answers "what's at cell (x,y)". Knows nothing about score or rendering.
- **snake** — the rules engine for the body: movement/follow, eat+append, the merge-compress
  cascade (§6), and collision tests. Holds the segment list.
- **render** — pure view: each frame reads game state and draws it with interpolation + juice.
  **This is the seam where visual polish/art is tuned** with no logic changes.
- **input** — translates raw pointer/touch/keys into a desired direction; enforces the no-reverse
  guard; platform-aware.
- **game** — composition of rules: tick scheduling, speed ramp, scoring/combo/best-tile, fail
  handling, restart. Owns run state.
- **main** — wires modules together and runs the frame loop.

**Persistence:** best score, best tile (and best combo) in `localStorage`. Nothing else.

---

## 13. Out of scope (YAGNI for v0.1)

- Ads / monetization of any kind.
- Daily-seed / fixed-sequence mode (RNG is built seedable to enable it later, but no UI).
- Spoiler-free share card (values are tracked; the card itself is later).
- Accounts, cloud save, leaderboards.
- Cosmetics, skins, themes, trails.
- Obstacles, blockers, power-ups, multiple tile types beyond numbers.
- Wrap-around board mode.
- Sound (optional, toggleable; not required for the validation question).

---

## 14. Open tuning questions for playtesting

Intentionally left to be answered by feel during testing, not pre-decided:

- Exact grid dimensions within a portrait-friendly range (starting 7×11).
- Tick start/floor and how aggressively speed ramps with score.
- Number of simultaneous tiles (starting ~3) and the spawn-value window/weights.
- Starting snake length and starting values.
- Whether cascades need extra reward/feedback to feel as good as they should.
- Whether walls-as-death feels fair, or whether a wrap-around mode tests better later.
