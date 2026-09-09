import { GRID, POWER_COLORS, FALLBACK_COLOR, FX, DEATH } from './constants.js';
import { ageOf } from './fx.js';
import { nextDirection } from './snake.js';

// Pure view. draw() reads game + fx state and paints one frame in CSS pixels;
// main.js has already scaled the context by devicePixelRatio.

export function colorFor(value) {
  const idx = Math.round(Math.log2(value / 2));
  return POWER_COLORS[idx] || FALLBACK_COLOR;
}

// Grid geometry for a logical (CSS-pixel) viewport.
export function layout(view, cols = GRID.cols, rows = GRID.rows) {
  const cell = Math.floor(Math.min(view.width / cols, view.height / rows));
  return {
    cell, cols, rows,
    ox: Math.floor((view.width - cell * cols) / 2),
    oy: Math.floor((view.height - cell * rows) / 2),
  };
}

export const PAD = 0.08; // padding around a segment or tile, as a fraction of the cell

// Eye centres relative to the head centre (px) for heading `dir`: on the leading
// edge, spread across it, clear of the number.
export function eyeOffsets(dir, cell) {
  const forward = cell * 0.36, spread = cell * 0.18;
  const px = -dir.y, py = dir.x; // perpendicular to the heading
  return [
    { dx: dir.x * forward + px * spread, dy: dir.y * forward + py * spread },
    { dx: dir.x * forward - px * spread, dy: dir.y * forward - py * spread },
  ];
}

