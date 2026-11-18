// Per-type question editors for the admin Builder that have not moved to their own module yet: lewis, short, matching,
// ordering, fill-in-the-blank, structure, orbital and open. `typeEditor` picks the editor for a question's type and is
// what the Builder view mounts; moved types load lazily from js/views/admin/editors/<type>.js.
// Each editor mutates the question in place, calls `changed()` for light refreshes and `redraw()` when its shape changes.
import { h, mount, icon } from '../../../ui.js';
import { normalizeSymbol, valenceOf, canonicalDots } from '../../../lib/lewis.js';
import { lewisDiagram } from '../../lewis-view.js';
import { structureDiagram } from '../../structure-view.js';
import { acceptedStructures, valenceTotal, electronsDrawn, bondEnds, MAX_CHARGE } from '../../../lib/structure.js';
import { AUFBAU, ORBITAL_TYPES, sublevelsFor, normalizeOrbitalAnswer, isOrbitalAnswered, resolveOrbitalSource, diagramFromCounts, configurationText, rangeForCounts } from '../../../lib/orbital.js';
import { ELEMENTS } from '../../../lib/elements.js';
import { orbitalWidget } from '../../orbital-view.js';
import { balanceEditor } from './balance.js';
import { econfigEditor } from './econfig.js';
import { ptableEditor } from './ptable.js';
import { sigfigsEditor } from './sigfigs.js';
import { categorizeEditor } from './categorize.js';
import { hotspotEditor } from './hotspot.js';
import { graphEditor } from './graph.js';
import { BLANK_KINDS, markerIds } from '../../../lib/blanks.js';
import { field, switchEl, debounce, iconButton } from '../common.js';
import { typeEditorModule, hasTypeUI, loadTypeEditor } from '../../qtypes/registry.js';
import { uniqueId, optionImageControl, withVariables, formatHelpField } from './shared.js';
import '../../qtypes/index.js'; // registers the older question-type editors

// ---------- per-type editors ----------
export function typeEditor(q, redraw, changed, uid) {
  switch (q.type) {
    case 'matching': return matchingEditor(q, redraw, changed);
    case 'lewis': return lewisEditor(q, changed);
    case 'short': return shortEditor(q, changed);
    case 'ordering': return orderingEditor(q, redraw, changed);
    case 'fillblank': return fillBlankEditor(q, redraw, changed);
    case 'structure': return structureEditor(q, redraw, changed);
    case 'open': return openEditor(q, redraw, changed);
    case 'orbital': return orbitalEditor(q, redraw, changed);
    case 'balance': return balanceEditor(q, redraw, changed);
    case 'econfig': return econfigEditor(q, changed);
    case 'ptable': return ptableEditor(q, changed, redraw);
    case 'sigfigs': return withVariables(q, sigfigsEditor(q, changed), redraw, changed);
    case 'categorize': return categorizeEditor(q, redraw, changed);
    case 'hotspot': return hotspotEditor(q, redraw, changed);
    case 'graph': return graphEditor(q, redraw, changed);
    default: {
      const mod = typeEditorModule(q.type);
      if (mod) return mod.edit({ q, redraw, changed, uid });
      if (hasTypeUI(q.type)) return deferredEditor(q, redraw, changed, uid);
      return h('p', { class: 'muted' }, `Unknown question type “${q.type}”.`);
    }
  }
}

/** Placeholder for an editor whose module is still loading; it fills itself in when the module arrives. */
function deferredEditor(q, redraw, changed, uid) {
  const el = h('div', { class: 'stack', 'aria-busy': 'true' });
  loadTypeEditor(q.type).then((mod) => {
    el.removeAttribute('aria-busy');
    el.replaceChildren(mod.edit({ q, redraw, changed, uid }));
  }).catch(() => el.replaceChildren(h('p', { class: 'muted' }, 'Could not load this editor.')));
  return el;
}

function lewisEditor(q, changed) {
  const previewEl = h('div', { class: 'adm-lewis-preview', dataset: { testid: 'lewis-preview' } });
  const hintEl = h('span', { class: 'field__hint' });
  const drawPreview = () => {
    const sym = normalizeSymbol(q.element);
    const n = Number(q.correctAnswer);
    const known = valenceOf(sym);
    hintEl.textContent = !sym ? 'Enter an element symbol, e.g. O, Cl, Mg'
      : known === null ? 'Not a main-group element: enter its valence electrons yourself'
        : known === n ? `${sym} has ${known} valence electrons` : `Note: ${sym} normally has ${known} valence electrons`;
    mount(previewEl, sym && Number.isInteger(n) && n >= 1 && n <= 8
      ? [lewisDiagram(sym, canonicalDots(n, sym), { size: 'lg' }), h('span', { class: 'faint' }, 'Correct diagram')]
      : h('span', { class: 'faint' }, 'Diagram preview appears here'));
  };
  const el = h('input', { class: 'input', value: q.element || '', placeholder: 'e.g. O', maxlength: '3', autocomplete: 'off', spellcheck: 'false', dataset: { testid: 'lewis-element' },
    on: { input: () => {
      const sym = normalizeSymbol(el.value);
      q.element = sym || el.value.trim();
      const v = valenceOf(sym);
      if (v !== null) { q.correctAnswer = v; ve.value = String(v); }
      drawPreview();
      changed();
    } } });
  const ve = h('input', { class: 'input', type: 'number', min: '1', max: '8', step: '1', value: q.correctAnswer ?? '', dataset: { testid: 'lewis-valence' },
    on: { input: () => { q.correctAnswer = ve.value.trim() === '' ? '' : Number(ve.value); drawPreview(); changed(); } } });
  drawPreview();
  return h('div', { class: 'stack' },
    h('div', { class: 'adm-grid adm-grid--4' },
      field('Element symbol', el, null), field('Valence electrons (dots)', ve, 'Filled in automatically for main-group elements')),
    hintEl,
    previewEl,
    switchEl({ label: 'Check dot placement', hint: 'On: one dot per side before pairing (He may be a pair). Off: only the number of dots is graded.',
      checked: q.checkPlacement !== false, testid: 'lewis-placement', onChange: (v) => { q.checkPlacement = v; changed(); } }));
}

