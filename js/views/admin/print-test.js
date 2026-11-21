// Paper version of a test: a student copy without answers and an answer key, versions A / B.
// Renders into #print-root with the export classes and opens the browser print dialog, like the PDF export of a
// submission (js/views/admin/export-view.js). Interactive question types (drawing, graphs, ...) get an answer box.
import { h, richText, renderMath, brandLogo } from '../../ui.js';
import { groupQuestions, safeImageUrl } from '../../lib/sections.js';
import { displayQuestionText, correctAnswerText } from '../../lib/grading.js';
import { versionTest } from '../../lib/versions.js';
import { withQuestionImage } from '../question-image.js';

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const fmt = (n) => String(Math.round((Number(n) || 0) * 100) / 100);
const LINE_TYPES = { short: 4, open: 8, formula: 1, numeric: 1, sigfigs: 1 };
const PAPER_TYPES = ['mcq', 'multi', 'truefalse', 'numeric', 'formula', 'sigfigs', 'short', 'open', 'matching', 'ordering', 'fillblank', 'balance'];

/** The test as printed for a version: 'A' = as authored, 'B' = shuffled copy (see versions.js). */
export function paperTest(test, version = 'A') {
  return version === 'B' ? versionTest(test, { label: 'B' }) : test;
}

function optionEl(o, mark, letter) {
  const url = o && o.image && safeImageUrl(o.image.url);
  return h('li', { class: 'pt-option' },
    h('span', { class: 'pt-box', 'aria-hidden': 'true' }, mark ? '✓' : ''),
    h('span', { class: 'pt-letter' }, `${letter}.`),
    richText(o.text, 'span', 'pt-option__text'),
    url ? h('img', { class: 'pt-option__img', src: url, alt: String((o.image && o.image.alt) || ''), referrerpolicy: 'no-referrer' }) : null);
}

/** Answer area for one question; `key` marks / writes the correct answer. */
function answerArea(q, key) {
  const correct = Array.isArray(q.correctAnswer) ? q.correctAnswer.map(String) : [String(q.correctAnswer)];
  if (q.type === 'mcq' || q.type === 'multi') {
    return h('ol', { class: 'pt-options', 'aria-label': q.type === 'multi' ? 'Choose all that apply' : 'Choose one' },
      (q.options || []).map((o, i) => optionEl(o, key && correct.includes(String(o.id)), LETTERS[i] || '?')));
  }
  if (q.type === 'truefalse') {
    return h('ol', { class: 'pt-options' }, [['True', true], ['False', false]].map(([label, val], i) =>
      optionEl({ text: label }, key && q.correctAnswer === val, LETTERS[i])));
  }
  if (q.type === 'matching') {
    return h('div', { class: 'pt-match' },
      h('ol', { class: 'pt-match__col' }, (q.left || []).map((l, i) => h('li', {}, h('span', { class: 'pt-blank' }, key ? LETTERS[(q.right || []).findIndex((r) => String(r.id) === String(q.correctAnswer?.[l.id]))] || '' : ''), richText(l.text, 'span')))),
      h('ol', { class: 'pt-match__col pt-match__col--letters' }, (q.right || []).map((r, i) => h('li', {}, h('span', { class: 'pt-letter' }, `${LETTERS[i] || '?'}.`), richText(r.text, 'span')))));
  }
  if (q.type === 'ordering') {
    const order = Array.isArray(q.correctAnswer) ? q.correctAnswer.map(String) : [];
    return h('ul', { class: 'pt-order' }, (q.items || []).map((it) => h('li', {},
      h('span', { class: 'pt-blank' }, key ? String(order.indexOf(String(it.id)) + 1) : ''), richText(it.text, 'span'))));
  }
  if (key) return h('p', { class: 'pt-key' }, h('span', { class: 'export-label' }, 'Answer'), richText(correctAnswerText(q), 'div', 'export-pre'));
  if (q.type === 'fillblank') return null; // blanks sit in the sentence
  const n = LINE_TYPES[q.type];
  if (n) return h('div', { class: 'pt-lines', 'aria-hidden': 'true' }, Array.from({ length: n }, () => h('div', { class: 'pt-line' })));
  return h('div', { class: 'pt-space' }, h('span', { class: 'faint' }, PAPER_TYPES.includes(q.type) ? '' : 'Interactive question: answer on a separate sheet.'));
}

