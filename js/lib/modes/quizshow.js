// Quiz Show: a board of tiles grouped by section (else topic, else question type). Pick any tile; harder tiles are worth
// more. A wrong answer scores nothing. Needs correctness to be shown. Not timed.
import { sumEvents } from './common.js';
import { showsCorrectness } from '../attempt.js';
import { TYPE_LABELS } from '../schema.js';

const LEVELS = { easy: 100, medium: 200, hard: 300 };

/** 100 to 500: from `difficulty` (easy / medium / hard, or 1-5), else from `points`, else 100. */
export function tilePoints(q) {
  const d = q && q.difficulty;
  if (typeof d === 'string' && LEVELS[d.toLowerCase()]) return LEVELS[d.toLowerCase()];
  const dn = Number(d);
  if (d !== undefined && d !== null && d !== '' && Number.isFinite(dn) && dn >= 1) return Math.min(5, Math.round(dn)) * 100;
  const p = Number(q && q.points);
  return p > 0 ? Math.min(5, Math.ceil(p)) * 100 : 100;
}

/** Board columns: [{ key, title, tiles: [{ id, points }] }], tiles easiest first. Section, then topic, then type. */
export function boardGroups(questions, sections = []) {
  const qs = Array.isArray(questions) ? questions.filter(Boolean) : [];
  const titles = new Map((Array.isArray(sections) ? sections : []).map((s) => [s.id, s.title || s.id]));
  const keyOf = (q) => {
    if (q.section && titles.has(q.section)) return [`s:${q.section}`, titles.get(q.section)];
    if (typeof q.topic === 'string' && q.topic.trim()) return [`t:${q.topic.trim()}`, q.topic.trim()];
    return [`y:${q.type}`, TYPE_LABELS[q.type] || q.type];
  };
  const map = new Map();
  qs.forEach((q, i) => {
    const [key, title] = keyOf(q);
    if (!map.has(key)) map.set(key, { key, title, tiles: [] });
    map.get(key).tiles.push({ id: q.id, points: tilePoints(q), i });
  });
  return [...map.values()].map((g) => ({ key: g.key, title: g.title, tiles: g.tiles.sort((a, b) => a.points - b.points || a.i - b.i).map(({ id, points }) => ({ id, points })) }));
}

export const quizshow = {
  id: 'quizshow', title: 'Quiz show', blurb: 'Pick tiles from a board. Harder tiles are worth more', icon: 'sheet', order: 9,
  pacing: 'none', minQuestions: 3,
  available(test) {
    if ((test?.questions || []).length < 3) return { ok: false, reason: 'Needs at least 3 questions' };
    if (!showsCorrectness(test)) return { ok: false, reason: 'Needs correct answers to be shown' };
    return { ok: true };
  },
  rules: () => ({ clock: 'none', lives: 0, maxSkips: 0, skipCost: 0, order: (qs) => qs.map((q) => q.id), secondsFor: () => null, init: () => ({}), apply: (state) => ({ state, points: 0 }) }),
  scoring: (attempt, events) => sumEvents(events),
};
