// Classic: the original timed game (speed points, streak bonus, 50/50 and Freeze). The logic lives in
// js/lib/game.js (kept so existing imports keep working); this module is its registry entry.

import { GAME_TYPES, splitGameQuestions } from '../game.js';

export * from '../game.js';

export const classic = {
  id: 'classic',
  title: 'Classic',
  blurb: '20 seconds a question. Faster answers score more, streaks add a bonus, two power-ups.',
  icon: 'flag',
  playableTypes: GAME_TYPES,
  minQuestions: 1,
  scored: true,
  availability(test) {
    const { playable } = splitGameQuestions(test);
    return playable.length >= 1
      ? { playable: true, reason: '', questions: playable }
      : { playable: false, reason: 'This test has no auto-graded questions.', questions: [] };
  },
};
