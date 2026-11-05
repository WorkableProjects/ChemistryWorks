// Admin › Import & templates (V4-09, S11): paste questions as plain text, CSV or a Google Forms export → draft test to
// review in the builder; or start from a unit template (data/templates).
import { h, mount, icon, toast } from '../../ui.js';
import { parsePlainText, parseQuestionCsv, parseFormsCsv } from '../../lib/importers.js';
import { normalizeTest, validateTest } from '../../lib/schema.js';
import { setBuilderTest } from './builder.js';

export function renderImport(root, ctx, { openInBuilder, go } = {}) {
  const kind = h('select', { class: 'select', 'aria-label': 'Format', dataset: { testid: 'import-kind' } },
    h('option', { value: 'text' }, 'Plain text (numbered questions)'), h('option', { value: 'csv' }, 'CSV (Question, Type, Option A…, Answer)'), h('option', { value: 'forms' }, 'Google Forms quiz (Question, Choices, Correct)'));
  const title = h('input', { class: 'input', placeholder: 'Test title', dataset: { testid: 'import-title' } });
  const src = h('textarea', { class: 'textarea textarea--code', rows: 12, 'aria-label': 'Paste questions', dataset: { testid: 'import-text' },
    placeholder: '1. Which particle has a negative charge?\na) proton\n*b) electron\nc) neutron\n2. Moles in 18.0 g of water?\nAnswer: 1.00 mol' });
  const file = h('input', { type: 'file', accept: '.txt,.csv,text/plain,text/csv', class: 'sr-only', id: 'import-file', on: { change: async (e) => { const f = e.target.files?.[0]; if (f) src.value = await f.text(); } } });
  const report = h('div', { class: 'stack', 'aria-live': 'polite', dataset: { testid: 'import-report' } });
  const open = (test) => { if (openInBuilder) openInBuilder(test); else { setBuilderTest(test); go?.('builder'); } };
  const run = () => {
    const parse = { text: parsePlainText, csv: parseQuestionCsv, forms: parseFormsCsv }[kind.value];
    const { test, warnings } = parse(src.value, { title: title.value.trim() });
    const t = normalizeTest({ ...test, code: '' });
    const errs = validateTest({ ...t, code: 'DRAFT' }).errors;
    mount(report,
      h('p', { class: 'notice notice--info' }, icon('info'), h('span', { dataset: { testid: 'import-count' } }, `${t.questions.length} question${t.questions.length === 1 ? '' : 's'} found.`)),
      warnings.length || errs.length ? h('ul', { class: 'adm-import-warn' }, [...warnings, ...errs].slice(0, 12).map((w) => h('li', {}, w))) : null,
      t.questions.length ? h('button', { class: 'btn btn--primary', type: 'button', dataset: { testid: 'import-open' }, on: { click: () => { open(t); toast('Draft opened in the builder. Give it a code, review it, then publish.', { type: 'success' }); } } }, icon('grid', { size: 16 }), 'Review in the builder') : null);
  };
  const templates = h('div', { class: 'adm-templates', dataset: { testid: 'templates' } }, h('p', { class: 'muted' }, 'Loading templates…'));
  fetch('data/templates/index.json').then((r) => r.json()).then((list) => {
    mount(templates, ...list.map((t) => h('button', { class: 'card adm-template', type: 'button', dataset: { testid: `template-${t.code}` }, on: { click: async () => {
      const raw = await fetch(`data/templates/${t.code}.json`).then((r) => r.json());
      open(normalizeTest({ ...raw, code: '' }));
      toast(`${t.title} opened in the builder`, { type: 'success' });
    } } }, h('strong', {}, t.title), h('span', { class: 'faint' }, `${t.questions} questions`))));
  }).catch(() => mount(templates, h('p', { class: 'muted' }, 'Templates are not available.')));
  mount(root, h('div', { class: 'stack', dataset: { testid: 'import' } },
    h('h2', { class: 'adm-h2' }, 'Import questions'),
    h('div', { class: 'row row--wrap' }, kind, title, h('label', { class: 'btn btn--ghost btn--sm', for: 'import-file' }, icon('upload', { size: 14 }), 'Open a file'), file),
    src,
    h('div', { class: 'row' }, h('button', { class: 'btn btn--primary', type: 'button', dataset: { testid: 'import-run' }, on: { click: run } }, 'Check and import')),
    report,
    h('h2', { class: 'adm-h2' }, 'Start from a template'),
    h('p', { class: 'muted' }, 'Starter tests per unit. They open in the builder as a new draft.'),
    templates));
  return undefined;
}
