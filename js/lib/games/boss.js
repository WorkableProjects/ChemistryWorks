// Boss Battle: questions are attacks on a boss with a health bar. Harder questions (more points) hit harder; a wrong
// answer lets the boss hit back and costs a life. Scoring is the Survival core (applySurvivalAnswer) plus a win bonus.

import { SURVIVAL_TYPES, sortSurvival, applySurvivalAnswer } from './survival.js';
import { questionAvailability } from './common.js';

export const BOSS_TYPES = [...SURVIVAL_TYPES];
export const DAMAGE_PER_POINT = 10;
export const BOSS_HEALTH_SHARE = 0.7; // the boss has 70% of the damage the whole question set can deal, so ~70% right wins
export const VICTORY_BONUS = 500;
export const LIFE_BONUS = 100;
export const BOSS_NAME = 'Captain Corrode';

const weight = (q) => { const n = Number(q && q.points); return Number.isFinite(n) && n > 0 ? n : 1; };

/** Damage of a correct answer; each answer already in the streak adds 10% (up to +50%). */
export function bossDamage(q, streak = 0) {
  const bonus = 1 + Math.min(5, Math.max(0, Number(streak) || 0)) * 0.1;
  return Math.round(DAMAGE_PER_POINT * weight(q) * bonus);
}

/** Boss health for a question set (at least one hit's worth). */
export function bossMaxHealth(questions) {
  const total = (Array.isArray(questions) ? questions : []).reduce((s, q) => s + bossDamage(q, 0), 0);
  return Math.max(DAMAGE_PER_POINT, Math.round(total * BOSS_HEALTH_SHARE));
}

/** Questions easy to hard, so the strongest attacks come last. */
export const bossOrder = (questions, rand) => sortSurvival(questions, rand);

/**
 * One exchange. state = { health, maxHealth, lives, maxLives, streak, score }.
 * Returns the new state plus { damage, bossHit, defeated, over, lifeGained, points }.
 */
export function applyBossAnswer(state, q, correct) {
  const sv = applySurvivalAnswer({ lives: state.lives, streak: state.streak, maxLives: state.maxLives }, { correct, points: weight(q) });
  const damage = correct ? bossDamage(q, state.streak) : 0;
  const health = Math.max(0, state.health - damage);
  const defeated = health === 0;
  const bonus = defeated ? VICTORY_BONUS + LIFE_BONUS * sv.lives : 0;
  return {
    ...state, health, lives: sv.lives, streak: sv.streak, score: state.score + sv.points + bonus,
    damage, bossHit: !correct, defeated, over: defeated || sv.over, lifeGained: sv.lifeGained, points: sv.points + bonus,
  };
}

export const boss = {
  id: 'boss',
  title: 'Boss Battle',
  blurb: 'Answer to attack the boss. Hard questions hit harder; wrong answers let it hit back.',
  icon: 'alert',
  playableTypes: BOSS_TYPES,
  minQuestions: 3,
  scored: true,
  availability: (test) => questionAvailability(test, BOSS_TYPES, 3, 'auto-graded'),
};