function questionEl(q, number, key) {
  const manualKey = key && (q.type === 'short' || q.type === 'open');
  return h('section', { class: 'export-item pt-q', dataset: { testid: `print-item-${q.id}` } },
    h('div', { class: 'export-item__head' },
      h('span', { class: 'export-item__num' }, `${number}.`),
      h('span', { class: 'export-item__pts' }, `${fmt(q.points)} pt${Number(q.points) === 1 ? '' : 's'}`)),
    withQuestionImage(q, richText(displayQuestionText(q), 'div', 'export-prompt')),
    answerArea(q, key),
    manualKey && q.type === 'open' && Array.isArray(q.rubric) && q.rubric.length
      ? h('ul', { class: 'pt-rubric' }, q.rubric.map((r) => h('li', {}, richText(r.text, 'span'), ` (${fmt(r.points)})`))) : null);
}

/** The printable document. opts: { key: answer key, version: 'A' | 'B' }. */
export function printTestDocument(test, { key = false, version = 'A' } = {}) {
  const t = paperTest(test, version);
  const total = (t.questions || []).reduce((s, q) => s + (Number(q.points) || 0), 0);
  let n = 0;
  return h('article', { class: 'export-doc pt-doc', dataset: { testid: 'print-test-doc', key: String(key), version } },
    h('header', { class: 'export-head' },
      h('div', { class: 'export-head__top' },
        h('div', { class: 'export-head__logo' }, brandLogo('wordmark')),
        h('div', { class: 'export-head__meta' },
          h('h1', { class: 'export-title' }, `${t.title || t.code}${key ? ' — Answer key' : ''}`),
          h('p', { class: 'export-student' }, `Version ${version} · ${fmt(total)} points${t.timeLimitMinutes ? ` · ${t.timeLimitMinutes} minutes` : ''}`))),
      key ? null : h('p', { class: 'pt-name' }, h('span', {}, 'Name'), h('span', { class: 'pt-name__line' }), h('span', {}, 'Date'), h('span', { class: 'pt-name__line pt-name__line--short' }))),
    h('hr', { class: 'export-rule' }),
    groupQuestions(t, { skipEmpty: true }).map((g) => h('div', { class: 'export-group' },
      g.section ? h('h2', { class: 'export-section' }, g.section.title || 'Section') : null,
      g.section && g.section.instructions ? richText(g.section.instructions, 'div', 'export-instructions') : null,
      g.questions.map((q) => questionEl(q, ++n, key)))));
}

const katexReady = () => typeof window.renderMathInElement === 'function' && !!window.katex;
async function waitForKatex(ms = 4000) {
  const end = Date.now() + ms;
  while (!katexReady() && Date.now() < end) await new Promise((r) => setTimeout(r, 50));
}

/** Render into #print-root and open the print dialog. Resolves to the root element. */
export async function printTest({ test, key = false, version = 'A' }) {
  let root = document.getElementById('print-root');
  if (!root || root.parentElement !== document.body) {
    if (root) root.remove();
    root = h('div', { id: 'print-root' });
    document.body.appendChild(root);
  }
  root.replaceChildren(h('table', { class: 'print-frame', role: 'presentation' },
    h('thead', {}, h('tr', {}, h('td', {}, h('div', { class: 'print-frame__space' })))),
    h('tfoot', {}, h('tr', {}, h('td', {}, h('div', { class: 'print-frame__space export-foot' },
      h('span', {}, `ChemistryWorks · ${test.code} · Version ${version}${key ? ' · Key' : ''}`))))),
    h('tbody', {}, h('tr', {}, h('td', {}, printTestDocument(test, { key, version }))))));
  await waitForKatex();
  renderMath(root);
  if (document.fonts && document.fonts.ready) await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 3000))]);
  const oldTitle = document.title;
  document.title = `ChemistryWorks - ${test.code} - Version ${version}${key ? ' - Key' : ' - Student copy'}`;
  document.body.classList.add('is-printing');
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    window.removeEventListener('afterprint', finish);
    document.body.classList.remove('is-printing');
    document.title = oldTitle;
  };
  window.addEventListener('afterprint', finish);
  setTimeout(() => { if (!done) document.title = oldTitle; }, 1000);
  window.print();
  return root;
}
