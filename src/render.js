import { GRID, POWER_COLORS, FALLBACK_COLOR } from './constants.js';

let shakeUntil = 0, shakeMag = 0;
let flashes = []; // {x, y, t} merge pops in grid coords, t = frames remaining

export function flash(ev) {
  if (ev && ev.cell) flashes.push({ x: ev.cell.x, y: ev.cell.y, t: 12 });
}

export function shake(ms = 220, mag = 8) {
  shakeUntil = performance.now() + ms;
  shakeMag = mag;
}

function colorFor(value) {
  const idx = Math.round(Math.log2(value / 2));
  return POWER_COLORS[idx] || FALLBACK_COLOR;
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
  const pad = cell * 0.08;
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

// Draw one frame.
//   progress: 0..1 fraction toward the next tick (for slide interpolation)
//   slide: the snake's direction to interpolate along, or null to snap (eat ticks)
export function draw(ctx, canvas, game, progress, slide) {
  const cols = GRID.cols, rows = GRID.rows;
  const cell = Math.floor(Math.min(canvas.width / cols, canvas.height / rows));
  const ox = Math.floor((canvas.width - cell * cols) / 2);
  const oy = Math.floor((canvas.height - cell * rows) / 2);

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();

  // screen shake
  if (performance.now() < shakeUntil) {
    ctx.translate((Math.random() - 0.5) * shakeMag, (Math.random() - 0.5) * shakeMag);
  }

  // board background grid
  ctx.fillStyle = 'rgba(255,255,255,0.03)';
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      roundRect(ctx, ox + x * cell + 2, oy + y * cell + 2, cell - 4, cell - 4, 6);
      ctx.fill();
    }
  }

  // tiles
  for (const t of game.board.tiles) {
    const px = ox + t.x * cell, py = oy + t.y * cell;
    drawCell(ctx, px, py, cell, colorFor(t.value), false);
    drawNumber(ctx, px, py, cell, t.value);
  }

  // snake (slide the whole body by the un-elapsed fraction on a normal move)
  const offx = slide ? -slide.x * (1 - progress) * cell : 0;
  const offy = slide ? -slide.y * (1 - progress) * cell : 0;
  for (let i = 0; i < game.snake.cells.length; i++) {
    const c = game.snake.cells[i];
    const px = ox + c.x * cell + offx;
    const py = oy + c.y * cell + offy;
    drawCell(ctx, px, py, cell, colorFor(game.snake.values[i]), i === 0);
    drawNumber(ctx, px, py, cell, game.snake.values[i]);
  }

  // merge flashes
  flashes = flashes.filter(f => f.t > 0);
  for (const f of flashes) {
    const px = ox + f.x * cell, py = oy + f.y * cell;
    ctx.strokeStyle = `rgba(255,255,255,${f.t / 12})`;
    ctx.lineWidth = 3;
    const grow = (12 - f.t) * 2;
    roundRect(ctx, px - grow, py - grow, cell + grow * 2, cell + grow * 2, cell * 0.3);
    ctx.stroke();
    f.t -= 1;
  }

  ctx.restore();
}
