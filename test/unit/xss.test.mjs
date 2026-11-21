// Teacher and student text must never become elements or event handlers. Every helper that builds markup from a
// string is fed hostile input, and the markup that comes out may only contain the tags the app itself writes.
globalThis.window = { CHEMISTRYWORKS_CONFIG: { FEATURES: { v4Types: true } } };
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

const { escapeHtml } = await import('../../js/lib/html.js');
const { formulaToHTML } = await import('../../js/lib/formula.js');
const { configToHTML } = await import('../../js/lib/qtypes/econfig.js');
const { chartSvg } = await import('../../js/lib/qtypes/graph.js');
const { pdfLines, formatAnswer, correctAnswerText } = await import('../../js/lib/grading.js');
const { typeDef, registeredTypes } = await import('../../js/lib/qtypes/registry.js');
const { normalizeTest } = await import('../../js/lib/schema.js');

const PAYLOADS = [
  '<img src=x onerror=alert(1)>',
  '"><svg onload=alert(1)>',
  '\'><script>alert(1)</script>',
  '<a href="javascript:alert(1)">x</a>',
  'javascript:alert(1)',
];

// Tags the app's own string builders emit (formulas, configs, chart SVG).
const ALLOWED_TAGS = new Set(['sub', 'sup', 'span', 'svg', 'rect', 'line', 'text', 'polyline', 'circle', 'g']);

/** Fails when `html` has a tag outside the allow-list, an event-handler attribute or a script URL. */
function assertInert(html, where) {
  for (const m of html.matchAll(/<\/?\s*([a-zA-Z][a-zA-Z0-9-]*)([^>]*)>/g)) {
    assert.ok(ALLOWED_TAGS.has(m[1].toLowerCase()), `${where}: unexpected <${m[1]}> in ${html}`);
    // Quoted attribute values are escaped text, so only the attribute names and link targets matter.
    const bare = m[2].replace(/"[^"]*"/g, '""');
    assert.ok(!/\son[a-z]+\s*=/i.test(bare), `${where}: event handler in ${m[0]}`);
    assert.ok(!/(href|src)\s*=\s*"\s*javascript:/i.test(m[2]), `${where}: script URL in ${m[0]}`);
  }
}

test('escapeHtml escapes the five markup characters and tolerates non-strings', () => {
  assert.equal(escapeHtml('<a href="x">&\'</a>'), '&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;');
  assert.equal(escapeHtml(null), '');
  assert.equal(escapeHtml(2), '2');
});

for (const p of PAYLOADS) {
  test(`formulaToHTML is inert for ${p}`, () => {
    assertInert(formulaToHTML(p), 'formulaToHTML');
    assertInert(formulaToHTML(`H2O${p}`), 'formulaToHTML');
  });

  test(`configToHTML is inert for ${p}`, () => {
    assertInert(configToHTML(p), 'configToHTML');
    assertInert(configToHTML(`1s2 ${p} 2p6`), 'configToHTML');
  });

  test(`chartSvg is inert for ${p}`, () => {
    const svg = chartSvg({ xLabel: p, yLabel: p, xMin: 0, xMax: 10, yMin: 0, yMax: 10, series: [{ name: p, points: [[1, 1], [2, 4]] }] }, { label: p });
    assertInert(svg, 'chartSvg');
  });
}

const DIR = new URL('../fixtures/types/', import.meta.url);

for (const type of registeredTypes()) {
  test(`${type}: format, keyText and toPdf return text for hostile content`, () => {
    const fx = JSON.parse(readFileSync(new URL(`${type}.json`, DIR), 'utf8'));
    const hostile = JSON.stringify(fx.question, (k, v) => (typeof v === 'string' && !/^(id|type|mode|kind)$/.test(k) ? `${v}${PAYLOADS[0]}` : v));
    const q = normalizeTest({ code: 'XSS', title: 'XSS', questions: [JSON.parse(hostile)] }).questions[0];
    const def = typeDef(type);
    const answers = [def.correctAnswer(q), PAYLOADS[1], [PAYLOADS[2]], { a: PAYLOADS[3] }];
    for (const a of answers) {
      for (const out of [formatAnswer(q, a), ...pdfLines(q, a)]) assert.equal(typeof out, 'string', `${type} output is text`);
    }
    assert.equal(typeof correctAnswerText(q), 'string');
  });
}

test('every html: and innerHTML call site uses an escaping helper or a constant', () => {
  const root = new URL('../../js/', import.meta.url);
  const walk = (u) => readdirSync(u, { withFileTypes: true }).flatMap((e) => {
    if (e.isDirectory()) return e.name === 'vendor' ? [] : walk(new URL(`${e.name}/`, u));
    return e.name.endsWith('.js') ? [new URL(e.name, u)] : [];
  });
  const SAFE = /formulaToHTML|configToHTML|chartSvg|joinHTML|diagram\(|flaskSvg|brandMarkSvg|ICONS\[|cw-icon-sprite|^\s*\*|el\.innerHTML = v;/;
  const offenders = [];
  for (const f of walk(root)) {
    readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
      if (/innerHTML|insertAdjacentHTML|\bhtml:/.test(line) && !SAFE.test(line)) offenders.push(`${f.pathname.split('/js/')[1]}:${i + 1}: ${line.trim()}`);
    });
  }
  assert.deepEqual(offenders, []);
});
