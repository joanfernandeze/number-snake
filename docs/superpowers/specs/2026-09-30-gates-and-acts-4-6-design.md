# Gates and Acts 4–6 — Design

**Date:** 2026-09-30
**Author:** Joan Fernández Esmerats (with Claude)
**Status:** Mechanic approved section by section (§2). The boards and the level table (§3–§4) are
Claude's proposal, written into the spec at the author's request so the plan could be drafted in
one sitting; review them before implementation starts.
**Builds on:** `2026-09-14-campaign-design.md` (boards, levels, stars) and the 2026-09-15 retune
(goals as a doubling ladder per act capped at 256; eats and time stars set by the simulator).

---

## 1. Why

Twelve levels is thin for a store launch. The campaign doubles to **24 levels in six acts of four**,
and the second half brings the game's first new mechanic since walls: **gates**. New shapes alone
would read as more of the same; one new rule, taught in its own act, makes the game feel like it
grows.

Decisions taken with the author:

| Question | Decision |
| --- | --- |
| How many levels at launch | 24 (six acts of four); more can ship as updates |
| What the new levels add | New boards and one new mechanic |
| Which mechanic | Gates |
| Where the new levels go | Acts 4–6 after level 12, in a sawtooth: act 4 is gentle again, like act 1 was for walls. Levels 1–12 keep their numbers, so stored stars stay valid |
| What moves a gate | Eating (not time, not switches) |

## 2. The mechanic

- **On the board.** Boards are drawn as text (`#` wall, `S` start, `.` free). Two new letters, `A`
  and `B`, mark two sets of gates in two colours. Set A starts open, set B starts closed.
- **Eating swaps them.** The closed set opens at once; the open set starts **closing**.
- **Closing** lasts `GATE.warnTicks` = 2 moves. A closing gate blinks, like an obstacle about to
  arm, and can still be crossed. Then it turns solid. Eating right in front of a gate therefore
  never kills without warning.
- **Never on the snake.** A closing gate with a snake segment on it keeps blinking until the cell
  is free, then turns solid on the next move.
- **Hitting a closed gate** ends the run like a wall, with its own cause, `gate`, so `/stats` shows
  whether gates kill too often.
- **Spawns.** Tiles and obstacles never land on a gate cell. Tiles also never land in a region that
  is sealed at that moment: a tile only spawns on a cell reachable from the head, where walls,
  closed and closing gates and armed obstacles block and the snake's own body does not.
- **Look.** Closed = a solid rounded block in its set's colour. Open = a dashed outline of the same
  colour on the floor, so the player sees where a gate will close. Closing = alternates between the
  two. No hazard stripes and no red glow: those stay reserved for obstacles and the frame.
- **Sound.** A short two-note click when the sets swap.
- **A valid board** (extends the existing rule): eleven rows of seven characters, one `S`, the
  start cell and the cell in front of it are `.`, every non-wall cell is reachable from `S` with all
  gates open, and the start area (A open, B closed) holds at least `GATE.minStartArea` = 20 cells.

## 3. Boards

Five new boards, checked against §2's validity rule (free cells / start area with A open / area
after the first swap):

```
The door       The locks      The halves     The rooms      The vault
.......        .......        ...#...        ...#...        .......
.......        .......        ...A...        ...B...        .#####.
.......        .......        ...#...        ...#...        .#...#.
##A#B##        ###A###        ...#...        #A###B#        .A...B.
.......        .......        ...#...        .......        .#...#.
...S...        ...S...        ..S#...        ...S...        .#.S.#.
.......        .......        ...#...        .......        .#...#.
.......        ###B###        ...#...        .......        .B...A.
.......        .......        ...B...        .......        .#...#.
.......        .......        ...#...        .......        .#####.
.......        .......        ...#...        .......        .......
72 / 71 / 71   65 / 43 / 43   68 / 67 / 67   70 / 59 / 69   57 / 55 / 55
```

- **The door** teaches the rule: one door is always open, so the two halves never disconnect.
- **The locks** is the first real choice: eating opens the bottom and seals the top, and back.
- **The halves** turns the same idea on its side, with the start on the narrow left.
- **The rooms** has three gates and two small rooms that open to each other in turn.
- **The vault** is the finale's board: an inner room and an outer ring joined by four gates.

## 4. Levels 13–24

