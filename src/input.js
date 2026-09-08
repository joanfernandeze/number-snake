import { INPUT } from './constants.js';

// Pure helper: convert a swipe delta into a unit direction (or null if too small).
export function swipeDirection(dx, dy, threshold = INPUT.swipeThresholdPx) {
  if (Math.abs(dx) < threshold && Math.abs(dy) < threshold) return null;
  if (Math.abs(dx) > Math.abs(dy)) return { x: dx > 0 ? 1 : -1, y: 0 };
  return { x: 0, y: dy > 0 ? 1 : -1 };
}

// Pure swipe state machine. Feed it pointer positions; it returns a direction the
// moment the pointer has travelled `threshold` px from its anchor, then re-anchors
// there so one continuous drag can steer through several turns without lifting.
export function createSwipeTracker(threshold = INPUT.swipeThresholdPx) {
  let ax = 0, ay = 0, tracking = false;
  return {
    start(x, y) { ax = x; ay = y; tracking = true; },
    move(x, y) {
      if (!tracking) return null;
      const d = swipeDirection(x - ax, y - ay, threshold);
      if (d) { ax = x; ay = y; }
      return d;
    },
    end() { tracking = false; },
    get tracking() { return tracking; },
  };
}

const KEY_DIRS = {
  ArrowUp: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 },
  ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 },
  w: { x: 0, y: -1 }, s: { x: 0, y: 1 }, a: { x: -1, y: 0 }, d: { x: 1, y: 0 },
};

// Wire DOM input. `onDir(dir)` is called with a unit direction vector.
export function initInput(target, onDir) {
  window.addEventListener('keydown', (e) => {
    const d = KEY_DIRS[e.key] || KEY_DIRS[e.key.toLowerCase()]; // WASD with Shift/CapsLock too
    if (d) { e.preventDefault(); onDir(d); }
  });

  const tracker = createSwipeTracker();
  const emit = (d) => { if (d) onDir(d); };

  target.addEventListener('touchstart', (e) => {
    const t = e.changedTouches[0]; tracker.start(t.clientX, t.clientY);
  }, { passive: true });
  target.addEventListener('touchmove', (e) => {
    const t = e.changedTouches[0]; emit(tracker.move(t.clientX, t.clientY));
  }, { passive: true });
  target.addEventListener('touchend', () => tracker.end(), { passive: true });
  target.addEventListener('touchcancel', () => tracker.end(), { passive: true });

  target.addEventListener('mousedown', (e) => tracker.start(e.clientX, e.clientY));
  window.addEventListener('mousemove', (e) => { if (tracker.tracking) emit(tracker.move(e.clientX, e.clientY)); });
  window.addEventListener('mouseup', () => tracker.end());
}