// Where the tail tip points: away from the segment before it, or straight back from
// the heading when the snake is a single segment.
export function tailDirection(snake) {
  const n = snake.cells.length;
  if (n >= 2) {
    const a = snake.cells[n - 2], b = snake.cells[n - 1];
    return { x: Math.sign(b.x - a.x), y: Math.sign(b.y - a.y) };
  }
  // `|| 0` turns a negated 0 back into +0: direction components are -1/0/1,
  // so this never touches a real -1.
  return { x: -snake.direction.x || 0, y: -snake.direction.y || 0 };
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawCell(ctx, px, py, cell, color, isHead) {
  const pad = cell * PAD;
  if (isHead) {
    ctx.shadowColor = color;
    ctx.shadowBlur = 18;
  }
  ctx.fillStyle = color;
  roundRect(ctx, px + pad, py + pad, cell - pad * 2, cell - pad * 2, cell * 0.22);
  ctx.fill();
  ctx.shadowBlur = 0;
}

function drawNumber(ctx, px, py, cell, value) {
  ctx.fillStyle = '#0b1020';
  ctx.font = `800 ${Math.floor(cell * (value >= 100 ? 0.32 : 0.42))}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(value), px + cell / 2, py + cell / 2 + 1);
}

// Fill the gap between two neighbouring segments so the body reads as one snake.
// Each half takes its own segment's colour. `vertical` comes from the grid cells, so
// the bridge stays axis-aligned while the head slides in on an eat tick.
function drawBridge(ctx, a, b, cell, colorA, colorB, vertical) {
  const pad = cell * PAD, w = cell - pad * 2;
  const acx = a.px + cell / 2, acy = a.py + cell / 2;
  const bcx = b.px + cell / 2, bcy = b.py + cell / 2;
  const mx = (acx + bcx) / 2, my = (acy + bcy) / 2;
  if (vertical) {
    const x = a.px + pad;
    ctx.fillStyle = colorA; ctx.fillRect(x, Math.min(acy, my), w, Math.abs(my - acy));
    ctx.fillStyle = colorB; ctx.fillRect(x, Math.min(bcy, my), w, Math.abs(my - bcy));
  } else {
    const y = a.py + pad;
    ctx.fillStyle = colorA; ctx.fillRect(Math.min(acx, mx), y, Math.abs(mx - acx), w);
    ctx.fillStyle = colorB; ctx.fillRect(Math.min(bcx, mx), y, Math.abs(mx - bcx), w);
  }
}

// A tapered tip behind the last segment: the snake has a tail, not a junk number.
// Its base starts inside the segment body (the segment paints over it) and it is
// clipped to the board so it never spills over the wall frame.
function drawTail(ctx, L, last, snake) {
  const d = tailDirection(snake);
  const cell = L.cell, pad = cell * PAD;
  const cx = last.px + cell / 2, cy = last.py + cell / 2;
  const half = (cell - pad * 2) / 2 * 0.8;     // a little narrower than the body
  const base = cell / 2 - pad * 2;             // inside the body's back edge
  const len = cell * 0.55;                     // how far the tip reaches past the body
  const bx = cx + d.x * base, by = cy + d.y * base;
  const ax = cx + d.x * (base + len), ay = cy + d.y * (base + len);
  const px = -d.y, py = d.x;
  ctx.save();
  ctx.beginPath();
  ctx.rect(L.ox, L.oy, L.cols * cell, L.rows * cell);
  ctx.clip();
  ctx.fillStyle = colorFor(snake.values[snake.values.length - 1]);
  ctx.beginPath();
  ctx.moveTo(bx + px * half, by + py * half);
  ctx.quadraticCurveTo(ax + px * half * 0.3, ay + py * half * 0.3, ax, ay);
  ctx.quadraticCurveTo(ax - px * half * 0.3, ay - py * half * 0.3, bx - px * half, by - py * half);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawHeadOutline(ctx, px, py, cell) {
  const pad = cell * PAD;
  ctx.lineWidth = Math.max(2, cell * 0.06);
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  roundRect(ctx, px + pad, py + pad, cell - pad * 2, cell - pad * 2, cell * 0.22);
  ctx.stroke();
}

// Two eyes on the leading edge, pupils nudged forward. `dir` is the direction the
// next tick will take, so a queued turn shows immediately.
function drawEyes(ctx, cx, cy, cell, dir) {
  const r = Math.max(2, cell * 0.075), pupil = r * 0.5;
  for (const e of eyeOffsets(dir, cell)) {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(cx + e.dx, cy + e.dy, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#0b1020';
    ctx.beginPath(); ctx.arc(cx + e.dx + dir.x * r * 0.35, cy + e.dy + dir.y * r * 0.35, pupil, 0, Math.PI * 2); ctx.fill();
  }
}

// A red frame just inside the board edge: the boundary is death, say so before contact.
// The canvas is clipped by CSS `border-radius: 16px`, so the frame keeps at least that
// corner radius and sits a full line width inside; otherwise small phone cells would
// lose the corners — exactly where two walls meet.
function drawWalls(ctx, L) {
  const lw = Math.max(3, L.cell * 0.07);
  const r = Math.max(L.cell * 0.25, 16);
  ctx.save();
  ctx.lineWidth = lw;
  ctx.strokeStyle = 'rgba(239,68,68,0.85)';
  ctx.shadowColor = 'rgba(239,68,68,0.9)';
  ctx.shadowBlur = lw * 3;
  roundRect(ctx, L.ox + lw, L.oy + lw, L.cols * L.cell - lw * 2, L.rows * L.cell - lw * 2, r);
  ctx.stroke();
  ctx.restore();
}

function drawBoard(ctx, L) {
  ctx.fillStyle = 'rgba(255,255,255,0.03)';
  for (let y = 0; y < L.rows; y++) {
    for (let x = 0; x < L.cols; x++) {
      roundRect(ctx, L.ox + x * L.cell + 2, L.oy + y * L.cell + 2, L.cell - 4, L.cell - 4, 6);
      ctx.fill();
    }
  }
}

function drawTiles(ctx, L, tiles) {
  for (const t of tiles) {
    const px = L.ox + t.x * L.cell, py = L.oy + t.y * L.cell;
    drawCell(ctx, px, py, L.cell, colorFor(t.value), false);
    drawNumber(ctx, px, py, L.cell, t.value);
  }
}

// motion.kind: 'slide' = whole body glides from its previous cells (normal move)
//              'grow'  = only the head glides in; the body did not move (eat tick)
//              'none'  = draw at rest (waiting to start, or game over)
function drawSnake(ctx, L, snake, motion) {
  const f = motion.kind === 'none' ? 0 : 1 - motion.progress;
  const dx = -motion.dir.x * f * L.cell, dy = -motion.dir.y * f * L.cell;
  const pos = snake.cells.map((c, i) => {
    const moves = motion.kind === 'slide' || (motion.kind === 'grow' && i === 0);
    return { px: L.ox + c.x * L.cell + (moves ? dx : 0), py: L.oy + c.y * L.cell + (moves ? dy : 0) };
  });
  // Bridges first so the segments paint over their ends.
  for (let i = 0; i < pos.length - 1; i++) {
    const vertical = snake.cells[i].x === snake.cells[i + 1].x;
    drawBridge(ctx, pos[i], pos[i + 1], L.cell, colorFor(snake.values[i]), colorFor(snake.values[i + 1]), vertical);
  }
  drawTail(ctx, L, pos[pos.length - 1], snake);
  for (let i = pos.length - 1; i >= 0; i--) { // tail first so the head paints on top
    drawCell(ctx, pos[i].px, pos[i].py, L.cell, colorFor(snake.values[i]), i === 0);
    drawNumber(ctx, pos[i].px, pos[i].py, L.cell, snake.values[i]);
  }
  const h = pos[0];
  drawHeadOutline(ctx, h.px, h.py, L.cell);
  drawEyes(ctx, h.px + L.cell / 2, h.py + L.cell / 2, L.cell, nextDirection(snake));
}

// The cell the head tried to enter: a red pulse on a body cell, or a red bar on
// the wall edge it crossed. Pulses for DEATH.flashMs, then stays lit.
function drawDeath(ctx, L, fx, now) {
  const d = fx.death;
  if (!d) return;
  const t = now - d.born;
  const on = t >= d.life || Math.floor(t / (DEATH.flashPeriodMs / 2)) % 2 === 0;
  ctx.fillStyle = on ? 'rgba(239,68,68,0.9)' : 'rgba(239,68,68,0.25)';
  const c = d.cell;
  if (d.type === 'self') {
    roundRect(ctx, L.ox + c.x * L.cell, L.oy + c.y * L.cell, L.cell, L.cell, L.cell * 0.22);
    ctx.fill();
    return;
  }
  const bar = Math.max(4, L.cell * 0.14);
  if (c.x < 0) ctx.fillRect(L.ox, L.oy + c.y * L.cell, bar, L.cell);
  else if (c.x >= L.cols) ctx.fillRect(L.ox + L.cols * L.cell - bar, L.oy + c.y * L.cell, bar, L.cell);
  else if (c.y < 0) ctx.fillRect(L.ox + c.x * L.cell, L.oy, L.cell, bar);
  else ctx.fillRect(L.ox + c.x * L.cell, L.oy + L.rows * L.cell - bar, L.cell, bar);
}

function drawRings(ctx, L, fx, now) {
  ctx.lineWidth = 3;
  for (const r of fx.rings) {
    const a = ageOf(r, now);
    if (a === null) continue;
    const grow = a * L.cell * 0.5;
    ctx.strokeStyle = `rgba(255,255,255,${1 - a})`;
    roundRect(ctx, L.ox + r.x * L.cell - grow, L.oy + r.y * L.cell - grow, L.cell + grow * 2, L.cell + grow * 2, L.cell * 0.3);
    ctx.stroke();
  }
}

function drawParticles(ctx, L, fx, now) {
  for (const p of fx.particles) {
    const a = ageOf(p, now);
    if (a === null) continue;
    const size = L.cell * 0.14 * (1 - a);
    ctx.globalAlpha = 1 - a;
    ctx.fillStyle = p.color;
    ctx.fillRect(L.ox + p.x * L.cell - size / 2, L.oy + p.y * L.cell - size / 2, size, size);
  }
  ctx.globalAlpha = 1;
}

// "Merge!" text rises from the merge cell; bigger and bolder for longer cascades.
function drawBursts(ctx, L, fx, now) {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const left = L.ox, right = L.ox + L.cols * L.cell;
  for (const b of fx.bursts) {
    const a = ageOf(b, now);
    if (a === null) continue;
    const scale = Math.min(2, 1 + 0.3 * (b.level - 1));
    const size = Math.floor(L.cell * 0.36 * scale);
    ctx.font = `900 ${size}px system-ui, sans-serif`;
    const half = ctx.measureText(b.text).width / 2 + 4;
    const x = Math.min(right - half, Math.max(left + half, L.ox + (b.x + 0.5) * L.cell));
    const y = Math.max(L.oy + size, L.oy + (b.y + 0.5) * L.cell - L.cell * 0.6 - a * L.cell * 0.9);
    ctx.globalAlpha = 1 - a * a;
    ctx.lineWidth = Math.max(2, size * 0.18);
    ctx.strokeStyle = b.color;
    ctx.strokeText(b.text, x, y);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(b.text, x, y);
  }
  ctx.globalAlpha = 1;
}

// Shown while the run waits for the player's first input.
function drawReady(ctx, L, now) {
  const pulse = 0.55 + 0.45 * Math.sin((now / FX.readyPulseMs) * Math.PI * 2);
  const cx = L.ox + (L.cols * L.cell) / 2;
  const cy = L.oy + L.rows * L.cell * 0.3;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.globalAlpha = pulse;
  ctx.fillStyle = '#e5e7eb';
  ctx.font = `800 ${Math.floor(L.cell * 0.42)}px system-ui, sans-serif`;
  ctx.fillText('SWIPE TO START', cx, cy);
  ctx.globalAlpha = 0.8;
  ctx.fillStyle = '#93a4c3';
  ctx.font = `600 ${Math.floor(L.cell * 0.24)}px system-ui, sans-serif`;
  ctx.fillText('or press an arrow key', cx, cy + L.cell * 0.55);
  ctx.globalAlpha = 1;
}

// Draw one frame. `view` is {width, height} in CSS px; `now` is performance.now().
export function draw(ctx, view, game, fx, now, motion) {
  const L = layout(view);
  ctx.clearRect(0, 0, view.width, view.height);
  ctx.save();
  if (fx.shake && now < fx.shake.until) {
    ctx.translate((Math.random() - 0.5) * fx.shake.mag, (Math.random() - 0.5) * fx.shake.mag);
  }
  drawBoard(ctx, L);
  drawWalls(ctx, L);
  drawTiles(ctx, L, game.board.tiles);
  drawSnake(ctx, L, game.snake, motion);
  drawDeath(ctx, L, fx, now);
  drawRings(ctx, L, fx, now);
  drawParticles(ctx, L, fx, now);
  drawBursts(ctx, L, fx, now);
  if (!game.started && !game.over) drawReady(ctx, L, now);
  ctx.restore();
}
