// Printable view of one reviewed submission (V2-08). Renders into #print-root and calls window.print();
// css/print.css hides the rest of the app while printing. Row data goes through h()/richText()/commentBody() only.
import { h, richText, renderMath } from '../../ui.js';
import { buildExportModel } from '../../lib/export.js';
import { commentBody } from '../comment-view.js';
import { orbitalDiagram } from '../orbital-view.js';
import { structureDiagram } from '../structure-view.js';
import { lewisDiagram } from '../lewis-view.js';
import { withQuestionImage } from '../question-image.js';
import { formulaToHTML } from '../../lib/formula.js';
import { canonicalDots } from '../../lib/lewis.js';
import { acceptedStructures } from '../../lib/structure.js';

const fmt = (n) => String(Math.round(n * 100) / 100);

function diagram(fn) {
  try { return fn(); } catch { return null; } // fall back to text
}

/** Student-answer diagram for drawing question types. */
function answerDiagram(item) {
  const { question: q, givenAnswer: a, type } = item;
  if (!q || !item.answered || a == null) return null;
  if (type === 'orbital') return diagram(() => orbitalDiagram(q, a, { size: 'md' }));
  if (type === 'structure') return diagram(() => structureDiagram(q, a, { size: 'md', label: 'Student Lewis structure' }));
  if (type === 'lewis') return diagram(() => lewisDiagram(q.element, a, { size: 'md' }));
  return null;
}

/** Correct/sample-answer diagram(s) for drawing question types. */
function correctDiagram(item) {
  const { question: q, type } = item;
  if (!q) return null;
  if (type === 'orbital') return q.sampleAnswer && typeof q.sampleAnswer === 'object' ? diagram(() => orbitalDiagram(q, q.sampleAnswer, { size: 'md' })) : null;
  if (type === 'structure') {
    const forms = diagram(() => acceptedStructures(q)) || [];
    const els = forms.map((k) => diagram(() => structureDiagram(q, k, { size: 'md', label: 'Correct Lewis structure' }))).filter(Boolean);
    return els.length ? h('div', { class: 'export-diagram-row' }, els) : null;
  }
  if (type === 'lewis' && item.correctAnswer != null) return diagram(() => lewisDiagram(q.element, canonicalDots(item.correctAnswer, q.element), { size: 'md' }));
  return null;
}

/** Answer text: chemical formulas get sub/superscripts, everything else goes through richText (KaTeX). */
function textEl(text, type) {
  if (type === 'formula') return h('div', { class: 'export-answer-text', html: `<span class="formula">${formulaToHTML(String(text))}</span>` });
  return richText(text, 'div', ['export-answer-text', (type === 'short' || type === 'open') && 'export-pre'].filter(Boolean).join(' '));
}

function block(label, diagramEl, text, type, testid) {
  return h('div', { class: 'export-answer', dataset: { testid } },
    h('span', { class: 'export-label' }, label),
    diagramEl ? h('div', { class: 'export-diagram' }, diagramEl) : null,
    text || !diagramEl ? textEl(text || '—', type) : null);
}

function correctLabel(item) {
  if (item.type === 'open') return 'Sample answer';
  if (item.manual && item.type === 'structure') return 'Reference answer';
  return item.manual ? 'Sample answer' : 'Correct answer';
}

function itemEl(item) {
  const pts = item.needsGrading
    ? `— / ${fmt(item.pointsPossible)} pts (not graded)`
    : `${fmt(item.pointsEarned)} / ${fmt(item.pointsPossible)} pts`;
  const answer = item.answered
    ? block('Answer', answerDiagram(item), item.answerText, item.type, 'export-answer')
    : h('div', { class: 'export-answer' }, h('span', { class: 'export-label' }, 'Answer'), h('p', { class: 'export-empty' }, 'Not answered'));
  const cDiagram = correctDiagram(item);
  const showCorrect = item.correctAnswerText || cDiagram;
  return h('section', { class: 'export-item', dataset: { testid: `export-item-${item.questionId}` } },
    h('div', { class: 'export-item__head' },
      h('span', { class: 'export-item__num' }, `Q${item.number}`),
      h('span', { class: 'export-item__pts' }, pts)),
    withQuestionImage(item.question, richText(item.prompt, 'div', 'export-prompt')),
    answer,
    showCorrect ? block(correctLabel(item), cDiagram, item.correctAnswerText, item.type, 'export-correct') : null,
    item.comment ? h('div', { class: 'export-comment' }, h('span', { class: 'export-label' }, 'Teacher comment'), commentBody(item.comment)) : null);
}

