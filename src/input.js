// Pure helper: convert a swipe delta into a unit direction (or null if too small).
export function swipeDirection(dx, dy, threshold = 20) {
  if (Math.abs(dx) < threshold && Math.abs(dy) < threshold) return null;
  if (Math.abs(dx) > Math.abs(dy)) return { x: dx > 0 ? 1 : -1, y: 0 };
  return { x: 0, y: dy > 0 ? 1 : -1 };
}

const KEY_DIRS = {
  ArrowUp: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 },
  ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 },
  w: { x: 0, y: -1 }, s: { x: 0, y: 1 }, a: { x: -1, y: 0 }, d: { x: 1, y: 0 },
};

// Wire DOM input. `onDir(dir)` is called with a unit direction vector.
export function initInput(target, onDir) {
  window.addEventListener('keydown', (e) => {
    const d = KEY_DIRS[e.key];
    if (d) { e.preventDefault(); onDir(d); }
  });

  let sx = 0, sy = 0, tracking = false;
  const startPt = (x, y) => { sx = x; sy = y; tracking = true; };
  const endPt = (x, y) => {
    if (!tracking) return;
    tracking = false;
    const d = swipeDirection(x - sx, y - sy);
    if (d) onDir(d);
  };

  target.addEventListener('touchstart', (e) => {
    const t = e.changedTouches[0]; startPt(t.clientX, t.clientY);
  }, { passive: true });
  target.addEventListener('touchend', (e) => {
    const t = e.changedTouches[0]; endPt(t.clientX, t.clientY);
  }, { passive: true });
  target.addEventListener('mousedown', (e) => startPt(e.clientX, e.clientY));
  window.addEventListener('mouseup', (e) => endPt(e.clientX, e.clientY));
}
