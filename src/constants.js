export const GRID = { cols: 7, rows: 11 };

export const TIMING = {
  tickStartMs: 200,   // tick interval at score 0 (gentle)
  tickFloorMs: 80,    // fastest tick interval
  tickPerPoint: 0.6,  // ms shaved off the interval per point of score
};

export const SPAWN = {
  maxTiles: 3,        // tiles kept on the board at once
  decay: 0.45,        // geometric weight per value step (lower value = far more common)
  baseValue: 2,       // smallest tile value
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
  swipeThresholdPx: 24, // finger travel before a swipe registers (fires on move, not on lift)
};
