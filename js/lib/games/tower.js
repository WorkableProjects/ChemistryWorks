// Tower: every correct answer adds a block, every wrong answer makes the tower wobble; the third wobble knocks it
// down. Height (blocks stacked) is the score. No clock, so there is no untimed variant.

import { SURVIVAL_TYPES } from './survival.js';
import { questionAvailability } from './common.js';

export const MAX_WOBBLES = 3;
export const POINTS_PER_BLOCK = 100;
export const TOWER_TYPES = [...SURVIVAL_TYPES];

export const newTower = () => ({ blocks: 0, wobbles: 0, fell: false });

/** Apply one answer. Returns a new tower plus { wobbled, over }. A fallen tower ignores further answers. */
export function applyTowerAnswer(tower, { correct }) {
  if (tower.fell) return { ...tower, wobbled: false, over: true };
  if (correct) return { ...tower, blocks: tower.blocks + 1, wobbled: false, over: false };
  const wobbles = tower.wobbles + 1;
  const fell = wobbles >= MAX_WOBBLES;
  return { ...tower, wobbles, fell, wobbled: true, over: fell };
}

/** Score = height reached (blocks stacked, 100 each). */
export const towerScore = (tower) => Math.max(0, Number(tower && tower.blocks) || 0) * POINTS_PER_BLOCK;

export const tower = {
  id: 'tower',
  title: 'Tower',
  blurb: 'Stack a block for every right answer. Three wobbles and the tower falls. Height is your score.',
  icon: 'layers',
  playableTypes: TOWER_TYPES,
  minQuestions: 3,
  scored: true,
  availability: (test) => questionAvailability(test, TOWER_TYPES, 3, 'auto-graded'),
};