function shortEditor(q, changed) {
  const ta = h('textarea', { class: 'textarea', rows: 3, placeholder: 'Model answer or rubric (optional)', dataset: { testid: 'short-sample' },
    on: { input: () => { q.sampleAnswer = ta.value; changed(); } } });
  ta.value = q.sampleAnswer || '';
  return h('div', { class: 'stack' },
    h('p', { class: 'notice notice--info' }, icon('info'), h('span', {}, 'Not auto-graded. Students’ answers appear in the Grading tab, where you assign points.')),
    field('Sample answer', ta, 'Shown to you while grading. Students see it in the review only if “Show correct answers” is on.'));
}

function matchingEditor(q, redraw, changed) {
  q.left = Array.isArray(q.left) ? q.left : [];
  q.right = Array.isArray(q.right) ? q.right : [];
  if (!q.correctAnswer || typeof q.correctAnswer !== 'object' || Array.isArray(q.correctAnswer)) q.correctAnswer = {};
  const selects = [];
  const rightLabel = (r, i) => (r.text ? r.text : `(item ${i + 1})`);
  const fillSelect = (sel, leftId) => {
    const cur = q.correctAnswer[leftId] ?? '';
    mount(sel, h('option', { value: '' }, 'Choose…'), q.right.map((r, i) => h('option', { value: r.id }, rightLabel(r, i))));
    sel.value = q.right.some((r) => r.id === cur) ? cur : '';
  };
  const refreshSelects = () => selects.forEach(({ sel, id }) => fillSelect(sel, id));

  const leftRows = q.left.map((l, i) => {
    const txt = h('input', { class: 'input', value: l.text || '', placeholder: `Left item ${i + 1}`, 'aria-label': `Left item ${i + 1}`, dataset: { testid: `match-left-${i}` }, on: { input: () => { l.text = txt.value; changed(); } } });
    const sel = h('select', { class: 'select', 'aria-label': `Correct match for left item ${i + 1}`, dataset: { testid: `match-correct-${i}` }, on: { change: () => { q.correctAnswer[l.id] = sel.value; changed(); } } });
    selects.push({ sel, id: l.id });
    fillSelect(sel, l.id);
    const rm = iconButton('x', 'Remove left item', () => { q.left.splice(i, 1); delete q.correctAnswer[l.id]; redraw(); changed(); }, { testid: `match-left-remove-${i}` });
    return h('div', { class: 'adm-optwrap' }, h('div', { class: 'adm-match-row' }, txt, h('span', { class: 'adm-match-arrow', 'aria-hidden': 'true' }, icon('right', { size: 16 })), sel, rm), optionImageControl(l, changed, `match-left-${i}`));
  });
  const rightRows = q.right.map((r, i) => {
    const txt = h('input', { class: 'input', value: r.text || '', placeholder: `Right item ${i + 1}`, 'aria-label': `Right item ${i + 1}`, dataset: { testid: `match-right-${i}` },
      on: { input: () => { r.text = txt.value; refreshSelects(); changed(); } } });
    const rm = iconButton('x', 'Remove right item', () => {
      q.right.splice(i, 1);
      for (const l of q.left) if (q.correctAnswer[l.id] === r.id) q.correctAnswer[l.id] = q.right[0]?.id ?? '';
      redraw();
      changed();
    }, { testid: `match-right-remove-${i}` });
    return h('div', { class: 'adm-optwrap' }, h('div', { class: 'adm-opt adm-opt--plain' }, txt, rm), optionImageControl(r, changed, `match-right-${i}`));
  });
  return h('div', { class: 'stack' },
    h('div', { class: 'field__label' }, 'Left items and their correct match'),
    h('div', { class: 'adm-opts' }, leftRows),
    h('button', { class: 'btn btn--ghost btn--sm adm-self-start', type: 'button', dataset: { testid: 'add-match-left' }, on: { click: () => {
      const id = uniqueId('l', q.left);
      q.left.push({ id, text: '' });
      q.correctAnswer[id] = q.right[0]?.id ?? '';
      redraw();
      changed();
    } } }, icon('plus', { size: 16 }), 'Add left item'),
    h('div', { class: 'field__label' }, 'Right items (distractors allowed; each can be reused)'),
    h('div', { class: 'adm-opts' }, rightRows),
    h('div', { class: 'row row--wrap' },
      h('button', { class: 'btn btn--ghost btn--sm', type: 'button', dataset: { testid: 'add-match-right' }, on: { click: () => {
        q.right.push({ id: uniqueId('r', q.right), text: '' });
        redraw();
        changed();
      } } }, icon('plus', { size: 16 }), 'Add right item'),
      switchEl({ label: 'Partial credit', checked: q.partialCredit !== false, testid: 'partial-credit', onChange: (v) => { q.partialCredit = v; changed(); } })));
}

