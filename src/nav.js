// What the Android back button does in each state of the game (spec 2026-10-04 §4):
//   the map is open                       → 'minimize' (leave the app the Android way)
//   a run is moving                       → 'pause'
//   anything else (paused, not started,
//   the end-of-run panel, the death flash) → 'map' (a paused or unstarted run is abandoned)
// state: { mapOpen, panelOpen, started, over, paused }
export function backAction(state) {
  if (state.mapOpen) return 'minimize';
  if (state.started && !state.over && !state.paused) return 'pause';
  return 'map';
}

// The run's start time after a pause from `pausedAt` to `now`: moved forward by the paused span, so
// the elapsed time — a `time ≤ T` star, the telemetry's duration — never counts a phone call.
export function shiftForPause(t0, pausedAt, now) {
  return t0 === null ? null : t0 + (now - pausedAt);
}
