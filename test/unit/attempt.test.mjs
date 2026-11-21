// Shared attempt: question order, answers, results, resume, save timing, modes, submission (js/lib/attempt.js).
const memory = () => {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k),
    key: (i) => [...m.keys()][i] ?? null, get length() { return m.size; }, clear: () => m.clear(),
  };
};
globalThis.localStorage = memory();
globalThis.sessionStorage = memory();
import test, { beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';

const { openAttempt, orderQuestions, showsCorrectness, listAttempts, progressKey } = await import('../../js/lib/attempt.js');
const { normalizeTest } = await import('../../js/lib/schema.js');

const EMAIL = 'kid@school.org';
const opts = (a, b) => [{ id: 'a', text: a }, { id: 'b', text: b }, { id: 'c', text: 'C' }, { id: 'd', text: 'D' }];

const build = (extra = {}, questions) => normalizeTest({
  code: 'ATT1', title: 'Attempt test',
  questions: questions || [
    { id: 'q1', type: 'mcq', text: 'One', points: 2, options: opts('A', 'B'), correctAnswer: 'a', hint: { text: 'Think', cost: 1 }, confidence: true },
    { id: 'q2', type: 'numeric', text: 'Two', points: 1, correctAnswer: 4, tolerance: 0 },
    { id: 'q3', type: 'short', text: 'Three', points: 1 },
    { id: 'q4', type: 'truefalse', text: 'Four', points: 1, correctAnswer: true },
  ],
  ...extra,
});

/** Storage double that records the writes. */
const fakeStore = (seed) => {
  const data = new Map(seed ? [[seed.key, seed.value]] : []);
  const log = [];
  return {
    data, log,
    load: (k, d = null) => (data.has(k) ? structuredClone(data.get(k)) : d),
    save: (k, v) => { data.set(k, structuredClone(v)); log.push(['save', k]); return true; },
    remove: (k) => { data.delete(k); log.push(['remove', k]); },
  };
};

const open = (test, extra = {}) => {
  const storage = extra.storage || fakeStore();
  const attempt = openAttempt(test, { email: EMAIL, storage, ...extra });
  return { attempt, storage };
};

beforeEach(() => globalThis.localStorage.clear());

test('progressKey keeps the 4.x record name', () => {
  assert.equal(progressKey('a@b.org', 'CODE'), 'progress:a@b.org:CODE');
});

test('showsCorrectness needs results and correct answers both shown', () => {
  assert.equal(showsCorrectness(build()), true);
  assert.equal(showsCorrectness(build({ showResults: false })), false);
  assert.equal(showsCorrectness(build({ showCorrectAnswers: false })), false);
  assert.equal(showsCorrectness(null), false);
});

test('orderQuestions: test order by default; the same student always gets the same shuffle', () => {
  const plain = build();
  assert.deepEqual(orderQuestions(plain, 'seed').map((q) => q.id), ['q1', 'q2', 'q3', 'q4']);
  const shuffled = build({ shuffleQuestions: true });
  const a = orderQuestions(shuffled, 'kid1ATT1').map((q) => q.id);
  assert.deepEqual(a, orderQuestions(shuffled, 'kid1ATT1').map((q) => q.id));
  assert.deepEqual([...a].sort(), ['q1', 'q2', 'q3', 'q4'], 'nothing is added or dropped');
  const orders = new Set(['s1', 's2', 's3', 's4', 's5', 's6'].map((s) => orderQuestions(shuffled, s).map((q) => q.id).join()));
  assert.ok(orders.size > 1, 'different seeds give different orders');
});

test('orderQuestions: shuffled options keep every option and the answer key', () => {
  const t = build({ shuffleOptions: true });
  const q1 = orderQuestions(t, 'abc').find((q) => q.id === 'q1');
  assert.deepEqual(q1.options.map((o) => o.id).sort(), ['a', 'b', 'c', 'd']);
  assert.equal(q1.correctAnswer, 'a');
  assert.deepEqual(t.questions[0].options.map((o) => o.id), ['a', 'b', 'c', 'd'], 'the test itself is not changed');
});

test('orderQuestions: ordering items never start in the correct order', () => {
  const t = build({}, [{ id: 'o1', type: 'ordering', text: 'Sort', points: 1, items: [{ id: 'x', text: 'X' }, { id: 'y', text: 'Y' }, { id: 'z', text: 'Z' }], correctAnswer: ['x', 'y', 'z'] }]);
  for (const seed of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']) {
    const items = orderQuestions(t, seed)[0].items.map((i) => i.id);
    assert.notDeepEqual(items, ['x', 'y', 'z'], seed);
    assert.deepEqual([...items].sort(), ['x', 'y', 'z']);
  }
});

test('orderQuestions: questions stay inside their section', () => {
  const t = build({ sections: [{ id: 's1', title: 'One', instructions: '' }, { id: 's2', title: 'Two', instructions: '' }], shuffleQuestions: true }, [
    { id: 'a1', type: 'truefalse', text: 'a1', points: 1, correctAnswer: true, section: 's1' },
    { id: 'a2', type: 'truefalse', text: 'a2', points: 1, correctAnswer: true, section: 's1' },
    { id: 'b1', type: 'truefalse', text: 'b1', points: 1, correctAnswer: true, section: 's2' },
    { id: 'b2', type: 'truefalse', text: 'b2', points: 1, correctAnswer: true, section: 's2' },
  ]);
  for (const seed of ['x', 'y', 'z']) {
    const ids = orderQuestions(t, seed).map((q) => q.id);
    assert.deepEqual(ids.slice(0, 2).sort(), ['a1', 'a2']);
    assert.deepEqual(ids.slice(2).sort(), ['b1', 'b2']);
  }
});

test('a new attempt starts empty', () => {
  const { attempt } = open(build());
  assert.equal(attempt.resumed, false);
  assert.equal(attempt.total, 4);
  assert.equal(attempt.key, 'progress:kid@school.org:ATT1');
  assert.equal(attempt.answeredCount, 0);
  assert.equal(attempt.index, 0);
  assert.equal(attempt.lastMode, 'study');
  assert.equal(attempt.question('q2').id, 'q2');
  assert.equal(attempt.question('nope'), null);
  attempt.destroy();
});

test('set and get: answers are stored, blank or unknown ones are not', () => {
  const { attempt } = open(build());
  assert.equal(attempt.set('q1', 'a'), true);
  assert.equal(attempt.get('q1'), 'a');
  assert.equal(attempt.isAnswered('q1'), true);
  assert.equal(attempt.answeredCount, 1);
  assert.equal(attempt.set('zz', 'a'), false, 'an unknown question id');
  attempt.set('q2', '   ');
  assert.equal(attempt.isAnswered('q2'), false);
  assert.equal(attempt.isAnswered('zz'), false);
  attempt.state.confidence.q1 = 3;
  attempt.set('q1', '');
  assert.equal(attempt.get('q1'), undefined, 'clearing the answer removes it');
  assert.equal(attempt.state.confidence.q1, undefined, 'and its confidence');
  attempt.destroy();
});

test('set emits events and subscribers can leave; a broken subscriber is ignored', () => {
  const { attempt } = open(build());
  const seen = [];
  const off = attempt.subscribe((e) => seen.push(e.type + (e.id ? `:${e.id}` : '')));
  attempt.subscribe(() => { throw new Error('bad'); });
  const spy = mock.method(console, 'error', () => {});
  attempt.set('q4', true);
  attempt.flag('q4');
  assert.deepEqual(seen, ['answer:q4', 'flag:q4']);
  assert.ok(spy.mock.callCount() >= 1);
  spy.mock.restore();
  off();
  attempt.set('q4', false);
  assert.equal(seen.length, 2);
  attempt.destroy();
});

test('resultFor: right, wrong, hidden, unanswered and teacher-graded', () => {
  const { attempt } = open(build());
  assert.deepEqual(attempt.resultFor('q1'), { correct: null });
  attempt.set('q1', 'a');
  attempt.set('q2', '5');
  attempt.set('q3', 'free text');
  assert.deepEqual(attempt.resultFor('q1'), { correct: true, pointsEarned: 2, pointsPossible: 2 });
  assert.deepEqual(attempt.resultFor('q2'), { correct: false, pointsEarned: 0, pointsPossible: 1 });
  assert.deepEqual(attempt.resultFor('q3'), { correct: null }, 'a teacher grades it');
  assert.deepEqual(Object.keys(attempt.results()), ['q1', 'q2', 'q3', 'q4']);
  attempt.destroy();
  const hidden = open(build({ showCorrectAnswers: false })).attempt;
  hidden.set('q1', 'a');
  assert.deepEqual(hidden.resultFor('q1'), { correct: null }, 'hidden when the test hides correct answers');
  assert.equal(hidden.showsCorrectness(), false);
  hidden.destroy();
});

test('a hint costs its points on the question', () => {
  const { attempt } = open(build());
  attempt.set('q1', 'a');
  attempt.state.hints.add('q1');
  assert.equal(attempt.resultFor('q1').pointsEarned, 1, 'the instant result charges the hint too');
  const g = attempt.grade();
  assert.equal(g.results.find((r) => r.questionId === 'q1').pointsEarned, 1);
  attempt.destroy();
});

test('wrongIds remembers a wrong answer, drops it once fixed, and keeps a cleared wrong one', () => {
  const { attempt } = open(build());
  attempt.set('q2', '9');
  attempt.set('q4', false);
  assert.deepEqual(attempt.wrongIds(), ['q2', 'q4']);
  attempt.set('q2', '4');
  assert.deepEqual(attempt.wrongIds(), ['q4']);
  attempt.set('q4', '');
  assert.deepEqual(attempt.wrongIds(), ['q4'], 'clearing a wrong answer does not forgive it');
  attempt.destroy();
  const hidden = open(build({ showResults: false })).attempt;
  hidden.set('q2', '9');
  assert.deepEqual(hidden.wrongIds(), [], 'nothing is marked wrong when correctness is hidden');
  hidden.destroy();
});

test('flags and flag notes: unflagging removes the note', () => {
  const { attempt } = open(build(), { tools: true });
  attempt.flag('q2');
  assert.equal(attempt.isFlagged('q2'), true);
  attempt.state.flagNotes.q2 = 'check units';
  attempt.flag('q2');
  assert.equal(attempt.isFlagged('q2'), false);
  assert.equal(attempt.state.flagNotes.q2, undefined);
  attempt.flag('nope');
  assert.equal(attempt.isFlagged('nope'), false);
  attempt.destroy();
});

test('next: the following unanswered question, wrapping round, with a filter', () => {
  const { attempt } = open(build());
  attempt.set('q2', '4');
  assert.equal(attempt.next().id, 'q3', 'skips the answered one');
  attempt.index = 2;
  assert.equal(attempt.next().id, 'q4');
  attempt.index = 3;
  assert.equal(attempt.next().id, 'q1', 'wraps to the start');
  assert.equal(attempt.next({ filter: (q) => q.type === 'short' }).id, 'q3');
  for (const id of ['q1', 'q3', 'q4']) attempt.set(id, id === 'q1' ? 'a' : id === 'q3' ? 'x' : true);
  assert.equal(attempt.next(), null, 'everything is answered');
  attempt.destroy();
});

test('index is clamped to the questions', () => {
  const { attempt } = open(build());
  attempt.index = 99;
  assert.equal(attempt.index, 3);
  attempt.index = -4;
  assert.equal(attempt.index, 0);
  attempt.index = 'junk';
  assert.equal(attempt.index, 0);
  attempt.destroy();
});

test('saves are debounced by 400 ms; save(true) writes now; the record has the 4.x fields plus v5', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { attempt, storage } = open(build());
  attempt.set('q4', true);
  attempt.set('q4', false);
  assert.equal(storage.log.length, 0, 'nothing yet');
  assert.equal(attempt.pending(), true);
  t.mock.timers.tick(399);
  assert.equal(storage.log.length, 0);
  t.mock.timers.tick(1);
  assert.equal(storage.log.length, 1, 'one write for both answers');
  assert.equal(attempt.pending(), false);
  const rec = storage.data.get(attempt.key);
  assert.deepEqual(rec.answers, { q4: false });
  assert.equal(rec.title, 'Attempt test');
  assert.equal(rec.total, 4);
  assert.equal(rec.v, 5);
  assert.equal(rec.lastMode, 'study');
  assert.ok(rec.startedAt > 0 && rec.updatedAt > 0);
  assert.ok(!('scratch' in rec), 'scratch notes only with the tools on');
  attempt.set('q4', true, { debounce: false });
  assert.equal(storage.log.length, 2, 'debounce: false writes at once');
  attempt.save(true);
  assert.equal(storage.log.length, 3);
  attempt.destroy();
});

