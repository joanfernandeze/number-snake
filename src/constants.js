export const GRID = { cols: 7, rows: 11 };

// What every level shares. Anything that differs between levels lives in DIFFICULTIES.
export const TIMING = {
  smoothTauMs: 1200,    // a change in target speed eases in over roughly this long
  turnEarlyFrac: 0.55,  // a queued turn may fire its tick once this much of the slide has played
};

export const SPAWN = {
  baseValue: 2,       // smallest tile value
};

// Speed is keyed to tiles eaten, not to score: eating grows steadily with time played,
// while score arrives late and in lumps, so a score-keyed ramp put the whole climb after
// the run was effectively over. A typical run eats about 58 tiles.
export const DIFFICULTIES = {
  chill: {
    key: 'chill', name: 'Chill',
    tickStartMs: 360, tickFloorMs: 180, halfLifeEats: 20,
    maxTiles: 4, decay: 0.55, window: 'head', obstacleEvery: 15,
  },
  classic: {
    key: 'classic', name: 'Classic',
    tickStartMs: 300, tickFloorMs: 120, halfLifeEats: 14,
    maxTiles: 3, decay: 0.45, window: 'max', obstacleEvery: 10,
  },
  frenzy: {
    key: 'frenzy', name: 'Frenzy',
    tickStartMs: 240, tickFloorMs: 90, halfLifeEats: 10,
    maxTiles: 2, decay: 0.35, window: 'max', obstacleEvery: 7,
  },
};

// Obstacles are permanent, so a long run slowly runs out of room. They keep clear of the
// head when they land and avoid lining up beside each other, and they stop at a cap so the
// board never becomes unplayable.
export const OBSTACLE = {
  max: 8,           // most obstacles a board will ever hold
  minHeadDist: 4,   // Manhattan cells of clearance from the head when one lands
};

export const DEFAULT_DIFFICULTY = 'classic';
export const DIFFICULTY_KEY = 'numberSnake.difficulty';

export const START = {
  snakeLength: 1,
  snakeValue: 2,                 // a lone head; the tail is drawn, not a number, so nothing is stuck behind you
  direction: { x: 0, y: -1 },    // moving up (y grows downward on the grid)
};

// Color by power of two: index 0 -> value 2, index 1 -> value 4, ...
export const POWER_COLORS = [
  '#2dd4bf', // 2   teal
  '#3b82f6', // 4   blue
  '#8b5cf6', // 8   purple
  '#ec4899', // 16  pink
  '#f97316', // 32  orange
  '#ef4444', // 64  red
  '#f59e0b', // 128 amber
  '#22c55e', // 256 green
  '#06b6d4', // 512 cyan
  '#a855f7', // 1024 violet
];
export const FALLBACK_COLOR = '#e5e7eb';

export const STORAGE_KEY = 'numberSnake.best';

export const INPUT = {
  queueDepth: 2,        // buffered turns: a fast LEFT-then-UP lands both
  swipeThresholdPx: 12, // finger travel before a swipe registers (fires on move, not on lift)
  turnBias: 1.5,        // mid-drag axis change needs the new axis to dominate by this factor
};

export const FX = {
  burstMs: 700,         // life of a "Merge! / Combo x2 / Chain x3!" text burst
  ringMs: 220,          // life of the white merge ring
  particleMs: 500,      // life of a merge particle
  particlesPerMerge: 6, // particles per merge in the cascade ...
  particlesMax: 30,     // ... capped here, per merge event
  shakeMs: 220,
  shakeMag: 8,          // px
  readyPulseMs: 1200,   // period of the "swipe to start" pulse
};

export const DEATH = {
  flashMs: 700,         // the offending cell pulses red for this long, then stays lit
  flashPeriodMs: 230,   // one on/off pulse
  overlayDelayMs: 700,  // game-over panel appears after the flash has read
};

export const TELEMETRY = {
  storageKey: 'numberSnake.runs',
  maxRuns: 50, // newest runs kept in localStorage
};

export const UI = {
  copiedNoteMs: 1800, // how long "Copied" stays visible under the stats
};
