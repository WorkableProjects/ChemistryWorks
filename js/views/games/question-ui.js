// Shared question board for the question-based games (Classic, Survival, Lightning Round).
// questionBoard(q, { onAnswer, quick }) -> { heading, answerArea, submitRow, activate(n), focusFirst(), lock(answer),
//                                            hide(id), canFifty }
// onAnswer(answer) is called once with the raw answer (id, boolean for true/false, ids[], or text).

import { h, richText } from '../../ui.js';
import { withQuestionImage } from '../question-image.js';

const SHAPES = ['▲', '◆', '●', '■'];

export function questionBoard(q, { onAnswer }) {
  const hidden = new Set();
  const heading = h('div', { class: 'game-q', tabindex: '-1', dataset: { testid: 'game-question', questionId: q.id } },
    withQuestionImage(q, richText(q.text, 'p', 'game-q__text')));
  const answerArea = h('div', { class: 'game-answers' });
  const submitRow = h('div', { class: 'game-submit' });
  const picked = new Set();

  const tile = (idx, id, label, extra = {}) => h('button', {
    type: 'button', class: `game-tile game-tile--${idx % 4}`, dataset: { testid: `game-option-${id}`, opt: String(id) }, 'aria-keyshortcuts': String(idx + 1), ...extra,
  }, h('span', { class: 'game-tile__shape', 'aria-hidden': 'true' }, SHAPES[idx % 4]), h('span', { class: 'game-tile__num', 'aria-hidden': 'true' }, String(idx + 1)),
  richText(label, 'span', 'game-tile__text'));

  let activate = () => {};
  let focusFirst = () => {};
  if (q.type === 'mcq' || q.type === 'truefalse') {
    const opts = q.type === 'mcq' ? q.options.map((o) => ({ id: String(o.id), text: o.text })) : [{ id: 'true', text: 'True' }, { id: 'false', text: 'False' }];
    const send = (o) => onAnswer(q.type === 'truefalse' ? o.id === 'true' : o.id);
    opts.forEach((o, i) => answerArea.append(tile(i, o.id, o.text, { on: { click: () => send(o) } })));
    activate = (n) => { const o = opts[n]; if (o && !hidden.has(o.id)) send(o); };
    answerArea.classList.add(q.type === 'truefalse' ? 'game-answers--two' : 'game-answers--grid');
    focusFirst = () => answerArea.querySelector('button')?.focus();
  } else if (q.type === 'multi') {
    const submit = h('button', { class: 'btn btn--primary btn--lg', type: 'button', disabled: true, dataset: { testid: 'game-submit' }, on: { click: () => onAnswer([...picked]) } }, 'Submit answer');
    submitRow.append(submit, h('span', { class: 'game-hint' }, 'Select all that apply'));
    const toggle = (id, el) => {
      if (picked.has(id)) picked.delete(id); else picked.add(id);
      el.setAttribute('aria-pressed', String(picked.has(id)));
      el.classList.toggle('is-picked', picked.has(id));
      submit.disabled = picked.size === 0;
    };
    q.options.forEach((o, i) => {
      const id = String(o.id);
      const el = tile(i, id, o.text, { 'aria-pressed': 'false' });
      el.addEventListener('click', () => toggle(id, el));
      answerArea.append(el);
    });
    answerArea.classList.add('game-answers--grid');
    activate = (n) => { const o = q.options[n]; if (o) answerArea.querySelector(`[data-opt="${CSS.escape(String(o.id))}"]`)?.click(); };
    focusFirst = () => answerArea.querySelector('button')?.focus();
  } else {
    const numeric = q.type === 'numeric';
    const input = h('input', {
      class: 'input game-input', type: 'text', autocomplete: 'off', spellcheck: 'false', inputmode: numeric ? 'decimal' : 'text',
      'aria-label': numeric ? `Your answer${q.unit ? ` (${q.unit})` : ''}` : 'Your answer (chemical formula)', dataset: { testid: numeric ? 'game-numeric-input' : 'game-formula-input' },
    });
    const go = (e) => { e.preventDefault(); if (input.value.trim()) onAnswer(input.value); else input.focus(); };
    answerArea.append(h('form', { class: 'game-form', on: { submit: go } }, input, q.unit ? h('span', { class: 'game-unit' }, q.unit) : null,
      h('button', { class: 'btn btn--primary btn--lg', type: 'submit', dataset: { testid: 'game-submit' } }, 'Submit answer')));
    focusFirst = () => input.focus();
  }

  /** Disable inputs and colour the tiles: correct / wrong pick / dimmed. */
  function lock(answer) {
    answerArea.querySelectorAll('button, input').forEach((el) => { el.disabled = true; });
    submitRow.replaceChildren();
    const chosen = new Set(Array.isArray(answer) ? answer.map(String) : answer == null ? [] : [String(answer)]);
    const key = Array.isArray(q.correctAnswer) ? q.correctAnswer.map(String) : [String(q.correctAnswer)];
    answerArea.querySelectorAll('[data-opt]').forEach((el) => {
      const id = el.dataset.opt;
      if (q.type === 'numeric' || q.type === 'formula') return;
      if (key.includes(id)) el.classList.add('is-correct');
      else if (chosen.has(id)) el.classList.add('is-wrong');
      else el.classList.add('is-dim');
    });
  }

  function hide(id) {
    hidden.add(String(id));
    const el = answerArea.querySelector(`[data-opt="${CSS.escape(String(id))}"]`);
    if (el) { el.disabled = true; el.classList.add('is-removed'); }
  }

  return { heading, answerArea, submitRow, activate, focusFirst, lock, hide, isHidden: (id) => hidden.has(String(id)), startsWithTiles: q.type === 'mcq' || q.type === 'truefalse' || q.type === 'multi' };
}

/** Keyboard handler for 1-9 answer shortcuts; ignores typing in inputs. */
export function numberKeys(board, isLocked) {
  return (e) => {
    if (isLocked()) return;
    if (e.target instanceof HTMLInputElement) return;
    if (/^[1-9]$/.test(e.key)) { board.activate(Number(e.key) - 1); e.preventDefault(); }
  };
}

/** Options with a stable shuffle for mcq / multi. */
export function shuffleOptions(q, shuffleFn, seed) {
  return q.type === 'mcq' || q.type === 'multi' ? { ...q, options: shuffleFn(q.options, seed + q.id) } : q;
}