test('tools keep scratch, struck-out options and flag notes', () => {
  const { attempt, storage } = open(build(), { tools: true });
  attempt.state.scratch = { q1: 'work' };
  attempt.state.struck = { q1: ['b'] };
  attempt.flag('q1');
  attempt.state.flagNotes.q1 = 'ask';
  attempt.save(true);
  const rec = storage.data.get(attempt.key);
  assert.deepEqual([rec.scratch, rec.struck, rec.flagNotes], [{ q1: 'work' }, { q1: ['b'] }, { q1: 'ask' }]);
  attempt.destroy();
});

test('resume: a saved record comes back, junk and unknown ids are dropped', () => {
  const key = progressKey(EMAIL, 'ATT1');
  const storage = fakeStore({ key, value: {
    answers: { q1: 'a', q2: '', q4: true, gone: 'x' }, flagged: ['q2', 'gone'], confidence: { q1: 2, q2: 3, q4: 9 }, hints: ['q1', 'q4'], wrong: ['q2', 'gone'],
    index: 7, mode: 'scroll', startedAt: 123456, tabSwitches: 2, lastMode: 'tower', modeState: { tower: { blocks: 3 } },
    scratch: { q1: 'x' }, struck: { q1: ['b'], q2: [] }, flagNotes: { q1: 'n'.repeat(300) },
  } });
  const { attempt } = open(build(), { storage });
  assert.equal(attempt.resumed, true);
  assert.deepEqual(attempt.state.answers, { q1: 'a', q4: true });
  assert.deepEqual([...attempt.state.flagged], ['q2']);
  assert.deepEqual(attempt.state.confidence, { q1: 2 }, 'only questions that ask for confidence, only valid values');
  assert.deepEqual([...attempt.state.hints], ['q1'], 'only questions that have a hint');
  assert.deepEqual([...attempt.state.wrong], ['q2']);
  assert.equal(attempt.index, 3, 'clamped');
  assert.deepEqual([attempt.state.mode, attempt.state.startedAt, attempt.state.tabSwitches, attempt.lastMode], ['scroll', 123456, 2, 'tower']);
  assert.deepEqual(attempt.modeState('tower'), { blocks: 3 });
  assert.deepEqual(attempt.state.scratch, {}, 'tools are off, so scratch is not loaded');
  attempt.destroy();
  const withTools = open(build(), { storage, tools: true }).attempt;
  assert.deepEqual(withTools.state.scratch, { q1: 'x' });
  assert.deepEqual(withTools.state.struck, { q1: ['b'] });
  assert.equal(withTools.state.flagNotes.q1.length, 200, 'notes are cut to 200 characters');
  withTools.destroy();
});