function orderingEditor(q, redraw, changed) {
  q.items = Array.isArray(q.items) ? q.items : [];
  const sync = () => { q.correctAnswer = q.items.map((it) => it.id); };
  sync();
  const rows = q.items.map((it, i) => {
    const txt = h('input', { class: 'input', value: it.text || '', placeholder: `Item ${i + 1}`, 'aria-label': `Item ${i + 1} (correct position ${i + 1})`, dataset: { testid: `order-item-${i}` },
      on: { input: () => { it.text = txt.value; changed(); } } });
    const mv = (d) => { const j = i + d; if (j < 0 || j >= q.items.length) return; [q.items[i], q.items[j]] = [q.items[j], q.items[i]]; sync(); redraw(); changed(); };
    return h('div', { class: 'adm-optwrap' }, h('div', { class: 'adm-opt adm-opt--order' },
      h('span', { class: 'adm-blank__num' }, String(i + 1)), txt,
      iconButton('up', 'Move up', () => mv(-1), { testid: `order-up-${i}` }),
      iconButton('down', 'Move down', () => mv(1), { testid: `order-down-${i}` }),
      iconButton('x', 'Remove item', () => { q.items.splice(i, 1); sync(); redraw(); changed(); }, { testid: `order-remove-${i}` })),
    optionImageControl(it, changed, `order-item-${i}`));
  });
  const top = h('input', { class: 'input', value: q.topLabel || '', placeholder: 'e.g. Lowest', dataset: { testid: 'order-top-label' }, on: { input: () => { q.topLabel = top.value; changed(); } } });
  const bottom = h('input', { class: 'input', value: q.bottomLabel || '', placeholder: 'e.g. Highest', dataset: { testid: 'order-bottom-label' }, on: { input: () => { q.bottomLabel = bottom.value; changed(); } } });
  return h('div', { class: 'stack' },
    h('div', { class: 'field__label' }, 'Items in the CORRECT order (students see them scrambled)'),
    h('div', { class: 'adm-opts' }, rows),
    h('div', { class: 'row row--wrap' },
      h('button', { class: 'btn btn--ghost btn--sm', type: 'button', dataset: { testid: 'add-order-item' }, on: { click: () => {
        q.items.push({ id: uniqueId('i', q.items), text: '' }); sync(); redraw(); changed();
      } } }, icon('plus', { size: 16 }), 'Add item'),
      switchEl({ label: 'Partial credit', hint: 'Points for each item in the right position', checked: q.partialCredit !== false, testid: 'partial-credit', onChange: (v) => { q.partialCredit = v; changed(); } })),
    h('div', { class: 'adm-grid adm-grid--4' }, field('Label above the list', top, 'Optional'), field('Label below the list', bottom, 'Optional')));
}

