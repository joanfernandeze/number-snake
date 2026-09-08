import { createRng } from './rng.js';
import * as Game from './game.js';
import * as Render from './render.js';
import * as Snake from './snake.js';
import { initInput } from './input.js';
import { STORAGE_KEY } from './constants.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const $ = (id) => document.getElementById(id);

function loadBest() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || { tile: 0, score: 0 }; }
  catch { return { tile: 0, score: 0 }; }
}
function saveBest(b) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(b)); } catch { /* ignore */ }
}

let best = loadBest();
let game, lastTick, lastWasEat;

function start() {
  const seed = (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0;
  game = Game.createGame(createRng(seed));
  lastTick = performance.now();
  lastWasEat = false;
  $('overlay').classList.add('hidden');
}

function onGameOver() {
  Render.shake();
  if (game.bestTile > best.tile) best.tile = game.bestTile;
  if (game.score > best.score) best.score = game.score;
  saveBest(best);
  $('ovTile').textContent = game.bestTile;
  $('ovScore').textContent = game.score;
  $('ovCombo').textContent = game.bestCombo;
  $('ovBestTile').textContent = best.tile;
  $('ovBestScore').textContent = best.score;
  setTimeout(() => $('overlay').classList.remove('hidden'), 400);
}

function frame(now) {
  const interval = Game.tickInterval(game.score);
  let progress = Math.min(1, (now - lastTick) / interval);

  if (!game.over && now - lastTick >= interval) {
    const ev = Game.step(game);
    lastTick = now;
    progress = 0;
    lastWasEat = !!ev.ate;
    if (ev.ate && ev.merges > 0) Render.flash(ev);
    if (ev.over) onGameOver();
  }

  $('score').textContent = game.score;
  $('bestTile').textContent = Math.max(best.tile, game.bestTile);
  Render.draw(ctx, canvas, game, progress, lastWasEat ? null : game.snake.direction);
  requestAnimationFrame(frame);
}

initInput(canvas, (dir) => { if (game && !game.over) Snake.setDirection(game.snake, dir); });
$('playAgain').addEventListener('click', start);

start();
requestAnimationFrame(frame);