test('resume ignores a record that is not an object', () => {
  const storage = fakeStore({ key: progressKey(EMAIL, 'ATT1'), value: 'junk' });
  const { attempt } = open(build(), { storage });
  assert.equal(attempt.resumed, false);
  attempt.destroy();
});

test('a preview attempt never loads or saves', () => {
  const key = progressKey(EMAIL, 'ATT1');
  const storage = fakeStore({ key, value: { answers: { q1: 'a' } } });
  const { attempt } = open(build(), { storage, preview: true });
  assert.equal(attempt.resumed, false);
  assert.equal(attempt.get('q1'), undefined);
  attempt.set('q4', true, { debounce: false });
  assert.equal(attempt.save(true), false);
  attempt.finish();
  assert.deepEqual(storage.log, [], 'no writes and no removes');
  attempt.destroy();
});

test('setMode and setModeState save and announce', () => {
  const { attempt, storage } = open(build());
  const seen = [];
  attempt.subscribe((e) => seen.push(e.type));
  attempt.setMode('study');
  assert.deepEqual(seen, [], 'the same mode does nothing');
  attempt.setMode('race');
  assert.equal(attempt.lastMode, 'race');
  assert.deepEqual(seen, ['save', 'mode']);
  assert.equal(storage.data.get(attempt.key).lastMode, 'race');
  attempt.setModeState('race', { steps: 2 });
  assert.deepEqual(attempt.modeState('race'), { steps: 2 });
  attempt.setModeState('race', null);
  assert.equal(attempt.modeState('race'), null);
  attempt.setMode('');
  assert.equal(attempt.lastMode, 'race');
  attempt.destroy();
});

