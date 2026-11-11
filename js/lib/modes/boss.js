// Boss Battle: each answer is an attack. Harder questions (more points) hit harder and come last; a wrong answer costs
// a life. Beat the boss for a bonus. Needs correctness to be shown.
import { sumEvents } from './common.js';
import { sortSurvival, applySurvival, START_LIVES } from './survival.js';
import { showsCorrectness } from '../attempt.js';

export const DAMAGE_PER_POINT = 10;
export const BOSS_HEALTH_SHARE = 0.7;
export const VICTORY_BONUS = 500;
export const LIFE_BONUS = 100;
export const BOSS_NAME = 'Captain Corrode';

const weight = (q) => { const n = Number(q && q.points); return Number.isFinite(n) && n > 0 ? n : 1; };

/** Damage of a correct answer; each answer already in the streak adds 10% (up to +50%). */
export function bossDamage(q, streak = 0) {
  return Math.round(DAMAGE_PER_POINT * weight(q) * (1 + Math.min(5, Math.max(0, Number(streak) || 0)) * 0.1));
}

/** The boss has 70% of the damage the whole set can deal, so about 70% right wins. */
export function bossMaxHealth(questions) {
  const total = (questions || []).reduce((s, q) => s + bossDamage(q, 0), 0);
  return Math.max(DAMAGE_PER_POINT, Math.round(total * BOSS_HEALTH_SHARE));
}

/** state { health, maxHealth, lives, maxLives, streak } + one answer -> { state, points, damage, defeated, over, lifeGained, lifeLost }. */
export function applyBoss(state, { q, outcome }) {
  if (outcome !== 'correct' && outcome !== 'wrong' && outcome !== 'blank') return { state, points: 0, damage: 0, defeated: false, over: false, lifeGained: false, lifeLost: false };
  const sv = applySurvival({ lives: state.lives, maxLives: state.maxLives, streak: state.streak }, { outcome, points: weight(q) });
  const damage = outcome === 'correct' ? bossDamage(q, state.streak) : 0;
  const health = Math.max(0, state.health - damage);
  const defeated = health === 0;
  const bonus = defeated ? VICTORY_BONUS + LIFE_BONUS * sv.state.lives : 0;
  return { state: { ...state, health, lives: sv.state.lives, streak: sv.state.streak }, points: sv.points + bonus, damage, defeated, over: defeated || sv.over, lifeGained: sv.lifeGained, lifeLost: sv.lifeLost };
}

export const boss = {
  id: 'boss', title: 'Boss battle', blurb: 'Answer to attack the boss. Hard questions hit harder; wrong answers cost a life', icon: 'alert', order: 7,
  pacing: 'lives', minQuestions: 3,
  available(test) {
    if ((test?.questions || []).length < 3) return { ok: false, reason: 'Needs at least 3 questions' };
    if (!showsCorrectness(test)) return { ok: false, reason: 'Needs correct answers to be shown' };
    return { ok: true };
  },
  rules(test, opts = {}) {
    const lives = opts.lives || START_LIVES;
    return {
      clock: 'none', lives, maxSkips: 0, skipCost: 0,
      order: (qs) => sortSurvival(qs).map((q) => q.id), secondsFor: () => null,
      init: (questions = test?.questions || []) => { const maxHealth = bossMaxHealth(questions); return { health: maxHealth, maxHealth, lives, maxLives: lives, streak: 0 }; },
      apply: (state, ev) => applyBoss(state, ev),
    };
  },
  scoring: (attempt, events) => sumEvents(events),
};
