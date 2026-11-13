// V5-01 shared attempt: one record per student per test, used by Study mode (the runner) and every game mode.
// It wraps the existing `progress:<email>:<CODE>` record (same key, same fields; only additions) so attempts
// started in 4.x still load. No DOM here apart from the optional pagehide/visibility save hooks.
// Contract: docs/ARCHITECTURE.md -> V5 contracts -> Attempt.

import { seededShuffle } from '../ui.js';
import { gradeTest, gradeQuestion, isAnswered as answered } from './grading.js';
import { groupQuestions } from './sections.js';
import { buildPayload } from './submit.js';
import { validConfidence } from './extras.js';
import { load, save, remove } from './storage.js';
import { enabled } from '../config.js';
import { attachAttempt } from './sync.js';

export const progressKey = (email, code) => `progress:${email}:${code}`;
const SAVE_DELAY = 400;

/** The student's stable question order (seeded per student + test). Shuffling is display-only: grading is by id. */
export function orderQuestions(test, seed) {
  const groups = groupQuestions(test);
  let ordered = groups.flatMap((g) => (test.shuffleQuestions ? seededShuffle(g.questions, seed + (g.section ? g.section.id : '')) : g.questions.slice()));
  ordered = ordered.map((q) => {
    if (!test.shuffleOptions) return q;
    if (q.type === 'mcq' || q.type === 'multi') return { ...q, options: seededShuffle(q.options, seed + q.id) };
    if (q.type === 'matching') return { ...q, left: seededShuffle(q.left, `${seed}${q.id}left`), right: seededShuffle(q.right, `${seed}${q.id}right`) };
    if (q.type === 'categorize') return { ...q, items: seededShuffle(q.items, `${seed}${q.id}items`) };
    return q;
  });
  // Ordering items always start scrambled (never already in the correct order).
  return ordered.map((q) => {
    if (q.type !== 'ordering') return q;
    let items = seededShuffle(q.items, `${seed}${q.id}order`);
    const key = Array.isArray(q.correctAnswer) ? q.correctAnswer.join('|') : '';
    if (items.length > 1 && items.map((it) => it.id).join('|') === key) items = [...items.slice(1), items[0]];
    return { ...q, items };
  });
}

/** Instant right/wrong is shown only when the test shows results and correct answers (Decision 2). */
export function showsCorrectness(test) {
  return !!test && test.showResults !== false && test.showCorrectAnswers !== false;
}

/**
 * Open (or resume) the attempt for `test`.
 * opts: { email, user?, preview?, tools? (keep scratch/struck/flagNotes), storage? ({ load, save, remove }) }
 */
