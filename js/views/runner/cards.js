// Question cards: header, widget, hint and confidence extras, flag with note, marks and scratchpad.

import { withQuestionImage } from '../question-image.js';
import { h, icon, richText } from '../../ui.js';
import { isAnswered } from '../../lib/grading.js';
import { TYPE_LABELS, isRequired } from '../../lib/schema.js';
import { CONFIDENCE_LEVELS, hintButtonText } from '../../lib/extras.js';
import { marksBar } from '../tools/marks.js';
import { scratchpad } from '../tools/scratchpad.js';
import { normalizeScratch, isEmptyScratch } from '../tools/scratch-model.js';
import { readAloudButton } from '../tools/readaloud.js';
import { questionSpeech } from '../tools/speech.js';
import { buildWidget, pointsLabel } from './widgets.js';

/** "Part A: Bonding" -> "Part A"; titles without a colon are shown whole (shortened when very long). */
function sectionPillText(title) {
  const t = String(title || '').trim();
  const head = t.includes(':') ? t.slice(0, t.indexOf(':')).trim() : t;
  return head.length > 24 ? `${head.slice(0, 23)}…` : head;
}

function sectionHeader({ section, points }) {
  return h('header', { class: 'q-section', dataset: { testid: 'section-header', sectionId: section.id } },
    h('p', { class: 'q-section__title' }, section.title),
    section.instructions ? richText(section.instructions, 'div', 'q-section__instr') : null,
    h('span', { class: 'q-section__pts' }, `${points} pts`));
}

/** Per-question extras: a point-costing hint and the "How sure are you?" row. Both are off unless the question asks. */
function buildExtras(rt, q) {
  const { state } = rt;
  if (!q.hint && !q.confidence) return { el: null, refresh() {} };
  let hintBtn = null; let hintBox = null; let confRow = null; let confBtns = [];
  if (q.hint) {
    const hintId = `hint-${q.id}`;
    hintBox = h('div', { class: 'q-hintbox', id: hintId, role: 'note', hidden: true, dataset: { testid: 'hint-text' } },
      h('span', { class: 'q-hintbox__label' }, 'Hint'), richText(q.hint.text, 'div', 'q-hintbox__text'));
    hintBtn = h('button', {
      type: 'button', class: 'btn btn--ghost btn--sm q-hintbtn', 'aria-controls': hintId, dataset: { testid: 'hint-btn' },
      on: { click: () => {
        if (state.done || state.submitting) return;
        state.hints.add(q.id);
        rt.refreshQuestion(q.id);
        hintBox.focus({ preventScroll: true });
      } },
    }, hintButtonText(q));
    hintBox.tabIndex = -1;
  }
  if (q.confidence) {
    confBtns = CONFIDENCE_LEVELS.map((l) => h('button', {
      type: 'button', class: 'q-conf__btn', role: 'radio', 'aria-checked': 'false', dataset: { testid: `confidence-${l.value}` },
      on: { click: () => { if (state.done || state.submitting) return; state.confidence[q.id] = l.value; rt.refreshQuestion(q.id); } },
    }, l.label));
    confRow = h('div', { class: 'q-conf', hidden: true, dataset: { testid: 'confidence-row' } },
      h('span', { class: 'q-conf__label', id: `conf-${q.id}` }, 'How sure are you?'),
      h('div', { class: 'q-conf__opts', role: 'radiogroup', 'aria-labelledby': `conf-${q.id}` }, confBtns));
  }
  return {
    el: h('div', { class: 'q-extras' }, hintBtn, hintBox, confRow),
    refresh(answered) {
      if (hintBtn) {
        const used = state.hints.has(q.id);
        hintBtn.hidden = used;
        hintBox.hidden = !used;
      }
      if (confRow) {
        confRow.hidden = !answered;
        confBtns.forEach((b, k) => {
          const on = state.confidence[q.id] === CONFIDENCE_LEVELS[k].value;
          b.setAttribute('aria-checked', String(on));
          b.classList.toggle('is-selected', on);
        });
      }
    },
  };
}