function fillBlankEditor(q, redraw, changed) {
  q.blanks = Array.isArray(q.blanks) ? q.blanks : [];
  const textArea = () => document.activeElement?.closest?.('.adm-q')?.querySelector('[data-testid="q-text"]');
  const markers = h('p', { class: 'field__hint', dataset: { testid: 'blank-markers' } });
  const checkMarkers = () => {
    const marks = markerIds(q.text);
    const missing = q.blanks.filter((b) => !marks.includes(b.id)).map((b) => `{{${b.id}}}`);
    markers.textContent = missing.length ? `Add ${missing.join(', ')} to the question text where each blank goes.` : 'Each {{id}} in the question text becomes a blank for students.';
    markers.classList.toggle('field-error', missing.length > 0);
  };
  const rows = q.blanks.map((b, i) => {
    const list = Array.isArray(b.answers) ? b.answers : [];
    const ans = h('input', { class: 'input', value: list.join(', '), placeholder: 'Accepted answers, comma-separated', 'aria-label': `Blank ${i + 1} accepted answers`, dataset: { testid: `blank-answers-${i}` },
      on: { input: () => { b.answers = ans.value.split(',').map((x) => x.trim()).filter(Boolean); changed(); } } });
    const kind = h('select', { class: 'select', 'aria-label': `Blank ${i + 1} kind`, dataset: { testid: `blank-kind-${i}` }, on: { change: () => {
      b.kind = kind.value;
      if (b.kind === 'number') { b.tolerance ??= 0; b.toleranceType ??= 'absolute'; b.unit ??= ''; }
      redraw(); changed();
    } } }, BLANK_KINDS.map((k) => h('option', { value: k }, { text: 'Word / text', number: 'Number', formula: 'Formula' }[k])));
    kind.value = b.kind || 'text';
    const rm = iconButton('x', 'Remove blank', () => { q.blanks.splice(i, 1); redraw(); changed(); }, { testid: `blank-remove-${i}` });
    const row = h('div', { class: 'adm-blank' }, h('span', { class: 'adm-blank__num' }, `{{${b.id}}}`), ans, kind, rm);
    if (b.kind !== 'number') return row;
    const tol = h('input', { class: 'input', type: 'number', min: '0', step: 'any', value: b.tolerance ?? 0, 'aria-label': `Blank ${i + 1} tolerance`, on: { input: () => { b.tolerance = tol.value.trim() === '' ? 0 : Number(tol.value); changed(); } } });
    const tt = h('select', { class: 'select', 'aria-label': `Blank ${i + 1} tolerance type`, on: { change: () => { b.toleranceType = tt.value; changed(); } } },
      h('option', { value: 'absolute' }, 'Absolute (±)'), h('option', { value: 'percent' }, 'Percent (±%)'));
    tt.value = b.toleranceType || 'absolute';
    const unit = h('input', { class: 'input', value: b.unit || '', placeholder: 'Unit (optional)', 'aria-label': `Blank ${i + 1} unit`, on: { input: () => { b.unit = unit.value; changed(); } } });
    return h('div', { class: 'stack' }, row, h('div', { class: 'adm-grid adm-grid--4' }, field('Tolerance', tol), field('Tolerance type', tt), field('Unit', unit)));
  });
  const distractors = h('input', { class: 'input', value: (q.distractors || []).join(', '), placeholder: 'Extra wrong words, comma-separated', dataset: { testid: 'blank-distractors' },
    on: { input: () => { q.distractors = distractors.value.split(',').map((x) => x.trim()).filter(Boolean); changed(); } } });
  checkMarkers();
  requestAnimationFrame(() => markers.closest('.adm-q')?.addEventListener('input', checkMarkers));
  return h('div', { class: 'stack' },
    h('p', { class: 'notice notice--info' }, icon('info'), h('span', {}, 'Write the sentence in the question text and put {{b1}}, {{b2}}, … where each blank goes.')),
    h('div', { class: 'field__label' }, 'Blanks'),
    h('div', { class: 'adm-opts' }, rows),
    markers,
    h('div', { class: 'row row--wrap' },
      h('button', { class: 'btn btn--ghost btn--sm', type: 'button', dataset: { testid: 'add-blank' }, on: { click: (e) => {
        const id = uniqueId('b', q.blanks);
        q.blanks.push({ id, answers: [], kind: 'text' });
        const ta = e.currentTarget.closest('.adm-q')?.querySelector('[data-testid="q-text"]') || textArea();
        if (ta && !markerIds(ta.value).includes(id)) {
          ta.value = `${ta.value.replace(/\s+$/, '')} {{${id}}}`;
          ta.dispatchEvent(new Event('input', { bubbles: true }));
        }
        redraw(); changed();
      } } }, icon('plus', { size: 16 }), 'Add blank'),
      switchEl({ label: 'Partial credit', hint: 'Points for each correct blank', checked: q.partialCredit !== false, testid: 'partial-credit', onChange: (v) => { q.partialCredit = v; changed(); } }),
      switchEl({ label: 'Case sensitive (text blanks)', checked: !!q.caseSensitive, testid: 'case-sensitive', onChange: (v) => { q.caseSensitive = v; changed(); } }),
      switchEl({ label: 'Word bank', hint: 'Students pick from a list instead of typing', checked: !!q.wordBank, testid: 'word-bank', onChange: (v) => { q.wordBank = v; redraw(); changed(); } })),
    q.wordBank ? field('Distractors (word bank only)', distractors, 'Wrong choices mixed into the word bank') : null,
    formatHelpField(q, changed));
}