test('toSubmission: the 4.x payload, the grade and the game mode flag', () => {
  const { attempt } = open(build(), { user: { name: 'Kid', email: EMAIL } });
  attempt.set('q1', 'a');
  attempt.set('q3', 'text');
  attempt.flag('q3');
  attempt.state.flagNotes.q3 = 'unsure';
  const { grade, payload } = attempt.toSubmission({ submittedAt: Date.parse('2026-03-01T10:00:00Z') });
  assert.equal(grade.scoreAchieved, 2);
  assert.equal(grade.pendingCount, 1);
  assert.equal(payload.test_code, 'ATT1');
  assert.equal(payload.student_email, EMAIL);
  assert.equal(payload.score_achieved, 2);
  assert.equal(payload.submitted_at, '2026-03-01T10:00:00.000Z');
  assert.equal(payload.flags.questions, undefined, 'flag notes only go with tools');
  assert.equal(attempt.toSubmission({ auto: true }).payload.flags.auto_submitted, true);
  attempt.destroy();
  const tools = open(build(), { tools: true, user: { name: 'Kid', email: EMAIL } }).attempt;
  tools.flag('q2');
  tools.state.flagNotes.q2 = '  why  ';
  assert.deepEqual(tools.toSubmission().payload.flags.questions, { q2: 'why' });
  tools.destroy();
});

