import { FX, DEATH } from './constants.js';

// Pure FX state. Times are ms (performance.now()), positions are grid cells.
// render.js reads this; main.js feeds it. Nothing here touches the DOM.
export function createFx() {
  return {
    rings: [],      // {x, y, born, life}                  white ring at the merge cell
    bursts: [],     // {text, x, y, level, color, born, life} "Merge!" text rising from the cell
    particles: [],  // {x, y, vx, vy, color, born, life}   x/y in cells, vx/vy in cells per second
    shake: null,    // {until, mag}
    death: null,    // {type: 'wall'|'self', cell, born, life}  persists until the next run
  };
}

// Text for a cascade of `merges` merges resolved from one bite (spec §7).
export function labelFor(merges) {
  if (merges <= 0) return null;
  if (merges === 1) return 'Merge!';
  if (merges === 2) return 'Combo x2';
  return `Chain x${merges}!`;
}

// Register the FX for one eat that produced `merges` merges at grid `cell`.
// `color` is the colour of the new head value. `rand` is injectable for tests.
export function addMerge(fx, cell, merges, color, now, rand = Math.random) {
  if (merges <= 0) return;
  fx.rings.push({ x: cell.x, y: cell.y, born: now, life: FX.ringMs });
  fx.bursts.push({ text: labelFor(merges), x: cell.x, y: cell.y, level: merges, color, born: now, life: FX.burstMs });
  const n = Math.min(FX.particlesMax, FX.particlesPerMerge * merges);
  for (let i = 0; i < n; i++) {
    const angle = rand() * Math.PI * 2;
    const speed = 0.6 + rand() * 0.9; // cells per second
    fx.particles.push({
      x: cell.x + 0.5, y: cell.y + 0.5,
      vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
      color, born: now, life: FX.particleMs,
    });
  }
}

export function addShake(fx, now, ms = FX.shakeMs, mag = FX.shakeMag) {
  fx.shake = { until: now + ms, mag };
}

// Mark the cell the head tried to enter when the run ended (spec §8).
export function addDeath(fx, cause, now) {
  fx.death = { type: cause.type, cell: { ...cause.cell }, born: now, life: DEATH.flashMs };
}

// Age 0..1 of an FX item at `now`, or null once expired.
export function ageOf(item, now) {
  const a = (now - item.born) / item.life;
  return a >= 1 ? null : Math.max(0, a);
}

// Advance the FX by dtMs: move particles, drop expired items, end a finished shake.
// The death marker is never dropped here; createFx() on restart clears it.
export function update(fx, now, dtMs) {
  const dt = dtMs / 1000;
  for (const p of fx.particles) { p.x += p.vx * dt; p.y += p.vy * dt; }
  fx.rings = fx.rings.filter(r => ageOf(r, now) !== null);
  fx.bursts = fx.bursts.filter(b => ageOf(b, now) !== null);
  fx.particles = fx.particles.filter(p => ageOf(p, now) !== null);
  if (fx.shake && now >= fx.shake.until) fx.shake = null;
}
