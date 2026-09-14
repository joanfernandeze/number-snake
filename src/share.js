import { GAME } from './constants.js';

// The share card: spoiler-free text in the Wordle tradition. Pure, so the exact wording is tested.
// A campaign card leads with the level and its stars; a daily with its number; free play with the
// level name. The streak only ever appears on a daily.
export function shareText({ daily = null, level = 'Classic', campaignLevel = null, stars = 0, bestTile, durationMs, streak = 0 }) {
  let head;
  if (campaignLevel != null) {
    const n = Math.max(0, Math.min(3, stars));
    head = `${GAME.name} · Level ${campaignLevel} ${'★'.repeat(n)}${'☆'.repeat(3 - n)}`;
  } else if (daily != null) {
    head = `${GAME.name} · Daily #${daily}`;
  } else {
    head = `${GAME.name} · ${level}`;
  }
  const parts = [`🐍 Best tile ${bestTile}`, `${Math.round(durationMs / 1000)} s`];
  if (campaignLevel == null && daily != null && streak > 0) parts.push(`🔥 ${streak}-day streak`);
  return `${head}\n${parts.join(' · ')}\n${GAME.url}`;
}