function structureEditor(q, redraw, changed) {
  q.atoms = Array.isArray(q.atoms) ? q.atoms : [];
  q.bonds = Array.isArray(q.bonds) ? q.bonds.map((b) => bondEnds(b) || ['', '']) : [];
  if (!acceptedStructures(q).length) q.correctAnswer = { bonds: q.bonds.map(() => 1), lonePairs: {} };
  const forms = () => acceptedStructures(q);
  const key = () => forms()[0];
  for (const f of forms()) { f.bonds = Array.isArray(f.bonds) ? f.bonds : []; f.lonePairs = f.lonePairs && typeof f.lonePairs === 'object' ? f.lonePairs : {}; }

  const preview = h('div', { class: 'adm-structure-preview', dataset: { testid: 'structure-preview' } });
  const check = h('p', { class: 'field__hint', dataset: { testid: 'structure-electrons' } });
  const drawPreview = () => {
    const total = valenceTotal(q);
    const drawn = electronsDrawn(q, key());
    check.textContent = total === null ? `Correct structure uses ${drawn} electrons (electron total not checked for non-main-group atoms).`
      : drawn === total ? `✓ Correct structure uses all ${total} valence electrons.` : `Correct structure uses ${drawn} electrons, but the atoms have ${total} valence electrons. Adjust bonds or lone pairs.`;
    check.classList.toggle('field-error', total !== null && drawn !== total);
    try {
      mount(preview, forms().map((f, i) => h('div', { class: 'stack' }, h('span', { class: 'faint' }, forms().length > 1 ? `Correct form ${i + 1}` : 'Correct structure'), structureDiagram(q, f))));
    } catch {
      mount(preview, h('span', { class: 'faint' }, 'Preview appears once atoms and bonds are filled in'));
    }
  };
  const update = () => { drawPreview(); changed(); };

  const atomRows = q.atoms.map((a, i) => {
    const id = h('input', { class: 'input', value: a.id, 'aria-label': `Atom ${i + 1} id`, spellcheck: 'false', dataset: { testid: `atom-id-${i}` }, on: { change: () => {
      const old = a.id; const next = id.value.trim();
      if (!next || next === old) { id.value = old; return; }
      a.id = next;
      q.bonds = q.bonds.map((b) => b.map((x) => (x === old ? next : x)));
      for (const f of forms()) {
        if (old in f.lonePairs) { f.lonePairs[next] = f.lonePairs[old]; delete f.lonePairs[old]; }
        if (f.formalCharges && old in f.formalCharges) { f.formalCharges[next] = f.formalCharges[old]; delete f.formalCharges[old]; }
      }
      redraw(); changed();
    } } });
    const sym = h('input', { class: 'input', value: a.symbol || '', maxlength: '3', 'aria-label': `Atom ${i + 1} element`, spellcheck: 'false', dataset: { testid: `atom-symbol-${i}` },
      on: { input: () => { a.symbol = normalizeSymbol(sym.value) || sym.value.trim(); update(); } } });
    const num = (k, label) => {
      const inp = h('input', { class: 'input', type: 'number', step: '0.5', value: a[k] ?? '', placeholder: 'auto', 'aria-label': `Atom ${i + 1} ${label}`, dataset: { testid: `atom-${k}-${i}` },
        on: { input: () => { if (inp.value.trim() === '') delete a[k]; else a[k] = Number(inp.value); update(); } } });
      return inp;
    };
    const lp = h('select', { class: 'select', 'aria-label': `Atom ${i + 1} lone pairs (correct)`, dataset: { testid: `atom-lp-${i}` },
      on: { change: () => { key().lonePairs[a.id] = Number(lp.value); update(); } } }, [0, 1, 2, 3, 4].map((n) => h('option', { value: String(n) }, String(n))));
    lp.value = String(key().lonePairs[a.id] ?? 0);
    const rm = iconButton('x', 'Remove atom', () => {
      q.atoms.splice(i, 1);
      const keepIdx = q.bonds.map((b, j) => (b.includes(a.id) ? -1 : j)).filter((j) => j >= 0);
      q.bonds = keepIdx.map((j) => q.bonds[j]);
      for (const f of forms()) { f.bonds = keepIdx.map((j) => f.bonds[j] ?? 1); delete f.lonePairs[a.id]; if (f.formalCharges) delete f.formalCharges[a.id]; }
      redraw(); changed();
    }, { testid: `atom-remove-${i}` });
    return h('div', { class: 'adm-atom' }, id, sym, num('x', 'column (x)'), num('y', 'row (y)'), lp, rm);
  });

  const atomOptions = () => q.atoms.map((a) => h('option', { value: a.id }, `${a.symbol || '?'} (${a.id})`));
  const bondRows = q.bonds.map((b, i) => {
    const mk = (end) => {
      const sel = h('select', { class: 'select', 'aria-label': `Bond ${i + 1} atom ${end + 1}`, dataset: { testid: `bond-${end ? 'b' : 'a'}-${i}` },
        on: { change: () => { b[end] = sel.value; update(); } } }, h('option', { value: '' }, 'Atom…'), atomOptions());
      sel.value = b[end] || '';
      return sel;
    };
    const order = h('select', { class: 'select', 'aria-label': `Bond ${i + 1} correct order`, dataset: { testid: `bond-order-${i}` },
      on: { change: () => { key().bonds[i] = Number(order.value); update(); } } },
    h('option', { value: '1' }, 'Single'), h('option', { value: '2' }, 'Double'), h('option', { value: '3' }, 'Triple'));
    order.value = String(key().bonds[i] ?? 1);
    const rm = iconButton('x', 'Remove bond', () => {
      q.bonds.splice(i, 1);
      for (const f of forms()) f.bonds.splice(i, 1);
      redraw(); changed();
    }, { testid: `bond-remove-${i}` });
    return h('div', { class: 'adm-bondrow' }, mk(0), mk(1), order, rm);
  });

  const charge = h('input', { class: 'input', type: 'number', step: '1', value: q.charge ?? 0, dataset: { testid: 'structure-charge' },
    on: { input: () => { q.charge = charge.value.trim() === '' ? 0 : Number(charge.value); update(); } } });
  drawPreview();

  // Student-drawn brackets & charges (V2-06): the key lives in forms()[0]; zero values are omitted.
  const chargeInput = (value, label, testid, onValue) => {
    const inp = h('input', { class: 'input', type: 'number', min: String(-MAX_CHARGE), max: String(MAX_CHARGE), step: '1', value: String(value || 0), 'aria-label': label, dataset: { testid },
      on: { input: () => {
        const n = Math.max(-MAX_CHARGE, Math.min(MAX_CHARGE, Math.trunc(Number(inp.value)) || 0));
        onValue(n);
        update();
      } } });
    return inp;
  };
  const chargeEditor = () => {
    if (!q.studentCharges) return null;
    const k = key();
    const bracket = h('input', { type: 'checkbox', checked: k.bracket === true, dataset: { testid: 'structure-key-bracket' },
      on: { change: () => { if (bracket.checked) k.bracket = true; else delete k.bracket; update(); } } });
    const keyCharge = chargeInput(k.charge, 'Key overall charge', 'structure-key-charge', (n) => { if (n) k.charge = n; else delete k.charge; });
    const fcRows = q.atoms.map((a, i) => field(`${a.symbol || '?'} (${a.id})`, chargeInput(k.formalCharges?.[a.id], `Atom ${i + 1} formal charge (correct)`, `atom-fc-${i}`, (n) => {
      if (n) { k.formalCharges = k.formalCharges && typeof k.formalCharges === 'object' ? k.formalCharges : {}; k.formalCharges[a.id] = n; }
      else if (k.formalCharges) { delete k.formalCharges[a.id]; if (!Object.keys(k.formalCharges).length) delete k.formalCharges; }
    })));
    return h('div', { class: 'stack adm-chargekey', dataset: { testid: 'structure-charge-key' } },
      h('div', { class: 'field__label' }, 'Correct brackets and charges (the key)'),
      h('label', { class: 'adm-check' }, bracket, h('span', {}, 'Structure is drawn in brackets')),
      h('div', { class: 'adm-grid adm-grid--4' }, field(`Overall charge on the bracket (−${MAX_CHARGE} to ${MAX_CHARGE})`, keyCharge, 'Leave 0 for none')),
      h('div', { class: 'field__label' }, `Formal charge on each atom (−${MAX_CHARGE} to ${MAX_CHARGE}, 0 = none)`),
      h('div', { class: 'adm-fcgrid' }, fcRows));
  };
  return h('div', { class: 'stack' },
    h('p', { class: 'notice notice--info' }, icon('info'), h('span', {},
      'Give the skeleton (atoms and which atoms are bonded) and the correct bond order and lone pairs. Students set bond orders and lone pairs themselves. ',
      'x/y place atoms on a grid (column, row); leave them empty for an automatic layout. Resonance forms can be added in JSON mode (correctAnswer as a list).')),
    forms().length > 1 ? h('p', { class: 'notice notice--warning' }, icon('alert'), h('span', {}, `This question accepts ${forms().length} resonance forms. The fields below edit form 1; edit the others in JSON mode.`)) : null,
    h('div', { class: 'field__label' }, 'Atoms'),
    h('div', { class: 'adm-atom adm-colhead', 'aria-hidden': 'true' }, h('span', {}, 'Id'), h('span', {}, 'Element'), h('span', {}, 'x'), h('span', {}, 'y'), h('span', {}, 'Lone pairs'), h('span', {})),
    h('div', { class: 'adm-opts' }, atomRows),
    h('button', { class: 'btn btn--ghost btn--sm adm-self-start', type: 'button', dataset: { testid: 'add-atom' }, on: { click: () => {
      const id = uniqueId('a', q.atoms);
      const maxX = q.atoms.reduce((m, a) => (Number.isFinite(Number(a.x)) && a.x !== '' ? Math.max(m, Number(a.x)) : m), -1);
      const atom = { id, symbol: 'H' };
      if (q.atoms.length && q.atoms.every((a) => a.x !== undefined && a.y !== undefined)) { atom.x = maxX + 1; atom.y = 0; }
      q.atoms.push(atom);
      redraw(); changed();
    } } }, icon('plus', { size: 16 }), 'Add atom'),
    h('div', { class: 'field__label' }, 'Bonds (skeleton) and the correct bond order'),
    h('div', { class: 'adm-opts' }, bondRows),
    h('button', { class: 'btn btn--ghost btn--sm adm-self-start', type: 'button', dataset: { testid: 'add-bond' }, on: { click: () => {
      q.bonds.push([q.atoms[0]?.id || '', q.atoms[1]?.id || '']);
      for (const f of forms()) f.bonds.push(1);
      redraw(); changed();
    } } }, icon('plus', { size: 16 }), 'Add bond'),
    h('div', { class: 'adm-grid adm-grid--4' }, field('Overall charge', charge, 'e.g. -1 for NO₃⁻, +1 for NH₄⁺')),
    h('div', { class: 'adm-switches' },
      switchEl({ label: 'Partial credit', hint: 'Credit for each correct bond and lone-pair count', checked: !!q.partialCredit, testid: 'partial-credit', onChange: (v) => { q.partialCredit = v; changed(); } }),
      switchEl({ label: 'Show electron total to students', hint: 'Counter shows “14 of 16 valence electrons drawn”', checked: !!q.showElectronCount, testid: 'structure-show-count', onChange: (v) => { q.showElectronCount = v; changed(); } })),
    switchEl({ label: 'Student draws brackets & charges (teacher graded)', hint: 'Students add brackets, an overall charge and formal charges themselves. The question then moves to the Grading tab.', checked: !!q.studentCharges, testid: 'structure-student-charges',
      onChange: (v) => { q.studentCharges = v; redraw(); changed(); } }),
    chargeEditor(),
    check,
    preview);
}

