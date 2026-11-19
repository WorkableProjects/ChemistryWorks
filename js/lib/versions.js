// Duplicate and "Version B" helpers for the library. Pure: no DOM, no storage.
//   suggestCopyCode(code, existing)   CODE -> CODE-2 (next free), checked against every code in the library
//   duplicateTest(test, code)         deep copy under a new code
//   versionTest(test, opts)           same test, questions and answer options shuffled by a fixed seed, code CODE-B
// Answer keys are stored as option / item ids, so reordering never changes which id is correct; the helpers still
// walk every type that carries an order so tests can prove the key stays valid.
import { seededShuffle } from '../ui.js';
import { groupQuestions } from './sections.js';

export const MAX_CODE_LENGTH = 32;
const clone = (v) => JSON.parse(JSON.stringify(v));
const upper = (s) => String(s ?? '').trim().toUpperCase();

/** Set of upper-cased codes from an array / Set of strings. */
function codeSet(existing) {
  return new Set([...(existing || [])].map(upper));
}

/** `base` + `suffix`, shortening base so the whole code stays within the 32-character limit. */
function withSuffix(base, suffix) {
  return `${base.slice(0, Math.max(1, MAX_CODE_LENGTH - suffix.length))}${suffix}`;
}

const CODE_RE = /^[A-Z0-9_-]{2,32}$/;

/** '' when `code` is usable as a new test code, else a short message (format first, then uniqueness). */
export function validateNewCode(code, existing = []) {
  const c = upper(code);
  if (!CODE_RE.test(c)) return 'Use 2-32 characters: A-Z, 0-9, "_" or "-".';
  if (codeSet(existing).has(c)) return `${c} is already in your library.`;
  return '';
}

/** True when `code` is free in the library (case-insensitive). */
export function isCodeFree(code, existing) {
  return !codeSet(existing).has(upper(code));
}

/** "CODE" -> "CODE-2", then "CODE-3"... the first one not already in `existing`. A trailing -N is replaced, not stacked. */
export function suggestCopyCode(code, existing = []) {
  const taken = codeSet(existing);
  const base = upper(code).replace(/-\d+$/, '') || 'TEST';
  for (let n = 2; n < 1000; n++) {
    const c = withSuffix(base, `-${n}`);
    if (!taken.has(c)) return c;
  }
  return withSuffix(base, `-${Date.now() % 100000}`);
}

/** Deep copy of a test under `code` (upper-cased); the copy carries no saved-at stamp. */
export function duplicateTest(test, code) {
  const copy = clone(test);
  copy.code = upper(code);
  delete copy.updatedAt;
  return copy;
}

/** "CODE-B" (or "CODE-B2" ... when taken) for a version label. */
export function suggestVersionCode(code, label = 'B', existing = []) {
  const taken = codeSet(existing);
  const base = upper(code).replace(/-[A-Z]\d*$/, '') || 'TEST';
  const tag = upper(label) || 'B';
  let c = withSuffix(base, `-${tag}`);
  for (let n = 2; taken.has(c) && n < 1000; n++) c = withSuffix(base, `-${tag}${n}`);
  return c;
}

/**
 * Shuffle the options of one question (a copy). mcq / multi: options; matching: left and right columns;
 * ordering: the items (correctAnswer is the id order of the right sequence and is left untouched);
 * categorize: items. Other types are returned unchanged.
 */
export function shuffleQuestionOptions(q, seed) {
  const out = clone(q);
  const key = `${seed}${q.id}`;
  if ((q.type === 'mcq' || q.type === 'multi') && Array.isArray(q.options)) out.options = seededShuffle(q.options, `${key}opts`);
  else if (q.type === 'matching') {
    if (Array.isArray(q.left)) out.left = seededShuffle(q.left, `${key}left`);
    if (Array.isArray(q.right)) out.right = seededShuffle(q.right, `${key}right`);
  } else if (q.type === 'ordering' && Array.isArray(q.items)) {
    let items = seededShuffle(q.items, `${key}items`);
    const answer = Array.isArray(q.correctAnswer) ? q.correctAnswer.join('|') : '';
    // Never hand out the items already in the correct order.
    if (items.length > 1 && items.map((i) => i.id).join('|') === answer) items = [...items.slice(1), items[0]];
    out.items = items;
  } else if (q.type === 'categorize' && Array.isArray(q.items)) out.items = seededShuffle(q.items, `${key}items`);
  return out;
}

/**
 * "Version B": questions shuffled inside their section (sections and unsectioned questions keep their place) and
 * every question's options shuffled, all from a fixed seed so the same input always gives the same paper.
 * Returns a new test; the input is untouched. opts: { label='B', existingCodes=[], seed }.
 */
export function versionTest(test, { label = 'B', existingCodes = [], seed } = {}) {
  const s = seed != null ? String(seed) : `${upper(test.code)}|${upper(label)}`;
  const out = clone(test);
  const ordered = groupQuestions(test).flatMap((g) => seededShuffle(g.questions, `${s}${g.section ? g.section.id : ''}`));
  out.questions = ordered.map((q) => shuffleQuestionOptions(q, s));
  out.code = suggestVersionCode(test.code, label, existingCodes);
  out.title = `${test.title || test.code || 'Test'} (Version ${upper(label) || 'B'})`;
  delete out.updatedAt;
  return out;
}
