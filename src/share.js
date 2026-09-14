import { GAME } from './constants.js';

// The share card: spoiler-free text in the Wordle tradition. Pure, so the exact wording is tested.
export function shareText({ daily = null, level = 'Classic', bestTile, durationMs, streak = 0 }) {
  const head = daily ? `${GAME.name} · Daily #${daily}` : `${GAME.name} · ${level}`;
  const parts = [`🐍 Best tile ${bestTile}`, `${Math.round(durationMs / 1000)} s`];
  if (daily && streak > 0) parts.push(`🔥 ${streak}-day streak`);
  return `${head}\n${parts.join(' · ')}\n${GAME.url}`;
}