/** The printable document for a model from buildExportModel(). */
export function exportDocument(model) {
  const { score } = model;
  let scoreText = `${fmt(score.earned)} / ${fmt(score.total)} · ${score.percentage}%`;
  if (score.pending > 0) scoreText += ` · ${score.pending} answer${score.pending === 1 ? '' : 's'} not yet graded`;
  return h('article', { class: 'export-doc', dataset: { testid: 'export-doc' } },
    h('header', { class: 'export-head' },
      h('div', { class: 'export-brand' }, 'ChemistryWorks'),
      h('h1', { class: 'export-title' }, model.testTitle || model.testCode || 'Assessment'),
      h('p', { class: 'export-student' }, h('strong', {}, model.studentName || 'Student'), model.studentEmail ? ` · ${model.studentEmail}` : ''),
      h('p', { class: 'export-score', dataset: { testid: 'export-score' } }, scoreText),
      model.gradedBy ? h('p', { class: 'export-grader', dataset: { testid: 'export-graded-by' } }, `Graded by ${model.gradedBy}`) : null),
    h('hr', { class: 'export-rule' }),
    model.groups.map((g) => h('div', { class: 'export-group' },
      g.section ? h('h2', { class: 'export-section', dataset: { testid: 'export-section' } }, g.section.title || 'Section') : null,
      g.section && g.section.instructions ? richText(g.section.instructions, 'div', 'export-instructions') : null,
      g.items.map(itemEl))));
}

const katexReady = () => typeof window.renderMathInElement === 'function' && !!window.katex;

/** Wait (up to `ms`) for KaTeX to load so math prints typeset, not as raw $…$. */
async function waitForKatex(ms = 4000) {
  const end = Date.now() + ms;
  while (!katexReady() && Date.now() < end) await new Promise((r) => setTimeout(r, 50));
}

/** Render the submission into #print-root, wait for math and fonts, then open the print dialog. Resolves to the root element. */
export async function printSubmission({ row, test, includeComments }) {
  const model = buildExportModel({ row, test, includeComments });
  let root = document.getElementById('print-root');
  if (!root || root.parentElement !== document.body) {
    if (root) root.remove();
    root = h('div', { id: 'print-root' });
    document.body.appendChild(root);
  }
  // @page margin is 0 so the browser has no room for its date/title/URL header and footer; the repeating
  // thead/tfoot spacers give every printed page its top and bottom margin instead.
  root.replaceChildren(h('table', { class: 'print-frame', role: 'presentation' },
    h('thead', {}, h('tr', {}, h('td', {}, h('div', { class: 'print-frame__space' })))),
    h('tfoot', {}, h('tr', {}, h('td', {}, h('div', { class: 'print-frame__space' })))),
    h('tbody', {}, h('tr', {}, h('td', {}, exportDocument(model))))));
  await waitForKatex();
  renderMath(root);
  if (document.fonts && document.fonts.ready) {
    // KaTeX fonts load on first use; printing before they arrive shows fallback glyphs.
    await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 3000))]);
  }

  const oldTitle = document.title;
  document.title = model.title;
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
  // Fallback for browsers that never fire afterprint; the 1s timeout only restores the title.
  setTimeout(() => { if (!done) document.title = oldTitle; }, 1000);
  window.print();
  return root;
}
