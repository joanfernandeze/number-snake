CREATE TABLE IF NOT EXISTS runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  received_at TEXT NOT NULL DEFAULT (datetime('now')),
  day_since INTEGER NOT NULL,
  days_played INTEGER NOT NULL,
  first_of_day INTEGER NOT NULL,
  mode TEXT NOT NULL,
  difficulty TEXT NOT NULL,
  score INTEGER NOT NULL,
  best_tile INTEGER NOT NULL,
  best_combo INTEGER NOT NULL,
  duration_ms INTEGER NOT NULL,
  eaten INTEGER NOT NULL,
  first_merge_ms INTEGER,
  level INTEGER,
  stars INTEGER,
  cause TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS runs_retention ON runs (day_since, first_of_day);