export function openAttempt(test, opts = {}) {
  const { preview = false, tools = false } = opts;
  const user = opts.user || { name: '', email: opts.email || '' };
  const email = opts.email || user.email || '';
  const store = opts.storage || { load, save, remove };
  const key = progressKey(email, test.code);
  const questions = orderQuestions(test, `${email}${test.code}`);
  const byId = new Map(questions.map((q) => [q.id, q]));
  const total = questions.length;
  const subs = new Set();

  const state = {
    answers: {}, confidence: {}, hints: new Set(), flagged: new Set(), index: 0, mode: null, startedAt: Date.now(),
    tabSwitches: 0, submitting: false, done: false, scratch: {}, struck: {}, flagNotes: {},
    lastMode: 'study', modeState: {}, wrong: new Set(),
  };

  const saved = preview ? null : store.load(key, null);
  const resumed = !!(saved && typeof saved === 'object');
  if (resumed) {
    for (const [k, v] of Object.entries(saved.answers || {})) if (byId.has(k) && answered(byId.get(k), v)) state.answers[k] = v;
    for (const k of saved.flagged || []) if (byId.has(k)) state.flagged.add(k);
    for (const [k, v] of Object.entries(saved.confidence || {})) if (byId.get(k)?.confidence && validConfidence(v)) state.confidence[k] = Number(v);
    for (const k of saved.hints || []) if (byId.get(k)?.hint) state.hints.add(k);
    for (const k of saved.wrong || []) if (byId.has(k)) state.wrong.add(k);
    if (tools) {
      if (saved.scratch && typeof saved.scratch === 'object') state.scratch = saved.scratch; // the runner normalizes it
      for (const [k, v] of Object.entries(saved.struck || {})) if (byId.has(k) && Array.isArray(v) && v.length) state.struck[k] = v.map(String);
      for (const [k, v] of Object.entries(saved.flagNotes || {})) if (byId.has(k) && typeof v === 'string') state.flagNotes[k] = v.slice(0, 200);
    }
    state.index = Math.min(Math.max(Number(saved.index) || 0, 0), Math.max(total - 1, 0));
    if (saved.mode === 'focus' || saved.mode === 'scroll') state.mode = saved.mode;
    if (Number(saved.startedAt) > 0) state.startedAt = Number(saved.startedAt);
    state.tabSwitches = Number(saved.tabSwitches) || 0;
    if (typeof saved.lastMode === 'string' && saved.lastMode) state.lastMode = saved.lastMode;
    if (saved.modeState && typeof saved.modeState === 'object') state.modeState = saved.modeState;
  }

  const emit = (ev) => subs.forEach((fn) => { try { fn(ev); } catch (err) { console.error('[attempt] subscriber failed', err); } });

  let timer = null;
  function saveNow() {
    clearTimeout(timer);
    timer = null;
    if (preview || state.done) return false;
    store.save(key, {
      answers: state.answers, confidence: state.confidence, hints: [...state.hints], flagged: [...state.flagged], index: state.index,
      startedAt: state.startedAt, tabSwitches: state.tabSwitches, mode: state.mode, updatedAt: Date.now(), title: test.title,
      ...(tools ? { scratch: state.scratch, struck: state.struck, flagNotes: state.flagNotes } : {}),
      lastMode: state.lastMode, modeState: state.modeState, wrong: [...state.wrong], total, v: 5,
    });
    emit({ type: 'save' });
    return true;
  }
  function saveSoon() {
    if (preview || state.done) return;
    clearTimeout(timer);
    timer = setTimeout(saveNow, SAVE_DELAY);
  }

  const gradable = (q) => showsCorrectness(test) && !!q;
  /** { correct: true | false | null } for one question; null = "Saved" (hidden, teacher-graded or unanswered). */
  function resultFor(id) {
    const q = byId.get(id);
    const val = state.answers[id];
    if (!q || !answered(q, val) || !gradable(q)) return { correct: null };
    const g = gradeQuestion(q, val, { hintUsed: state.hints.has(id) });
    if (g.needsGrading) return { correct: null };
    return { correct: !!g.isCorrect, pointsEarned: g.pointsEarned, pointsPossible: g.pointsPossible };
  }

  const onHide = () => { if (timer) saveNow(); };
  const onVis = () => { if (typeof document !== 'undefined' && document.visibilityState === 'hidden' && timer) saveNow(); };
  if (typeof window !== 'undefined' && !preview) {
    window.addEventListener('pagehide', onHide);
    document.addEventListener('visibilitychange', onVis);
  }

  const attempt = {
    test, email, user, key, questions, total, preview, resumed,
    /** Raw state, shared with the runner (it reads and writes answers/flags/index here, then calls save()). */
    state,
    question: (id) => byId.get(id) || null,
    get: (id) => state.answers[id],
    set(id, value, { debounce = true } = {}) {
      const q = byId.get(id);
      if (!q || state.done || state.submitting) return false;
      if (answered(q, value)) state.answers[id] = value;
      else { delete state.answers[id]; delete state.confidence[id]; }
      const r = resultFor(id);
      if (r.correct === false) state.wrong.add(id); else if (r.correct === true) state.wrong.delete(id);
      if (debounce) saveSoon(); else saveNow();
      emit({ type: 'answer', id });
      return true;
    },
    isAnswered: (id) => (byId.has(id) ? answered(byId.get(id), state.answers[id]) : false),
    flag(id, on = !state.flagged.has(id)) {
      if (!byId.has(id)) return;
      if (on) state.flagged.add(id); else { state.flagged.delete(id); delete state.flagNotes[id]; }
      saveSoon();
      emit({ type: 'flag', id });
    },
    isFlagged: (id) => state.flagged.has(id),
    /** Next unanswered question after the current index (wraps), or null when everything (matching `filter`) is answered. */
    next({ filter } = {}) {
      for (let k = 1; k <= total; k++) {
        const q = questions[(state.index + k) % total];
        if (!attempt.isAnswered(q.id) && (!filter || filter(q))) return q;
      }
      return null;
    },
    get index() { return state.index; },
    set index(i) { state.index = Math.min(Math.max(Number(i) || 0, 0), Math.max(total - 1, 0)); saveSoon(); },
    get answeredCount() { return questions.reduce((n, q) => n + (answered(q, state.answers[q.id]) ? 1 : 0), 0); },
    showsCorrectness: () => showsCorrectness(test),
    resultFor,
    results: () => Object.fromEntries(questions.map((q) => [q.id, resultFor(q.id)])),
    /** Ids answered wrong (only where correctness is shown): feeds Mistake Review. */
    wrongIds: () => questions.filter((q) => resultFor(q.id).correct === false || (state.wrong.has(q.id) && !attempt.isAnswered(q.id))).map((q) => q.id),
    get lastMode() { return state.lastMode; },
    setMode(id) {
      if (!id || id === state.lastMode) return;
      state.lastMode = String(id);
      saveNow();
      emit({ type: 'mode', id: state.lastMode });
    },
    modeState: (id) => state.modeState[id] || null,
    setModeState(id, data) { if (data == null) delete state.modeState[id]; else state.modeState[id] = data; saveSoon(); },
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
    save: (now = false) => (now ? saveNow() : saveSoon()),
    pending: () => !!timer,
    grade: () => gradeTest(test, state.answers, { hintsUsed: state.hints, confidence: state.confidence }),
    /** The submission exactly as the runner built it in 4.x: { grade, payload }. */
    toSubmission({ auto = false, layout = state.mode, tools: withNotes = tools, submittedAt = Date.now() } = {}) {
      const grade = attempt.grade();
      const payload = buildPayload({
        test, grade, user, startedAt: state.startedAt, submittedAt,
        flags: {
          tabSwitches: state.tabSwitches, autoSubmitted: auto, mode: layout,
          ...(withNotes && state.flagged.size ? { questions: Object.fromEntries([...state.flagged].map((id) => [id, String(state.flagNotes[id] || '').trim().slice(0, 200)])) } : {}),
          ...(state.lastMode && state.lastMode !== 'study' ? { game_mode: state.lastMode } : {}),
        },
      });
      return { grade, payload };
    },
    /** Start over: clears answers and flags (used by "Remove" on the home and by practice restarts). */
    reset() {
      state.answers = {}; state.confidence = {}; state.hints = new Set(); state.flagged = new Set(); state.wrong = new Set();
      state.flagNotes = {}; state.modeState = {}; state.index = 0; state.startedAt = Date.now();
      saveNow();
      emit({ type: 'reset' });
    },
    /** After a successful submit: the record is removed and nothing is saved any more. */
    finish() { state.done = true; clearTimeout(timer); timer = null; if (!preview) store.remove(key); },
    destroy() {
      if (timer) saveNow();
      unsync();
      subs.clear();
      if (typeof window !== 'undefined' && !preview) {
        window.removeEventListener('pagehide', onHide);
        document.removeEventListener('visibilitychange', onVis);
      }
    },
  };
  // V5-02 sync hook: queues this attempt for `syncProgress` (no-op without a backend / when signed in as demo).
  let unsync = () => {};
  if (!preview && email && enabled('studentSync')) { try { unsync = attachAttempt(attempt); } catch (err) { console.error('[attempt] sync hook failed', err); } }
  attempt.unsync = unsync;
  return attempt;
}

/** Attempts on this device for one student: [{ code, title, answered, total, updatedAt, lastMode }] newest first. */
export function listAttempts(email, { storage } = {}) {
  const ls = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
  if (!ls) return [];
  const prefix = `progress:${email}:`;
  const out = [];
  for (let i = 0; i < ls.length; i++) {
    const k = ls.key(i);
    const at = k ? k.indexOf(prefix) : -1;
    if (at < 0) continue;
    try {
      const rec = JSON.parse(ls.getItem(k));
      if (!rec || typeof rec !== 'object') continue;
      out.push({
        code: k.slice(at + prefix.length), title: rec.title || '', answered: Object.keys(rec.answers || {}).length,
        total: Number(rec.total) || 0, updatedAt: Number(rec.updatedAt) || 0, lastMode: rec.lastMode || 'study',
      });
    } catch { /* not a progress record */ }
  }
  return out.sort((a, b) => b.updatedAt - a.updatedAt);
}