test('reset clears answers and flags and saves', () => {
  const { attempt, storage } = open(build());
  attempt.set('q1', 'a');
  attempt.flag('q1');
  attempt.index = 2;
  const seen = [];
  attempt.subscribe((e) => seen.push(e.type));
  attempt.reset();
  assert.deepEqual([attempt.answeredCount, attempt.isFlagged('q1'), attempt.index, attempt.wrongIds()], [0, false, 0, []]);
  assert.deepEqual(storage.data.get(attempt.key).answers, {});
  assert.deepEqual(seen, ['save', 'reset']);
  attempt.destroy();
});

test('finish removes the record and stops all saving and answering', () => {
  const { attempt, storage } = open(build());
  attempt.set('q4', true, { debounce: false });
  assert.ok(storage.data.has(attempt.key));
  attempt.finish();
  assert.equal(storage.data.has(attempt.key), false);
  assert.equal(attempt.set('q4', false), false, 'no answers after finishing');
  assert.equal(attempt.save(true), false);
  attempt.destroy();
  assert.equal(storage.data.has(attempt.key), false, 'destroy does not bring it back');
});

test('submitting locks the answers', () => {
  const { attempt } = open(build());
  attempt.state.submitting = true;
  assert.equal(attempt.set('q4', true), false);
  attempt.destroy();
});

test('destroy writes a pending save; pagehide and a hidden tab do too', () => {
  const target = (extra = {}) => ({
    listeners: {}, ...extra,
    addEventListener(t, f) { (this.listeners[t] ||= new Set()).add(f); },
    removeEventListener(t, f) { this.listeners[t]?.delete(f); },
    fire(t) { [...(this.listeners[t] || [])].forEach((f) => f()); },
    count() { return Object.values(this.listeners).reduce((n, set) => n + set.size, 0); },
  });
  const win = target();
  const doc = target({ visibilityState: 'visible' });
  globalThis.window = win;
  globalThis.document = doc;
  try {
    const { attempt, storage } = open(build());
    assert.ok(win.count() >= 1 && doc.count() === 1);
    attempt.set('q4', true);
    assert.equal(storage.log.length, 0);
    win.fire('pagehide');
    assert.equal(storage.log.length, 1, 'pagehide saves a pending change at once');
    attempt.set('q4', false);
    doc.fire('visibilitychange');
    assert.equal(storage.log.length, 1, 'a visible tab does not save');
    doc.visibilityState = 'hidden';
    doc.fire('visibilitychange');
    assert.equal(storage.log.length, 2);
    attempt.set('q4', true);
    attempt.destroy();
    assert.equal(storage.log.length, 3, 'destroy flushes the pending save');
    assert.equal(win.count(), 0, 'listeners are removed');
    assert.equal(doc.count(), 0);
  } finally {
    delete globalThis.window;
    delete globalThis.document;
  }
});

test('listAttempts: this student only, newest first, with answered counts', () => {
  const ls = globalThis.localStorage;
  ls.setItem('cw:progress:kid@school.org:T1', JSON.stringify({ answers: { a: 1, b: 2 }, total: 5, updatedAt: 100, title: 'Older', lastMode: 'race' }));
  ls.setItem('cw:progress:kid@school.org:T2', JSON.stringify({ answers: { a: 1 }, total: 3, updatedAt: 900, title: 'Newer' }));
  ls.setItem('cw:progress:other@school.org:T3', JSON.stringify({ answers: {}, total: 3, updatedAt: 500 }));
  ls.setItem('cw:progress:kid@school.org:T4', '{broken');
  ls.setItem('cw:progress:kid@school.org:T5', 'null');
  ls.setItem('cw:something:else', '1');
  const list = listAttempts('kid@school.org');
  assert.deepEqual(list.map((a) => a.code), ['T2', 'T1']);
  assert.deepEqual(list[1], { code: 'T1', title: 'Older', answered: 2, total: 5, updatedAt: 100, lastMode: 'race' });
  assert.equal(list[0].lastMode, 'study');
  assert.deepEqual(listAttempts('kid@school.org', { storage: null }).length, 2);
  assert.deepEqual(listAttempts('nobody@school.org'), []);
});