function orbitalEditor(q, redraw, changed) {
  q.orbitalTypes = Array.isArray(q.orbitalTypes) ? q.orbitalTypes : ['s', 'p'];
  const note = h('p', { class: 'field__hint', dataset: { testid: 'orbital-sublevels' } });
  const sampleBox = h('div', { class: 'adm-orbsample' });
  const drawSample = () => {
    // The widget never redraws itself (the runner calls refresh after each set), so refresh here too.
    let w = null;
    w = orbitalWidget(q, { get: () => q.sampleAnswer, set: (_, v) => { q.sampleAnswer = v ?? null; w?.refresh(q.sampleAnswer ?? undefined); changed(); } });
    mount(sampleBox, w.el);
    w.refresh(q.sampleAnswer ?? undefined);
  };
  const update = () => {
    const subs = sublevelsFor(q);
    note.textContent = subs.length ? `Sublevels shown: ${subs.join(' ')}` : 'No sublevels shown. Tick a type that appears at or below the highest sublevel.';
    note.classList.toggle('field-error', !subs.length);
  };
  // After the range changes keep only boxes that still exist; drop the sample when nothing is left.
  const renormalize = () => {
    if (q.sampleAnswer && typeof q.sampleAnswer === 'object') {
      const next = normalizeOrbitalAnswer(q, q.sampleAnswer);
      q.sampleAnswer = isOrbitalAnswered(q, next) ? next : null;
    }
    update();
    drawSample();
    changed();
  };
  const max = h('select', { class: 'select', dataset: { testid: 'orbital-max' }, on: { change: () => { q.maxSublevel = max.value; renormalize(); } } },
    AUFBAU.map((s) => h('option', { value: s }, `Up to ${s}`)));
  max.value = AUFBAU.includes(q.maxSublevel) ? q.maxSublevel : '2p';
  const typeBoxes = ORBITAL_TYPES.map((t) => {
    const cb = h('input', { type: 'checkbox', checked: q.orbitalTypes.includes(t), dataset: { testid: `orbital-type-${t}` },
      on: { change: () => { q.orbitalTypes = ORBITAL_TYPES.filter((x) => (x === t ? cb.checked : q.orbitalTypes.includes(x))); renormalize(); } } });
    return h('label', { class: 'adm-check' }, cb, h('span', {}, `${t} sublevels`));
  });
  const clear = h('button', { class: 'btn btn--ghost btn--sm', type: 'button', dataset: { testid: 'orbital-sample-clear' }, on: { click: () => { q.sampleAnswer = null; drawSample(); changed(); } } }, 'Clear sample');
  // Element symbol or configuration -> range + reference diagram (like Lewis questions).
  const srcHint = h('p', { class: 'field__hint', dataset: { testid: 'orbital-source-hint' } });
  const applySource = () => {
    const text = src.value.trim();
    q.element = text;
    if (!text) { srcHint.textContent = 'Type a symbol (N) or a configuration (1s2 2s2 2p3, [Ne] 3s1) to draw the reference diagram.'; srcHint.classList.remove('field-error'); changed(); return; }
    const r = resolveOrbitalSource(text, ELEMENTS);
    if (r.error) { srcHint.textContent = r.error; srcHint.classList.add('field-error'); changed(); return; }
    srcHint.classList.remove('field-error');
    const need = rangeForCounts(r.counts);
    if (AUFBAU.indexOf(need.maxSublevel) > AUFBAU.indexOf(q.maxSublevel)) q.maxSublevel = need.maxSublevel;
    max.value = AUFBAU.includes(q.maxSublevel) ? q.maxSublevel : '2p';
    q.orbitalTypes = ORBITAL_TYPES.filter((t) => q.orbitalTypes.includes(t) || need.orbitalTypes.includes(t));
    typeBoxes.forEach((l, k) => { l.querySelector('input').checked = q.orbitalTypes.includes(ORBITAL_TYPES[k]); });
    const sample = normalizeOrbitalAnswer(q, diagramFromCounts(r.counts));
    q.sampleAnswer = isOrbitalAnswered(q, sample) ? sample : null;
    srcHint.textContent = `${r.label ? `${r.label}: ` : ''}${configurationText(r.counts)}. You can still click boxes below to adjust.`;
    update();
    drawSample();
    changed();
  };
  const src = h('input', { class: 'input', value: q.element || '', placeholder: 'e.g. N or 1s2 2s2 2p3', autocomplete: 'off', spellcheck: 'false', dataset: { testid: 'orbital-source' },
    on: { input: debounce(applySource, 250), change: applySource } });
  srcHint.textContent = q.element ? '' : 'Type a symbol (N) or a configuration (1s2 2s2 2p3, [Ne] 3s1) to draw the reference diagram.';

  update();
  drawSample();
  return h('div', { class: 'stack' },
    h('p', { class: 'notice notice--info' }, icon('info'), h('span', {}, 'Orbital diagrams are graded by the teacher.')),
    h('div', { class: 'field' }, h('label', { class: 'field__label' }, 'Element or electron configuration'), src, srcHint),
    h('div', { class: 'adm-grid adm-grid--4' }, field('Highest sublevel', max, 'In filling (Aufbau) order')),
    h('div', { class: 'field__label' }, 'Sublevel types included'),
    h('div', { class: 'row row--wrap' }, typeBoxes),
    note,
    h('div', { class: 'field__label' }, 'Sample answer (optional, for graders)'),
    sampleBox,
    h('div', { class: 'row' }, clear));
}

