export const GRID = { cols: 7, rows: 11 };

export const TIMING = {
  tickStartMs: 170,   // tick interval at score 0 (gentle)
  tickFloorMs: 80,    // fastest tick interval
  tickPerPoint: 0.6,  // ms shaved off the interval per point of score
};

export const SPAWN = {
  maxTiles: 3,        // tiles kept on the board at once
  decay: 0.45,        // geometric weight per value step (lower value = far more common)
  baseValue: 2,       // smallest tile value
  window: 'max',      // 'max' = up to the snake's largest segment (spec §5); 'head' = up to the head value (playtest knob)
};

export const START = {
  snakeLength: 2,
  snakeValue: 2,                 // every starting segment holds this value
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
  swipeThresholdPx: 16, // finger travel before a swipe registers (fires on move, not on lift)
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
