# Sound, Telegraph, Teaching and Relief — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Implementation subagents run on **Sonnet**.

**Goal:** the first five improvements from the next-version list: sound, an obstacle telegraph, teaching the merge rule without words, highlighting tiles that match the head, and a cascade that buys breathing room.

**Why these five:** all of them serve the one question the prototype exists to answer — does the loop pull voluntary retries. Sound is the largest feel-per-effort win left. The telegraph removes the unfairness complaint most likely to come out of a playtest. The teaching hint and the match highlight attack "did they understand it without being told". The relief makes skill pay in time as well as points.

**Architecture:** unchanged. Two of the five touch the rules engine and are tick-based, because a grid game's natural clock is the tick, not the millisecond: an obstacle warns for a fixed number of *moves* regardless of level speed, and relief lasts a fixed number of moves. Sound lives in a new `src/sound.js` whose only testable part is pure; everything else in it is Web Audio and is verified in the browser. The match highlight is one renderer feature with two triggers, so the teaching hint and the Chill-always-on behaviour share an implementation.

**Five features, and where each lands:**

| # | Feature | Rules | Render | Main | Sound |
| - | ------- | ----- | ------ | ---- | ----- |
| 1 | Sound | – | – | wiring + mute | new module |
| 2 | Obstacle telegraph | arming | blinking block | – | thud |
| 3 | Teach the merge (first run only) | – | highlight | trigger | – |
| 4 | Highlight matching tiles (Chill always) | `matchHint` in the level | highlight | trigger | – |
| 5 | Cascade relief | `relief`, `currentTarget` | – | use it | – |

**Task order:** A (rules) first. Then B (sound module) and C (renderer) in parallel. Then D (main wiring). Then the orchestrator verifies, measures the relief's effect in the simulator, updates the guide and pushes.

---

### Task A: rules — obstacle arming and cascade relief

**Files:** `src/constants.js`, `src/board.js`, `src/game.js`, `test/board.test.js`, `test/game.test.js`

An obstacle now lands **unarmed** and blinks for `OBSTACLE.warnTicks` moves before it turns solid. While unarmed it blocks tile spawns but is harmless to touch; if the snake happens to be lying on the cell when it would arm, the obstacle is cancelled rather than killing from underneath. A cascade of `RELIEF.minMerges` or more stretches the target interval by `RELIEF.factor` for `RELIEF.ticks` moves.

New constants, new `Board.armedObstacleAt` and `Board.armObstacles`, new `game.relief` and `Game.currentTarget(game)`. `step` reports `armed` (cells that just turned solid) and `relief` (true when a cascade just bought some).

### Task B: `src/sound.js`

Oscillator-based, no assets. Created lazily on the first gesture because browsers refuse audio before one. Pure, tested part: `mergeHz(index)` and the mute-preference read/write. Everything else is Web Audio and is checked in the browser.

### Task C: renderer — blinking obstacles and match highlighting

An unarmed obstacle draws hollow and pulsing; an armed one is the solid hazard block already there. `draw` takes a `hint` flag; when set, every tile whose value equals the head's value gets a pulsing ring.

### Task D: `src/main.js` — wiring

Sound calls on eat, merge, obstacle and death; a mute toggle on the game-over panel; the hint flag computed as "Chill, or this player's very first run before their first merge"; and the interval taken from `Game.currentTarget(game)` so relief reaches the loop.

---

## Self-Review

- **Coverage:** all five improvements have a home; nothing in the list is left without a task.
- **Clock choice:** ticks, not milliseconds, for both rules features — a fixed number of moves is what the player actually perceives on a grid, and it keeps the rules engine free of wall-clock time, which is what makes it testable.
- **Shared implementation:** the teaching hint and the Chill match highlight are one renderer feature, so there is one thing to tune and one thing to remove if the playtest says it is a crutch.