function openEditor(q, redraw, changed) {
  q.rubric = Array.isArray(q.rubric) ? q.rubric : [];
  const sumEl = h('p', { class: 'field__hint', dataset: { testid: 'rubric-total' } });
  const fixBtn = h('button', { class: 'btn btn--subtle btn--sm', type: 'button', dataset: { testid: 'rubric-set-points' }, on: { click: (e) => {
    const sum = rubricSum();
    q.points = sum;
    const pts = e.currentTarget.closest('.adm-q')?.querySelector('[data-testid="q-points"]');
    if (pts) { pts.value = String(sum); pts.dispatchEvent(new Event('input', { bubbles: true })); }
    showSum(); changed();
  } } }, 'Set question points to rubric total');
  const rubricSum = () => Math.round(q.rubric.reduce((s, r) => s + (Number(r.points) || 0), 0) * 100) / 100;
  const showSum = () => {
    const sum = rubricSum();
    const ok = !q.rubric.length || sum === Number(q.points);
    sumEl.textContent = q.rubric.length ? `Rubric total: ${sum} pt${sum === 1 ? '' : 's'}${ok ? ' ✓' : ` (question is worth ${q.points})`}` : 'No rubric: you will type points freely while grading.';
    sumEl.classList.toggle('field-error', !ok);
    fixBtn.hidden = ok;
  };
  const rows = q.rubric.map((r, i) => {
    const txt = h('input', { class: 'input', value: r.text || '', placeholder: `Criterion ${i + 1}`, 'aria-label': `Rubric criterion ${i + 1}`, dataset: { testid: `rubric-text-${i}` },
      on: { input: () => { r.text = txt.value; changed(); } } });
    const pts = h('input', { class: 'input adm-points', type: 'number', min: '0', step: 'any', value: r.points ?? 1, 'aria-label': `Rubric criterion ${i + 1} points`, dataset: { testid: `rubric-points-${i}` },
      on: { input: () => { r.points = pts.value.trim() === '' ? '' : Number(pts.value); showSum(); changed(); } } });
    return h('div', { class: 'adm-opt adm-opt--plain' }, txt, pts, iconButton('x', 'Remove criterion', () => { q.rubric.splice(i, 1); redraw(); changed(); }, { testid: `rubric-remove-${i}` }));
  });
  const words = (k, label) => {
    const inp = h('input', { class: 'input', type: 'number', min: '0', step: '1', value: q[k] ?? '', placeholder: 'None', dataset: { testid: `open-${k}` },
      on: { input: () => { q[k] = inp.value.trim() === '' ? null : Number(inp.value); changed(); } } });
    return field(label, inp);
  };
  const ta = h('textarea', { class: 'textarea', rows: 3, placeholder: 'Model answer (optional)', dataset: { testid: 'open-sample' }, on: { input: () => { q.sampleAnswer = ta.value; changed(); } } });
  ta.value = q.sampleAnswer || '';
  requestAnimationFrame(() => sumEl.closest('.adm-q')?.querySelector('[data-testid="q-points"]')?.addEventListener('input', showSum));
  showSum();
  return h('div', { class: 'stack' },
    h('p', { class: 'notice notice--info' }, icon('info'), h('span', {}, 'Not auto-graded. In the Grading tab you tick rubric criteria (or type points) for each student.')),
    h('div', { class: 'field__label' }, 'Rubric criteria'),
    h('div', { class: 'adm-opts' }, rows),
    h('div', { class: 'row row--wrap' },
      h('button', { class: 'btn btn--ghost btn--sm', type: 'button', dataset: { testid: 'add-rubric' }, on: { click: () => { q.rubric.push({ text: '', points: 1 }); redraw(); changed(); } } }, icon('plus', { size: 16 }), 'Add criterion'),
      fixBtn),
    sumEl,
    switchEl({ label: 'Show rubric to students', hint: 'Students see the criteria above the answer box', checked: q.showRubric !== false, testid: 'open-show-rubric', onChange: (v) => { q.showRubric = v; changed(); } }),
    h('div', { class: 'adm-grid adm-grid--4' }, words('minWords', 'Minimum words'), words('maxWords', 'Maximum words')),
    field('Sample answer', ta, 'Shown to you while grading, and to students in the review if “Show correct answers” is on.'));
}