Acts 4–6 follow the retune's rules: goals climb a doubling ladder within each act, capped at 256;
tile and chain stars are design; **eats and time stars are set by `tools/simulate.js --campaign`**
(eats = p50 of eats among the bot's wins; time = p50 seconds × 1.4). The eats and time values below
are starting points the calibration overwrites.

| # | Act | Board | Speed | Obstacles | Goal | ★★ | ★★★ |
| - | --- | --- | --- | --- | --- | --- | --- |
| 13 | 4 Gates | The door | Classic | none | tile 64 | eats ≤ 18 | chain ≥ 3 |
| 14 | 4 Gates | The door | Classic | none | tile 128 | eats ≤ 24 | time ≤ 45 s |
| 15 | 4 Gates | The locks | Classic | none | chain 3 | eats ≤ 14 | tile ≥ 128 |
| 16 | 4 Gates | The locks | Classic | none | tile 256 | eats ≤ 30 | chain ≥ 3 |
| 17 | 5 Crossings | The halves | Classic | every 15 | tile 128 | eats ≤ 24 | time ≤ 50 s |
| 18 | 5 Crossings | The halves | Classic | every 15 | collect 40 | tile ≥ 128 | chain ≥ 3 |
| 19 | 5 Crossings | The rooms | Classic | every 20 | chain 4 | eats ≤ 26 | tile ≥ 128 |
| 20 | 5 Crossings | The rooms | Classic | every 15 | tile 256 | eats ≤ 26 | chain ≥ 3 |
| 21 | 6 Vault | The rooms | Frenzy | every 15 | tile 128 | eats ≤ 24 | time ≤ 40 s |
| 22 | 6 Vault | The vault | Frenzy | every 15 | collect 40 | tile ≥ 128 | chain ≥ 3 |
| 23 | 6 Vault | The vault | Frenzy | every 10 | chain 4 | eats ≤ 16 | tile ≥ 128 |
| 24 | 6 Vault | The vault | Frenzy | every 10 | tile 256 | eats ≤ 28 | chain ≥ 4 |

The act names join `ACTS`: `['Learn', 'Pressure', 'Mastery', 'Gates', 'Crossings', 'Vault']`.

**Calibration targets** (the same bar the spec of 2026-09-14 §8 sets): the bot wins at least one
attempt in ten on acts 4–5 and one in thirty on act 6, and **no level's ★★★ holds in under 15 % of
the bot's wins**. A level that misses is tuned on its own (obstacles, speed, goal), not its act.

## 5. Engine and modules

- **`src/constants.js`** — `GATE = { warnTicks: 2, minStartArea: 20, colors: { A: '#fde047', B:
  '#c4b5fd' } }`: a light yellow and a light lavender, paler than every `POWER_COLORS` tile, and a
  gate never carries a number, so the two never read alike.
- **`src/boards.js`** — `parseBoard` reads `A`/`B` into `gates: [{ x, y, set }]`; `isValidBoard`
  applies §2's rule; the five boards join `BOARDS`.
- **`src/board.js`** — `createBoard(cols, rows, walls, gates)` keeps
  `board.gates: [{ x, y, set, state: 'open' | 'closing' | 'closed', warn }]`; `gateAt`,
  `closedGateAt`; `swapGates(board)` (on eat); `tickGates(board, snakeCells)` (every move);
  `reachableFrom(board, head)` for spawns; `isOccupied` counts every gate cell.
- **`src/game.js`** — `createGame` passes the board's gates; `step` ends the run with cause `gate`
  on a closed gate, calls `swapGates` after an eat (before `refill`) and `tickGates` every move.
- **`src/render.js`** — `drawGates` under the tiles; the tail tip is clipped against closed gates as
  it is against walls.
- **`src/fx.js`** — the death flash accepts `gate`.
- **`src/sound.js`** — `playGateSwap()`.
- **`src/campaign.js`** — levels 13–24 and the six act names.
- **`src/main.js`** — plays the swap sound; the map scrolls its current level into view (24 tiles
  no longer fit a phone screen at once).
- **`tools/simulate.js`** — the bot treats closed and closing gates as blocked when it path-finds,
  and a closing gate as passable for its immediate safety check.
- **`analytics/src/validate.js`** — `CAUSES` accepts `gate`. **Deploy order:** Worker first, then
  the game, as for the campaign; until then gate deaths are not counted and nothing else breaks.

## 6. Testing

- Every shipped board passes `isValidBoard` (the existing test, now over ten boards).
- Parsing: `A`/`B` become gates in the right set and state; a board with a bad letter is refused.
- Gates: a swap opens the closed set at once and starts the open set closing; closing becomes
  closed after `warnTicks` moves; a closing gate under the snake stays closing until free.
- Game: a closed gate kills with cause `gate`; a closing gate can be crossed; eating swaps.
- Spawns: no tile or obstacle on a gate; no tile in a sealed region.
- Campaign: 24 levels, ids 1–24 in order, six acts of four, unlocking still linear.
- Draw: a closed gate paints a block, an open one does not (recording-context test, like
  `test/draw.test.js`).

## 7. Next: music (separate design)

The author asked for background music, **a different track for each board**. It is its own
subsystem and gets its own short design after this one. Requirements already stated or implied:

- One track per board: ten boards after this pass (Open, The pillars, The lanes, The chambers,
  The ring and the five above). Endless and the Daily play on the open board.
- Generated like the existing sound effects (oscillators, no audio files to license or download),
  unless the music design finds that too thin.
- Obeys the existing Sound toggle; quieter than the effects; stops on game over and on leaving
  the app.

## 8. Not in this pass

Portals, timed gates, switches; gates in Endless or in the Daily; more than 24 levels; renumbering
levels 1–12; the music itself (§7).
