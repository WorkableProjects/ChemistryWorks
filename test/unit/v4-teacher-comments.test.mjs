// S07: comment bank (pure helpers; localStorage `cw:commentBank`).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  emptyBank, normalizeBank, addBankComment, updateBankComment, deleteBankComment, setBankRubric, getBankRubric, rubricKey, cleanRubric,
  insertComment, loadBank, saveBank, BANK_KEY, MAX_COMMENT_CHARS, MAX_BANK_COMMENTS,
} from '../../js/lib/comments.js';

test('add / update / delete comments (immutably)', () => {
  const e = emptyBank();
  const a = addBankComment(e, '  Show your work.  ');
  assert.deepEqual(a.comments.map((c) => c.text), ['Show your work.']);
  assert.equal(e.comments.length, 0);
  assert.equal(addBankComment(a, 'Show your work.'), a);          // duplicate ignored
  assert.equal(addBankComment(a, '   '), a);                      // empty ignored
  const b = addBankComment(a, 'Check units.');
  assert.notEqual(b.comments[0].id, b.comments[1].id);
  const c = updateBankComment(b, b.comments[0].id, 'Show ALL work.');
  assert.deepEqual(c.comments.map((x) => x.text), ['Show ALL work.', 'Check units.']);
  assert.deepEqual(updateBankComment(c, c.comments[0].id, '').comments.map((x) => x.text), ['Check units.']);
  assert.deepEqual(deleteBankComment(c, c.comments[1].id).comments.map((x) => x.text), ['Show ALL work.']);
});

test('ids stay unique after deletes', () => {
  let bank = emptyBank();
  for (const t of ['a', 'b', 'c']) bank = addBankComment(bank, t);
  bank = deleteBankComment(bank, bank.comments[0].id);
  bank = addBankComment(bank, 'd');
  assert.equal(new Set(bank.comments.map((c) => c.id)).size, 3);
});

test('bank is capped and long comments are cut', () => {
  let bank = emptyBank();
  for (let i = 0; i < MAX_BANK_COMMENTS + 5; i++) bank = addBankComment(bank, `c${i}`);
  assert.equal(bank.comments.length, MAX_BANK_COMMENTS);
  assert.equal(addBankComment(emptyBank(), 'x'.repeat(MAX_COMMENT_CHARS + 50)).comments[0].text.length, MAX_COMMENT_CHARS);
});

test('rubric per test code + question id', () => {
  const e = emptyBank();
  const r = setBankRubric(e, 'chem1', 'q4', [{ text: 'Correct formula', points: 1 }, { text: ' ', points: 5 }, { text: 'Units', points: '0.5' }, { text: 'Bad', points: -3 }]);
  assert.equal(rubricKey('chem1', 'q4'), 'CHEM1|q4');
  assert.deepEqual(getBankRubric(r, 'CHEM1', 'q4'), [{ text: 'Correct formula', points: 1 }, { text: 'Units', points: 0.5 }, { text: 'Bad', points: 0 }]);
  assert.deepEqual(getBankRubric(r, 'CHEM1', 'q5'), []);
  assert.deepEqual(getBankRubric(r, 'CHEM2', 'q4'), []);
  assert.deepEqual(e.rubrics, {});
  assert.deepEqual(setBankRubric(r, 'CHEM1', 'q4', []).rubrics, {});   // empty list removes it
  assert.deepEqual(cleanRubric('nope'), []);
});

test('insertComment appends on a new line, trims, caps', () => {
  assert.equal(insertComment('', 'Good job.'), 'Good job.');
  assert.equal(insertComment('   ', 'Good job.'), 'Good job.');
  assert.equal(insertComment('Nice start.  \n', 'Check units.'), 'Nice start.\nCheck units.');
  assert.equal(insertComment('keep', ''), 'keep');
  assert.equal(insertComment('x'.repeat(MAX_COMMENT_CHARS), 'more').length, MAX_COMMENT_CHARS);
});

test('normalizeBank repairs junk', () => {
  assert.deepEqual(normalizeBank(null), emptyBank());
  assert.deepEqual(normalizeBank('x'), emptyBank());
  const n = normalizeBank({ comments: [{ id: 'a', text: 'one' }, { id: 'a', text: 'two' }, { text: '' }, null, { id: 'z', text: 'three' }], rubrics: { 'T|q': [{ text: 'k', points: 2 }], 'T|bad': 5, 'T|empty': [] } });
  assert.deepEqual(n.comments.map((c) => c.text), ['one', 'two', 'three']);
  assert.equal(new Set(n.comments.map((c) => c.id)).size, 3);
  assert.deepEqual(Object.keys(n.rubrics), ['T|q']);
});

test('load / save never throw without localStorage; round-trip with it', () => {
  assert.equal(BANK_KEY, 'commentBank');
  assert.doesNotThrow(() => { loadBank(); saveBank(emptyBank()); }); // whatever storage node offers (or none)
  const mem = new Map();
  const prior = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, writable: true, value: null });
  globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
  try {
    assert.equal(saveBank(addBankComment(emptyBank(), 'Round trip')), true);
    assert.ok(mem.has('cw:commentBank'));
    assert.deepEqual(loadBank().comments.map((c) => c.text), ['Round trip']);
    mem.set('cw:commentBank', '{not json');
    assert.deepEqual(loadBank(), emptyBank());
  } finally { if (prior) Object.defineProperty(globalThis, 'localStorage', prior); else delete globalThis.localStorage; }
});