function buildCard(rt, api, q, i) {
  const { test, state, tools, total, headerFor, sectionOfQ } = rt;
  const widget = buildWidget(q, api);
  const flagBtn = h('button', {
    type: 'button', class: 'q-flag', 'aria-pressed': 'false', title: 'Flag for review (G)',
    dataset: { testid: 'flag-btn' }, on: { click: () => rt.toggleFlag(q.id, { focusNote: true }) },
  }, icon('flag', { size: 16 }), h('span', { class: 'q-flag__label' }, 'Flag'));
  const clearBtn = h('button', {
    type: 'button', class: 'q-clear', dataset: { testid: 'clear-answer' },
    on: { click: () => { delete state.answers[q.id]; delete state.confidence[q.id]; rt.refreshQuestion(q.id); card.el.focus({ preventScroll: true }); } },
  }, 'Clear answer');
  const clearSlot = h('div', { class: 'q-clear-slot' });
  const extras = buildExtras(rt, q);
  // Optional note to the teacher that goes with the flag.
  const noteInput = h('input', {
    class: 'input q-flagnote__input', type: 'text', maxlength: '200', 'aria-label': 'Note for your teacher (optional)',
    placeholder: 'Note for your teacher (optional)', dataset: { testid: 'flag-note' },
    on: {
      input: () => { state.flagNotes[q.id] = noteInput.value; rt.persist(true); },
      keydown: (e) => e.stopPropagation(), // typing here must not trigger runner shortcuts or Enter -> next question
    },
  });
  const noteRow = h('div', { class: 'q-flagnote', hidden: true, dataset: { testid: 'flag-note-row' } }, noteInput);
  const readAloud = tools.readAloud ? readAloudButton({ getText: () => questionSpeech(q) }) : null;
  const el = h('section', {
    class: 'q-card', tabindex: '-1', 'aria-label': `Question ${i + 1} of ${total}`,
    dataset: { testid: 'question-card', questionId: q.id },
  },
    headerFor.has(q.id) ? sectionHeader(sectionOfQ(q)) : null,
    h('div', { class: 'q-card__head' },
      h('h2', { class: 'q-card__num' }, `Question ${i + 1} of ${total}`),
      h('span', { class: 'pill pill--primary' }, TYPE_LABELS[q.type] || q.type),
      h('span', { class: 'pill' }, pointsLabel(q.points ?? 1)),
      isRequired(test, q) ? h('span', { class: 'pill pill--warning q-required-pill', dataset: { testid: 'required-pill' } }, 'Required') : null,
      sectionOfQ(q) ? h('span', { class: 'pill q-section-pill', title: sectionOfQ(q).section.title, dataset: { testid: 'section-pill' } }, sectionPillText(sectionOfQ(q).section.title)) : null,
      h('span', { class: 'spacer' }),
      readAloud?.el,
      flagBtn),
    // a hotspot's image is the diagram inside the widget, so it is not repeated beside the question text
    withQuestionImage(q.type === 'hotspot' ? { ...q, image: undefined } : q, widget.textEl || richText(q.text, 'div', 'q-text')),
    widget.el,
    extras.el,
    clearSlot,
  );
  el.querySelector('.q-text').id = `qt-${q.id}`;
  const marks = tools.highlighter ? marksBar({
    card: el, qid: q.id, getStruck: () => state.struck[q.id] || [],
    setStruck: (ids) => { if (ids.length) state.struck[q.id] = ids; else delete state.struck[q.id]; rt.persist(true); },
  }) : null;
  if (marks) widget.el.before(marks.el);
  const pad = tools.scratchpad ? scratchpad({
    qid: q.id, get: () => state.scratch[q.id],
    set: (v) => { const n = normalizeScratch(v); if (isEmptyScratch(n)) delete state.scratch[q.id]; else state.scratch[q.id] = n; rt.persist(true); },
  }) : null;
  if (pad) clearSlot.before(pad.el);
  clearSlot.before(noteRow); // the optional note sits under the answer, not above it
  const card = {
    q, i, el, widget,
    refresh() {
      const ans = state.answers[q.id];
      widget.refresh(ans);
      const answered = isAnswered(q, ans);
      extras.refresh(answered);
      if (answered && !clearBtn.isConnected) clearSlot.appendChild(clearBtn);
      else if (!answered) clearBtn.remove();
      const flagged = state.flagged.has(q.id);
      flagBtn.setAttribute('aria-pressed', String(flagged));
      flagBtn.classList.toggle('is-flagged', flagged);
      noteRow.hidden = !flagged;
      if (noteInput.value !== (state.flagNotes[q.id] || '')) noteInput.value = state.flagNotes[q.id] || '';
      marks?.refresh();
      pad?.refresh();
    },
  };
  return card;
}

/** Builds one card per question. Returns { cards, cardById }. */
export function createCards(rt) {
  const api = {
    get: (id) => rt.state.answers[id],
    set: (id, val, opts) => rt.setAnswer(id, val, opts),
  };
  const cards = rt.ordered.map((q, i) => buildCard(rt, api, q, i));
  return { cards, cardById: new Map(cards.map((c) => [c.q.id, c])) };
}
