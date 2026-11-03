// Printable view of one reviewed submission (V2-08). Renders into #print-root and calls window.print();
// css/print.css hides the rest of the app while printing. Row data goes through h()/richText()/commentBody() only.
import { h, richText, renderMath } from '../../ui.js';
import { buildExportModel } from '../../lib/export.js';
import { commentBody } from '../comment-view.js';
import { orbitalDiagram } from '../orbital-view.js';
import { structureDiagram } from '../structure-view.js';
import { lewisDiagram } from '../lewis-view.js';

const fmt = (n) => String(Math.round(n * 100) / 100);

function diagramFor(item) {
  const { question: q, givenAnswer: a, type } = item;
  if (!q || !item.answered || a == null) return null;
  try {
    if (type === 'orbital') return orbitalDiagram(q, a, { size: 'md' });
    if (type === 'structure') return structureDiagram(q, a, { size: 'md', label: 'Student Lewis structure' });
    if (type === 'lewis') return lewisDiagram(q.element, a, { size: 'md' });
  } catch { /* fall back to text */ }
  return null;
}

function itemEl(item) {
  const pts = item.needsGrading
    ? `— / ${fmt(item.pointsPossible)} pts (not graded)`
    : `${fmt(item.pointsEarned)} / ${fmt(item.pointsPossible)} pts`;
  const multiline = item.type === 'short' || item.type === 'open';
  let answer;
  if (!item.answered) answer = h('p', { class: 'export-empty' }, 'Not answered');
  else {
    const diagram = diagramFor(item);
    answer = [
      diagram ? h('div', { class: 'export-diagram' }, diagram) : null,
      item.answerText || !diagram ? h('div', { class: ['export-answer-text', multiline && 'export-pre'] }, item.answerText || '—') : null,
    ];
  }
  return h('section', { class: 'export-item', dataset: { testid: `export-item-${item.questionId}` } },
    h('div', { class: 'export-item__head' },
      h('span', { class: 'export-item__num' }, `Q${item.number}`),
      h('span', { class: 'export-item__pts' }, pts)),
    richText(item.prompt, 'div', 'export-prompt'),
    h('div', { class: 'export-answer' }, h('span', { class: 'export-label' }, 'Answer'), answer),
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
      h('p', { class: 'export-score', dataset: { testid: 'export-score' } }, scoreText)),
    h('hr', { class: 'export-rule' }),
    model.groups.map((g) => h('div', { class: 'export-group' },
      g.section ? h('h2', { class: 'export-section', dataset: { testid: 'export-section' } }, g.section.title || 'Section') : null,
      g.section && g.section.instructions ? richText(g.section.instructions, 'div', 'export-instructions') : null,
      g.items.map(itemEl))));
}

/** Render the submission into #print-root and open the print dialog. Returns the root element. */
export function printSubmission({ row, test, includeComments }) {
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
  renderMath(root);

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
