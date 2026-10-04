# Music — Design

**Date:** 2026-10-03
**Author:** Joan Fernández Esmerats (with Claude)
**Status:** Approved section by section (engine and tracks; lifecycle and controls).
**Builds on:** the sound effects in `src/sound.js` and `2026-09-30-gates-and-acts-4-6-design.md` §7, where
the author asked for background music with **a different track for each board**.

---

## 1. Decisions

| Question | Decision |
| --- | --- |
| Where the music comes from | Generated in code with Web Audio, like the sound effects: nothing to download, nothing to license |
| Does it react to play | Its tempo follows the snake's speed; each board keeps its own melody |
| How it is controlled | Its own `Music: on/off` button beside `Sound: on/off`, remembered between runs |
| How it is built | A look-ahead scheduler on the audio clock (below), not one note per move (turns that fire early would make the rhythm limp) and not a pre-rendered loop played faster (pitch would rise with speed) |

## 2. The engine

`src/music.js`, beside `src/sound.js`.

- **Scheduler.** A timer every `MUSIC.timerMs` (25 ms) schedules every step whose start falls before
  `audioContext.currentTime + MUSIC.lookaheadMs` (100 ms). Timing comes from the audio clock, so the
  rhythm stays exact however the page's frames stutter.
- **Steps.** A bar is 16 steps (sixteenth notes). A step lasts `60 / bpm / 4` seconds.
- **Voices.** Four per track: **bass** (an octave below the root), **arp** (at the root octave),
  **lead** (an octave above) and **hat** (a short burst of filtered noise). Each note is one oscillator
  with a quick attack and an exponential fall, the same shape the effects use, so nothing clicks.
- **Tempo follows speed.** The game loop already holds the smoothed interval between moves (ms). The
  music maps it linearly to a tempo, clamped: an interval of `MUSIC.slowMs` (360 ms) or slower plays at
  `MUSIC.bpmMin` (90 BPM), `MUSIC.fastMs` (120 ms) or faster at `MUSIC.bpmMax` (150 BPM). Because the
  interval is already eased, the tempo never jumps; the clamp keeps the fastest levels musical rather
  than frantic.
- **Mix.** `MUSIC.gain` is about a third of the effects' gain (`SOUND.gain` 0.06 → 0.02), so eating,
  merging, the gate click and the death and win sounds stay on top.

## 3. Tracks

One track per board, as data in `src/tracks.js` (data kept apart from the engine): a root note (MIDI number), a scale (semitone steps from the root, starting at 0, ascending,
within 0–11), a waveform per voice, and four 16-step patterns. A pattern step is a scale degree (an
integer; 0 is the root, `scale.length` is the root an octave up, negatives go down) or `null` for a rest;
the hat pattern holds `0`/`1`.

| Board | Character | Scale |
| --- | --- | --- |
| Open | bright, the default | major pentatonic |
| The pillars | open, floating | lydian |
| The lanes | driving bass | dorian |
| The chambers | serious | natural minor |
| The ring | tense | phrygian |
| The door | playful | mixolydian |
| The locks | syncopated | dorian, a different root and rhythm from the lanes |
| The halves | question and answer | major |
| The rooms | mysterious | melodic minor |
| The vault | the finale | harmonic minor |

Endless and the Daily play on the open board, so they play Open's track. A test enforces that every
board in `BOARDS` has a track and that every track is well formed (§6).

## 4. When it plays

- **Starts on the run's first move**, with the track of the run's board. Not before: phones only allow
  audio after a touch, and the first swipe is that touch. The map and the goal card are silent.
- **Stops when the run ends**, death or victory, fading out over `MUSIC.fadeMs` (500 ms) so the death
  slide or the victory chord sounds clean. Retry starts the track again from its first bar.
- **Pauses when the page is hidden** (`visibilitychange`: another app, a locked phone) and resumes when
  it comes back, so it never plays in the background.
- **Tempo** is updated from the game loop every frame with the current interval.

## 5. Control

- A `Music: on/off` button beside `Sound: on/off` on the end-of-run panel. **On by default.** Stored in
  `localStorage['numberSnake.music']` exactly as the sound setting is stored (a corrupt or missing value
  means on).
- The button lives on the end-of-run panel, so a change applies from the next run; turning it off also stops anything still fading out.
- The two buttons are independent: music only, effects only, both or neither.

## 6. Modules and testing

- **`src/constants.js`** — `MUSIC = { storageKey, gain, bpmMin, bpmMax, slowMs, fastMs, timerMs,
  lookaheadMs, fadeMs }` with the values above.
- **`src/music.js`** — pure helpers, exported and unit-tested:
  `bpmFor(intervalMs)` (the clamped linear map), `stepSeconds(bpm)`, `stepsDue(nextTime, stepSec,
  until)` (the start times the scheduler must play in one window), `pitchHz(track, voice, degree)`,
  `loadMuted` / `saveMuted`. The live part — `start(boardKey)`, `stop()`,
  `setTempoFromInterval(ms)`, `pause()`, `resume()`, `setMuted(v)`, `isMuted()` — uses Web Audio and is a no-op
  where there is none (Node), like `sound.js`.
- **`src/tracks.js`** — `TRACKS` keyed by board key and `trackFor(boardKey)`.
- **`src/main.js`** — starts the music with the run's board on the first move, feeds it the interval
  each frame, stops it in the game-over path, wires the button and `visibilitychange`.
- **`index.html`** — the `Music` button beside `Sound`.
- **Tests** (`test/music.test.js`): every board has a track; every track's scale and patterns are well
  formed (16 steps, integer degrees or null, hat 0/1, scale ascending from 0 within 0–11); `bpmFor`
  hits both clamps and is linear between; `stepsDue` returns exactly the steps in a window and none
  twice across consecutive windows; `pitchHz` puts the root at the right frequency per voice octave;
  `loadMuted` / `saveMuted` round-trip and default to on. The audible result is checked by ear in a
  browser.

## 7. Not in this pass

Layers that build up as the goal nears; a volume slider; music on the map; recorded audio; different
music per mode on the open board.
